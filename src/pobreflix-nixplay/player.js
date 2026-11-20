/**
 * Consulta aos endpoints de player e player-resolve do PobreFlix NixPlay.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { interpretPlaylist } from '../_blocks/fireplayer/index.mjs';
import { DEFAULT_USER_AGENT, fetchPage, fetchText, playbackHeaders } from '../_blocks/http/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { buildRequestedPath, resolveOriginPage, extractPlayerStreams, probeMedia } from '../_blocks/redeflix-player/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
const VERIFIED_REDEFLIX_HOSTS = new Set(['redeflixapi.click', 'redeflixapi.bar', 'redeflixapi.store']);
const IMPORTED_MEDIA_PATH = /^\/(movie|series)\/[^/]+\/[^/]+\/\d+\.(mp4|webm)$/i;
const MAX_SEARCH_CANDIDATES = 8;

function getCheerio() {
  return require('cheerio-without-node-native');
}

export const PLAYER_PATH = '/wp-json/api/v1/player';
export const RESOLVE_PATH = '/wp-json/api/v1/player-resolve';

/**
 * Verifica se a resposta do player indica conteúdo importado da RedeMuvi.
 * @param {*} json - Corpo JSON interpretado.
 * @returns {boolean} True quando a origem delega o conteúdo à RedeMuvi.
 */
function isImportedMessage(json) {
  return Boolean(json && typeof json.message === 'string' && json.message.includes('importado usa a fonte RedeMuvi'));
}

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
 * @returns {Promise<{ status: 'ok', data: object } | { status: 'absent', message: string } | { status: 'imported', message: string }>}
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
      if (json.message.includes('Este título ainda não está disponível')
        || json.message.includes('Episódio não sincronizado')
        || json.message.includes('Título não cadastrado')) {
        return { status: 'absent', message: json.message };
      }
      if (isImportedMessage(json)) {
        return { status: 'imported', message: json.message };
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

  if (isImportedMessage(json)) {
    return { status: 'imported', message: json.message };
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
 * Confere se a URL final continua na origem verificada.
 * @param {string} finalUrl - URL após redirecionamentos.
 * @param {string} effectiveOrigin - Origem aprovada.
 * @param {string} stage - Etapa usada na mensagem de erro.
 * @returns {void}
 * @throws {Error} Se a URL final pertencer a outra origem.
 */
function assertCatalogOrigin(finalUrl, effectiveOrigin, stage) {
  const origin = new URL(finalUrl).origin;
  if (origin !== effectiveOrigin) {
    throw new Error(`${stage} redirecionou para origem não aprovada: ${origin}`);
  }
}

/**
 * Lê a configuração pública do player embutida na página de conteúdo.
 * @param {string} html - HTML da página confirmada.
 * @returns {{ api?: string, ajax: string, base: string, fallback?: string }} Configuração validada.
 * @throws {Error} Se a configuração estiver ausente, inválida ou sem os campos exigidos.
 */
function readPlayerConfig(html) {
  const match = html.match(/var\s+pf12Player\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error('Configuração pf12Player ausente na página de conteúdo');
  let config;
  try {
    config = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Configuração pf12Player inválida na página de conteúdo: ${error.message}`, { cause: error });
  }
  if (!config || typeof config !== 'object') throw new Error('Configuração pf12Player não é objeto');
  if (typeof config.ajax !== 'string' || config.ajax.trim() === '') {
    throw new Error('Configuração pf12Player sem endpoint de recuperação');
  }
  if (typeof config.base !== 'string' || config.base.trim() === '') {
    throw new Error('Configuração pf12Player sem base de mídia');
  }
  return config;
}

/**
 * Localiza a página pública do conteúdo pelo TMDB e devolve a coordenada do post.
 * @param {string} effectiveOrigin - Origem verificada do catálogo.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {{ title: string, originalTitle: string, alternativeTitles: string[] }} mediaInfo - Dados do TMDB.
 * @returns {Promise<{ postId: string, pageUrl: string, config: object } | null>} Conteúdo confirmado ou null.
 * @throws {Error} Se a busca falhar, redirecionar para outra origem ou a página tiver estrutura inválida.
 */
async function findCatalogContent(effectiveOrigin, request, mediaInfo) {
  const terms = [];
  for (const value of [mediaInfo.title, mediaInfo.originalTitle, ...(mediaInfo.alternativeTitles || [])]) {
    const term = typeof value === 'string' ? value.trim() : '';
    if (term && !terms.some((item) => item.toLowerCase() === term.toLowerCase())) terms.push(term);
  }
  if (terms.length === 0) throw new Error('TMDB sem título para a busca no catálogo');

  const searchType = request.mediaType === 'movie' ? 'movie' : 'tv';
  const wantedSegment = request.mediaType === 'movie' ? '/filme/' : '/serie/';
  const expectedType = request.mediaType === 'movie' ? 'movie' : 'episode';
  let pageBudget = MAX_SEARCH_CANDIDATES * 2;

  for (const term of terms) {
    const searchUrl = `${effectiveOrigin}/?pf12_search=1&q=${encodeURIComponent(term)}&type=${searchType}`;
    const searchPage = await fetchPage(searchUrl);
    assertCatalogOrigin(searchPage.url, effectiveOrigin, 'Busca');
    const $ = getCheerio().load(searchPage.text);
    const cards = $('a.pf12-card');
    const candidates = [];
    for (let i = 0; i < cards.length && candidates.length < MAX_SEARCH_CANDIDATES; i++) {
      const href = cards.eq(i).attr('href');
      if (typeof href !== 'string' || href.trim() === '') continue;
      let candidate;
      try {
        candidate = new URL(href, effectiveOrigin);
      } catch {
        continue;
      }
      if (candidate.origin !== effectiveOrigin || !candidate.pathname.includes(wantedSegment)) continue;
      if (!candidates.includes(candidate.href)) candidates.push(candidate.href);
    }

    for (const candidate of candidates) {
      if (pageBudget <= 0) break;
      pageBudget--;
      const page = await fetchPage(candidate);
      assertCatalogOrigin(page.url, effectiveOrigin, 'Página de conteúdo');
      const $page = getCheerio().load(page.text);
      const root = $page('.pf12-player').eq(0);
      if (root.length === 0) throw new Error(`Página de conteúdo sem player em ${page.url}`);
      const tmdb = root.attr('data-tmdb');
      const type = root.attr('data-type');
      const postId = root.attr('data-post-id');
      if (tmdb === undefined || postId === undefined) {
        throw new Error(`Página de conteúdo sem coordenadas em ${page.url}`);
      }
      if (String(tmdb) !== String(request.tmdbId) || String(type) !== expectedType) continue;
      if (!/^\d+$/.test(String(postId))) throw new Error(`Post inválido na página de conteúdo: ${postId}`);
      return { postId: String(postId), pageUrl: page.url, config: readPlayerConfig(page.text) };
    }
    if (pageBudget <= 0) break;
  }
  return null;
}

/**
 * Consulta a recuperação pública de conteúdo importado na origem verificada.
 * @param {{ postId: string, pageUrl: string, config: object }} content - Conteúdo confirmado.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object|null>} Opção RedeMuvi ou null quando a fonte não tem o conteúdo.
 * @throws {Error} Se a recuperação falhar, responder inválido ou devolver opção divergente.
 */
async function queryImportedOption(content, request) {
  const ajaxUrl = new URL(content.config.ajax);
  if (ajaxUrl.protocol !== 'https:' || ajaxUrl.origin !== new URL(content.pageUrl).origin) {
    throw new Error(`Endpoint de recuperação fora da origem verificada: ${ajaxUrl.origin}`);
  }
  const body = new URLSearchParams({
    action: 'pf12_public_player',
    provider: 'redemuvi',
    type: request.mediaType === 'movie' ? 'movie' : 'episode',
    tmdb: request.tmdbId,
    post_id: content.postId,
    season: request.mediaType === 'tv' ? String(request.season) : '1',
    episode: request.mediaType === 'tv' ? String(request.episode) : '1',
  });

  let response;
  try {
    response = await fetch(ajaxUrl.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': DEFAULT_USER_AGENT,
        Referer: content.pageUrl,
      },
      body: body.toString(),
    });
  } catch (error) {
    throw new Error(`Falha de rede na recuperação pública: ${error.message}`, { cause: error });
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (response.status === 200 && json && (json.reason === 'source_not_found' || json.reason === 'missing')) {
    return null;
  }
  if (response.status === 404 && json && json.reason === 'invalid_post') {
    throw new Error(`Recuperação recusou a coordenada do post: ${content.postId}`);
  }
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} na recuperação pública: ${json?.reason || json?.message || text}`);
  }
  if (!json || typeof json !== 'object') throw new Error('Recuperação pública não retornou JSON válido');
  if (json.available !== true) {
    throw new Error(`Recuperação pública sem opção: ${json.reason || json.message || 'motivo ausente'}`);
  }
  const option = json.option;
  if (!option || typeof option !== 'object') throw new Error('Recuperação pública sem opção de mídia');
  if (option.provider !== 'redemuvi') {
    throw new Error(`Recuperação pública com provedor divergente: ${option.provider}`);
  }
  return option;
}

/**
 * Sonda a mídia importada com Range e valida o contêiner MP4/WebM.
 * @param {string} url - URL HTTPS da mídia.
 * @param {Record<string, string>} headers - Cabeçalhos de reprodução exigidos.
 * @returns {Promise<{ totalBytes: number, size: string } | null>} Tamanho validado ou null quando o episódio/filme não existe.
 * @throws {Error} Se a resposta não for 206, o Content-Range for inválido ou faltar a assinatura.
 */
async function probeImportedMedia(url, headers) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { ...headers, Range: 'bytes=0-63' },
  });
  if (response.status === 404) {
    const text = await response.text();
    if (text.includes('Episode not found') || text.includes('Movie not found')) return null;
    throw new Error(`Resposta HTTP 404 na sonda de mídia importada: ${text.slice(0, 120)}`);
  }
  if (response.status !== 206) {
    throw new Error(`Resposta HTTP ${response.status} na sonda de mídia importada (esperado 206)`);
  }
  const contentRange = response.headers.get('content-range') || '';
  const match = contentRange.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (!match) throw new Error(`Content-Range inválido na sonda de mídia importada: "${contentRange}"`);
  const totalBytes = Number(match[1]);
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw new Error(`Total de bytes inválido na sonda de mídia importada: "${match[1]}"`);
  }
  const buffer = await response.arrayBuffer();
  if (!hasFtypSignature(buffer)) {
    throw new Error('Assinatura ftyp não encontrada no contêiner da mídia importada');
  }
  return { totalBytes, size: formatSize(totalBytes) };
}

/**
 * Confere a caixa `ftyp` nos primeiros bytes do contêiner MP4.
 * @param {ArrayBuffer} buffer - Primeiros bytes lidos da mídia.
 * @returns {boolean} True quando a assinatura é encontrada.
 */
function hasFtypSignature(buffer) {
  if (!buffer || buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const limit = Math.min(buffer.byteLength, 64);
  let offset = 0;
  while (offset + 8 <= limit) {
    const size32 = view.getUint32(offset);
    let type = '';
    for (let i = 0; i < 4; i++) type += String.fromCharCode(view.getUint8(offset + 4 + i));
    if (type === 'ftyp') return true;
    if (size32 === 1 && offset + 16 > limit) return false;
    const size = size32 === 1 ? view.getUint32(offset + 12) : size32;
    if (size <= 0 || offset + size <= offset) break;
    offset += size;
  }
  return false;
}

/**
 * Formata um total de bytes com uma casa decimal (GB, MB ou KB), como no bloco de mídia.
 * @param {number} bytes - Quantidade de bytes.
 * @returns {string} Texto formatado, ex.: "0.9 GB".
 * @throws {Error} Se bytes não for um número finito não negativo.
 */
function formatSize(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`Tamanho em bytes inválido: ${bytes}`);
  }
  const GIGA = 1024 * 1024 * 1024;
  const MEGA = 1024 * 1024;
  const KILO = 1024;
  const inGb = bytes / GIGA;
  if (inGb >= 0.85) return `${inGb.toFixed(1)} GB`;
  if (bytes >= MEGA) return `${(bytes / MEGA).toFixed(1)} MB`;
  if (bytes >= KILO) return `${(bytes / KILO).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Valida a opção RedeMuvi, sonda a mídia e monta o stream com os headers de reprodução.
 * @param {object} option - Opção pública `{ provider, mode, extension, url, title }`.
 * @param {{ pageUrl: string, config: object }} content - Página confirmada e configuração.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @param {{ title: string, year: number|null }} mediaInfo - Dados do TMDB.
 * @returns {Promise<Array<object>|null>} Stream validado ou null quando a mídia não existe.
 * @throws {Error} Se o modo, a origem, o caminho ou a sonda forem inválidos.
 */
async function resolveImportedMedia(option, content, request, mediaInfo) {
  if (option.mode !== 'video') {
    throw new Error(`Modo de mídia importada não suportado: ${option.mode}`);
  }
  const target = new URL(option.url);
  const base = new URL(content.config.base);
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error(`URL de mídia importada inválida: ${option.url}`);
  }
  if (target.origin !== base.origin) {
    throw new Error(`Origem de mídia divergente da base declarada: ${target.origin}`);
  }
  if (!IMPORTED_MEDIA_PATH.test(target.pathname)) {
    throw new Error(`Caminho de mídia importada inválido: ${target.pathname}`);
  }
  const headers = playbackHeaders(content.pageUrl);
  const probe = await probeImportedMedia(target.href, headers);
  if (probe === null) return null;
  const format = {
    addon: 'PobreFlix NixPlay',
    template: FORMATTER.AUTO,
    title: mediaInfo.title,
  };
  if (mediaInfo.year !== null) format.year = mediaInfo.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  const languageHints = [option.language, option.label]
    .filter((value) => typeof value === 'string' && value.trim() !== '');
  const language = languageHints.length > 0 ? normalizeLanguage(languageHints[0]) : null;
  const stream = buildStream({
    url: target.href,
    type: target.pathname.split('.').pop().toLowerCase(),
    size: probe.size,
    provider: option.title || 'RedeMuvi',
    headers,
    qualityHints: [option.quality, option.label, option.title, target.href],
    language: language || undefined,
    languageHints,
    format,
  });
  return [stream];
}

/**
 * Resolve conteúdo importado pela interface pública da origem verificada.
 * @param {string} effectiveOrigin - Origem verificada.
 * @param {object} request - Pedido validado.
 * @param {object} mediaInfo - Dados do TMDB.
 * @returns {Promise<{ status: 'ok', streams: Array<object> } | { status: 'absent' }>} Streams ou ausência.
 * @throws {Error} Se a busca, a recuperação ou a mídia falharem.
 */
async function resolveImportedPlayer(effectiveOrigin, request, mediaInfo) {
  const content = await findCatalogContent(effectiveOrigin, request, mediaInfo);
  if (!content) return { status: 'absent' };
  const option = await queryImportedOption(content, request);
  if (!option) return { status: 'absent' };
  const streams = await resolveImportedMedia(option, content, request, mediaInfo);
  if (!streams) return { status: 'absent' };
  return { status: 'ok', streams };
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
  if (playerResult.status === 'imported') {
    return resolveImportedPlayer(effectiveOrigin, request, mediaInfo);
  }
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
