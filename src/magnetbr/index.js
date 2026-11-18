/**
 * Provedor MagnetBR: catálogo público agregado de torrents brasileiros por IMDb ou título.
 *
 * Ponto de entrada do plugin no contrato do Nuvio (getStreams).
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { collectStreams, sanitizeMessage } from './extractor.js';

const PROVIDER_NAME = 'MagnetBR';

/**
 * Localiza streams do título solicitado pelo app.
 *
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo ('movie' ou 'tv').
 * @param {number|null} season - Temporada para séries (1-based); null para filmes.
 * @param {number|null} episode - Episódio para séries (1-based); null para filmes.
 * @returns {Promise<object[]>} Streams ordenados por qualidade; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  const request = { tmdbId, mediaType, season, episode };
  try {
    validate(request);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Entrada: ${sanitizeMessage(error.message)}`);
    return [];
  }

  try {
    const media = await getMediaInfo({
      tmdbId: String(request.tmdbId).trim(),
      mediaType: request.mediaType,
    });
    const streams = await collectStreams(media, request);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] ${sanitizeMessage(error.message)}`);
    return [];
  }
}

/**
 * Valida os parâmetros recebidos do app antes de qualquer requisição.
 *
 * @param {{ tmdbId: string, mediaType: string, season: number|null, episode: number|null }} request - Dados da requisição.
 * @returns {void}
 * @throws {Error} Se algum parâmetro for inválido ou se TMDB_API_KEY estiver indisponível.
 */
function validate(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('Pedido inválido');
  }
  const tmdb = String(request.tmdbId || '').trim();
  if (!/^\d+$/.test(tmdb)) {
    throw new Error('ID do TMDB inválido');
  }
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error('Tipo de mídia inválido');
  }
  if (request.mediaType === 'tv') {
    if (!Number.isInteger(request.season) || request.season <= 0 ||
        !Number.isInteger(request.episode) || request.episode <= 0) {
      throw new Error('Temporada e episódio devem ser inteiros positivos');
    }
  }
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin');
  }
}

module.exports = { getStreams };
