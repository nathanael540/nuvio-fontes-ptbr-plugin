/**
 * Ponto de entrada do provedor TheRARBG.
 *
 * A fronteira com o app é o único ponto de captura: falhas sobem do extrator, são registradas com
 * `[TheRARBG]` e o contrato exige lista vazia. A ordenação por qualidade fica aqui, como no
 * template do repositório.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'TheRARBG';

/**
 * Função chamada pelo Nuvio.
 *
 * @param {string} tmdbId - ID do TMDB (ex.: "1263337").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); `null` para filmes.
 * @param {number|null} episode - Episódio (1-based); `null` para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte
 *   não tem o título ou em falha.
 * @example
 * const streams = await getStreams('1263337', 'movie', null, null);
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
