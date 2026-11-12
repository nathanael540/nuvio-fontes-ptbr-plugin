/**
 * Espelhos e player BrStream do CineAgora.
 *
 * A página do conteúdo publica botões `.mirrors .button`; cada link de `watch.brstream.cc` é uma
 * opção independente. O player publica o objeto `video`, de onde saem a playlist master HLS e as
 * resoluções declaradas. Em séries, o episódio é selecionado pelas coordenadas na resposta de
 * `fetch_series_data.php`, nunca pela posição da lista.
 */

import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { extractScriptJson, extractScriptString } from '../_blocks/script-extract/index.mjs';
import { buildOptionStream } from './streams.js';

const PLAYER_ORIGIN = 'https://watch.brstream.cc';
const PLAYER_HOST = 'watch.brstream.cc';
const SERIES_DATA_URL = `${PLAYER_ORIGIN}/fetch_series_data.php`;
const HLS_TYPE = 'hls';
const ACTIVE_STATUS = '1';
const NUMERIC = /^\d+$/;
const MD5 = /^[0-9a-f]{32}$/i;
const SLUG = /^[A-Za-z0-9-]+$/;
const VIDEO_SLUG = /^[A-Za-z0-9]+$/;

/**
 * @typedef {object} MirrorOption
 * @property {string} label - Texto do botão, ex.: "Dublado".
 * @property {string} url - Link do espelho BrStream.
 */

/**
 * Resolve as opções de uma página de conteúdo.
 *
 * Cada espelho é resolvido isoladamente: a falha de um vira `console.warn` e não descarta os
 * demais. Sem nenhum stream, o erro agregado sobe quando alguma opção falhou; ausência em todas
 * devolve `{ status: 'absent' }`.
 *
 * @param {{ url: string, html: string }} content - Página confirmada do catálogo.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ status: 'ok', streams: object[] }|{ status: 'absent' }>} Resultado das opções.
 * @throws {Error} Se todas as opções falharem ou se nenhuma produzir stream com falha registrada.
 */
export async function resolvePlayer(content, request, media) {
  const options = readMirrors(content.html, content.url);
  if (options.length === 0) return { status: 'absent' };
  const streams = [];
  const failures = [];
  for (const option of options) {
    try {
      const resolved = await resolveOption(option, request);
      if (resolved === null) continue;
      streams.push(buildOptionStream(resolved, media, request));
    } catch (error) {
      const detail = `Opção ${option.label} descartada: ${error.message}`;
      failures.push(`Opção ${option.label}: ${error.message}`);
      console.warn(`[CineAgora] ${detail}`);
    }
  }
  if (streams.length > 0) return { status: 'ok', streams };
  if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  return { status: 'absent' };
}

/**
 * Lê os botões de espelho e mantém só os links do BrStream.
 * @param {string} html - HTML da página de filme ou série.
 * @param {string} pageUrl - URL da página, usada para resolver links relativos.
 * @returns {MirrorOption[]} Opções BrStream na ordem da página.
 * @throws {Error} Se um botão de espelho não tiver `data-link` válido.
 */
function readMirrors(html, pageUrl) {
  const $ = getCheerio().load(html);
  const buttons = $('.mirrors .button');
  const options = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const link = button.attr('data-link');
    if (!link) throw new Error(`Botão ${index + 1} de espelho sem data-link`);
    const url = new URL(link, pageUrl);
    if (url.hostname !== PLAYER_HOST) continue;
    const text = button.text().replace(/\s+/g, ' ').trim();
    options.push({ label: text === '' ? `#${index + 1}` : text, url: url.href });
  }
  return options;
}

/**
 * Resolve uma opção conforme o tipo pedido.
 * @param {MirrorOption} option - Espelho BrStream.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ video: { url: string, quality: * }, filename: string|null, label: string }|null>}
 *   Opção resolvida ou null quando a mídia/episódio é ausência.
 * @throws {Error} Se a página ou o player não tiverem a estrutura esperada.
 */
async function resolveOption(option, request) {
  if (request.mediaType === 'tv') return resolveSeriesOption(option, request);
  return resolveMovieOption(option);
}

/**
 * Resolve um espelho de filme em `watch.brstream.cc/watch`.
 * @param {MirrorOption} option - Espelho BrStream.
 * @returns {Promise<{ video: { url: string, quality: * }, filename: string|null, label: string }>} Opção resolvida.
 * @throws {Error} Se o caminho não for de filme ou o player não publicar um `video` válido.
 */
async function resolveMovieOption(option) {
  const path = new URL(option.url).pathname;
  if (path !== '/watch' && path !== '/watch/') {
    throw new Error(`Link de filme com caminho inesperado: ${path}`);
  }
  const html = await fetchText(option.url);
  const video = readVideo(html, option.url);
  return { video, filename: decodeRelease(video.title), label: option.label };
}

/**
 * Resolve um espelho de série: página `tv/<slug>`, episódio por coordenadas e página `watch`.
 * @param {MirrorOption} option - Espelho BrStream.
 * @param {{ season: number, episode: number }} request - Pedido de série validado.
 * @returns {Promise<{ video: { url: string, quality: * }, filename: string|null, label: string }|null>}
 *   Opção resolvida ou null quando a temporada/episódio não existe.
 * @throws {Error} Se a página, a resposta da série ou o player não tiverem a estrutura esperada.
 */
async function resolveSeriesOption(option, request) {
  const path = new URL(option.url).pathname;
  const slug = path.startsWith('/tv/') ? path.slice('/tv/'.length) : '';
  if (!SLUG.test(slug)) throw new Error(`Link de série com caminho inesperado: ${path}`);
  const pageHtml = await fetchText(option.url);
  const seriesSlug = extractScriptString(pageHtml, 'seriesSlug');
  if (seriesSlug === null || !SLUG.test(seriesSlug)) {
    throw new Error(`Página ${option.url} sem seriesSlug válido`);
  }
  const data = await fetchJson(`${SERIES_DATA_URL}?seriesSlug=${encodeURIComponent(seriesSlug)}`, { profile: 'api' });
  const episode = findEpisode(data, request);
  if (episode === null) return null;
  if (typeof episode.video_slug !== 'string' || !VIDEO_SLUG.test(episode.video_slug)) {
    throw new Error(`Episódio S${request.season}E${request.episode} com video_slug inválido`);
  }
  const watchUrl = `${PLAYER_ORIGIN}/watch/${episode.video_slug}`;
  const watchHtml = await fetchText(watchUrl);
  const video = readVideo(watchHtml, watchUrl);
  return { video, filename: decodeRelease(episode.episode_title), label: option.label };
}

/**
 * Seleciona o episódio pelo par temporada/número na resposta de `fetch_series_data.php`.
 * @param {*} data - Resposta interpretada.
 * @param {{ season: number, episode: number }} request - Coordenadas pedidas.
 * @returns {object|null} Entrada do episódio ou null quando a temporada/episódio não existe.
 * @throws {Error} Se `seasons` estiver ausente/fora do formato ou houver episódio repetido.
 */
function findEpisode(data, request) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Resposta da série não é objeto');
  }
  const { seasons } = data;
  if (seasons === null || typeof seasons !== 'object' || Array.isArray(seasons)) {
    throw new Error('Resposta da série sem seasons utilizável');
  }
  const season = seasons[String(request.season)];
  if (season === undefined) return null;
  if (!Array.isArray(season)) throw new Error(`Temporada ${request.season} fora do formato esperado`);
  const matches = season.filter((entry) => entry && typeof entry === 'object' && entry.episode_number === String(request.episode));
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new Error(`Episódio S${request.season}E${request.episode} repetido na resposta`);
  return matches[0];
}

/**
 * Extrai e valida o objeto `video` do player.
 *
 * Exige HLS ativo e os campos usados na playlist master: `uid`, `md5`, `id` e `status`.
 *
 * @param {string} html - HTML da página do player.
 * @param {string} url - URL do player, usada nas mensagens de erro.
 * @returns {{ url: string, quality: *, title: * }} Playlist master e dados declarados.
 * @throws {Error} Se o objeto `video` estiver ausente ou fora do contrato.
 */
function readVideo(html, url) {
  const video = extractScriptJson(html, 'video');
  if (video === null) {
    if (/Video is not found/i.test(html)) throw new Error(`Player ${url} sem vídeo: Video is not found`);
    throw new Error(`Player ${url} sem objeto video`);
  }
  if (typeof video !== 'object' || Array.isArray(video)) {
    throw new Error(`Objeto video inválido em ${url}`);
  }
  if (video.type !== HLS_TYPE) throw new Error(`Tipo de vídeo inesperado em ${url}: ${video.type}`);
  if (video.status !== ACTIVE_STATUS) {
    throw new Error(`Vídeo inativo em ${url}: status ${video.status}`);
  }
  const uid = readNumeric(video.uid, 'uid', url);
  const id = readNumeric(video.id, 'id', url);
  if (typeof video.md5 !== 'string' || !MD5.test(video.md5)) {
    throw new Error(`md5 inválido em ${url}: ${video.md5}`);
  }
  const master = `${PLAYER_ORIGIN}/m3u8/${uid}/${video.md5}/master.txt?s=1&id=${id}&cache=${video.status}`;
  return { url: master, quality: video.quality, title: video.title };
}

/**
 * Valida um campo numérico do objeto `video`.
 * @param {*} value - Valor recebido.
 * @param {string} field - Nome do campo.
 * @param {string} url - URL do player, usada na mensagem.
 * @returns {string} Valor numérico em texto.
 * @throws {Error} Se o valor não for inteiro positivo em texto ou número.
 */
function readNumeric(value, field, url) {
  const text = String(value);
  if (!NUMERIC.test(text)) throw new Error(`${field} inválido em ${url}: ${value}`);
  return text;
}

/**
 * Decodifica o nome da release até duas vezes.
 *
 * O player publica títulos com `%20`; o `episode_title` da série vem com codificação dupla
 * (`%2520`). Valor ausente ou decodificação inválida resulta em `null` para omitir o campo.
 *
 * @param {*} value - Texto publicado pela fonte.
 * @returns {string|null} Nome decodificado ou null.
 */
function decodeRelease(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  const trimmed = decoded.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
