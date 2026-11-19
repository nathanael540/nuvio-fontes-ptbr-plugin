/**
 * Players e montagem dos streams do Donghua No Sekai.
 *
 * Cada `div.slideItem` é uma opção independente. A página `/player` escolhe o host pelo conteúdo,
 * não pelo índice `type`: o player nativo publica `v` e `720`, o player novo publica `url`, o
 * `<source>` publica a mídia direta e o Blogger entrega MP4 progressivos. Dailymotion, StreamSB,
 * Fembed, Wolfstream e Short.ink ficam em triagem.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { ADDON_NAME, attrOf, loadHtml } from './site.js';

const PROVIDER = 'DNSK Player';
const PLAYER_HOST = 'player.donghuanosekai.com';
const SITE_HOSTS = new Set(['donghuanosekai.com', 'www.donghuanosekai.com']);
const BLOGGER_HOSTS = new Set(['blogger.com', 'www.blogger.com']);
const TRIAGE_HOSTS = ['dailymotion.com', 'streamsb.to', 'dnsk.streamsb.to', 'fembed.com', 'wolfstream.tv', 'short.ink', 'youtube.com', 'youtu.be', 'ok.ru'];

/**
 * @typedef {object} MediaOption
 * @property {string} url - URL da mídia.
 * @property {'hls'|'mp4'} type - Tipo do stream.
 * @property {string|null} quality - Qualidade declarada, quando houver.
 * @property {string} provider - Player de origem.
 */

/**
 * Resolve os players em streams.
 *
 * A falha de um player gera `console.warn` e não descarta os demais. Se nenhum stream sair e
 * algum player tiver falhado, o erro agregado sobe; se todos forem triagem, a ausência é válida.
 *
 * @param {{ url: string, label: string }[]} players - Players publicados pela ficha.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ status: 'ok', streams: object[] }|{ status: 'absent' }>} Resultado.
 * @throws {Error} Se todos os players falharem.
 * @example
 * const result = await resolvePlayers(players, request, media);
 */
export async function resolvePlayers(players, request, media) {
  const streams = [];
  const failures = [];
  const seen = new Set();

  for (const player of players) {
    try {
      const html = await fetchText(player.url);
      const options = await readPlayerOptions(html, player.url);
      for (const option of options) {
        if (seen.has(option.url)) continue;
        seen.add(option.url);
        streams.push(buildOptionStream(option, request, media));
      }
    } catch (error) {
      const detail = sanitizeMessage(error.message);
      failures.push(`${player.label}: ${detail}`);
      console.warn(`[${ADDON_NAME}] Opção ${player.label} descartada: ${detail}`);
    }
  }

  if (streams.length > 0) return { status: 'ok', streams };
  if (failures.length > 0) throw new Error(`Nenhum player produziu stream: ${failures.join('; ')}`);
  return { status: 'absent' };
}

/**
 * Lê as mídias de uma página de player.
 *
 * @param {string} html - HTML da página `/player`.
 * @param {string} playerUrl - URL do player, para resolver links relativos.
 * @returns {Promise<MediaOption[]>} Mídias aceitas, sem repetição.
 * @throws {Error} Se o HTML não for texto ou o Blogger falhar.
 */
async function readPlayerOptions(html, playerUrl) {
  const $ = loadHtml(html);
  const options = [];

  const iframes = $('iframe');
  for (let index = 0; index < iframes.length; index += 1) {
    const src = attrOf(iframes.eq(index), 'src');
    if (src === null || src === '') continue;
    const resolved = await readIframeSource(src, playerUrl);
    for (const option of resolved) options.push(option);
  }

  const sources = $('source');
  for (let index = 0; index < sources.length; index += 1) {
    const node = sources.eq(index);
    const src = attrOf(node, 'src');
    if (src === null || src === '') continue;
    const size = attrOf(node, 'size');
    const option = readDirectSource(src, size, playerUrl);
    if (option !== null) options.push(option);
  }

  const unique = [];
  const seen = new Set();
  for (const option of options) {
    if (seen.has(option.url)) continue;
    seen.add(option.url);
    unique.push(option);
  }
  return unique;
}

/**
 * Classifica o `src` de um iframe do player.
 *
 * @param {string} src - Atributo `src`.
 * @param {string} playerUrl - URL da página do player.
 * @returns {Promise<MediaOption[]>} Mídias encontradas.
 * @throws {Error} Se o Blogger responder erro ou não publicar formatos.
 */
async function readIframeSource(src, playerUrl) {
  let url;
  try {
    url = new URL(src, playerUrl);
  } catch {
    return [];
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return [];

  const host = url.hostname.toLowerCase();
  if (isTriageHost(host)) return [];

  if (host === PLAYER_HOST && url.pathname === '/player-nativov2.php') {
    return readNativePlayer(url);
  }
  if (SITE_HOSTS.has(host) && url.pathname === '/player-new/') {
    const target = url.searchParams.get('url');
    const clean = target === null ? '' : target.trim();
    return isHlsUrl(clean) ? [{ url: clean, type: 'hls', quality: null, provider: PROVIDER }] : [];
  }
  if (host === 'dnskcdn.link' && url.pathname.startsWith('/embed2')) {
    const target = url.searchParams.get('id');
    const clean = target === null ? '' : target.trim();
    return isHlsUrl(clean) ? [{ url: clean, type: 'hls', quality: null, provider: PROVIDER }] : [];
  }
  if (BLOGGER_HOSTS.has(host) && url.pathname === '/video.g') {
    const bloggerHtml = await fetchText(url.href);
    const formats = extractBloggerFormats(bloggerHtml);
    return formats.map((format) => ({
      url: format.url,
      type: 'mp4',
      quality: format.qualityLabel,
      provider: 'Blogger',
    }));
  }

  if (isHlsUrl(url.href)) return [{ url: url.href, type: 'hls', quality: null, provider: PROVIDER }];
  if (isMp4Url(url.href)) return [{ url: url.href, type: 'mp4', quality: null, provider: PROVIDER }];
  return [];
}

/**
 * Lê o player nativo publicado em `player-nativov2.php`.
 *
 * @param {URL} url - URL do iframe.
 * @returns {MediaOption[]} HLS principal e alternativa `720`, quando existirem.
 */
function readNativePlayer(url) {
  const options = [];
  const main = url.searchParams.get('v');
  const alternative = url.searchParams.get('720');
  if (main !== null && isHlsUrl(main.trim())) {
    options.push({ url: main.trim(), type: 'hls', quality: null, provider: PROVIDER });
  }
  if (alternative !== null && isHlsUrl(alternative.trim())) {
    options.push({ url: alternative.trim(), type: 'hls', quality: null, provider: PROVIDER });
  }
  return options;
}

/**
 * Lê um `<source>` direto do player.
 *
 * @param {string} src - Atributo `src`.
 * @param {string|null} size - Atributo `size`, quando publicado.
 * @param {string} playerUrl - URL da página do player.
 * @returns {MediaOption|null} Mídia aceita ou `null`.
 */
function readDirectSource(src, size, playerUrl) {
  let url;
  try {
    url = new URL(src, playerUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isTriageHost(url.hostname.toLowerCase())) return null;

  const quality = size !== null && /^\d{3,4}$/.test(size) ? `${size}p` : null;
  if (isHlsUrl(url.href)) return { url: url.href, type: 'hls', quality, provider: PROVIDER };
  if (isMp4Url(url.href)) return { url: url.href, type: 'mp4', quality, provider: PROVIDER };
  return null;
}

/**
 * Monta o stream de uma mídia aceita.
 *
 * @param {MediaOption} option - Mídia resolvida.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {object} Stream validado pelo bloco stream-build.
 * @throws {Error} Se a mídia ou o formatador rejeitarem os dados.
 */
function buildOptionStream(option, request, media) {
  const format = { template: FORMATTER.AUTO, addon: ADDON_NAME, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  const filename = extractFilename(option.url);
  if (filename !== null) format.filename = filename;

  const fields = {
    url: option.url,
    provider: option.provider,
    type: option.type,
    format,
    language: LANGUAGE.SUBTITLED,
  };
  if (option.quality !== null) fields.quality = option.quality;
  return buildStream(fields);
}

/**
 * Extrai o nome do arquivo de um caminho HLS `.../<arquivo>.mp4/index.m3u8`.
 *
 * @param {string} value - URL da mídia.
 * @returns {string|null} Nome do arquivo ou `null`.
 */
function extractFilename(value) {
  const match = /\/([^/]+\.(?:mp4|mkv))\/index\.m3u8(?:$|\?)/i.exec(value);
  return match === null ? null : match[1];
}

/**
 * Indica se a URL é um HLS http(s).
 *
 * @param {string} value - URL.
 * @returns {boolean}
 */
function isHlsUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return /m3u8/i.test(url.pathname) || /m3u8/i.test(url.search);
  } catch {
    return false;
  }
}

/**
 * Indica se a URL é um MP4 ou MKV http(s).
 *
 * @param {string} value - URL.
 * @returns {boolean}
 */
function isMp4Url(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return /\.(?:mp4|mkv)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Reconhece hosts que não entram no contrato.
 *
 * @param {string} host - Hostname.
 * @returns {boolean} True quando é triagem.
 */
function isTriageHost(host) {
  const value = String(host || '').toLowerCase();
  return TRIAGE_HOSTS.some((item) => value === item || value.endsWith(`.${item}`));
}

/**
 * Remove URL e token das mensagens de log.
 *
 * @param {string} message - Mensagem recebida.
 * @returns {string} Mensagem saneada.
 * @example
 * sanitizeMessage('HTTP 403 em https://cdn.example/v.m3u8?token=abc');
 * // 'HTTP 403 em [url]'
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/\b[0-9a-f]{32}\b/gi, '[hash]')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '[token]');
}
