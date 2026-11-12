/** Provedor FirePlayer PT-BR: fronteira do contrato do Nuvio. */
import { redact } from '../_blocks/fireplayer/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';
import { PROVIDER } from './identity.js';

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  const request = { tmdbId, mediaType, season, episode, stage: 'Entrada' };
  try {
    validate(request);
  } catch (error) {
    console.error(`[${PROVIDER}] Entrada: ${error.message}`);
    return [];
  }
  try {
    request.stage = 'Consultas';
    const { streams, failures } = await extractStreams(request);
    if (!streams.length && failures.length) {
      console.error(`[${PROVIDER}] Nenhuma entrada entregou streams: ${redact(failures.join('; '))}`);
    }
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER}] ${request.stage}: ${redact(error.message)}`);
    return [];
  }
}

function validate(request) {
  const id = String(request.tmdbId).trim();
  if (!/^\d+$/.test(id) || Number(id) <= 0) throw new Error('ID do TMDB inválido');
  if (!['movie', 'tv'].includes(request.mediaType)) throw new Error('Tipo de mídia inválido');
  if (request.mediaType === 'tv' &&
      ![request.season, request.episode].every((number) => Number.isInteger(number) && number > 0)) {
    throw new Error('Temporada e episódio devem ser inteiros positivos');
  }
}

module.exports = { getStreams };
