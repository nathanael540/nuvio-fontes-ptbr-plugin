/**
 * Módulo de comunicação com as rotas e APIs do sistema FSHD.
 */

import { loadHtml } from '../_blocks/fireplayer/index.mjs';
import { HEADER_PROFILES, fetchJson, fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { extractJsRedirect } from '../_blocks/script-extract/index.mjs';

export const FALLBACK_DOMAINS = Object.freeze([
  'https://fshd.link',
]);

/**
 * Busca páginas/APIs do catálogo, distinguindo rejeição do fetch de falhas de parsing.
 * @param {string} url - Endereço da origem que admite failover.
 * @param {object} [json] - Corpo de /api/options; ausente para a página de conteúdo.
 * @param {string} [referer] - Página que originou a chamada à API.
 * @returns {Promise<{url: string, text: string}>} Página com a URL final e o texto.
 * @throws {Error} Se houver rejeição de rede, status não-2xx ou URL final ausente.
 */
async function fetchCatalogPage(url, json, referer) {
  const init = json === undefined
    ? { method: 'GET', headers: { ...HEADER_PROFILES.page } }
    : {
      method: 'POST',
      headers: { ...HEADER_PROFILES.api, Accept: 'application/json', Referer: referer, 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    };
  let response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    const error = new Error(`Falha de rede em ${url}: ${cause.message}`, { cause });
    error.networkFailure = true;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} em ${url}`);
    error.status = response.status;
    throw error;
  }
  if (typeof response.url !== 'string' || !response.url.trim()) {
    throw new Error(`Resposta sem URL final (response.url) em ${url}`);
  }
  return { url: response.url, text: await response.text() };
}

/**
 * Constrói a rota relativa para o conteúdo solicitado.
 * @param {string} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada.
 * @param {number|null} episode - Episódio.
 * @returns {string} Rota relativa (ex.: "/filme/693134").
 */
export function buildContentPath(tmdbId, mediaType, season, episode) {
  if (mediaType === 'movie') {
    return `/filme/${tmdbId}`;
  }
  return `/serie/${tmdbId}/${season}/${episode}`;
}

/**
 * Verifica se um erro representa falha de transporte sujeita a failover entre domínios.
 * @param {Error} error - Erro capturado.
 * @returns {boolean} True se for passível de fallback.
 */
export function isTransportError(error) {
  return error.networkFailure === true
    || [429, 403, 451].includes(error.status)
    || (error.status >= 500 && error.status <= 599);
}

/**
 * Extrai legendas da query string da URL do player (ex.: ?sub1=...&lang1=...).
 * @param {string} playerUrl - URL completa do player.
 * @returns {Array<{url: string, language?: string, name?: string}>} Lista de legendas normalizadas.
 * @throws {Error} Se a URL do player for malformada.
 */
export function extractSubtitlesFromQuery(playerUrl) {
  const subtitles = [];
  const url = new URL(playerUrl);
  for (let index = 1; index <= 10; index += 1) {
    const sub = url.searchParams.get(`sub${index}`);
    if (!sub) break;
    const language = url.searchParams.get(`lang${index}`);
    subtitles.push({ url: sub, ...(language ? { language, name: language } : {}) });
  }
  return subtitles;
}

/**
 * Obtém a página do conteúdo e extrai o identificador interno de conteúdo (Content ID).
 * @param {string} domain - Origem base (ex.: "https://fshd.link").
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Requisição.
 * @returns {Promise<{ absent: boolean, contentId?: string, contentType?: '1'|'2', pageUrl?: string, title?: string, year?: number|null, servers?: Array<{id: string, name: string}> }>}
 * @throws {Error} Se a página responder com status de erro, HTML malformado ou título fora do formato da fonte.
 */
export async function fetchContentDetails(domain, request) {
  const path = buildContentPath(request.tmdbId, request.mediaType, request.season, request.episode);
  const targetUrl = `${domain}${path}`;

  let page;
  try {
    page = await fetchCatalogPage(targetUrl);
  } catch (error) {
    if (error.status === 404) {
      return { absent: true };
    }
    throw error;
  }

  const html = page.text;
  if (!html || !html.trim()) {
    throw new Error(`Página vazia recebida de ${targetUrl}`);
  }

  // Título no formato publicado pela fonte: "FSHD — Filme <título>" ou "FSHD — Série <título>".
  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const rawTitle = titleTagMatch ? decodeHtmlEntities(titleTagMatch[1]).replace(/\s+/g, ' ').trim() : '';
  const titleMatch = /^FSHD\s+[—–-]\s+(Filme|Série)\s+(.+)$/i.exec(rawTitle);
  if (!titleMatch) {
    throw new Error(`Formato de título inesperado em ${targetUrl}`);
  }
  const title = titleMatch[2].trim();
  // A página não informa o ano; o formatador o omite quando ausente.
  const year = null;

  if (request.mediaType === 'movie') {
    const match = /CONTENT_INFO\s*=\s*['"]?(\d+)['"]?/i.exec(html);
    if (!match) {
      // Confere se é uma página indicando ausência de catálogo
      if (/filme\s+n[aã]o\s+encontrado/i.test(html) || /conte[uú]do\s+indispon[ií]vel/i.test(html)) {
        return { absent: true };
      }
      throw new Error(`Identificador CONTENT_INFO não encontrado no HTML de ${targetUrl}`);
    }
    return {
      absent: false,
      contentId: match[1],
      contentType: '1',
      pageUrl: page.url,
      title,
      year,
      servers: extractMovieServers(html),
    };
  }

  // Séries
  const $ = loadHtml(html);
  const activeEpisode = $('.episodeOption.active');
  let contentId = activeEpisode.attr('data-contentid');

  if (!contentId) {
    // Fallback de regex para casos sem suporte completo do cheerio
    const activeRegex = /class="[^"]*\bepisodeOption\b[^"]*\bactive\b[^"]*"[^>]*data-contentid="(\d+)"/i.exec(html)
      || /data-contentid="(\d+)"[^>]*class="[^"]*\bepisodeOption\b[^"]*\bactive\b[^"]*"/i.exec(html);
    if (activeRegex) {
      contentId = activeRegex[1];
    }
  }

  if (!contentId) {
    // Se há episódios listados mas nenhum é o solicitado, ou página indica ausência
    const hasEpisodes = $('.episodeOption').length > 0 || /class="[^"]*episodeOption/i.test(html);
    if (hasEpisodes || /s[eé]rie\s+n[aã]o\s+encontrada/i.test(html)) {
      return { absent: true };
    }
    throw new Error(`Episódio ativo com data-contentid não encontrado no HTML de ${targetUrl}`);
  }

  return {
    absent: false,
    contentId,
    contentType: '2',
    pageUrl: page.url,
    title,
    year,
  };
}

/**
 * Lê os nomes dos servidores listados na página de filme, associados ao `data-id` usado pela API.
 * @param {string} html - HTML da página de conteúdo.
 * @returns {Array<{id: string, name: string}>} Servidores com identificador e nome.
 */
function extractMovieServers(html) {
  const $ = loadHtml(html);
  const nodes = $('.server-selector[data-id]');
  const servers = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const id = nodes.eq(index).attr('data-id');
    if (!id) continue;
    const name = nodes.eq(index).text().replace(/\s+/g, ' ').trim();
    if (!name) continue;
    servers.push({ id: String(id), name });
  }
  return servers;
}

/**
 * Decodifica as entidades HTML básicas de um texto.
 * @param {string} value - Texto com entidades.
 * @returns {string} Texto decodificado.
 */
function decodeHtmlEntities(value) {
  return value.replace(/&(amp|quot|#39|lt|gt);/g, (whole, entity) => ({
    amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>',
  })[entity]);
}

/**
 * Consulta a API de opções para obter os players e faixas de áudio disponíveis.
 * @param {string} domain - Origem base.
 * @param {string} contentId - ID interno do conteúdo.
 * @param {'1'|'2'} contentType - Tipo do conteúdo ("1" para filmes, "2" para séries).
 * @param {string} referer - URL da página que originou a requisição.
 * @returns {Promise<Array<{ id: number, type: number, language: 'Dublado'|'Legendado'|null }>>}
 * @throws {Error} Se a resposta HTTP ou o JSON forem inválidos.
 */
export async function fetchOptions(domain, contentId, contentType, referer) {
  const url = `${domain}/api/options`;
  const body = {
    content_id: Number(contentId) || contentId,
    content_type: contentType,
  };

  const page = await fetchCatalogPage(url, body, referer);
  let response;
  try {
    response = JSON.parse(page.text);
  } catch (cause) {
    throw new Error(`Resposta de /api/options não é JSON válido em ${url}`, { cause });
  }

  if (!response || !Array.isArray(response.options)) {
    throw new Error(`Resposta de /api/options inválida: campo "options" ausente ou não é array`);
  }

  return response.options.map((opt) => {
    const id = opt.ID ?? opt.id;
    const typeNum = Number(opt.type);
    let language = null;
    if (typeNum === 1) language = 'Dublado';
    else if (typeNum === 2) language = 'Legendado';

    return {
      id,
      type: typeNum,
      language,
    };
  });
}

/**
 * Consulta a API de players para obter a URL do vídeo/redirecionamento.
 * @param {string} domain - Origem base.
 * @param {string} contentId - ID interno do conteúdo.
 * @param {'1'|'2'} contentType - Tipo do conteúdo ("1" para filmes, "2" para séries).
 * @param {number} videoId - ID do player/opção.
 * @param {string} referer - URL da página que originou a requisição.
 * @returns {Promise<string>} URL do vídeo retornada pela API.
 * @throws {Error} Se o campo video_url não for retornado.
 */
export async function fetchPlayerVideoUrl(domain, contentId, contentType, videoId, referer) {
  const url = `${domain}/api/players`;
  const body = {
    content_info: Number(contentId) || contentId,
    content_type: contentType,
    video_id: videoId,
  };

  const response = await fetchJson(url, {
    method: 'POST',
    profile: 'api',
    json: body,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': referer,
      'Accept': 'application/json',
    },
  });

  if (!response || typeof response.video_url !== 'string' || !response.video_url.trim()) {
    throw new Error(`Resposta de /api/players sem video_url válida`);
  }

  return response.video_url.trim();
}

/**
 * Segue a URL do vídeo retornada pela API e obtém a página final do player.
 *
 * A URL do redirecionamento por script é devolvida mesmo quando não há redirecionamento (nesse
 * caso, é a URL da própria resposta), porque é nela que a fonte publica as legendas `subN`/`langN`.
 * A página final é lida sem lançar em HTTP 404, para reconhecer a página "404 - Vídeo Offline".
 *
 * @param {string} videoUrl - URL do vídeo obtida em /api/players.
 * @param {string} referer - Cabeçalho Referer para a requisição.
 * @returns {Promise<{ playerUrl: string, html: string, redirectUrl: string }>}
 * @throws {Error} Se a navegação falhar, o vídeo estiver offline na fonte ou o player responder fora de 2xx.
 */
export async function resolvePlayerEmbed(videoUrl, referer) {
  let page = await fetchPage(videoUrl, {
    profile: 'player',
    headers: { Referer: referer },
  });

  // Verifica se a página contém redirecionamento por JS
  const jsRedirect = extractJsRedirect(page.text);
  const redirectUrl = jsRedirect ? new URL(jsRedirect, page.url).href : page.url;
  if (jsRedirect) {
    page = await fetchPlayerPage(redirectUrl, page.url);
  }

  return {
    playerUrl: page.url,
    html: page.text,
    redirectUrl,
  };
}

/**
 * Busca a página final do player permitindo reconhecer a página de vídeo offline em HTTP 404.
 * @param {string} url - URL final do player.
 * @param {string} referer - Cabeçalho Referer da página anterior.
 * @returns {Promise<{ url: string, text: string }>} URL final e corpo da página.
 * @throws {Error} Se o vídeo estiver offline na fonte, a resposta não for 2xx ou faltar a URL final.
 */
async function fetchPlayerPage(url, referer) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { ...HEADER_PROFILES.player, Referer: referer },
    });
  } catch (cause) {
    const error = new Error(`Falha de rede em ${url}: ${cause.message}`, { cause });
    error.networkFailure = true;
    throw error;
  }

  const host = new URL(url).host;
  if (response.status === 404) {
    const text = await response.text();
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    const pageTitle = title ? title[1].replace(/\s+/g, ' ').trim() : '';
    if (/^404\s*[-–—]\s*Vídeo Offline$/i.test(pageTitle)) {
      throw new Error(`Vídeo offline na fonte (${host})`);
    }
    throw new Error(`HTTP 404 em ${url}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${url}`);
  }
  if (typeof response.url !== 'string' || !response.url.trim()) {
    throw new Error(`Resposta sem URL final (response.url) em ${url}`);
  }
  return { url: response.url, text: await response.text() };
}

/**
 * Baixa o texto da playlist mestre HLS.
 * @param {string} masterUrl - URL da playlist mestre.
 * @param {string} referer - Cabeçalho Referer (origem do player).
 * @returns {Promise<string>} Conteúdo de texto da playlist.
 */
export async function fetchHlsMaster(masterUrl, referer) {
  return fetchText(masterUrl, {
    profile: 'player',
    headers: { Referer: referer },
  });
}
