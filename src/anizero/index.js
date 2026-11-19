/**
 * Ponto de entrada do provedor AniZero.
 *
 * O app entrega o ID do TMDB; o provedor consulta o catálogo público, mapeia temporada e episódio e
 * devolve HLS. Somente `tv` é suportado. Este arquivo concentra o contrato do app, a ordenação e a
 * única captura de erro.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';
import { sanitizeMessage } from './support.js';

const PROVIDER_NAME = 'AniZero';
const TMDB_ID = /^[1-9]\d*$/;

/**
 * Valida os parâmetros recebidos antes de qualquer requisição.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada; null em filme.
 * @param {number|null} episode - Episódio; null em filme.
 * @returns {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} Pedido validado.
 * @throws {Error} Se o ID, o tipo ou as coordenadas de série forem inválidos.
 */
function validateInput(tmdbId, mediaType, season, episode) {
  const id = String(tmdbId).trim();
  if (!TMDB_ID.test(id)) throw new Error(`Entrada: ID do TMDB inválido: ${tmdbId}`);
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`Entrada: tipo de mídia inválido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === 'tv' && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    throw new Error(`Entrada: série sem temporada/episódio válidos: temporada=${season}, episódio=${episode}`);
  }
  return {
    tmdbId: id,
    mediaType,
    season: mediaType === 'tv' ? season : null,
    episode: mediaType === 'tv' ? episode : null,
  };
}

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada; null em filme.
 * @param {number|null} episode - Episódio; null em filme.
 * @returns {Promise<object[]>} Streams da maior para a menor qualidade; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const request = validateInput(tmdbId, mediaType, season, episode);
    if (request.mediaType !== 'tv') return [];
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
