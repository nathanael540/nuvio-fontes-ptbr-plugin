/**
 * Resolução do player `player3` do `redecanais.deals`.
 *
 * A ficha publica `iframe[name="Player"]` com `vid` no formato `m<tmdb>.mp4` (filme) ou
 * `e<tmdb>-<temporada>-<episódio>.mp4` (série). A página do player publica `var SOURCE_URL`,
 * que aponta para `action=resolve`; a resposta é JSON `{ok, src, download}`. O `audio` do
 * `download`/`src` é a única prova do idioma do arquivo. A URL de mídia é assinada e efêmera.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { extractScriptString } from '../_blocks/script-extract/index.mjs';

const HTTP_PROTOCOLS = ['http:', 'https:'];
const MOVIE_VID = /^m(\d+)\.mp4$/i;
const SERIES_VID = /^e(\d+)-(\d+)-(\d+)\.mp4$/i;

/**
 * @typedef {object} PlayerFrame
 * @property {string} url - URL absoluta do player.
 * @property {string} vid - Identificador de mídia publicado no iframe.
 * @property {string|null} server - Parâmetro `server` do iframe (ex.: "XT"), quando presente.
 */

/**
 * @typedef {object} PlayerMedia
 * @property {string} url - URL de mídia resolvida.
 * @property {string} language - Membro do enum `LANGUAGE` provado pelo `audio` do arquivo.
 */

/**
 * Localiza o iframe do player na ficha ou na página do episódio.
 * @param {string} contentHtml - HTML da ficha.
 * @param {string} contentUrl - URL final da página, usada para resolver o `src` relativo.
 * @returns {PlayerFrame} Player encontrado.
 * @throws {Error} Se a página não publicar `iframe[name="Player"]` com `src` e `vid`.
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
    const params = new URL(url).searchParams;
    const vid = params.get('vid');
    if (typeof vid !== 'string' || vid.trim() === '') {
      throw new Error(`iframe Player sem vid em ${contentUrl}`);
    }
    return { url, vid: vid.trim(), server: params.get('server') || null };
  }
  throw new Error(`Ficha sem iframe Player em ${contentUrl}`);
}

/**
 * Confere se o `vid` do player corresponde ao TMDB, à temporada e ao episódio pedidos.
 * @param {PlayerFrame} frame - Player localizado.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {boolean} True quando o `vid` confirma a identidade.
 * @throws {Error} Se o `vid` estiver fora dos formatos publicados pela fonte.
 */
export function matchesRequest(frame, request) {
  const tmdbId = String(request.tmdbId);
  const movie = MOVIE_VID.exec(frame.vid);
  if (movie !== null) return request.mediaType === 'movie' && movie[1] === tmdbId;

  const series = SERIES_VID.exec(frame.vid);
  if (series !== null) {
    return request.mediaType === 'tv'
      && series[1] === tmdbId
      && Number(series[2]) === request.season
      && Number(series[3]) === request.episode;
  }
  throw new Error(`vid fora do formato m<tmdb>.mp4 ou e<tmdb>-<temporada>-<episódio>.mp4: "${frame.vid}"`);
}

/**
 * Abre o player, lê `SOURCE_URL` e resolve o JSON de mídia.
 * @param {PlayerFrame} frame - Player localizado.
 * @returns {Promise<PlayerMedia>} MP4 resolvido e idioma provado pelo `audio`.
 * @throws {Error} Se o player não publicar `SOURCE_URL` ou o resolve recusar a mídia.
 */
export async function resolvePlayerMedia(frame) {
  const page = await fetchPage(frame.url, { profile: 'player' });
  const sourceUrl = extractScriptString(page.text, 'SOURCE_URL');
  if (sourceUrl === null || sourceUrl.trim() === '') {
    throw new Error(`Player sem SOURCE_URL em ${page.url}`);
  }

  const resolveUrl = new URL(sourceUrl.trim(), page.url).href;
  const data = await fetchJson(resolveUrl, { profile: 'player' });
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Resolve sem objeto JSON em ${resolveUrl}`);
  }
  if (data.ok !== true) {
    throw new Error(`Resolve recusou a mídia (ok=${String(data.ok)}) em ${resolveUrl}`);
  }

  const raw = typeof data.src === 'string' ? data.src.trim() : '';
  if (raw === '') throw new Error(`Resolve sem src em ${resolveUrl}`);

  let url;
  try {
    url = new URL(raw, resolveUrl).href;
  } catch {
    throw new Error(`src inválido no resolve ${resolveUrl}`);
  }
  if (!HTTP_PROTOCOLS.includes(new URL(url).protocol)) {
    throw new Error(`src fora de HTTP(S) no resolve ${resolveUrl}`);
  }
  return { url, language: audioLanguage(data, resolveUrl) };
}

/**
 * Classifica o idioma pelo `audio` do `download` e, na falta dele, do `src`.
 * @param {{ download?: *, src?: * }} data - JSON do resolve.
 * @param {string} baseUrl - URL do resolve, usada para interpretar caminhos relativos.
 * @returns {string} Membro do enum `LANGUAGE`.
 */
function audioLanguage(data, baseUrl) {
  const audio = readAudio(data.download, baseUrl) || readAudio(data.src, baseUrl);
  if (audio === 'dub') return LANGUAGE.DUBBED;
  if (audio === 'leg') return LANGUAGE.SUBTITLED;
  return LANGUAGE.UNKNOWN;
}

/**
 * Lê o parâmetro `audio` de uma URL publicada no resolve.
 * @param {*} value - Valor de `download` ou `src`.
 * @param {string} baseUrl - URL base para valores relativos.
 * @returns {string|null} Marcador em minúsculas ou null quando ausente ou inválido.
 */
function readAudio(value, baseUrl) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let audio;
  try {
    audio = new URL(value.trim(), baseUrl).searchParams.get('audio');
  } catch {
    return null;
  }
  return typeof audio === 'string' && audio.trim() !== '' ? audio.trim().toLowerCase() : null;
}
