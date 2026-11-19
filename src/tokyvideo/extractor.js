/**
 * Extrator do provedor Tokyvideo.
 *
 * Busca o título no portal (perfil `/br`), abre as fichas dos candidatos, confirma a
 * identidade pela JSON-LD `VideoObject` pelo título do TMDB e devolve o stream MP4 direto
 * publicado na página do vídeo (`<source type="video/mp4">`).
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} Card
 * @property {string} title - Título legível da ficha, sem duração.
 * @property {number|null} year - Ano parenthesizado no título, quando presente.
 * @property {string} url - Página absoluta do vídeo (`/br/video/<slug>`).
 */

const BASE = 'https://www.tokyvideo.com';
const SEARCH_PATH = '/br/procurar';
const MAX_CANDIDATES = 3;
const MIN_CARD_SCORE = 0.6;
const CONFIRMED_SIMILARITY = 0.5;
const DURATION_TEXT = /^\d{1,3}:\d{2}(:\d{2})?$/;
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * Remove URL, query e hash da mensagem para os logs não carregarem a assinatura do CDN.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Localiza o stream do título solicitado pelo app: busca, ranking e abertura das fichas.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {string} [providerName] - Nome exibido no formato.
 * @returns {Promise<Stream[]>} Streams montados; lista vazia em ausência ou falha.
 * @throws {Error} Em falha de rede, HTTP ou de montagem de stream.
 */
export async function extractStreams(request, providerName = 'Tokyvideo') {
  const media = await getMediaInfo(request);
  const searchHtml = await fetchText(searchUrl(media));
  const ranked = rankCards(parseSearchResults(searchHtml), media);
  if (ranked.length === 0) return [];

  const streams = [];
  const failures = [];
  for (const entry of ranked.slice(0, MAX_CANDIDATES)) {
    let stream;
    try {
      stream = await resolveCard(entry.card, media, request, providerName);
    } catch (error) {
      const reason = sanitizeMessage(error.message);
      console.warn(`[${providerName}] Opção "${entry.card.title}" descartada: ${reason}`);
      failures.push(`${entry.card.title}: ${reason}`);
      continue;
    }
    if (stream !== null) {
      streams.push(stream);
      break;
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream (${failures.join('; ')})`);
  }
  return [];
}

/**
 * Monta a URL da busca no portal.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string} URL da busca com o título em `q`.
 */
function searchUrl(media) {
  return `${BASE}${SEARCH_PATH}?${new URLSearchParams({ q: media.title }).toString()}`;
}

/**
 * Lê os candidatos de busca: um mapa de URL de vídeo para os textos legíveis das âncoras.
 * @param {string} html - HTML da página de busca.
 * @returns {Card[]} Candidatos na ordem do portal.
 */
function parseSearchResults(html) {
  const titlesByUrl = new Map();
  const pattern = /<a\b[^>]+href=["']([^"']*\/br\/video\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = new URL(match[1], BASE).href;
    const title = cleanText(match[2]);
    if (title === '') continue;
    const titles = titlesByUrl.get(url);
    if (titles === undefined) titlesByUrl.set(url, [title]);
    else titles.push(title);
  }
  const results = [];
  for (const [url, titles] of titlesByUrl) {
    const title = titles.find((candidate) => !DURATION_TEXT.test(candidate));
    if (title === undefined) continue;
    results.push({ title, year: readCardYear(title), url });
  }
  return results;
}

/**
 * Lê o ano parenthesizado no texto do cartão.
 * @param {string} title - Título do cartão.
 * @returns {number|null} Ano ou null quando o cartão não traz.
 */
function readCardYear(title) {
  const match = title.match(/\((\d{4})\)/);
  return match === null ? null : Number(match[1]);
}

/**
 * Decodifica as entidades HTML básicas de um texto.
 * @param {string} text - Texto bruto.
 * @returns {string} Texto decodificado.
 */
function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * Extrai o texto legível de uma âncora: remove tags, decodifica entidades e colapsa espaços.
 * @param {string} text - HTML do âncora.
 * @returns {string} Título do cartão.
 */
function cleanText(text) {
  return decodeEntities(String(text).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Ordena os candidatos da busca por semelhança com os títulos do TMDB.
 * @param {Card[]} cards - Candidatos da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {{ card: Card, score: number }[]} Candidatos com score ≥ 0,6, em ordem decrescente.
 */
function rankCards(cards, media) {
  const mediaTitles = [media.title, media.originalTitle, ...(media.alternativeTitles || [])];
  return cards
    .map((card) => ({ card, score: cardScore(card, mediaTitles) }))
    .filter((entry) => entry.score >= MIN_CARD_SCORE)
    .sort((a, b) => b.score - a.score);
}

/**
 * Normaliza um título para comparação de contenção: `normalizeText` sem espaços.
 * @param {string} title - Título a normalizar.
 * @returns {string} Título normalizado, sem espaços.
 */
function squash(title) {
  return normalizeText(title).replace(/\s+/g, '');
}

/**
 * Score de um cartão: máximo de `titleSimilarity` contra os títulos do TMDB, com regra de
 * contenção (título do TMDB contido em `squash` do título do cartão, sem espaços).
 * @param {Card} card - Candidato da busca.
 * @param {string[]} mediaTitles - Títulos do TMDB considerados.
 * @returns {number} Score de semelhança.
 */
function cardScore(card, mediaTitles) {
  let score = 0;
  const normalizedCard = squash(card.title);
  for (const title of mediaTitles) {
    if (typeof title !== 'string' || title === '') continue;
    score = Math.max(score, titleSimilarity(card.title, title));
    const normalizedTitle = squash(title);
    if (normalizedCard !== '' && normalizedTitle !== '' && normalizedCard.includes(normalizedTitle)) {
      score = Math.min(1, Math.max(score, 0.55 + normalizedTitle.length / normalizedCard.length));
    }
  }
  return score;
}

/**
 * Abre a ficha do candidato, confirma a identidade e monta o stream.
 * @param {Card} card - Candidato selecionado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: string, season: number|null, episode: number| null }} request - Pedido validado.
 * @param {string} providerName - Nome exibido no formato.
 * @returns {Promise<Stream|null>} Stream montado ou null quando a ficha não traz fonte publicada.
 * @throws {Error} Em falha de rede ou contrato.
 */
async function resolveCard(card, media, request, providerName) {
  const page = await fetchText(card.url);
  const parsed = parseVideoPage(page);
  if (!pageTitleConfirmed(parsed.title, media)) {
    if (parsed.cdnUrl !== null) {
      console.warn(`[${providerName}] Opção "${card.title}" descartada: título "${parsed.title}" não confirma`);
    }
    return null;
  }
  if (parsed.cdnUrl === null) return null;
  return buildStream(buildFields(parsed, card, media, request, providerName));
}

/**
 * Lê os dados da página do vídeo: título confirmável, duração e URL do MP4 publicado.
 * @param {string} html - HTML da página da ficha.
 * @returns {{ title: string|null, duration: number|null, cdnUrl: string|null, quality: string|null }} Dados da ficha.
 */
function parseVideoPage(html) {
  const jsonld = readVideoJsonLd(html)[0] || null;
  const duration = readDurationSeconds(jsonld === null ? null : jsonld.duration);
  const title = readVideoTitle(jsonld, html);
  return {
    title,
    duration: duration === null ? readDataVideoDuration(html) : duration,
    cdnUrl: readMp4Source(html),
    quality: nonEmptyText(jsonld === null ? null : jsonld.videoQuality),
  };
}

/**
 * Confirma o título da ficha: `titleSimilarity >= 0,5` ou contenção normalizada do título do TMDB.
 * Título ausente (sem `name` e sem `<title>` legível) confirma: o cartão já confirmou na busca.
 * @param {string|null} pageTitle - Título confirmável da ficha.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {boolean} Se o título da ficha confirma o título do TMDB.
 */
function pageTitleConfirmed(pageTitle, media) {
  if (pageTitle === null) return true;
  const normalized = squash(pageTitle);
  if (normalized === '') return true;
  for (const title of [media.title, media.originalTitle, ...(media.alternativeTitles || [])]) {
    if (typeof title !== 'string' || title === '') continue;
    const normalizedTitle = squash(title);
    if (normalizedTitle === '') continue;
    if (normalized.includes(normalizedTitle) || titleSimilarity(pageTitle, title) >= CONFIRMED_SIMILARITY) {
      return true;
    }
  }
  return false;
}

/**
 * Monta os campos do stream: `url`, `format`, `type`, `provider`, `headers` e `quality`.
 * @param {object} parsed - Dados da ficha (`cdnUrl`, `duration`, `quality`).
 * @param {Card} card - Candidato selecionado (`url` absoluta).
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: string, season: number|null, episode: number| null }} request - Pedido validado.
 * @param {string} providerName - Nome exibido no formato.
 * @returns {object} Campos para `buildStream`.
 */
function buildFields(parsed, card, media, request, providerName) {
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
  };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  if (parsed.duration !== null) format.duration = parsed.duration;
  const fields = {
    url: parsed.cdnUrl,
    format,
    type: 'mp4',
    headers: playbackHeaders(card.url),
    provider: new URL(parsed.cdnUrl).hostname,
  };
  if (parsed.quality !== null) fields.quality = parsed.quality;
  return fields;
}

/**
 * Lê os objetos `VideoObject` do JSON-LD embutido na página (array ou objeto).
 * @param {string} html - HTML da página.
 * @returns {object[]} Objetos com `@type` `VideoObject`.
 */
function readVideoJsonLd(html) {
  const results = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    let data;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    for (const item of Array.isArray(data) ? data : [data]) {
      if (isPlainObject(item) && item['@type'] === 'VideoObject') results.push(item);
    }
  }
  return results;
}

/**
 * Lê o título confirmável da ficha: `name` do `VideoObject`, com fallback ao `<title>` da página.
 * @param {object|null} jsonld - Objeto `VideoObject` lido, se houver.
 * @param {string} html - HTML da página.
 * @returns {string|null} Título ou null.
 */
function readVideoTitle(jsonld, html) {
  const name = jsonld === null ? null : jsonld.name;
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  return readPageTitle(html);
}

/**
 * Lê a URL do `<source>` MP4 da página: `type` contendo `video/mp4`, ou `src` terminado em `.mp4` sem `type`.
 * @param {string} html - HTML da ficha.
 * @returns {string|null} URL do vídeo ou null quando a ficha não traz fonte MP4.
 */
function readMp4Source(html) {
  const pattern = /<source\b[^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const tag = match[0];
    const src = readAttr(tag, 'src');
    if (src === null) continue;
    const type = (readAttr(tag, 'type') || '').toLowerCase();
    const isMp4 = type !== '' ? type.includes('video/mp4') : /\.mp4(\?|#|$)/i.test(src);
    if (isMp4 && isHttpUrl(src)) return src;
  }
  return null;
}

/**
 * Lê um atributo de uma tag HTML isolada.
 * @param {string} tag - Tag já isolada (`<source ...>`).
 * @param {string} name - Nome do atributo, sem aspas.
 * @returns {string|null} Valor do atributo, ou null quando ausente.
 */
function readAttr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match === null ? null : match[1].trim();
}

/**
 * Lê o `<title>` legível da página.
 * @param {string} html - HTML da página.
 * @returns {string|null} Título ou null.
 */
function readPageTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (match === null) return null;
  const title = decodeEntities(match[1]).trim();
  return title === '' ? null : title;
}

/**
 * Converte duração ISO 8601 do JSON-LD (`PnDTnHnMnS`) em segundos.
 * @param {*} value - Valor do campo `duration`.
 * @returns {number|null} Duração em segundos ou null.
 */
function readDurationSeconds(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (match === null) return null;
  const total = Number(match[1] || 0) * 86400
    + Number(match[2] || 0) * 3600
    + Number(match[3] || 0) * 60
    + Number(match[4] || 0);
  return total > 0 ? total : null;
}

/**
 * Lê a duração em segundos pelo atributo `data-video-duration` da página.
 * @param {string} html - HTML da ficha.
 * @returns {number|null} Duração em segundos ou null.
 */
function readDataVideoDuration(html) {
  const match = html.match(/data-video-duration=["']([^"']+)["']/i);
  if (match === null) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Indica se a URL é HTTP(S).
 * @param {string} value - URL a conferir.
 * @returns {boolean} Se o protocolo é http ou https.
 */
function isHttpUrl(value) {
  try {
    return HTTP_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}

/**
 * Devolve o texto sem espaços nas pontas ou null quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null} Texto ou null.
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean} Se é objeto simples.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
