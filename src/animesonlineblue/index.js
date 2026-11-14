/**
 * Ponto de entrada do provedor Animes Online Blue.
 *
 * O app chama `getStreams`; toda falha é registrada aqui com o prefixo `[Animes Online Blue]` e a
 * saída é uma lista vazia. O provedor atende somente séries e recusa filmes antes de qualquer
 * requisição. Os streams são ordenados da maior para a menor qualidade.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'Animes Online Blue';

/**
 * @typedef {object} ValidRequest
 * @property {string} tmdbId - ID numérico do TMDB.
 * @property {'tv'} mediaType - Tipo aceito pelo provedor.
 * @property {number} season - Temporada a partir de 1.
 * @property {number} episode - Episódio a partir de 1.
 */

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "85937").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte não tem o título, não publica o episódio/áudio ou em falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const request = readRequest(tmdbId, mediaType, season, episode);
    if (request === null) return [];
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

/**
 * Valida a entrada e recusa filme antes de qualquer requisição.
 * @param {*} tmdbId - ID recebido do app.
 * @param {*} mediaType - Tipo recebido do app.
 * @param {*} season - Temporada recebida do app.
 * @param {*} episode - Episódio recebido do app.
 * @returns {ValidRequest|null} Pedido validado, ou `null` para filme (ausência por escopo).
 * @throws {Error} Se o ID não for numérico, o tipo não for `movie`/`tv` ou a série não tiver
 *   temporada e episódio inteiros a partir de 1.
 * @example
 * readRequest('85937', 'tv', 1, 1);
 * // { tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }
 */
function readRequest(tmdbId, mediaType, season, episode) {
  const id = String(tmdbId).trim();
  if (!/^\d+$/.test(id)) {
    throw new Error(`tmdbId inválido: "${String(tmdbId)}" (esperado ID numérico do TMDB)`);
  }
  if (mediaType === 'movie') return null;
  if (mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${String(mediaType)}" (esperado "movie" ou "tv")`);
  }
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${String(season)} episode=${String(episode)} (esperados inteiros a partir de 1)`);
  }
  return { tmdbId: id, mediaType: 'tv', season, episode };
}

module.exports = { getStreams };
