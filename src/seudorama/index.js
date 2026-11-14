/** Provedor SeuDorama: fronteira do contrato do Nuvio. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './streams.js';

const PROVIDER_NAME = 'SeuDorama';

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo; o SeuDorama só publica séries.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return sortByQuality(await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME));
  } catch (error) {
    const coordinates = Number.isInteger(season) && Number.isInteger(episode) ? ` S${season}E${episode}` : '';
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}${coordinates}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
