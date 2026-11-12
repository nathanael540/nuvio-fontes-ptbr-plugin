/**
 * Provedor Pobreflix HD: fronteira do contrato do Nuvio.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams, sanitizeMessage } from './extractor.js';

const PROVIDER_NAME = 'Pobreflix HD';

/**
 * Função de entrada chamada pelo Nuvio.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based; null para filmes).
 * @param {number|null} episode - Episódio (1-based; null para filmes).
 * @returns {Promise<Array<object>>} Streams ordenados ou lista vazia em ausência/falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
