/**
 * Ponto de entrada do provedor Animy.
 *
 * O app entrega o ID do TMDB; o provedor consulta a API pública do Animy, confirma a entrada e
 * devolve os MP4 das variantes de áudio publicadas. Este arquivo concentra o contrato do app e a
 * captura única de erros.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'Animy';
const TMDB_ID = /^[1-9]\d*$/;

/**
 * Valida os parâmetros recebidos antes de qualquer requisição.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada; null em filmes.
 * @param {number|null} episode - Episódio; null em filmes.
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
 * Localiza streams do título solicitado pelo app.
 * @param {string} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do conteúdo.
 * @param {number|null} season - Temporada para séries.
 * @param {number|null} episode - Episódio para séries.
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
