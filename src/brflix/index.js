/** Provedor BRFlix: fronteira do contrato do Nuvio. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { resolveStreams } from './api.js';
import { buildStreams } from './streams.js';

const PROVIDER_NAME = 'BRFlix';

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
    const resolution = await resolveStreams(request);
    request.stage = 'Candidatos';
    return sortByQuality(buildStreams(resolution, PROVIDER_NAME));
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] ${request.stage}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
