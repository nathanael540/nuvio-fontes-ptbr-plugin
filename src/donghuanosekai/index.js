/**
 * Provedor Donghua No Sekai: fronteira do contrato do Nuvio.
 *
 * O app entrega o ID do TMDB; o provedor busca o título no catálogo HTML, confirma a ficha,
 * seleciona a temporada e o episódio e resolve os players DNSK/Blogger em HLS ou MP4.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { resolveStreams } from './extractor.js';
import { sanitizeMessage } from './players.js';

const PROVIDER_NAME = 'Donghua No Sekai';
const TMDB_ID = /^\d+$/;

/**
 * Valida os parâmetros recebidos antes de qualquer requisição.
 *
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada; null em filmes.
 * @param {number|null} episode - Episódio; null em filmes.
 * @returns {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} Pedido validado.
 * @throws {Error} Se o ID, o tipo ou as coordenadas de série forem inválidos.
 */
function validateInput(tmdbId, mediaType, season, episode) {
  const id = String(tmdbId).trim();
  if (!TMDB_ID.test(id)) throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: ${mediaType}`);
  }
  if (mediaType === 'tv' && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode}`);
  }
  return {
    tmdbId: id,
    mediaType,
    season: mediaType === 'tv' ? season : null,
    episode: mediaType === 'tv' ? episode : null,
  };
}

/**
 * Localiza streams do título solicitado pelo app.
 *
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 * @example
 * const streams = await getStreams('101172', 'tv', 1, 1);
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const request = validateInput(tmdbId, mediaType, season, episode);
    const streams = await resolveStreams(request);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
