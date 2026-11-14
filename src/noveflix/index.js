/**
 * Ponto de entrada do provedor NoveFlix.
 *
 * O app entrega o ID do TMDB; o provedor confirma a novela por título e ano, expande o botão
 * DooPlay e percorre o gate novefx até o MP4 do capítulo. Este arquivo concentra o contrato e a
 * captura única de erros.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'NoveFlix';
const TMDB_ID = /^[1-9]\d*$/;

/**
 * Valida os parâmetros recebidos antes de qualquer requisição.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'tv'} mediaType - Tipo de mídia; somente série.
 * @param {number} season - Temporada.
 * @param {number} episode - Episódio.
 * @returns {{ tmdbId: string, mediaType: 'tv', season: number, episode: number }} Pedido validado.
 * @throws {Error} Se o ID, o tipo ou as coordenadas forem inválidos.
 */
function validateInput(tmdbId, mediaType, season, episode) {
  const id = String(tmdbId).trim();
  if (!TMDB_ID.test(id)) throw new Error(`Entrada: ID do TMDB inválido: ${tmdbId}`);
  if (mediaType !== 'tv') {
    throw new Error(`Entrada: tipo de mídia inválido: "${mediaType}" (esperado "tv")`);
  }
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Entrada: série sem temporada/episódio válidos: temporada=${season}, episódio=${episode}`);
  }
  return { tmdbId: id, mediaType, season, episode };
}

/**
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'tv'} mediaType - Tipo do conteúdo.
 * @param {number} season - Temporada.
 * @param {number} episode - Episódio.
 * @returns {Promise<object[]>} Streams ordenados; lista vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const request = validateInput(tmdbId, mediaType, season, episode);
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

/**
 * Remove URL e hash longos das mensagens de log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

module.exports = { getStreams };
