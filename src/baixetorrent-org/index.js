/** Provedor BaixeTorrents: fronteira do contrato do Nuvio. */
import { collectWordpressTorrents } from '../_blocks/wordpress-torrent/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { CATALOG } from './extractor.js';

// Nome do catálogo, usado nos logs e como `addon` do formatador em cada stream.
const PROVIDER_NAME = 'BaixeTorrents';

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenadas; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  const request = { tmdbId, mediaType, season, episode };
  try {
    validate(request);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Entrada: ${error.message}`);
    return [];
  }
  try {
    const media = await getMediaInfo({ tmdbId: String(request.tmdbId).trim(), mediaType: request.mediaType });
    const streams = await collectWordpressTorrents(CATALOG, media, request);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] ${error.message}`);
    return [];
  }
}

/**
 * @param {{ tmdbId: string, mediaType: string, season: number|null, episode: number|null }} request
 * @returns {void}
 */
function validate(request) {
  if (!/^\d+$/.test(String(request.tmdbId).trim())) throw new Error('ID do TMDB inválido');
  if (!['movie', 'tv'].includes(request.mediaType)) throw new Error('Tipo de mídia inválido');
  if (request.mediaType === 'tv' &&
      ![request.season, request.episode].every((number) => Number.isInteger(number) && number > 0)) {
    throw new Error('Temporada e episódio devem ser inteiros positivos');
  }
}

module.exports = { getStreams };
