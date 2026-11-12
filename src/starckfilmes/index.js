/** Provedor Starck Filmes: fronteira do contrato do Nuvio. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { extractStreams } from './extractor.js';

/**
 * Localiza streams do título solicitado pelo app.
 *
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (!/^\d+$/.test(String(tmdbId).trim())) throw new Error('ID do TMDB inválido');
    if (!['movie', 'tv'].includes(mediaType)) throw new Error('Tipo de mídia inválido');
    if (mediaType === 'tv' && ![season, episode].every((n) => Number.isInteger(n) && n > 0)) {
      throw new Error('Temporada e episódio devem ser inteiros positivos');
    }
    const request = { mediaType, season: season ?? null, episode: episode ?? null };
    const media = await getMediaInfo({ tmdbId: String(tmdbId).trim(), mediaType });
    return sortByQuality(await extractStreams(media, request));
  } catch (error) {
    console.error(`[Starck Filmes] ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
