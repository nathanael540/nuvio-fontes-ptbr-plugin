/**
 * Resolução das famílias de mídia do AnimeQ.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { ANIMEQ_REFERER, BLOGGER_LABEL, PROVIDER_LABEL, SITE } from './site.js';

const UNSUPPORTED_HOSTS = new Set(['animeshd.cloud', 'www.animeshd.cloud', 'animes.strp2p.com', 'www.animes.strp2p.com']);
const BLOGGER_HOSTS = new Set(['blogger.com', 'www.blogger.com']);

/**
 * Resolve uma opção do player AnimeQ ou do DooPlay.
 * @param {{ label: string, url: string }} option - Opção com rótulo e URL.
 * @param {object} context - Dados da montagem (`media`, `coordinates`).
 * @returns {Promise<object[]>} Streams da opção; vazio quando é triagem.
 * @throws {Error} Em falha de rede, HTML do Blogger inválido ou contrato quebrado.
 */
export async function resolveOption(option, context) {
  const absolute = new URL(option.url, SITE).href;
  const parsed = new URL(absolute);
  if (parsed.hostname === 'animeq.cloud' && parsed.pathname.includes('jwplayer')) {
    return resolveJwplayer(absolute, option, context);
  }
  if (BLOGGER_HOSTS.has(parsed.hostname)) return resolveBlogger(absolute, option, context);
  if (UNSUPPORTED_HOSTS.has(parsed.hostname)) return [];
  if (isHttp(absolute)) return [buildDirectStream(absolute, option, context)];
  return [];
}

/**
 * Resolve o parâmetro `source` de um `jwplayer`.
 * @param {string} url - URL do jwplayer.
 * @param {{ label: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {Promise<object[]>} Streams.
 * @throws {Error} Se o parâmetro não existir ou não for HTTP(S).
 */
async function resolveJwplayer(url, option, context) {
  const source = new URL(url).searchParams.get('source');
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('jwplayer sem parâmetro source');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    decoded = source;
  }
  if (!isHttp(decoded)) throw new Error('jwplayer com source fora de HTTP(S)');
  return [buildDirectStream(decoded, { ...option, provider: PROVIDER_LABEL }, context)];
}

/**
 * Resolve um iframe do Blogger com o bloco `blogger-video`.
 * @param {string} url - URL do iframe.
 * @param {{ label: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {Promise<object[]>} Streams MP4 progressivos.
 * @throws {Error} Se o HTML não tiver formatos.
 */
async function resolveBlogger(url, option, context) {
  const html = await fetchText(url, { profile: 'player' });
  const formats = extractBloggerFormats(html);
  return formats.map((format) => {
    const fields = streamFields(format.url, { ...option, provider: BLOGGER_LABEL }, context);
    fields.quality = format.qualityLabel || undefined;
    return buildStream(fields);
  });
}

/**
 * Monta um stream direto.
 * @param {string} url - URL absoluta.
 * @param {{ label: string, provider?: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {object} Stream.
 */
function buildDirectStream(url, option, context) {
  return buildStream(streamFields(url, option, context));
}

/**
 * Monta os campos comuns de um stream.
 * @param {string} url - URL absoluta.
 * @param {{ label: string, provider?: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {object} Campos para `buildStream`.
 */
function streamFields(url, option, context) {
  const parsed = new URL(url);
  const type = parsed.pathname.toLowerCase().endsWith('.m3u8') ? 'hls' : 'mp4';
  const language = normalizeLanguage(option.label);
  const format = {
    template: FORMATTER.AUTO,
    addon: PROVIDER_LABEL,
    title: context.media.title,
  };
  if (context.media.year !== null) format.year = context.media.year;
  if (context.coordinates.season !== null) {
    format.season = context.coordinates.season;
    format.episode = context.coordinates.episode;
  }
  const fields = {
    url,
    format,
    type,
    provider: option.provider || PROVIDER_LABEL,
    languageHints: [option.label],
  };
  if (parsed.hostname === 'aniplay.online' || parsed.hostname.endsWith('.aniplay.online')) {
    fields.headers = { Referer: ANIMEQ_REFERER };
  }
  if (language !== null) fields.language = language;
  return fields;
}

/**
 * Indica se o valor é URL HTTP(S).
 * @param {string} value - Texto.
 * @returns {boolean}
 */
function isHttp(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
