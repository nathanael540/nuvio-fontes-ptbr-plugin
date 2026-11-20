/**
 * Resolução do player `player3` do RedeCanais.
 *
 * A ficha publica `iframe[name="Player"]` com `/player3/server.php`. O player responde 403 sem
 * `Referer` da ficha e publica `SRC`, `SOURCE_FORMAT` e `SOURCE_MIME`. A URL de mídia é assinada e
 * efêmera: não entra em log, fixture nem cache.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { extractScriptString } from '../_blocks/script-extract/index.mjs';

const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {object} PlayerFrame
 * @property {string} url - URL absoluta do player.
 * @property {string|null} server - Parâmetro `server` do iframe (ex.: "R2"), quando presente.
 */

/**
 * @typedef {object} PlayerMedia
 * @property {string} url - URL de mídia resolvida contra o player.
 * @property {'mp4'|'hls'} type - Formato declarado ou reconhecido no caminho.
 */

/**
 * Localiza o iframe do player na ficha.
 * @param {string} contentHtml - HTML da ficha.
 * @param {string} contentUrl - URL final da ficha, usada para resolver o `src` relativo.
 * @returns {PlayerFrame} Player encontrado.
 * @throws {Error} Se a ficha não publicar `iframe[name="Player"]` com `src`.
 */
export function findPlayerFrame(contentHtml, contentUrl) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(contentHtml);
  const frames = $('iframe[name]');
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames.eq(index);
    if (frame.attr('name') !== 'Player') continue;
    const src = frame.attr('src');
    if (src === undefined || src.trim() === '') {
      throw new Error(`iframe Player sem src em ${contentUrl}`);
    }
    const url = new URL(src, contentUrl).href;
    return { url, server: new URL(url).searchParams.get('server') || null };
  }
  throw new Error(`Ficha sem iframe Player em ${contentUrl}`);
}

/**
 * Abre o player com `Referer` da ficha e lê a mídia declarada.
 * @param {PlayerFrame} frame - Player localizado na ficha.
 * @param {string} refererUrl - URL final da ficha.
 * @returns {Promise<PlayerMedia|null>} Mídia resolvida; null quando o formato declarado está fora do contrato.
 * @throws {Error} Se o player falhar ou não publicar `SRC` utilizável.
 */
export async function resolvePlayerMedia(frame, refererUrl) {
  const page = await fetchPage(frame.url, {
    profile: 'player',
    headers: { Referer: refererUrl },
  });
  const raw = extractScriptString(page.text, 'SRC');
  if (raw === null || raw.trim() === '') {
    throw new Error(`Player sem SRC em ${page.url}`);
  }

  let url;
  try {
    url = new URL(raw.trim(), page.url).href;
  } catch {
    throw new Error(`SRC inválido no player ${page.url}`);
  }
  if (!HTTP_PROTOCOLS.includes(new URL(url).protocol)) {
    throw new Error(`SRC fora de HTTP(S) no player ${page.url}`);
  }

  const declared = (extractScriptString(page.text, 'SOURCE_FORMAT') || '').trim().toLowerCase();
  const mime = (extractScriptString(page.text, 'SOURCE_MIME') || '').toLowerCase().split(';')[0].trim();
  const path = new URL(url).pathname.toLowerCase();

  if (declared === 'file' && mime === 'video/mp4') return { url, type: 'mp4' };
  if (declared === 'hls' || path.endsWith('.m3u8')) return { url, type: 'hls' };
  return null;
}
