/**
 * Players do AniBunker.
 *
 * A página do episódio lista `data-player-id` e o carregador público `POST /php/loader.php`
 * devolve a URL de cada opção. O carregador exige `Origin` do catálogo; sem ele, responde HTTP 403
 * com `{"success":false}`. Cada player é resolvido em isolamento: a falha de um gera aviso e
 * preserva os demais.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { fetchJson, fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { loadHtml } from './html.js';
import { BLOGGER_TOKEN_PREFIX, LOADER_URL, SOURCE_URL } from './site.js';

const BLOGGER_REFERER = 'https://www.blogger.com/';
const SENDVID_HOSTS = new Set(['sendvid.com', 'www.sendvid.com']);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;
const DIRECT_MEDIA = /\.(?:mp4|m3u8|mkv|webm)$/i;
// Itags progressivos observados no player do Blogger.
const ITAG_QUALITY = Object.freeze({ 18: '360p', 22: '720p', 37: '1080p', 59: '480p' });

/**
 * @typedef {object} PlayerOption
 * @property {string} url - URL da mídia.
 * @property {'mp4'|'hls'} type - Tipo do stream.
 * @property {string} provider - Rótulo do player.
 * @property {string[]} [qualityHints] - Rótulos ou itags de qualidade.
 * @property {Object<string, string>} [headers] - Cabeçalhos de reprodução.
 */

/**
 * Resolve os players de um episódio em isolamento.
 *
 * `url_mega` é descartado por triagem, sem aviso. A falha de um player gera
 * `[<provedor>] Opção <rótulo> descartada: <causa>` e preserva os demais. Se nenhum player produzir
 * stream e algum tiver falhado, lança erro agregado com as causas.
 *
 * @param {{ videoId: string, players: { id: string, label: string }[] }} episode - Página lida.
 * @param {string} pageUrl - Página do episódio, usada como `Referer` nas resoluções.
 * @param {string} providerName - Nome do provedor para os avisos.
 * @returns {Promise<PlayerOption[]>} Opções resolvidas na ordem dos players.
 * @throws {Error} Se todos os players falharem.
 * @example
 * await resolvePlayers(episode, 'https://anibunker.com/anime/x-episodio-1-legendado', 'AniBunker');
 * // [{ url: 'https://video.example.test/1080p.mp4', type: 'mp4', provider: 'HD+' }]
 */
export async function resolvePlayers(episode, pageUrl, providerName) {
  const options = episode.players.filter((player) => player.id !== 'url_mega');
  if (options.length === 0) return [];

  const results = await Promise.all(options.map(async (player) => {
    try {
      return { ok: true, label: player.label, streams: await resolvePlayer(player, episode.videoId, pageUrl) };
    } catch (error) {
      return { ok: false, label: player.label, error };
    }
  }));

  const streams = [];
  const failures = [];
  for (const result of results) {
    if (result.ok) {
      streams.push(...result.streams);
      continue;
    }
    failures.push({ label: result.label, message: result.error.message });
    console.warn(`[${providerName}] Opção ${result.label} descartada: ${sanitizeMessage(result.error.message)}`);
  }

  if (streams.length > 0) return streams;
  if (failures.length === 0) return [];
  const causes = failures.map((failure) => `${failure.label}: ${sanitizeMessage(failure.message)}`).join('; ');
  throw new Error(`Nenhum player produziu stream: ${causes}`);
}

/**
 * Remove URL e tokens longos das mensagens de log.
 *
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem sem URL nem token.
 * @example
 * sanitizeMessage('HTTP 500 em https://exemplo.test/video?token=abc');
 * // 'HTTP 500 em [url]'
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '[token]');
}

/**
 * Resolve um player escolhido.
 * @param {{ id: string, label: string }} player - Player da página.
 * @param {string} videoId - `data-video-id` do episódio.
 * @param {string} pageUrl - Página do episódio.
 * @returns {Promise<PlayerOption[]>} Opções de mídia.
 * @throws {Error} Se o carregador recusar ou a opção não entregar mídia.
 */
async function resolvePlayer(player, videoId, pageUrl) {
  const target = await loadTarget(player.id, videoId);
  if (player.id === 'token') return resolveBlogger(target, player.label, pageUrl);
  if (player.id === 'url_drive') return resolveDrive(target, player.label);
  if (player.id === 'sendvid') return resolveSendvid(target, player.label, pageUrl);
  if (player.id === 'url_hd' || player.id === 'url_hd_2' || player.id === 'url_hd_3') {
    return resolveHd(target, player.label, pageUrl);
  }
  return resolveGeneric(target, player.label, pageUrl);
}

/**
 * Chama o carregador e devolve a URL publicada.
 * @param {string} playerId - `player_id`.
 * @param {string} videoId - `video_id`.
 * @returns {Promise<string>} URL, token ou identificador publicado.
 * @throws {Error} Se a resposta não for 2xx/JSON, vier fora do esquema ou recusar a opção.
 */
async function loadTarget(playerId, videoId) {
  const data = await fetchJson(LOADER_URL, {
    method: 'POST',
    profile: 'api',
    form: { player_id: playerId, video_id: videoId },
    headers: { Origin: SOURCE_URL },
  });
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Carregador do AniBunker fora do esquema para ${playerId}`);
  }
  if (data.success !== true) {
    const reason = typeof data.message === 'string' && data.message.trim() !== '' ? data.message.trim() : 'sem mensagem';
    throw new Error(`Carregador recusou ${playerId}: ${reason}`);
  }
  const url = typeof data.url === 'string' ? data.url.trim() : '';
  if (url === '') throw new Error(`Carregador do AniBunker sem URL para ${playerId}`);
  return url;
}

/**
 * Resolve o token do Blogger e devolve um MP4 por formato progressivo.
 * @param {string} token - Token publicado pelo carregador.
 * @param {string} label - Rótulo do player.
 * @param {string} pageUrl - Página do episódio.
 * @returns {Promise<PlayerOption[]>} MP4 progressivos.
 * @throws {Error} Se a página do Blogger não tiver `streamingData.formats` ou nenhum MP4.
 */
async function resolveBlogger(token, label, pageUrl) {
  const url = bloggerTokenUrl(token);
  const html = await fetchText(url, { profile: 'player', headers: { Referer: pageUrl } });
  const formats = extractBloggerFormats(html);
  const headers = playbackHeaders(BLOGGER_REFERER);
  return formats.map((format) => {
    const quality = format.qualityLabel || itagQuality(format.url);
    const option = { url: format.url, type: 'mp4', provider: label, headers };
    if (quality !== null) option.qualityHints = [quality];
    return option;
  });
}

/**
 * Monta a URL do player do Blogger com o prefixo observado.
 * @param {string} token - Token publicado.
 * @returns {string}
 * @throws {Error} Se o token for vazio.
 */
function bloggerTokenUrl(token) {
  const text = typeof token === 'string' ? token.trim() : '';
  if (text === '') throw new Error('Player YTube sem token');
  const value = text.startsWith(BLOGGER_TOKEN_PREFIX) ? text : `${BLOGGER_TOKEN_PREFIX}${text}`;
  return `https://www.blogger.com/video.g?token=${value}`;
}

/**
 * Qualidade de um itag progressivo conhecido.
 * @param {string} url - URL do vídeo.
 * @returns {string|null}
 */
function itagQuality(url) {
  const match = /[?&]itag=(\d+)/.exec(url);
  if (match === null) return null;
  return ITAG_QUALITY[match[1]] || null;
}

/**
 * Resolve o Google Drive como download direto MP4.
 * @param {string} target - Identificador ou URL publicada.
 * @param {string} label - Rótulo do player.
 * @returns {PlayerOption[]} Um MP4 sem qualidade declarada.
 * @throws {Error} Se não houver identificador reconhecível.
 */
function resolveDrive(target, label) {
  const id = driveId(target);
  return [{
    url: `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    type: 'mp4',
    provider: label,
  }];
}

/**
 * Lê o identificador do Google Drive.
 * @param {string} target - Identificador ou URL publicada.
 * @returns {string}
 * @throws {Error} Se o valor não for identificador nem URL do Drive.
 */
function driveId(target) {
  const text = typeof target === 'string' ? target.trim() : '';
  if (DRIVE_ID.test(text)) return text;
  if (isHttpUrl(text)) {
    const parsed = new URL(text);
    const fromQuery = parsed.searchParams.get('id');
    if (fromQuery && DRIVE_ID.test(fromQuery)) return fromQuery;
    const fromPath = /\/d\/([A-Za-z0-9_-]{10,})/.exec(parsed.pathname);
    if (fromPath !== null) return fromPath[1];
  }
  throw new Error('Player Gdrive sem identificador');
}

/**
 * Resolve o Sendvid: MP4 direto ou `<source type="video/mp4">` do embed.
 * @param {string} target - URL publicada pelo carregador.
 * @param {string} label - Rótulo do player.
 * @param {string} pageUrl - Página do episódio.
 * @returns {Promise<PlayerOption[]>} Um MP4 sem qualidade declarada.
 * @throws {Error} Se a URL não for http(s) ou o embed não tiver mídia.
 */
async function resolveSendvid(target, label, pageUrl) {
  if (!isHttpUrl(target)) throw new Error('Player Sendvid sem URL http(s)');
  if (isDirectMedia(target)) {
    return [{ url: target, type: mediaTypeFromUrl(target), provider: label }];
  }
  const media = await readEmbedMedia(target, pageUrl);
  return [{ url: media.url, type: media.type, provider: label }];
}

/**
 * Resolve `url_hd*`: MP4/HLS direto ou embed do Sendvid quando o carregador entrega um.
 * @param {string} target - URL publicada.
 * @param {string} label - Rótulo do botão (`HD+`, `HD 2`, `HD 3`).
 * @param {string} pageUrl - Página do episódio.
 * @returns {Promise<PlayerOption[]>} Um stream com o rótulo como dica de qualidade.
 * @throws {Error} Se a URL não for http(s) ou o embed não tiver mídia.
 */
async function resolveHd(target, label, pageUrl) {
  if (!isHttpUrl(target)) throw new Error(`Player ${label} sem URL http(s)`);
  if (isSendvidEmbed(target)) {
    const media = await readEmbedMedia(target, pageUrl);
    return [{ url: media.url, type: media.type, provider: label, qualityHints: [label] }];
  }
  return [{ url: target, type: mediaTypeFromUrl(target), provider: label, qualityHints: [label] }];
}

/**
 * Resolve um player desconhecido: mídia direta ou embed com `<source>`/`og:video`.
 * @param {string} target - URL publicada.
 * @param {string} label - Rótulo do player.
 * @param {string} pageUrl - Página do episódio.
 * @returns {Promise<PlayerOption[]>} Um stream.
 * @throws {Error} Se a URL não for http(s) ou o embed não tiver mídia legível.
 */
async function resolveGeneric(target, label, pageUrl) {
  if (!isHttpUrl(target)) throw new Error(`Player ${label} sem URL http(s)`);
  if (isDirectMedia(target)) {
    return [{ url: target, type: mediaTypeFromUrl(target), provider: label }];
  }
  const media = await readEmbedMedia(target, pageUrl);
  return [{ url: media.url, type: media.type, provider: label }];
}

/**
 * Lê a primeira mídia de um embed: `<source>` ou `og:video`.
 * @param {string} url - Página do embed.
 * @param {string} pageUrl - Página do episódio, usada como `Referer`.
 * @returns {Promise<{ url: string, type: 'mp4'|'hls' }>}
 * @throws {Error} Se o embed não tiver source/og:video ou o tipo não for reconhecível.
 */
async function readEmbedMedia(url, pageUrl) {
  const html = await fetchText(url, { profile: 'player', headers: { Referer: pageUrl } });
  const $ = loadHtml(html);

  const sources = $('source');
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources.eq(index);
    const src = String(source.attr('src') || '').trim();
    if (!isHttpUrl(src)) continue;
    const type = String(source.attr('type') || '').toLowerCase();
    if (type.includes('mpegurl')) return { url: src, type: 'hls' };
    if (type.includes('mp4')) return { url: src, type: 'mp4' };
    if (type === '') return { url: src, type: mediaTypeFromUrl(src) };
  }

  let videoUrl = '';
  let videoType = '';
  const metas = $('meta');
  for (let index = 0; index < metas.length; index += 1) {
    const meta = metas.eq(index);
    const property = String(meta.attr('property') || '').toLowerCase();
    const content = String(meta.attr('content') || '').trim();
    if ((property === 'og:video' || property === 'og:video:secure_url') && videoUrl === '' && isHttpUrl(content)) {
      videoUrl = content;
    }
    if (property === 'og:video:type') videoType = content.toLowerCase();
  }
  if (videoUrl === '') throw new Error('Embed sem source MP4 ou og:video');
  if (videoType.includes('mpegurl')) return { url: videoUrl, type: 'hls' };
  if (videoType.includes('mp4')) return { url: videoUrl, type: 'mp4' };
  if (videoType !== '') throw new Error(`Embed com tipo de mídia não suportado: ${videoType}`);
  return { url: videoUrl, type: mediaTypeFromUrl(videoUrl) };
}

/**
 * Indica se a URL termina em um arquivo de mídia direto.
 * @param {string} url - URL a verificar.
 * @returns {boolean}
 */
function isDirectMedia(url) {
  if (!isHttpUrl(url)) return false;
  return DIRECT_MEDIA.test(new URL(url).pathname);
}

/**
 * Tipo do stream pela extensão do caminho.
 * @param {string} url - URL de mídia.
 * @returns {'mp4'|'hls'}
 */
function mediaTypeFromUrl(url) {
  return /\.m3u8$/i.test(new URL(url).pathname) ? 'hls' : 'mp4';
}

/**
 * Indica se a URL é um embed do Sendvid.
 * @param {string} url - URL a verificar.
 * @returns {boolean}
 */
function isSendvidEmbed(url) {
  if (!isHttpUrl(url)) return false;
  const parsed = new URL(url);
  return SENDVID_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.startsWith('/embed/');
}

/**
 * Indica se o valor é uma URL HTTP(S).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const protocol = new URL(value.trim()).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
