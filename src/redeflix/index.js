/**
 * Provedor RedeFlix: fronteira do contrato do Nuvio para RedeFlixApi.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { buildRequestedPath, resolveOriginPage, extractPlayerStreams } from '../_blocks/redeflix-player/index.mjs';

const PROVIDER_NAME = 'RedeFlix';

const ALIASES = Object.freeze([
  'https://redeflixapi.click',
  'https://redeflixapi.bar',
  'https://redeflixapi.store',
]);

/**
 * Valida os parâmetros recebidos do app antes de qualquer requisição externa.
 * @param {string|number} tmdbId - ID numérico do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based; null para filmes).
 * @param {number|null} episode - Episódio (1-based; null para filmes).
 * @returns {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }}
 * @throws {Error} Se qualquer parâmetro for inválido.
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
      throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
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
 * Redige segredos, chaves e parâmetros de consulta de URLs de mensagens de log.
 * @param {string} rawMessage - Mensagem original.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(rawMessage) {
  let message = String(rawMessage || '');
  const key = globalThis.TMDB_API_KEY;
  if (typeof key === 'string' && key.trim()) {
    for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
      message = message.split(secret).join('[redigido]');
    }
  }
  // Remove parâmetros de consulta de URLs para expor somente host + caminho
  message = message.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1');
  return message;
}

/**
 * Função de entrada chamada pelo Nuvio.
 * @param {string|number} tmdbId - ID do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based; null para filmes).
 * @param {number|null} episode - Episódio (1-based; null para filmes).
 * @returns {Promise<Array<object>>} Streams ordenados ou lista vazia em ausência/falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  let request;
  try {
    request = validateInput(tmdbId, mediaType, season, episode);
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Entrada: ${sanitizeMessage(error.message)}`);
    return [];
  }

  const requestedPath = buildRequestedPath(request.tmdbId, request.mediaType, request.season, request.episode);
  const budget = { getCount: 0, maxGets: 6 };
  const seenEffectiveOrigins = new Set();
  const failures = [];

  for (const alias of ALIASES) {
    if (budget.getCount >= budget.maxGets) {
      failures.push({
        origin: alias,
        stage: 'Orçamento',
        error: new Error(`Orçamento de ${budget.maxGets} requisições de página esgotado`),
      });
      break;
    }

    let originResult;
    try {
      originResult = await resolveOriginPage(alias, requestedPath, budget);
    } catch (err) {
      failures.push({ origin: alias, stage: 'Origem', error: err });
      continue;
    }

    const { effectiveOrigin, status } = originResult;
    if (seenEffectiveOrigins.has(effectiveOrigin)) {
      // Aliases convergentes já processados
      continue;
    }
    seenEffectiveOrigins.add(effectiveOrigin);

    if (status === 'absent') {
      continue;
    }

    if (status === 'player') {
      try {
        const streams = await extractPlayerStreams(originResult, request);
        if (streams.length > 0) {
          return sortByQuality(streams);
        }
        failures.push({
          origin: effectiveOrigin,
          stage: 'Player',
          error: new Error('Nenhum stream válido produzido'),
        });
      } catch (err) {
        failures.push({ origin: effectiveOrigin, stage: 'Resolução', error: err });
      }
    }
  }

  // Se todas as origens distintas foram ausentes e nenhuma falhou, retorna [] sem erro
  if (failures.length === 0) {
    return [];
  }

  // Falhas observadas: registra log agregado e saneado
  const coordStr = request.mediaType === 'tv' ? ` S${request.season}E${request.episode}` : '';
  const details = failures.map((f) => `${f.origin} (${f.stage}): ${f.error.message}`).join('; ');
  console.error(`[${PROVIDER_NAME}] Falha em ${request.mediaType} ${request.tmdbId}${coordStr}: ${sanitizeMessage(details)}`);
  return [];
}

module.exports = { getStreams, ALIASES, PROVIDER_NAME, validateInput, sanitizeMessage };
