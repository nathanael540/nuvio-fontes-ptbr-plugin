/**
 * Ponto de entrada do provedor AnimeFire.
 *
 * A fonte é um catálogo brasileiro de animes com busca, ficha e opções de áudio JSON públicas. O
 * extrator confirma título, ano e tipo antes de resolver o episódio; este arquivo concentra o
 * contrato do app e a captura única de erros.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'AnimeFire';

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "46260").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte não tem o título ou em falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
