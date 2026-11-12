/**
 * Provedor FSHD: ponto de entrada para o Nuvio.
 * Resolução direta de filmes e séries pelo ID numérico do TMDB no catálogo FSHD.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'FSHD';

/**
 * Valida os parâmetros de entrada recebidos do app antes de qualquer requisição externa.
 * @param {string|number} tmdbId - Identificador numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based; obrigatório para tv).
 * @param {number|null} episode - Episódio (1-based; obrigatório para tv).
 * @returns {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }}
 * @throws {Error} Se qualquer parâmetro violar o contrato.
 */
function validateInput(tmdbId, mediaType, season, episode) {
  if (typeof tmdbId !== 'string' && typeof tmdbId !== 'number') {
    throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  }
  const idStr = String(tmdbId).trim();
  if (!/^[1-9]\d*$/.test(idStr)) {
    throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: "${mediaType}" (esperado "movie" ou "tv")`);
  }

  if (mediaType === 'tv') {
    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
      throw new Error(`Coordenadas de série inválidas: temporada=${season}, episódio=${episode} (esperados inteiros positivos)`);
    }
  }

  return {
    tmdbId: idStr,
    mediaType,
    season: mediaType === 'tv' ? season : null,
    episode: mediaType === 'tv' ? episode : null,
  };
}

/**
 * Remove parâmetros de consulta de URLs e protege eventuais chaves de API nos logs.
 * @param {string} rawMessage - Mensagem bruta de erro.
 * @returns {string} Mensagem saneada para log.
 */
function sanitizeMessage(rawMessage) {
  let message = String(rawMessage || '');
  const key = globalThis.TMDB_API_KEY;
  if (typeof key === 'string' && key.trim()) {
    for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
      message = message.split(secret).join('[redigido]');
    }
  }
  // Remove query string de URLs para evitar vazamento de tokens ou dados de sessão
  message = message.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1');
  return message;
}

/**
 * Função de entrada do provedor chamada pelo Nuvio.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia ("movie" ou "tv").
 * @param {number|null} season - Temporada (1-based; null para filmes).
 * @param {number|null} episode - Episódio (1-based; null para filmes).
 * @returns {Promise<Array<object>>} Streams ordenados da maior para a menor qualidade.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  let request;
  try {
    request = validateInput(tmdbId, mediaType, season, episode);
  } catch (validationError) {
    console.error(`[${PROVIDER_NAME}] Validação: ${sanitizeMessage(validationError.message)}`);
    return [];
  }

  try {
    const streams = await extractStreams(request, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira única com o app: registra log descritivo e devolve lista vazia
    const coordStr = request.mediaType === 'tv' ? ` S${request.season}E${request.episode}` : '';
    console.error(`[${PROVIDER_NAME}] Falha em ${request.mediaType} ${request.tmdbId}${coordStr}: ${sanitizeMessage(error.message)}`);
    return [];
  }
}

module.exports = {
  getStreams,
  validateInput,
  sanitizeMessage,
  PROVIDER_NAME,
};
