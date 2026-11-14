/**
 * Resolução das famílias de mídia do AmyFlix.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { JWPLAYER_LABEL, PROVIDER_LABEL, RUMBLE_LABEL, SITE } from './site.js';

/**
 * Resolve uma opção de player do AmyFlix.
 * @param {{ label: string, url: string }} option - Rótulo e URL do embed.
 * @param {object} context - Dados da montagem (`media`, `coordinates`).
 * @returns {Promise<object[]>} Streams da opção; vazio quando é triagem.
 * @throws {Error} Em URL inválida, HTML do Rumble sem o objeto esperado ou mídia ausente.
 */
export async function resolveOption(option, context) {
  const absolute = new URL(option.url, SITE).href;
  const parsed = new URL(absolute);
  const host = parsed.hostname.toLowerCase();
  if ((host === 'amyflix.net' || host === 'www.amyflix.net') && parsed.pathname.includes('jwplayer')) {
    return resolveJwplayer(absolute, option, context);
  }
  if (host === 'rumble.com' || host === 'www.rumble.com') return resolveRumble(absolute, option, context);
  return [];
}

/**
 * Resolve o parâmetro `source` de um `jwplayer`.
 * @param {string} url - URL do jwplayer.
 * @param {{ label: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {object[]} Stream com a URL do `source`.
 * @throws {Error} Se o parâmetro não existir ou não for HTTP(S).
 */
function resolveJwplayer(url, option, context) {
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
  const parsed = new URL(decoded);
  const type = parsed.pathname.toLowerCase().endsWith('.m3u8') ? 'hls' : 'mp4';
  return [buildStream(streamFields(decoded, option, context, JWPLAYER_LABEL, type))];
}

/**
 * Resolve um embed do Rumble lendo o objeto `p.f["<id>"]`.
 * @param {string} url - URL do embed.
 * @param {{ label: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @returns {Promise<object[]>} Stream HLS com a qualidade das variantes declaradas.
 * @throws {Error} Se o id não existir, o HTML não publicar o objeto ou `u.hls.url` faltar.
 */
async function resolveRumble(url, option, context) {
  const match = /^\/embed\/([A-Za-z0-9]+)/.exec(new URL(url).pathname);
  if (match === null) throw new Error('rumble.com sem id em /embed/<id>');
  const id = match[1];
  const html = await fetchText(url, { profile: 'player' });
  const payload = readRumblePayload(html, id);
  if (payload === null) throw new Error(`Rumble embed sem o objeto p.f["${id}"]`);
  const hls = payload.u && payload.u.hls && payload.u.hls.url;
  if (typeof hls !== 'string' || !isHttp(hls)) {
    throw new Error(`Rumble embed sem u.hls.url para ${id}`);
  }
  const fields = streamFields(hls, option, context, RUMBLE_LABEL, 'hls');
  const quality = bestRumbleQuality(payload);
  if (quality !== null) fields.quality = quality;
  return [buildStream(fields)];
}

/**
 * Extrai e interpreta o objeto JSON de `p.f["<id>"]`.
 * @param {string} html - HTML do embed.
 * @param {string} id - Id do vídeo no Rumble.
 * @returns {object|null} Objeto do vídeo ou `null` se ausente ou inválido.
 */
function readRumblePayload(html, id) {
  const marker = new RegExp(`p\\.f\\[\\s*["']${escapeRegExp(id)}["']\\s*\\]\\s*=\\s*`);
  const match = marker.exec(html);
  if (match === null) return null;
  const start = match.index + match[0].length;
  const json = readJsonObject(html, start);
  if (json === null) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Recorta o objeto JSON que começa em `start`, respeitando strings e escapes.
 * @param {string} text - Texto completo.
 * @param {number} start - Índice do `{` inicial.
 * @returns {string|null} Objeto recortado ou `null` se não fechar.
 */
function readJsonObject(text, start) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Maior qualidade declarada em `u.ua.tar`.
 * @param {object} payload - Objeto do vídeo.
 * @returns {string|null} Qualidade no formato `<n>p` ou `null` sem chaves numéricas.
 */
function bestRumbleQuality(payload) {
  const tar = payload.u && payload.u.ua && payload.u.ua.tar;
  if (!tar || typeof tar !== 'object' || Array.isArray(tar)) return null;
  let best = 0;
  for (const key of Object.keys(tar)) {
    if (!/^\d+$/.test(key)) continue;
    const value = Number(key);
    if (value > best) best = value;
  }
  return best > 0 ? `${best}p` : null;
}

/**
 * Monta os campos comuns de um stream.
 * @param {string} url - URL absoluta da mídia.
 * @param {{ label: string }} option - Opção.
 * @param {object} context - Dados da montagem.
 * @param {string} provider - Player de origem.
 * @param {'hls'|'mp4'} type - Tipo da mídia.
 * @returns {object} Campos para `buildStream`.
 */
function streamFields(url, option, context, provider, type) {
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
    provider,
    languageHints: [option.label],
  };
  const language = normalizeLanguage(option.label);
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

/**
 * Escapa caracteres especiais para uso em expressão regular.
 * @param {string} value - Texto.
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
