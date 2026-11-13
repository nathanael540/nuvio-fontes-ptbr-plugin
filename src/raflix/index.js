/** Provedor Raflix: fronteira do contrato do Nuvio. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './api.js';
import { sanitizeMessage } from './shared.js';

const PROVIDER_NAME = 'Raflix';

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  const request = { tmdbId, mediaType, season, episode, stage: 'Entrada' };
  try {
    return sortByQuality(await extractStreams(request));
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] ${request.stage}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
