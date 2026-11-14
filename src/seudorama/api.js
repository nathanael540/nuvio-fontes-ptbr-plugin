/**
 * API do SeuDorama: valida o pedido e consulta o endpoint público que devolve o player do Blogger.
 *
 * O endpoint recebe temporada, episódio e o ID do TMDB e não exige chave, conta ou cookie.
 * `success: false` é ausência reconhecida; JSON inválido, HTTP fora de 2xx, `success` não booleano
 * e `videoUrl` fora do Blogger são erros de estrutura.
 */

import { fetchJson } from '../_blocks/http/index.mjs';

const API_URL = 'https://serv01.meusdoramas.club/posts/get-video.php';
const ACCEPT = 'application/json, text/plain, */*';
const BLOGGER_HOSTS = ['blogger.com', 'www.blogger.com'];
const HTTP_PROTOCOLS = ['http:', 'https:'];
const VIDEO_URL_KEYS = ['url', 'file', 'src'];

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} TvRequest
 * @property {string} tmdbId - ID numérico do TMDB.
 * @property {number} season - Temporada inteira a partir de 1.
 * @property {number} episode - Episódio inteiro a partir de 1.
 */

/**
 * Valida o pedido: somente série, com temporada e episódio inteiros a partir de 1.
 *
 * O filme é recusado aqui, antes de qualquer requisição: o catálogo da fonte é de séries asiáticas.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {TvRequest} Pedido normalizado.
 * @throws {Error} Se o ID não for numérico, se o tipo não for `tv` ou se faltar temporada/episódio válidos.
 * @example
 * normalizeRequest({ tmdbId: '94796', mediaType: 'tv', season: 1, episode: 1 });
 * // { tmdbId: '94796', season: 1, episode: 1 }
 */
export function normalizeRequest(request) {
  const tmdbId = String(request.tmdbId).trim();
  if (!/^\d+$/.test(tmdbId)) {
    throw new Error(`ID do TMDB inválido: "${request.tmdbId}"`);
  }
  if (request.mediaType !== 'tv') {
    throw new Error(`Tipo de mídia recusado: "${request.mediaType}" (o SeuDorama só publica séries)`);
  }
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { tmdbId, season, episode };
}

/**
 * Consulta a API e devolve a URL do player do Blogger, ou `null` quando a obra não está no catálogo.
 *
 * @param {TvRequest} request - Pedido já normalizado.
 * @param {string} userAgent - User-Agent de navegador usado na descoberta e na reprodução.
 * @returns {Promise<string|null>} URL HTTP(S) do Blogger ou `null` para `success: false`.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido, estrutura inesperada ou host
 *   diferente do Blogger; a mensagem é prefixada por `API:`.
 * @example
 * const videoUrl = await fetchVideoUrl({ tmdbId: '94796', season: 1, episode: 1 }, DEFAULT_USER_AGENT);
 */
export async function fetchVideoUrl(request, userAgent) {
  let payload;
  try {
    payload = await fetchJson(apiUrl(request), {
      headers: { 'User-Agent': userAgent, Accept: ACCEPT },
    });
  } catch (error) {
    throw new Error(`API: ${error.message}`, { cause: error });
  }
  return readVideoUrl(payload);
}

/**
 * Monta a URL da consulta com os parâmetros que a fonte usa.
 * @param {TvRequest} request - Pedido normalizado.
 * @returns {string} URL absoluta da API.
 * @example
 * apiUrl({ tmdbId: '94796', season: 1, episode: 1 });
 * // 'https://serv01.meusdoramas.club/posts/get-video.php?episode_number=1&season_number=1&tmdb=94796'
 */
function apiUrl({ tmdbId, season, episode }) {
  const params = new URLSearchParams();
  params.append('episode_number', String(episode));
  params.append('season_number', String(season));
  params.append('tmdb', tmdbId);
  return `${API_URL}?${params.toString()}`;
}

/**
 * Lê o envelope da API e exige uma URL do Blogger quando a obra foi encontrada.
 * @param {*} payload - Corpo JSON devolvido pela fonte.
 * @returns {string|null} URL do Blogger ou `null` para ausência reconhecida.
 * @throws {Error} Se a resposta não for objeto, se `success` não for booleano, se `success: true`
 *   vier sem URL utilizável ou se o host não for o Blogger.
 */
function readVideoUrl(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('API: resposta não é objeto');
  }
  if (typeof payload.success !== 'boolean') {
    throw new Error('API: resposta sem "success" booleano');
  }
  if (payload.success === false) return null;

  const raw = firstVideoUrl(payload.videoUrl);
  if (raw === '') {
    throw new Error('API: "success: true" sem "videoUrl" HTTP(S)');
  }
  const videoUrl = httpUrl(raw);
  const host = new URL(videoUrl).hostname.toLowerCase();
  if (!BLOGGER_HOSTS.includes(host)) {
    throw new Error(`API: "videoUrl" fora do host blogger.com: "${videoUrl}"`);
  }
  return videoUrl;
}

/**
 * Primeira URL utilizável de `videoUrl`: texto direto ou, em respostas alternativas, um item de
 * lista com `url`, `file` ou `src`.
 * @param {*} value - Valor recebido em `videoUrl`.
 * @returns {string} URL em texto ou string vazia quando nenhuma serve.
 */
function firstVideoUrl(value) {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    for (const key of VIDEO_URL_KEYS) {
      if (typeof item[key] === 'string' && item[key].trim() !== '') return item[key].trim();
    }
  }
  return '';
}

/**
 * Valida uma URL HTTP(S).
 * @param {string} value - Endereço recebido.
 * @returns {string} A própria URL, sem espaços nas pontas.
 * @throws {Error} Se a URL for inválida ou não usar HTTP(S).
 */
function httpUrl(value) {
  const text = value.trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`API: "videoUrl" inválida: "${text}"`);
  }
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`API: "videoUrl" não é HTTP(S): "${text}"`);
  }
  return text;
}

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean} `true` para objeto simples.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
