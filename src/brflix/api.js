/** Consulta pública do agregado BRFlix por ID do TMDB. */
import { fetchJson } from '../_blocks/http/index.mjs';
import { readResolution } from './payload.js';

const SOURCE_URL = 'https://brflix.lat';
const RESOLVE_URL = `${SOURCE_URL}/best-stream-resolve`;
const TMDB_ID = /^\d+$/;

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID numérico do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null em filme.
 * @property {number|null} episode - Episódio (1-based); null em filme.
 * @property {string} [stage] - Etapa corrente, usada no log de falha do ponto de entrada.
 */

/**
 * Valida o pedido e consulta a resolução agregada do BRFlix.
 *
 * Filme não envia `season`/`episode`; série exige temporada e episódio inteiros positivos.
 * A consulta pede resposta cifrada com `X-Brflix-Enc: 1` e é renovada a cada chamada.
 *
 * @param {StreamRequest} request - Valores recebidos por `getStreams`.
 * @returns {Promise<import('./payload.js').Resolution>} Resolução validada, em texto claro.
 * @throws {Error} Se a entrada for inválida, a requisição falhar ou a resposta não decifrar.
 * @example
 * const resolution = await resolveStreams({ tmdbId: '550', mediaType: 'movie', season: null, episode: null });
 * // { ok: true, candidates: [...] }
 */
export async function resolveStreams(request) {
  const query = buildQuery(request);
  request.stage = 'Consulta';
  const body = await fetchJson(`${RESOLVE_URL}?${query}`, {
    profile: 'api',
    headers: {
      Referer: `${SOURCE_URL}/`,
      'X-Brflix-Enc': '1',
    },
  });
  return readResolution(body);
}

/**
 * Monta a query da resolução depois de validar a entrada.
 * @param {StreamRequest} request - Valores recebidos por `getStreams`.
 * @returns {string} Query string codificada.
 * @throws {Error} Se `tmdbId`, `mediaType`, temporada ou episódio forem inválidos.
 */
function buildQuery(request) {
  const tmdbId = readTmdbId(request.tmdbId);
  const mediaType = readMediaType(request.mediaType);
  const params = { mediaType, tmdbId, hq: '0', dubbed: '1' };
  if (mediaType === 'tv') {
    if (!isPositiveInteger(request.season) || !isPositiveInteger(request.episode)) {
      throw new Error('Temporada e episódio devem ser inteiros positivos');
    }
    params.season = String(request.season);
    params.episode = String(request.episode);
  }
  // Evita resposta em cache: as URLs de mídia expiram e cada chamada precisa de candidatos novos.
  params._t = String(Date.now());
  return new URLSearchParams(params).toString();
}

/**
 * @param {*} value - ID recebido do app.
 * @returns {string} ID numérico normalizado.
 * @throws {Error} Se não for composto só por dígitos.
 */
function readTmdbId(value) {
  const id = value === undefined || value === null ? '' : String(value).trim();
  if (!TMDB_ID.test(id)) throw new Error('ID do TMDB inválido');
  return id;
}

/**
 * @param {*} value - Tipo de mídia recebido do app.
 * @returns {'movie'|'tv'} Tipo validado.
 * @throws {Error} Se não for `movie` nem `tv`.
 */
function readMediaType(value) {
  if (value !== 'movie' && value !== 'tv') throw new Error('Tipo de mídia inválido');
  return value;
}

/**
 * @param {*} value - Valor a testar.
 * @returns {boolean} `true` para inteiro maior ou igual a 1.
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}
