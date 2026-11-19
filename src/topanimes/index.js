/** Provedor TopAnimes: fronteira do contrato do Nuvio para filmes e séries. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'TopAnimes';

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada em série; ignorada em filme.
 * @param {number|null} episode - Episódio em série; ignorado em filme.
 * @returns {Promise<object[]>} Streams ordenados; vazio em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({
      tmdbId,
      mediaType,
      season,
      episode,
    }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
