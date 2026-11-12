/** Provedor TopFilmes: fronteira do contrato do Nuvio para filmes em MP4. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'TopFilmes';

/**
 * Localiza streams do filme solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada, ignorada em filmes.
 * @param {number|null} episode - Episódio, ignorado em filmes.
 * @returns {Promise<object[]>} Streams ordenados; vazio em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  // A fonte observada só publica filmes: pedido de série é ausência sem rede.
  if (mediaType !== 'movie') return [];

  try {
    const streams = await extractStreams({
      tmdbId,
      mediaType,
      season,
      episode,
    }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em movie ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
