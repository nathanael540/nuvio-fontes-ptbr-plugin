/**
 * Extrator do provedor Pomfy.
 *
 * Consulta a página pública da API Pomfy pelo ID do TMDB, extrai o token de embed
 * e o troca pelo endereço do player Flyfile. A API pública do Flyfile valida o
 * arquivo, pede um servidor de streaming e monta a master HLS adaptativa.
 *
 * A página Pomfy só responde 2xx com `Sec-Fetch-Dest: iframe`. O Byse não é
 * integrado: quando o token só devolve Byse, o resultado é ausência reconhecida.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { extractScriptString } from '../_blocks/script-extract/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const API_BASE = 'https://api.pomfy.stream';
const API_REFERER = `${API_BASE}/`;
const FLYFILE_API = 'https://api.flyfile.app';
const FLYFILE_HOSTS = new Set(['flyfile.app', 'flyf.lat']);
const FLYFILE_PROVIDER = 'Flyfile';
const STREAM_TYPE = 'hls';
const EMBED_PATH = 'embed';
const EMBED_REFERRER = API_REFERER;
const TMDB_ID = /^[1-9]\d*$/;
const HTTP_PROTOCOLS = ['http:', 'https:'];
const PORTUGUESE_TEXT = /\b(?:portugues|portuguese)\b/;
const BRAZIL_TEXT = /\b(?:brazil|brasil|brazilian|brasileiro|brasileira|br|pob)\b/;

// Nome legível para os códigos de legenda mais comuns; código desconhecido usa o rótulo da fonte.
const LANGUAGE_NAMES = Object.freeze({
  por: 'Português',
  pt: 'Português',
  pob: 'Português',
  eng: 'Inglês',
  en: 'Inglês',
  spa: 'Espanhol',
  es: 'Espanhol',
  fra: 'Francês',
  fre: 'Francês',
  fr: 'Francês',
  deu: 'Alemão',
  ger: 'Alemão',
  de: 'Alemão',
  ita: 'Italiano',
  it: 'Italiano',
  jpn: 'Japonês',
  ja: 'Japonês',
  kor: 'Coreano',
  ko: 'Coreano',
  zho: 'Chinês',
  chi: 'Chinês',
  zh: 'Chinês',
  rus: 'Russo',
  ru: 'Russo',
  ara: 'Árabe',
  ar: 'Árabe',
  hin: 'Hindi',
  hi: 'Hindi',
  tur: 'Turco',
  tr: 'Turco',
});

// Formas ISO 639-2/639-1 equivalentes, usadas ao escolher a faixa padrão.
const LANGUAGE_ALIASES = Object.freeze({
  por: 'pt',
  pt: 'pt',
  pob: 'pt',
  eng: 'en',
  en: 'en',
  spa: 'es',
  es: 'es',
  fra: 'fr',
  fre: 'fr',
  fr: 'fr',
  deu: 'de',
  ger: 'de',
  de: 'de',
  ita: 'it',
  it: 'it',
  jpn: 'ja',
  ja: 'ja',
  kor: 'ko',
  ko: 'ko',
  zho: 'zh',
  chi: 'zh',
  zh: 'zh',
  rus: 'ru',
  ru: 'ru',
  ara: 'ar',
  ar: 'ar',
  hin: 'hi',
  hi: 'hi',
  tur: 'tr',
  tr: 'tr',
});

/**
 * Remove URL e hash longo das mensagens para os logs não carregarem mídia assinada ou token.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Extrai os streams do pedido consultando a página Pomfy e o player Flyfile.
 * @param {object} request - Pedido recebido de `getStreams`, atualizado com a etapa corrente.
 * @param {string} request.tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} request.mediaType - Tipo do conteúdo.
 * @param {number|null} request.season - Temporada para séries; null em filmes.
 * @param {number|null} request.episode - Episódio para séries; null em filmes.
 * @param {string} request.stage - Etapa corrente (`Entrada`, `Página`, `Player`, `Arquivo` ou `Streams`).
 * @param {string} [providerName] - Nome do provedor exibido no formatador.
 * @returns {Promise<object[]>} Streams montados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, HTTP, layout, contrato ou `assign` incompleto.
 */
export async function extractStreams(request, providerName = 'Pomfy') {
  request.stage = 'Entrada';
  validateRequest(request);

  request.stage = 'Página';
  const pageUrl = buildPageUrl(request);
  const page = await fetchPage(pageUrl, {
    profile: 'page',
    headers: { Referer: API_REFERER, 'Sec-Fetch-Dest': 'iframe' },
  });
  const metadata = readPageMetadata(page.text);
  const statusToken = readStatusToken(page.text);
  if (statusToken === null) return [];

  request.stage = 'Player';
  const embed = await resolveFlyfileEmbed(statusToken, page.url);
  if (embed === null) return [];

  request.stage = 'Arquivo';
  const embedHeaders = flyfileHeaders(embed.url);
  const file = await fetchJson(`${FLYFILE_API}/api/public/file/${encodeURIComponent(embed.id)}`, {
    profile: 'api',
    headers: embedHeaders,
  });
  if (!isPlainObject(file)) throw new Error('metadata do arquivo não é objeto');
  const ready = readReadyFile(file);
  if (ready === null) return [];

  const assign = await fetchJson(`${FLYFILE_API}/api/streaming/assign/${encodeURIComponent(embed.id)}`, {
    profile: 'api',
    headers: { ...embedHeaders, 'X-Adblock-Detected': '0' },
  });
  const masterUrl = buildMasterUrl(assign);

  request.stage = 'Streams';
  const { asset } = ready;
  const fields = {
    url: masterUrl,
    format: buildFormat(providerName, request, metadata, file.name, asset.originalMetadata),
    quality: ready.quality,
    language: classifyLanguage(asset, readDefaultAudioLanguage(file)),
    provider: FLYFILE_PROVIDER,
    type: STREAM_TYPE,
  };
  if (ready.sizeBytes !== undefined) fields.size = formatBytes(ready.sizeBytes);
  const subtitles = readSubtitles(asset);
  if (subtitles.length > 0) fields.subtitles = subtitles;

  return [buildStream(fields)];
}

/**
 * Valida e normaliza o pedido antes de qualquer requisição.
 * @param {object} request - Pedido recebido de `getStreams`.
 * @returns {void}
 * @throws {Error} Se o ID, o tipo ou as coordenadas de série forem inválidos.
 */
function validateRequest(request) {
  if (!isPlainObject(request)) throw new Error('pedido inválido: esperado objeto');
  const rawId = request.tmdbId;
  const id = typeof rawId === 'number' ? String(rawId) : typeof rawId === 'string' ? rawId.trim() : '';
  if (!TMDB_ID.test(id)) throw new Error(`ID do TMDB inválido: ${describe(rawId)}`);
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error(`tipo de mídia inválido: ${describe(request.mediaType)} (esperado "movie" ou "tv")`);
  }
  if (request.mediaType === 'tv') {
    const { season, episode } = request;
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
      throw new Error(`série sem temporada/episódio válidos: temporada=${season}, episódio=${episode}`);
    }
    request.season = season;
    request.episode = episode;
  } else {
    request.season = null;
    request.episode = null;
  }
  request.tmdbId = id;
}

/**
 * Endereço da página do conteúdo na API Pomfy.
 * @param {object} request - Pedido validado.
 * @returns {string} URL da página.
 */
function buildPageUrl(request) {
  if (request.mediaType === 'movie') return `${API_BASE}/filme/${request.tmdbId}`;
  return `${API_BASE}/serie/${request.tmdbId}/${request.season}/${request.episode}`;
}

/**
 * Lê título e ano da página com a API básica do cheerio.
 * @param {string} html - HTML da página Pomfy.
 * @returns {{ title: string|null, year: number|null }} Metadados opcionais exibidos pela fonte.
 * @throws {Error} Se a página não tiver o elemento `h1.title` que confirma o layout.
 */
function readPageMetadata(html) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const heading = $('h1.title');
  if (heading.length === 0) throw new Error('layout da página sem h1.title');

  const title = heading.eq(0).text().trim();
  const badges = $('.info-badge-dim');
  let year = null;
  for (let index = 0; index < badges.length; index++) {
    const match = /\b(?:19|20)\d{2}\b/.exec(badges.eq(index).text());
    if (match !== null) {
      year = Number(match[0]);
      break;
    }
  }
  return { title: title === '' ? null : title, year };
}

/**
 * Lê o `statusToken` embutido na página. Valor nulo ou ausente significa ausência de mídia.
 * @param {string} html - HTML da página Pomfy.
 * @returns {string|null} Token não vazio ou null.
 */
function readStatusToken(html) {
  const token = extractScriptString(html, 'statusToken');
  if (token === null) return null;
  const trimmed = token.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Troca o token pelo endereço do player e seleciona o embed Flyfile, quando existir.
 * @param {string} token - `statusToken` da página.
 * @param {string} pageUrl - URL final da página, usada como referer da troca.
 * @returns {Promise<{ url: string, id: string }|null>} Embed Flyfile ou null em ausência reconhecida.
 * @throws {Error} Se a resposta não tiver JSON de objeto ou não trouxer nenhum campo de player.
 */
async function resolveFlyfileEmbed(token, pageUrl) {
  const data = await fetchJson(`${API_BASE}/api/play-token?t=${encodeURIComponent(token)}`, {
    profile: 'api',
    headers: { Referer: pageUrl },
  });
  if (!isPlainObject(data)) throw new Error('resposta do player não é objeto');
  const hasPlayerField = ['flyfileUrl', 'byseUrl', 'url']
    .some((field) => Object.prototype.hasOwnProperty.call(data, field));
  if (!hasPlayerField) throw new Error('resposta do player sem campos de endereço');

  const explicit = readFlyfileEmbed(data.flyfileUrl);
  if (explicit !== null) return explicit;
  return readFlyfileEmbed(data.url);
}

/**
 * Interpreta um endereço de embed Flyfile.
 * @param {*} value - Valor recebido em `flyfileUrl` ou `url`.
 * @returns {{ url: string, id: string }|null} URL preservada e ID do embed, ou null quando não é Flyfile.
 */
function readFlyfileEmbed(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (!HTTP_PROTOCOLS.includes(parsed.protocol)) return null;
  if (!FLYFILE_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const parts = parsed.pathname.split('/').filter((part) => part !== '');
  if (parts.length < 2 || parts[0] !== EMBED_PATH) return null;
  const id = parts[1].trim();
  if (id === '') return null;
  return { url: parsed.href, id };
}

/**
 * Cabeçalhos de embed exigidos pela API pública do Flyfile.
 * @param {string} embedUrl - URL do embed que originou a consulta.
 * @returns {Object<string, string>} Cabeçalhos da requisição.
 */
function flyfileHeaders(embedUrl) {
  return {
    Referer: embedUrl,
    'X-FlyFile-View': 'embed',
    'X-Embed-Referrer': EMBED_REFERRER,
  };
}

/**
 * Valida o arquivo Flyfile e escolhe a maior qualidade pronta.
 * @param {object} file - Resposta de `api/public/file/<id>`.
 * @returns {{ asset: object, quality: string, sizeBytes: number|undefined }|null} Dados prontos ou null em ausência.
 */
function readReadyFile(file) {
  const status = nonEmptyText(file.status);
  if (status === null || status.toUpperCase() !== 'READY') return null;

  const asset = file.videoAsset;
  if (!isPlainObject(asset)) return null;

  const qualities = parseQualities(asset.qualities);
  if (qualities === null) return null;
  const ready = qualities.filter((item) => isPlainObject(item) && isReadyStatus(item.status));
  const chosen = selectBestQuality(ready);
  if (chosen === null) return null;

  const quality = nonEmptyText(chosen.quality);
  if (quality === null) return null;
  const sizeBytes = readSize(chosen.sizeBytes) ?? readSize(file.size);
  return { asset, quality, sizeBytes };
}

/**
 * Interpreta `qualities`, que pode vir como lista ou como string JSON.
 * @param {*} value - Valor recebido do arquivo.
 * @returns {Array<*>|null} Lista de qualidades ou null quando o formato é inválido.
 */
function parseQualities(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) ? parsed : null;
}

/**
 * Indica se um status de qualidade está pronto.
 * @param {*} value - Status informado.
 * @returns {boolean}
 */
function isReadyStatus(value) {
  const status = nonEmptyText(value);
  return status !== null && status.toUpperCase() === 'READY';
}

/**
 * Escolhe a qualidade pronta de maior resolução numérica; empates mantêm a primeira.
 * @param {Array<*>} qualities - Itens prontos.
 * @returns {object|null} Item escolhido ou null quando nenhum tem rótulo utilizável.
 */
function selectBestQuality(qualities) {
  let best = null;
  let bestRank = -1;
  for (const item of qualities) {
    const quality = nonEmptyText(item.quality);
    if (quality === null) continue;
    const rank = qualityRank(quality);
    if (best === null || rank > bestRank) {
      best = item;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Altura numérica de um rótulo de qualidade.
 * @param {string} quality - Rótulo como "1080p" ou "4K".
 * @returns {number} Altura em pixels ou -1 quando o rótulo não é numérico.
 */
function qualityRank(quality) {
  if (/^4k$/i.test(quality)) return 2160;
  const match = /^(\d{3,4})p$/i.exec(quality);
  return match === null ? -1 : Number(match[1]);
}

/**
 * Lê um tamanho em bytes não negativo.
 * @param {*} value - Valor recebido.
 * @returns {number|undefined} Bytes ou undefined quando o valor é inválido.
 */
function readSize(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Monta o tamanho em texto com duas casas e limiar de 1 GiB.
 * @param {number} bytes - Tamanho em bytes.
 * @returns {string|undefined} Texto como "1.86 GB" ou undefined para valor inválido.
 */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return undefined;
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (bytes >= gib) return `${(bytes / gib).toFixed(2)} GB`;
  if (bytes >= mib) return `${(bytes / mib).toFixed(2)} MB`;
  return `${Math.trunc(bytes)} B`;
}

/**
 * Lê a URL do master HLS a partir da resposta do `assign`.
 * @param {*} assign - Resposta de `api/streaming/assign/<id>`.
 * @returns {string} URL do master.
 * @throws {Error} Se a resposta não tiver `url` https e `token` não vazio.
 */
function buildMasterUrl(assign) {
  if (!isPlainObject(assign)) throw new Error('resposta do assign não é objeto');
  const url = nonEmptyText(assign.url);
  const token = nonEmptyText(assign.token);
  if (url === null || token === null) throw new Error('assign sem url ou token');

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('assign com url inválida');
  }
  if (parsed.protocol !== 'https:') throw new Error('assign com url fora de https');
  return `${url.replace(/\/+$/, '')}/hls/${token}/master.m3u8`;
}

/**
 * Lê o idioma padrão declarado pelo player.
 * @param {object} file - Resposta de `api/public/file/<id>`.
 * @returns {string|null} Código declarado ou null.
 */
function readDefaultAudioLanguage(file) {
  const settings = file.videoSettings;
  return isPlainObject(settings) ? nonEmptyText(settings.defaultAudioLanguage) : null;
}

/**
 * Classifica o idioma pelo áudio padrão e pelas legendas em português.
 * @param {object} asset - `videoAsset` do arquivo.
 * @param {string|null} defaultAudioLanguage - Idioma padrão declarado.
 * @returns {string} Membro do enum LANGUAGE.
 */
function classifyLanguage(asset, defaultAudioLanguage) {
  const tracks = Array.isArray(asset.audioTracks)
    ? asset.audioTracks.filter((track) => isPlainObject(track))
    : [];
  const audio = selectDefaultAudio(tracks, defaultAudioLanguage);

  if (audio !== null && isPortugueseAudio(audio)) {
    return isBrazilian(audio) ? LANGUAGE.DUBBED : LANGUAGE.DUBBED_NON_PT_BR;
  }

  const portugueseSubtitle = findPortugueseSubtitle(asset.subtitles);
  if (portugueseSubtitle !== null) {
    return portugueseSubtitle.brazil ? LANGUAGE.SUBTITLED : LANGUAGE.SUBTITLED_NON_PT_BR;
  }

  return audio === null ? LANGUAGE.UNKNOWN : LANGUAGE.NON_PT_BR;
}

/**
 * Escolhe a faixa de áudio padrão: `default: true`, depois a compatível com o idioma declarado.
 * @param {object[]} tracks - Faixas de áudio válidas.
 * @param {string|null} defaultAudioLanguage - Idioma padrão declarado.
 * @returns {object|null} Faixa escolhida ou null sem faixas.
 */
function selectDefaultAudio(tracks, defaultAudioLanguage) {
  const explicit = tracks.find((track) => track.default === true);
  if (explicit !== undefined) return explicit;

  const preferred = canonicalCode(defaultAudioLanguage);
  if (preferred !== null) {
    const match = tracks.find((track) => canonicalCode(track.lang) === preferred);
    if (match !== undefined) return match;
  }
  return tracks.length > 0 ? tracks[0] : null;
}

/**
 * Indica se a faixa de áudio é português.
 * @param {object} track - Faixa de áudio.
 * @returns {boolean}
 */
function isPortugueseAudio(track) {
  if (canonicalCode(track.lang) === 'pt') return true;
  const label = nonEmptyText(track.label);
  return label !== null && PORTUGUESE_TEXT.test(normalizeText(label));
}

/**
 * Indica se a faixa ou legenda cita Brasil.
 * @param {object} item - Faixa de áudio ou legenda.
 * @returns {boolean}
 */
function isBrazilian(item) {
  const text = `${nonEmptyText(item.lang) || ''} ${nonEmptyText(item.label) || ''}`;
  return BRAZIL_TEXT.test(normalizeText(text));
}

/**
 * Procura a primeira legenda em português utilizável e informa se ela cita Brasil.
 * @param {*} subtitles - Lista anunciada pelo arquivo.
 * @returns {{ brazil: boolean }|null} Evidência encontrada ou null.
 */
function findPortugueseSubtitle(subtitles) {
  if (!Array.isArray(subtitles)) return null;
  for (const item of subtitles) {
    if (!isPlainObject(item) || !isHttpUrl(item.url)) continue;
    const isPortuguese = canonicalCode(item.lang) === 'pt'
      || (nonEmptyText(item.label) !== null && PORTUGUESE_TEXT.test(normalizeText(item.label)));
    if (isPortuguese) return { brazil: isBrazilian(item) };
  }
  return null;
}

/**
 * Converte as legendas anunciadas em legendas do contrato, descartando só as inválidas.
 * @param {object} asset - `videoAsset` do arquivo.
 * @returns {Array<{ url: string, language: string }>} Legendas utilizáveis.
 */
function readSubtitles(asset) {
  if (!Array.isArray(asset.subtitles)) return [];
  const subtitles = [];
  for (const item of asset.subtitles) {
    if (!isPlainObject(item) || !isHttpUrl(item.url)) continue;
    const language = subtitleLanguage(item);
    if (language === null) continue;
    subtitles.push({ url: item.url.trim(), language });
  }
  return subtitles;
}

/**
 * Nome legível da legenda: mapa para códigos conhecidos, rótulo da fonte para os demais.
 * @param {object} item - Legenda anunciada.
 * @returns {string|null} Idioma legível ou null quando não há código nem rótulo.
 */
function subtitleLanguage(item) {
  const code = baseCode(item.lang);
  if (code !== null && LANGUAGE_NAMES[code] !== undefined) return LANGUAGE_NAMES[code];
  const label = nonEmptyText(item.label);
  if (label !== null) return label;
  return code;
}

/**
 * Monta os detalhes de apresentação do stream para o formatador.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {object} request - Pedido validado.
 * @param {{ title: string|null, year: number|null }} metadata - Metadados da página.
 * @param {*} fileName - Nome do arquivo informado pelo Flyfile.
 * @param {*} originalMetadata - Metadado original, em string JSON ou objeto.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function buildFormat(providerName, request, metadata, fileName, originalMetadata) {
  const format = { template: FORMATTER.AUTO, addon: providerName };
  if (metadata.title !== null) format.title = metadata.title;
  if (metadata.year !== null) format.year = metadata.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  const name = nonEmptyText(fileName);
  if (name !== null) format.filename = name;

  const extra = readOriginalMetadata(originalMetadata);
  if (extra.bitrate !== undefined) format.bitrate = extra.bitrate;
  if (extra.duration !== undefined) format.duration = extra.duration;
  return format;
}

/**
 * Lê bitrate e duração do metadado original sem invalidar o stream quando o JSON é inválido.
 * @param {*} value - `originalMetadata` do arquivo.
 * @returns {{ bitrate?: number, duration?: number }} Campos disponíveis.
 */
function readOriginalMetadata(value) {
  let data = value;
  if (typeof value === 'string') {
    if (value.trim() === '') return {};
    try {
      data = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!isPlainObject(data)) return {};

  const extra = {};
  const bitrateKbps = Number(data.bitrateKbps);
  if (Number.isFinite(bitrateKbps) && bitrateKbps > 0) extra.bitrate = Math.round(bitrateKbps * 1000);
  const durationSec = Number(data.durationSec);
  if (Number.isFinite(durationSec) && durationSec > 0) extra.duration = Math.round(durationSec);
  return extra;
}

/**
 * Código ISO base, sem região e em minúsculas.
 * @param {*} value - Código recebido.
 * @returns {string|null} Código base ou null.
 */
function baseCode(value) {
  const text = nonEmptyText(value);
  if (text === null) return null;
  return text.toLowerCase().split(/[-_]/)[0];
}

/**
 * Código canônico curto (por/eng/spa viram pt/en/es), usado para comparar idiomas.
 * @param {*} value - Código recebido.
 * @returns {string|null} Código canônico ou null.
 */
function canonicalCode(value) {
  const code = baseCode(value);
  if (code === null) return null;
  return LANGUAGE_ALIASES[code] || code;
}

/**
 * Indica se o valor é uma URL HTTP(S).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return HTTP_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}

/**
 * Devolve o texto sem espaços nas pontas ou null quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null} Texto limpo ou null.
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
