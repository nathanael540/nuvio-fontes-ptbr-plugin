/**
 * Ponto de entrada do provedor AniTube.
 *
 * O app chama `getStreams`; toda falha é registrada aqui com o prefixo `[AniTube]` e a saída é uma
 * lista vazia. Os streams são ordenados da maior para a menor qualidade.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'AniTube';

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "95479").
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
