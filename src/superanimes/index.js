/**
 * Ponto de entrada do provedor Super Animes (AnimesTVS).
 *
 * O app chama `getStreams`; toda falha é registrada aqui com o prefixo `[Super Animes]` e a saída
 * é uma lista vazia. Os streams são deduplicados pela URL exata e ordenados da maior para a menor
 * qualidade.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'Super Animes';

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID numérico do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "85937").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte
 *   não tem o título ou em falha.
 * @example
 * const streams = await getStreams('85937', 'tv', 1, 1);
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const request = readRequest(tmdbId, mediaType, season, episode);
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(dedupeStreams(streams));
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

/**
 * Valida o tipo de mídia e as coordenadas da série antes de qualquer requisição.
 * @param {*} tmdbId - ID recebido do app.
 * @param {*} mediaType - Tipo recebido do app.
 * @param {*} season - Temporada recebida do app.
 * @param {*} episode - Episódio recebido do app.
 * @returns {StreamRequest} Pedido validado.
 * @throws {Error} Se o tipo não for `movie`/`tv` ou se a série não tiver temporada e episódio
 *   inteiros a partir de 1.
 * @example
 * readRequest('85937', 'tv', 1, 1);
 * // { tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }
 */
function readRequest(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${String(mediaType)}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === 'movie') {
    return { tmdbId: String(tmdbId), mediaType, season: null, episode: null };
  }
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${String(season)} episode=${String(episode)} (esperados inteiros a partir de 1)`);
  }
  return { tmdbId: String(tmdbId), mediaType, season, episode };
}

/**
 * Remove streams com a mesma URL exata, mantendo a primeira ocorrência.
 * @param {Array<object>} streams - Streams em ordem de descoberta.
 * @returns {Array<object>} Nova lista sem URLs repetidas.
 */
function dedupeStreams(streams) {
  const seen = new Set();
  const unique = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
    unique.push(stream);
  }
  return unique;
}

module.exports = { getStreams };
