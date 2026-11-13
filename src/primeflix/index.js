/** Provedor Primeflix: fronteira do contrato do Nuvio. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './player.js';

const PROVIDER_NAME = 'Primeflix';
const URL_WITH_QUERY = /(https?:\/\/[^\s?]+)\?[^\s)]*/g;

/**
 * Remove a query assinada das mensagens de erro para não expor token de mídia no log.
 * @param {string} message - Mensagem original.
 * @returns {string} Mensagem com a query substituída por `<assinatura>`.
 */
function sanitizeMessage(message) {
  return String(message).replace(URL_WITH_QUERY, '$1?<assinatura>');
}

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    return sortByQuality(await extractStreams({ tmdbId, mediaType, season, episode }));
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
