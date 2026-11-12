/** Provedor VaqueiroFilmes: fronteira do contrato do Nuvio para filmes em HLS. */
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './catalog.js';

const PROVIDER_NAME = 'VaqueiroFilmes';

/**
 * Localiza streams do filme solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada, não usada em filmes.
 * @param {number|null} episode - Episódio, não usado em filmes.
 * @returns {Promise<object[]>} Streams ordenados; vazio em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    validateType(mediaType);
    if (mediaType === 'tv') {
      console.warn(`[${PROVIDER_NAME}] Pedido tv recusado: o provedor atende somente filmes`);
      return [];
    }
    validateMovieId(tmdbId);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Entrada: ${error.message}`);
    return [];
  }

  try {
    const streams = await extractStreams({
      tmdbId: String(tmdbId).trim(),
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

/**
 * Valida o tipo de mídia aceito pelo provedor.
 * @param {*} mediaType - Tipo recebido do app.
 * @returns {void}
 * @throws {Error} Se o tipo não for `movie` nem `tv`.
 */
function validateType(mediaType) {
  if (mediaType !== 'movie' && mediaType !== 'tv') throw new Error('Tipo de mídia inválido');
}

/**
 * Valida o ID do TMDB de um pedido de filme.
 * @param {*} tmdbId - ID recebido do app.
 * @returns {void}
 * @throws {Error} Se o ID não for numérico e positivo.
 */
function validateMovieId(tmdbId) {
  const text = String(tmdbId).trim();
  if (!/^\d+$/.test(text) || Number(text) <= 0) throw new Error('ID do TMDB inválido');
}

module.exports = { getStreams };
