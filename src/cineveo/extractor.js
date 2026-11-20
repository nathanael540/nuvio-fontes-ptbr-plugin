/**
 * Extração do Cineveo: detalhe por ID do TMDB, seleção do episódio e montagem dos streams.
 *
 * Filme usa `servers.dub[]`/`servers.leg[]` do próprio detalhe. Série usa a lista `episodes[]` para
 * confirmar o par pedido e lê os servidores do JSON `initialEpisodeData` da página do episódio.
 * Cada servidor é uma opção independente; a falha de uma não derruba as demais.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { HEADER_PROFILES, fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import {
  AUDIO_GROUPS,
  DETAIL_TYPE,
  DOCUMENTED_NOT_FOUND,
  EPISODE_DATA,
  PROVIDER_NAME,
  SITE_URL,
  STREAM_TYPES,
  detailUrl,
  episodePageUrl,
} from './site.js';

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 * @property {string} [stage] - Etapa atual, usada pelo log da fronteira em `getStreams`.
 */

/**
 * @typedef {object} ServerEntry
 * @property {object} server - Item publicado pela fonte.
 * @property {string} language - Membro do enum LANGUAGE do grupo de áudio.
 * @property {string} group - Chave do grupo de áudio (`dub`, `leg` ou desconhecido).
 * @property {number} index - Posição no grupo, usada no rótulo quando falta o nome.
 */

/**
 * Localiza o pedido no Cineveo e devolve os streams ainda não ordenados.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Promise<object[]>} Streams encontrados; vazio quando a fonte não tem o título ou o episódio.
 * @throws {Error} Em falha de rede, HTTP, JSON, identidade ou estrutura da fonte.
 */
export async function extractStreams(request) {
  validateRequest(request);
  const type = DETAIL_TYPE[request.mediaType];
  const id = String(request.tmdbId).trim();

  request.stage = 'Detalhe';
  const detail = await fetchDetail(type, id);
  if (detail === null) return [];

  if (type === 'movie') {
    request.stage = 'Servidores';
    return collectStreams(readServerEntries(detail.servers), movieContext(detail.item));
  }

  const episode = selectEpisode(detail, request);
  if (episode === null) return [];

  request.stage = 'Episódio';
  const page = await fetchEpisodePage(detail.item, request);
  const pageData = readEpisodeData(page, id, request);
  if (pageData === null) return [];

  request.stage = 'Servidores';
  return collectStreams(readServerEntries(pageData.servers), seriesContext(detail.item, request, page.url));
}

/**
 * Valida o pedido antes de qualquer requisição.
 * @param {StreamRequest} request - Valores recebidos do app.
 * @returns {void}
 * @throws {Error} Se o ID, o tipo de mídia ou as coordenadas de série forem inválidos.
 */
function validateRequest(request) {
  if (!isPlainObject(request)) throw new Error('Pedido inválido: esperado objeto');
  if (!/^\d+$/.test(String(request.tmdbId).trim())) {
    throw new Error(`ID do TMDB inválido: ${String(request.tmdbId)} (esperado número inteiro)`);
  }
  if (!Object.prototype.hasOwnProperty.call(DETAIL_TYPE, request.mediaType)) {
    throw new Error(`Tipo de mídia inválido: ${String(request.mediaType)} (esperado "movie" ou "tv")`);
  }
  if (request.mediaType === 'tv' &&
      (!Number.isInteger(request.season) || request.season < 1 ||
       !Number.isInteger(request.episode) || request.episode < 1)) {
    throw new Error(`Série sem temporada/episódio válidos: season=${request.season} episode=${request.episode} (esperados inteiros a partir de 1)`);
  }
}

/**
 * Consulta o detalhe e trata o 404 documentado da fonte como ausência.
 * @param {string} type - Tipo da API (`movie` ou `series`).
 * @param {string} id - ID do TMDB validado.
 * @returns {Promise<object|null>} Detalhe validado ou null quando a fonte não tem o título.
 * @throws {Error} Em HTTP inesperado, JSON inválido ou identidade divergente.
 */
async function fetchDetail(type, id) {
  const url = detailUrl(type, id);
  // fetchJson lança em 404 antes de o corpo ser lido; o 404 documentado só é ausência pelo corpo.
  const response = await fetch(url, { headers: HEADER_PROFILES.api });
  const body = await response.text();
  if (response.status === 404 && isDocumentedNotFound(response, body)) return null;
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status} em ${url}`);
  const detail = parseJson(body, url);
  validateIdentity(detail, type, id, url);
  return detail;
}

/**
 * Confere se um 404 é o HTML próprio da fonte.
 *
 * O runtime do app pode não expor `response.headers`; nesse caso, o marcador do corpo continua sendo
 * o critério, porque o 404 documentado é um HTML distinto do JSON de sucesso.
 * @param {Response} response - Resposta do `fetch`.
 * @param {string} body - Corpo em texto.
 * @returns {boolean} True quando o 404 tem o corpo documentado da fonte.
 */
function isDocumentedNotFound(response, body) {
  const contentType = readContentType(response);
  return DOCUMENTED_NOT_FOUND.test(body) && (contentType === null || /text\/html/i.test(contentType));
}

/**
 * Content-Type da resposta, quando o runtime expõe os cabeçalhos.
 * @param {Response} response - Resposta do `fetch`.
 * @returns {string|null} Valor do cabeçalho ou null quando indisponível.
 */
function readContentType(response) {
  if (response.headers === undefined || response.headers === null || typeof response.headers.get !== 'function') {
    return null;
  }
  return response.headers.get('content-type');
}

/**
 * Lê um corpo JSON, com a URL na mensagem de erro.
 * @param {string} body - Corpo da resposta.
 * @param {string} url - URL consultada.
 * @returns {*} Valor interpretado.
 * @throws {Error} Se o corpo não for JSON válido.
 */
function parseJson(body, url) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Resposta não é JSON válido em ${url}: ${error.message}`, { cause: error });
  }
}

/**
 * Exige tipo e ID do TMDB iguais ao pedido.
 * @param {*} detail - Resposta interpretada.
 * @param {string} type - Tipo esperado da API.
 * @param {string} id - ID do TMDB pedido.
 * @param {string} url - URL consultada, para a mensagem de erro.
 * @returns {void}
 * @throws {Error} Se o detalhe, o tipo ou o identificador divergirem.
 */
function validateIdentity(detail, type, id, url) {
  if (!isPlainObject(detail)) throw new Error(`Detalhe inválido em ${url}: esperado objeto`);
  if (detail.type !== type) {
    throw new Error(`Tipo divergente em ${url}: esperado "${type}", recebido "${String(detail.type)}"`);
  }
  if (!isPlainObject(detail.item)) throw new Error(`Item ausente em ${url}`);
  if (String(detail.item.tmdb_id) !== id) {
    throw new Error(`tmdb_id divergente em ${url}: esperado ${id}, recebido ${String(detail.item.tmdb_id)}`);
  }
}

/**
 * Escolhe o episódio pelo par pedido, somente quando publicado como disponível.
 * @param {object} detail - Detalhe da série já validado.
 * @param {StreamRequest} request - Pedido com temporada e episódio válidos.
 * @returns {object|null} Episódio encontrado ou null quando o par não está disponível.
 * @throws {Error} Se `episodes` estiver ausente ou fora do formato de lista.
 */
function selectEpisode(detail, request) {
  if (!Array.isArray(detail.episodes)) {
    throw new Error('Campo "episodes" ausente ou inválido no detalhe da série');
  }
  const episode = detail.episodes.find((item) =>
    isPlainObject(item) &&
    item.season === request.season &&
    item.episode === request.episode &&
    item.available === true);
  return episode === undefined ? null : episode;
}

/**
 * Abre a página do episódio no padrão publicado pela fonte.
 * @param {object} item - Item da série no detalhe.
 * @param {StreamRequest} request - Pedido com temporada e episódio válidos.
 * @returns {Promise<{url: string, text: string}>} URL final e HTML da página.
 * @throws {Error} Se o slug faltar ou a página não responder 2xx.
 */
async function fetchEpisodePage(item, request) {
  return fetchPage(episodePageUrl(item.slug, request.season, request.episode));
}

/**
 * Lê o JSON do episódio e confere identidade e coordenada.
 * @param {{url: string, text: string}} page - Página baixada.
 * @param {string} id - ID do TMDB pedido.
 * @param {StreamRequest} request - Pedido com temporada e episódio válidos.
 * @returns {object|null} Dados do episódio ou null quando a página mostra outra coordenada.
 * @throws {Error} Se o bloco faltar, o JSON for inválido ou a série divergir.
 */
function readEpisodeData(page, id, request) {
  const match = EPISODE_DATA.exec(page.text);
  if (match === null) throw new Error(`Bloco "initialEpisodeData" ausente em ${page.url}`);
  const data = parseJson(match[1], page.url);
  if (!isPlainObject(data.series)) throw new Error(`Série ausente em initialEpisodeData de ${page.url}`);
  if (String(data.series.tmdb_id) !== id) {
    throw new Error(`tmdb_id divergente em ${page.url}: esperado ${id}, recebido ${String(data.series.tmdb_id)}`);
  }
  if (!isPlainObject(data.episode)) throw new Error(`Episódio ausente em initialEpisodeData de ${page.url}`);
  const { season, episode } = data.episode;
  if (!Number.isInteger(season) || !Number.isInteger(episode)) {
    throw new Error(`Coordenada inválida em initialEpisodeData de ${page.url}`);
  }
  if (season !== request.season || episode !== request.episode) return null;
  return data;
}

/**
 * Lista os servidores de todos os grupos de áudio publicados.
 *
 * Os grupos conhecidos (`dub` e `leg`) definem o idioma; um grupo desconhecido vira
 * `Idioma Desconhecido` e não é descartado. `servers` ausente ou vazio é ausência.
 * @param {*} servers - Valor do campo `servers`.
 * @returns {ServerEntry[]} Servidores na ordem publicada, com o idioma do grupo.
 * @throws {Error} Se `servers` não for objeto ou um grupo conhecido não for lista.
 */
function readServerEntries(servers) {
  if (servers === undefined || servers === null) return [];
  if (!isPlainObject(servers)) throw new Error('Campo "servers" inválido: esperado objeto');
  const known = new Map(AUDIO_GROUPS.map((group) => [group.key, group.language]));
  const entries = [];
  for (const key of Object.keys(servers)) {
    const list = servers[key];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) {
      if (known.has(key)) throw new Error(`Grupo de áudio "${key}" inválido: esperada lista`);
      continue;
    }
    const language = known.has(key) ? known.get(key) : LANGUAGE.UNKNOWN;
    list.forEach((server, index) => entries.push({ server, language, group: key, index }));
  }
  return entries;
}

/**
 * Resolve cada servidor em isolamento e agrega as falhas.
 * @param {ServerEntry[]} entries - Servidores publicados.
 * @param {object} context - Item, episódio, base das URLs relativas e ordem dos campos de endereço.
 * @returns {object[]} Streams únicos; vazio quando todos os servidores são ausência ou triagem.
 * @throws {Error} Se nenhum stream sair e alguma opção falhar.
 */
function collectStreams(entries, context) {
  const streams = [];
  const causes = [];
  for (const entry of entries) {
    const label = optionLabel(entry);
    try {
      const stream = buildOption(entry, context);
      if (stream !== null) streams.push(stream);
    } catch (error) {
      const cause = sanitizeMessage(error.message);
      causes.push(`${label}: ${cause}`);
      console.warn(`[${PROVIDER_NAME}] Opção ${label} descartada: ${cause}`);
    }
  }
  if (streams.length === 0 && causes.length > 0) {
    throw new Error(`Todas as opções falharam: [${causes.join('; ')}]`);
  }
  return dedupeStreams(streams);
}

/**
 * Monta um stream a partir de um servidor ou descarta o tipo não suportado por triagem.
 * @param {ServerEntry} entry - Servidor e idioma do grupo.
 * @param {object} context - Item, episódio, base das URLs relativas e ordem dos campos de endereço.
 * @returns {object|null} Stream validado ou null em triagem.
 * @throws {Error} Se o servidor, o endereço ou a URL forem inválidos.
 */
function buildOption(entry, context) {
  const { server } = entry;
  if (!isPlainObject(server)) throw new Error('servidor inválido: esperado objeto');
  const type = readStreamType(server.type);
  if (type === null) {
    console.warn(`[${PROVIDER_NAME}] Opção ${optionLabel(entry)} descartada por triagem: tipo "${String(server.type)}" não suportado`);
    return null;
  }
  const address = readAddress(server, context.addressOrder);
  const fields = {
    url: new URL(address, context.baseUrl).href,
    format: buildFormat(context.item, context.episode),
    type,
    language: entry.language,
  };
  const qualityHints = [server.quality, server.name].filter(isText);
  if (qualityHints.length > 0) fields.qualityHints = qualityHints;
  return buildStream(fields);
}

/**
 * Normaliza o tipo declarado pelo servidor.
 * @param {*} value - Valor do campo `type`.
 * @returns {string|null} `mp4`, `hls` ou null quando não é suportado.
 */
function readStreamType(value) {
  if (typeof value !== 'string') return null;
  const type = value.trim().toLowerCase();
  return STREAM_TYPES.includes(type) ? type : null;
}

/**
 * Lê o endereço do servidor na ordem de preferência do tipo de mídia.
 * @param {object} server - Servidor publicado.
 * @param {string[]} order - Campos aceitos, em ordem de prioridade.
 * @returns {string} Endereço não vazio.
 * @throws {Error} Se nenhum campo tiver endereço.
 */
function readAddress(server, order) {
  for (const field of order) {
    const value = server[field];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  throw new Error(`servidor sem "url" nem "download"`);
}

/**
 * Rótulo da opção nos avisos: grupo e nome do servidor.
 * @param {ServerEntry} entry - Servidor e posição no grupo.
 * @returns {string} Rótulo legível.
 */
function optionLabel(entry) {
  const name = isPlainObject(entry.server) && isText(entry.server.name)
    ? entry.server.name.trim()
    : `servidor ${entry.index + 1}`;
  return `${entry.group}: ${name}`;
}

/**
 * Detalhes do formatador para filme.
 * @param {object} item - Item do detalhe.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function movieContext(item) {
  return { item, episode: null, baseUrl: SITE_URL, addressOrder: ['url', 'download'] };
}

/**
 * Detalhes do formatador e base das URLs para série.
 * @param {object} item - Item da série no detalhe.
 * @param {StreamRequest} request - Pedido com temporada e episódio válidos.
 * @param {string} pageUrl - URL final da página do episódio.
 * @returns {object} Contexto de montagem dos streams.
 */
function seriesContext(item, request, pageUrl) {
  return {
    item,
    episode: { season: request.season, episode: request.episode },
    baseUrl: pageUrl,
    addressOrder: ['download', 'url'],
  };
}

/**
 * Monta o campo `format` com os dados que a fonte publica.
 * @param {object} item - Item do detalhe.
 * @param {{season: number, episode: number}|null} episode - Coordenada em série; null em filme.
 * @returns {object} Valor do campo `format` de `buildStream`.
 * @throws {Error} Se o título estiver ausente.
 */
function buildFormat(item, episode) {
  const title = item.name;
  if (typeof title !== 'string' || title.trim() === '') throw new Error('Título ausente no detalhe da fonte');
  const format = { template: FORMATTER.AUTO, addon: PROVIDER_NAME, title: title.trim() };
  const year = readYear(item.year);
  if (year !== null) format.year = year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}

/**
 * Ano da mídia como inteiro, quando publicado em quatro dígitos.
 * @param {*} value - Valor do campo `year`.
 * @returns {number|null} Ano ou null quando a fonte não publica um ano válido.
 */
function readYear(value) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^\d{4}$/.test(text) ? Number(text) : null;
}

/**
 * Remove duplicatas de mesma URL e mesmo idioma, preservando a primeira ocorrência.
 * @param {object[]} streams - Streams montados.
 * @returns {object[]} Novo array sem duplicatas.
 */
function dedupeStreams(streams) {
  const seen = new Set();
  return streams.filter((stream) => {
    const key = `${stream.url}\n${stream.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Remove URL e hash longos das mensagens de log e das causas agregadas.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Indica se o valor é texto não vazio.
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}
