/**
 * Consulta aos endpoints de player e player-resolve do PobreFlix NixPlay.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { interpretPlaylist } from '../_blocks/fireplayer/index.mjs';
import { DEFAULT_USER_AGENT, fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { buildRequestedPath, resolveOriginPage, extractPlayerStreams, probeMedia } from '../_blocks/redeflix-player/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
const VERIFIED_REDEFLIX_HOSTS = new Set(['redeflixapi.click', 'redeflixapi.bar', 'redeflixapi.store']);

function getCheerio() {
  return require('cheerio-without-node-native');
}

export const PLAYER_PATH = '/wp-json/api/v1/player';
export const RESOLVE_PATH = '/wp-json/api/v1/player-resolve';

/**
 * Monta o corpo urlencoded para os endpoints de player.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {string} Corpo urlencoded.
 */
function buildRequestBody(request) {
  if (request.mediaType === 'movie') {
    return `type=movie&tmdb=${encodeURIComponent(request.tmdbId)}&season=&episode=`;
  }
  return `type=episode&tmdb=${encodeURIComponent(request.tmdbId)}&season=${request.season}&episode=${request.episode}`;
}

/**
 * Consulta o endpoint principal de player da fonte.
 * @param {string} effectiveOrigin - Origem do catálogo (ex: "https://pobreflix.boutique").
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ status: 'ok', data: object } | { status: 'absent', message: string }>}
 * @throws {Error} Se houver erro HTTP operacional, JSON inválido ou divergência de identidade.
 */
export async function queryPlayer(effectiveOrigin, request) {
  const url = `${effectiveOrigin}${PLAYER_PATH}`;
  const body = buildRequestBody(request);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      body,
    });
  } catch (err) {
    throw new Error(`Falha de rede em ${url}: ${err.message}`, { cause: err });
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (response.status === 404) {
    if (json && typeof json.message === 'string') {
      if (json.message.includes('Este título ainda não está disponível') || json.message.includes('Episódio não sincronizado')) {
        return { status: 'absent', message: json.message };
      }
    }
    throw new Error(`HTTP 404 em ${url} (${json?.code || '404'}): ${json?.message || text}`);
  }

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ao consultar player em ${url}: ${json?.message || text}`);
  }

  if (!json || typeof json !== 'object') {
    throw new Error(`Resposta do player não é JSON válido em ${url}`);
  }

  if (json.success === false) {
    throw new Error(`Player API erro em ${url}: ${json.message || 'desconhecido'}`);
  }

  // Validação de identidade da resposta
  if (String(json.tmdb) !== String(request.tmdbId)) {
    throw new Error(`Resposta com TMDB divergente: retornado "${json.tmdb}", pedido "${request.tmdbId}"`);
  }

  if (request.mediaType === 'movie') {
    if (json.type !== 'movie') {
      throw new Error(`Resposta com tipo divergente: retornado "${json.type}", esperado "movie"`);
    }
    if (json.season != null && json.season !== 0 && json.season !== '') {
      throw new Error(`Resposta de filme com temporada não nula: ${json.season}`);
    }
  } else {
    if (json.type !== 'episode') {
      throw new Error(`Resposta com tipo divergente: retornado "${json.type}", esperado "episode"`);
    }
    if (Number(json.season) !== request.season || Number(json.episode) !== request.episode) {
      throw new Error(`Resposta com coordenadas divergentes: retornada T${json.season}E${json.episode}, pedida T${request.season}E${request.episode}`);
    }
  }

  return { status: 'ok', data: json };
}

/**
 * Consulta o endpoint de recuperação player-resolve.
 * @param {string} effectiveOrigin - Origem do catálogo.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<{ status: 'ok', data: object } | { status: 'absent', message: string }>}
 * @throws {Error} Se a recuperação falhar, responder 404 operacional ou não trouxer URL.
 */
export async function queryPlayerResolve(effectiveOrigin, request) {
  const url = `${effectiveOrigin}${RESOLVE_PATH}`;
  const body = buildRequestBody(request);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DEFAULT_USER_AGENT,
      },
      body,
    });
  } catch (err) {
    throw new Error(`Falha de rede em ${url}: ${err.message}`, { cause: err });
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (response.status === 404) {
    if (json && typeof json.message === 'string') {
      if (json.message.includes('Episódio não sincronizado') || json.message.includes('Este título ainda não está disponível')) {
        return { status: 'absent', message: json.message };
      }
    }
    throw new Error(`HTTP 404 ao resolver player: ${json?.message || text}`);
  }

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} ao resolver player em ${url}: ${json?.message || text}`);
  }

  if (!json || typeof json !== 'object') {
    throw new Error(`Resposta de player-resolve não é JSON válido em ${url}`);
  }

  if (json.success === false) {
    throw new Error(`Player resolve erro em ${url}: ${json.message || 'desconhecido'}`);
  }

  if (!json.recoverable) {
    throw new Error(`Recuperação não disponível em player-resolve para ${url}`);
  }

  if (typeof json.url !== 'string' || !json.url.trim()) {
    throw new Error(`Resposta de player-resolve sem URL em ${url}`);
  }

  return { status: 'ok', data: json };
}

/**
 * Detecta se o HTML recebido é uma página de desafio Turnstile/bloqueio pela estrutura real do documento.
 * Não classifica falsamente páginas funcionais que contenham "<title>Blocked</title>" dentro de scripts.
 * @param {string} html - HTML da página.
 * @returns {boolean} True se a página for um desafio.
 */
export function isChallengePage(html) {
  if (!html || typeof html !== 'string') return false;

  const hasTurnstileIndicator = html.includes('challenges.cloudflare.com/turnstile')
    || html.includes('turnstileSiteKey')
    || html.includes('cf-turnstile');

  const $ = getCheerio().load(html);
  const titleText = $('title').text().trim().toLowerCase();
  const isChallengeTitle = titleText === 'blocked' || titleText === 'verificação' || titleText === 'just a moment...';

  const hasPlayerPills = $('.server-pill').length > 0;
  const hasPlaybackTicket = html.includes('playbackResolveTicket') || html.includes('fastLaunchTickets');

  // É desafio se tiver indicador de desafio ou título de bloqueio E não tiver os componentes reais do player
  if ((hasTurnstileIndicator || isChallengeTitle) && !hasPlayerPills && !hasPlaybackTicket) {
    return true;
  }

  return false;
}

/**
 * Resolve uma opção anunciada, usando a cadeia compartilhada para RedeFlix.
 * @param {object} source - Opção ou recuperação anunciada pela API.
 * @param {string} effectiveOrigin - Origem do catálogo.
 * @param {object} request - Pedido validado.
 * @param {object} mediaInfo - Título e ano obtidos pelo tmdb-info.
 * @returns {Promise<Array<object>>} Streams validados da opção.
 * @throws {Error} Se o contrato ou a mídia forem inválidos ou o embed não puder ser resolvido.
 */
async function resolveSource(source, effectiveOrigin, request, mediaInfo) {
  const target = new URL(source.url);
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error(`URL de mídia/player inválida: ${source.url}`);
  }
  const format = {
    addon: 'PobreFlix NixPlay', template: FORMATTER.AUTO,
    title: mediaInfo.title,
  };
  if (mediaInfo.year !== null) format.year = mediaInfo.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  const language = source.language || normalizeLanguage(source.label || '') || normalizeLanguage(source.brand || '') || undefined;
  const fields = {
    provider: source.provider || source.selected_provider || source.fallback_provider || undefined,
    language,
    qualityHints: [source.quality, source.label, source.brand, source.title, source.url],
    subtitles: source.subtitles,
    headers: source.headers,
    format,
  };

  if (source.mode === 'hls' || /mpegurl/i.test(source.mime || '')) {
    const page = await fetchPage(source.url, { profile: 'player' });
    const playlist = interpretPlaylist(page.text, page.url);
    const variants = playlist.variants.length ? playlist.variants : [{ url: playlist.url, quality: playlist.quality }];
    const subtitles = [...(source.subtitles || []), ...playlist.subtitles];
    const streams = new Map();
    for (const variant of variants) {
      streams.set(variant.url, buildStream({
        ...fields, url: variant.url, type: 'm3u8', quality: variant.quality ?? undefined,
        language: playlist.language || fields.language,
        subtitles: subtitles.length ? subtitles : undefined,
        format: playlist.adaptive ? { ...format, message: 'Reprodução adaptativa' } : format,
      }));
    }
    return [...streams.values()];
  }
  if (source.mode === 'video' || /^video\//i.test(source.mime || '')) {
    const { size } = await probeMedia(source.url, { verifySignature: true });
    return [buildStream({ ...fields, url: source.url, type: 'mp4', size })];
  }
  if (VERIFIED_REDEFLIX_HOSTS.has(target.host)) {
    const requestedPath = buildRequestedPath(request.tmdbId, request.mediaType, request.season, request.episode);
    if (target.pathname.replace(/\/+$/, '') !== requestedPath) {
      throw new Error(`Caminho do player diverge do pedido: ${target.pathname}`);
    }
    const originResult = await resolveOriginPage(target.origin, requestedPath, { getCount: 0, maxGets: 6 });
    const finalUrl = new URL(originResult.page.url);
    if (!VERIFIED_REDEFLIX_HOSTS.has(finalUrl.host) || finalUrl.protocol !== 'https:') {
      throw new Error(`Host não verificado no player: ${finalUrl.host}`);
    }
    if (originResult.status !== 'player' || finalUrl.pathname.replace(/\/+$/, '') !== requestedPath) {
      throw new Error('Página sem player do conteúdo pedido no RedeFlix');
    }
    return extractPlayerStreams(originResult, request, {
      addon: 'PobreFlix NixPlay', mediaInfo,
      verifySignature: true, excludePreviewSubtitles: true,
    });
  }
  if (source.mode === 'embed' || source.mode === 'embed_fallback') {
    const html = await fetchText(source.url, { headers: { Referer: effectiveOrigin } });
    if (isChallengePage(html)) throw new Error(`Desafio reconhecido no embed: ${target.host}`);
    throw new Error(`Embed sem contrato de resolução suportado: ${target.host}`);
  }
  throw new Error(`Modo ou tipo de mídia desconhecido: ${source.mode}`);
}

/**
 * Resolve todas as opções únicas e só então tenta a recuperação, uma vez.
 * @param {string} effectiveOrigin - Origem verificada do catálogo.
 * @param {object} request - Pedido validado.
 * @returns {Promise<{ status: 'ok', streams: Array<object> } | { status: 'absent' }>} Resultado da origem.
 * @throws {Error} Se os metadados falharem ou nenhuma opção/recuperação produzir mídia.
 */
export async function resolvePlayer(effectiveOrigin, request) {
  const playerResult = await queryPlayer(effectiveOrigin, request);
  if (playerResult.status === 'absent') return { status: 'absent' };
  const mediaInfo = await getMediaInfo(request);
  const data = playerResult.data;
  if (data.options !== undefined && !Array.isArray(data.options)) {
    throw new Error('Player options não é lista');
  }
  const options = data.options && data.options.length > 0
    ? data.options.map((option) => ({ mode: data.mode, mime: data.mime, language: data.language, quality: data.quality, ...option }))
    : [data];
  const seen = new Set();
  const streams = [];
  const failures = [];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const label = option.provider || option.label || `#${i + 1}`;
    try {
      const url = new URL(option.url);
      url.hash = '';
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      const resolved = await resolveSource(option, effectiveOrigin, request, mediaInfo);
      if (resolved.length === 0) throw new Error('Nenhuma mídia válida na opção');
      streams.push(...resolved);
    } catch (error) {
      const detail = `${label}: ${error.message}`;
      failures.push(detail);
      const clean = detail.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1');
      console.warn(`[PobreFlix NixPlay] Opção ${clean} descartada`);
    }
  }
  if (streams.length > 0) return { status: 'ok', streams };
  try {
    const recovery = await queryPlayerResolve(effectiveOrigin, request);
    if (recovery.status === 'absent') throw new Error(`Recuperação ausente: ${recovery.message}`);
    const recovered = await resolveSource(recovery.data, effectiveOrigin, request, mediaInfo);
    if (recovered.length === 0) throw new Error('Recuperação sem mídia válida');
    return { status: 'ok', streams: recovered };
  } catch (error) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}; recuperação: ${error.message}`, { cause: error });
  }
}
