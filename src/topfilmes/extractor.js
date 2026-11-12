/**
 * Extração do TopFilmes: busca por título, confirmação da ficha e resolução dos players em MP4.
 *
 * Fluxo observado em 12/11/2026:
 * 1. `GET /busca?q=<termo>` devolve cartões `.filme` com link `/assistir/<slug>`, `.title` e `.year`.
 * 2. A ficha `/assistir/<slug>` traz o título em `.infos h2`, o ano no primeiro `.info` de quatro
 *    dígitos e as opções em `.links_dub` e `.links_leg`, apontando para `/player/<slug>?player=<n>`.
 * 3. O player devolve `<video>` com `<source src="//topfilmes.biz/direct/..." size="360|720" type="video/mp4">`;
 *    `size` é a altura do vídeo, não o tamanho do arquivo.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { UNKNOWN_QUALITY } from '../_blocks/quality-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';

const SOURCE_URL = 'https://topfilmes.biz';
const SOURCE_HOST = 'topfilmes.biz';
const MEDIA_PROVIDER = 'MediaFire';
const STREAM_TYPE = 'mp4';
const MAX_ALTERNATIVE_TITLES = 2;
const FOUR_DIGIT_YEAR = /^\d{4}$/;
const VIDEO_HEIGHT = /^\d{3,4}$/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada, ignorada em filmes.
 * @property {number|null} episode - Episódio, ignorado em filmes.
 */

/**
 * @typedef {object} SearchResult
 * @property {string} title - Título do cartão.
 * @property {number|null} year - Ano de quatro dígitos ou null.
 * @property {string} url - Endereço absoluto da ficha.
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} url - Endereço absoluto do player.
 * @property {string} language - Idioma do contêiner da ficha.
 */

/**
 * @typedef {object} DetailPage
 * @property {string} title - Título exibido na ficha.
 * @property {number|null} year - Ano exibido na ficha.
 * @property {PlayerOption[]} players - Opções de player no próprio domínio.
 */

/**
 * Localiza o filme na fonte e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título.
 * @throws {Error} Em falha de rede, layout alterado ou dado obrigatório ausente.
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const terms = searchTerms(media);

  for (const term of terms) {
    const results = parseSearchResults(await fetchSearch(term));
    const confirmed = await confirmCandidate(results, media);
    if (confirmed !== null) {
      return resolvePlayers(confirmed.detail, confirmed.year, media, providerName);
    }
  }

  return [];
}

/**
 * Títulos do TMDB a tentar, na ordem: PT-BR, original e até dois alternativos, sem repetição.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos de busca não vazios.
 */
function searchTerms(media) {
  const terms = [media.title, media.originalTitle]
    .concat(media.alternativeTitles.slice(0, MAX_ALTERNATIVE_TITLES));
  const seen = new Set();
  const result = [];
  for (const term of terms) {
    const text = typeof term === 'string' ? term.trim() : '';
    const key = text.toLowerCase();
    if (text === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * Busca um termo na fonte.
 * @param {string} term - Título a pesquisar.
 * @returns {Promise<string>} HTML da página de busca.
 */
function fetchSearch(term) {
  const query = new URLSearchParams({ q: term });
  return fetchText(`${SOURCE_URL}/busca?${query}`, { profile: 'page' });
}

/**
 * Lê os cartões da busca. `.filmes` é o contêiner obrigatório; sem cartões, a mensagem de ausência
 * é aceita e uma página vazia sem essa mensagem é tratada como layout alterado.
 * @param {string} html - HTML da página de busca.
 * @returns {SearchResult[]} Cartões na ordem da página.
 * @throws {Error} Se o contêiner, um link ou um título de cartão faltar.
 */
function parseSearchResults(html) {
  const $ = loadHtml(html);
  const container = $('.filmes');
  if (!container.length) throw new Error('Busca sem o contêiner .filmes');

  const cards = container.find('.filme');
  if (!cards.length) {
    const message = container.text().replace(/\s+/g, ' ').trim();
    if (/nenhum resultado encontrado/i.test(message)) return [];
    throw new Error('Busca sem cartões .filme e sem mensagem de ausência');
  }

  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const href = card.find('a').eq(0).attr('href');
    if (typeof href !== 'string' || href.trim() === '') {
      throw new Error(`Cartão ${index + 1} da busca sem link`);
    }
    const title = card.find('.title').text().trim();
    if (title === '') throw new Error(`Cartão ${index + 1} da busca sem título`);
    results.push({
      title,
      year: readYear(card.find('.year').text()),
      url: new URL(href, SOURCE_URL).href,
    });
  }
  return results;
}

/**
 * Confirma um cartão na ficha, tentando o próximo quando a ficha não corresponde ao TMDB.
 * @param {SearchResult[]} candidates - Cartões do termo buscado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ detail: DetailPage, year: number|null }|null>} Ficha confirmada ou null.
 * @throws {Error} Em falha de rede ou layout alterado da ficha.
 */
async function confirmCandidate(candidates, media) {
  const remaining = candidates.slice();
  while (remaining.length > 0) {
    const match = findBestMatch(remaining, media);
    if (match === null) return null;
    remaining.splice(remaining.indexOf(match.candidate), 1);

    const detail = await readDetail(match.candidate.url);
    const identity = findBestMatch([{ title: detail.title, year: detail.year }], media);
    if (identity === null) continue;

    const year = detail.year === null ? match.candidate.year : detail.year;
    return { detail, year };
  }
  return null;
}

/**
 * Lê título, ano e opções de player de uma ficha.
 * @param {string} url - Endereço da ficha.
 * @returns {Promise<DetailPage>} Dados da ficha.
 * @throws {Error} Se a ficha não tiver título, contêiner de links ou link de player inválido.
 */
async function readDetail(url) {
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);

  const title = $('.infos h2').eq(0).text().trim();
  if (title === '') throw new Error(`Ficha ${url} sem título em .infos h2`);
  if (!$('.links').length) throw new Error(`Ficha ${url} sem o contêiner .links`);

  return {
    title,
    year: readDetailYear($),
    players: readPlayers($, page.url),
  };
}

/**
 * Primeiro `.info` com ano de quatro dígitos na ficha.
 * @param {*} $ - Instância do cheerio.
 * @returns {number|null} Ano ou null quando a ficha não exibe.
 */
function readDetailYear($) {
  const infos = $('.info');
  for (let index = 0; index < infos.length; index += 1) {
    const text = infos.eq(index).text().trim();
    if (FOUR_DIGIT_YEAR.test(text)) return Number(text);
  }
  return null;
}

/**
 * Opções de `.links_dub` e `.links_leg`: somente o próprio domínio em `/player/`, sem repetição.
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - URL final da ficha.
 * @returns {PlayerOption[]} Opções na ordem da página.
 * @throws {Error} Se um link de player estiver sem `href` ou fora de HTTP(S).
 */
function readPlayers($, pageUrl) {
  const selectors = [['.links_dub a', 'Dublado'], ['.links_leg a', 'Legendado']];
  const seen = new Set();
  const players = [];

  for (const [selector, language] of selectors) {
    const links = $(selector);
    for (let index = 0; index < links.length; index += 1) {
      const href = links.eq(index).attr('href');
      if (typeof href !== 'string' || href.trim() === '') {
        throw new Error(`Link de player em ${selector} sem href na ficha`);
      }
      const url = playerUrl(href, pageUrl);
      if (url === null || seen.has(url)) continue;
      seen.add(url);
      players.push({ url, language });
    }
  }
  return players;
}

/**
 * Converte um link da ficha em URL de player aceita, ou null para host/caminho fora do contrato.
 * @param {string} href - Endereço lido da ficha.
 * @param {string} pageUrl - URL final da ficha.
 * @returns {string|null} URL absoluta ou null quando não é player do próprio domínio.
 * @throws {Error} Se o endereço não for uma URL válida.
 */
function playerUrl(href, pageUrl) {
  let url;
  try {
    url = new URL(href, pageUrl);
  } catch (error) {
    throw new Error('Link de player com endereço inválido na ficha', { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.hostname !== SOURCE_HOST) return null;
  if (!url.pathname.startsWith('/player/')) return null;
  return url.href;
}

/**
 * Resolve as opções de player em isolamento e deduplica URL e qualidade.
 * @param {DetailPage} detail - Ficha confirmada.
 * @param {number|null} year - Ano confirmado da ficha ou do cartão.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a ficha não tem player.
 * @throws {Error} Se todas as opções falharem, com a causa de cada uma.
 */
async function resolvePlayers(detail, year, media, providerName) {
  if (detail.players.length === 0) return [];

  const streams = [];
  const failures = [];
  const seen = new Set();

  for (let index = 0; index < detail.players.length; index += 1) {
    const player = detail.players[index];
    const label = `Opção ${index + 1} (${player.language})`;
    try {
      const found = await readPlayerStreams(player, index + 1, year, media, providerName);
      for (const stream of found) {
        const key = `${stream.url}\n${stream.quality}`;
        if (seen.has(key)) continue;
        seen.add(key);
        streams.push(stream);
      }
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.warn(`[${providerName}] ${label} descartada: ${error.message}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  }
  return streams;
}

/**
 * Busca o HTML de um player com mensagem sem a URL, para não vazar query de mídia nos logs.
 * @param {PlayerOption} player - Opção da ficha.
 * @param {number} number - Número da opção nas mensagens.
 * @returns {Promise<string>} HTML do player.
 * @throws {Error} Se a resposta não for 2xx ou a requisição falhar.
 */
async function fetchPlayerHtml(player, number) {
  try {
    return await fetchText(player.url, { profile: 'page' });
  } catch (error) {
    const status = /^HTTP (\d+)/.exec(error.message);
    const cause = status === null ? 'falha na requisição' : `HTTP ${status[1]}`;
    throw new Error(`Player ${number}: ${cause}`, { cause: error });
  }
}

/**
 * Consulta um player e monta um stream por `<source>` MP4.
 * @param {PlayerOption} player - Opção da ficha.
 * @param {number} number - Número da opção nas mensagens.
 * @param {number|null} year - Ano confirmado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Promise<Stream[]>} Streams do player.
 * @throws {Error} Se o player não tiver `<source>`, faltar `src` ou houver URL inválida.
 */
async function readPlayerStreams(player, number, year, media, providerName) {
  const html = await fetchPlayerHtml(player, number);
  const $ = loadHtml(html);
  const sources = $('video source');
  if (!sources.length) throw new Error(`Player ${number} sem <source>`);

  const streams = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources.eq(index);
    const src = source.attr('src');
    if (typeof src !== 'string' || src.trim() === '') {
      throw new Error(`Source ${index + 1} do player ${number} sem src`);
    }
    const url = mediaUrl(src, player.url, index + 1, number);
    if (!isMp4(source.attr('type'), url)) {
      console.log(`[${providerName}] Source ${index + 1} do player ${number} descartado por triagem: tipo não MP4`);
      continue;
    }
    streams.push(buildSourceStream({ url, size: source.attr('size'), language: player.language }, number, index + 1, year, media, providerName));
  }
  return streams;
}

/**
 * Resolve o `src` de um `<source>` para HTTP(S), sem expor a URL de mídia nas mensagens de erro.
 * @param {string} value - Endereço relativo ou absoluto.
 * @param {string} base - URL do player.
 * @param {number} sourceNumber - Posição do source no player.
 * @param {number} playerNumber - Posição do player na ficha.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o endereço não for uma URL HTTP(S) válida.
 */
function mediaUrl(value, base, sourceNumber, playerNumber) {
  let url;
  try {
    url = new URL(value, base);
  } catch (error) {
    throw new Error(`Source ${sourceNumber} do player ${playerNumber} com endereço inválido`, { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Source ${sourceNumber} do player ${playerNumber} não é HTTP(S)`);
  }
  return url.href;
}

/**
 * Indica se o source é MP4 pelo `type` ou pelo caminho.
 * @param {string|undefined} type - Valor de `type`.
 * @param {string} url - URL da mídia.
 * @returns {boolean}
 */
function isMp4(type, url) {
  if (typeof type === 'string' && type.trim().toLowerCase().startsWith('video/mp4')) return true;
  return new URL(url).pathname.toLowerCase().endsWith('.mp4');
}

/**
 * Monta um stream de um `<source>` com a qualidade derivada de `size`.
 * @param {{ url: string, size: string|undefined, language: string }} source - Dados do source.
 * @param {number} playerNumber - Posição do player.
 * @param {number} sourceNumber - Posição do source.
 * @param {number|null} year - Ano confirmado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Stream} Stream montado.
 * @throws {Error} Se `buildStream` rejeitar o resultado.
 */
function buildSourceStream(source, playerNumber, sourceNumber, year, media, providerName) {
  const fields = {
    url: source.url,
    quality: readQuality(source.size),
    language: source.language,
    provider: MEDIA_PROVIDER,
    type: STREAM_TYPE,
    format: formatDetails(providerName, media, year),
  };
  try {
    return buildStream(fields);
  } catch (error) {
    throw new Error(`Source ${sourceNumber} do player ${playerNumber} inválido`, { cause: error });
  }
}

/**
 * Qualidade a partir da altura em `size`; valor ausente ou fora de três/quatro dígitos fica desconhecido.
 * @param {string|undefined} size - Atributo `size` do `<source>`.
 * @returns {string} Qualidade `<size>p` ou "Desconhecida".
 */
function readQuality(size) {
  const text = typeof size === 'string' ? size.trim() : '';
  return VIDEO_HEIGHT.test(text) ? `${text}p` : UNKNOWN_QUALITY;
}

/**
 * Detalhes do formatador: template automático, nome do provedor, título e ano confirmados.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} year - Ano confirmado.
 * @returns {object} Valor do campo `format`.
 */
function formatDetails(providerName, media, year) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (Number.isInteger(year)) format.year = year;
  return format;
}

/**
 * Primeiro ano de quatro dígitos de um texto.
 * @param {string} text - Texto lido do cartão.
 * @returns {number|null}
 */
function readYear(text) {
  const match = /\b(\d{4})\b/.exec(text);
  return match === null ? null : Number(match[1]);
}

/**
 * Carrega o cheerio durante o pedido, como exige o runtime do app.
 * @param {string} html - HTML a interpretar.
 * @returns {*} Função `$` do cheerio.
 * @throws {Error} Se o módulo não estiver disponível.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
