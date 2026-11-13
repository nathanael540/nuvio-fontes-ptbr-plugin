/**
 * Provedor Pomfy: fronteira do contrato do Nuvio.
 *
 * O app entrega o ID do TMDB; o provedor consulta a página pública da API Pomfy,
 * troca o token de embed pelo player e resolve somente o HLS entregue pelo Flyfile.
 * Títulos publicados apenas no Byse são ausência reconhecida.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams, sanitizeMessage } from './extractor.js';

const PROVIDER_NAME = 'Pomfy';

/**
 * Localiza os streams do título solicitado pelo app.
 *
 * Único ponto de captura da falha final: registra a etapa e a causa saneada, sem
 * URL de mídia nem token, e devolve lista vazia. A ausência reconhecida já chega
 * aqui como lista vazia, sem cair no log de erro.
 *
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries; null em filmes.
 * @param {number|null} episode - Episódio para séries; null em filmes.
 * @returns {Promise<object[]>} Streams ordenados da maior para a menor qualidade; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  const request = { tmdbId, mediaType, season, episode, stage: 'Entrada' };
  try {
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] ${request.stage}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = { getStreams };
