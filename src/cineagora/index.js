/**
 * Provedor CineAgora: fronteira do contrato do Nuvio.
 *
 * O app entrega o ID do TMDB; o provedor consulta o catálogo DLE, confirma a identidade na
 * página, resolve cada espelho BrStream em isolamento e devolve streams HLS.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findContent } from './catalog.js';
import { resolvePlayer } from './player.js';

const PROVIDER_NAME = 'CineAgora';
const TMDB_ID = /^\d+$/;

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
  if (!TMDB_ID.test(id)) throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: ${mediaType}`);
  }
  if (mediaType === 'tv' && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode}`);
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
    const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: request.mediaType });
    const found = await findContent(request, media);
    if (found.confirmed.length === 0 && found.failures.length === 0) return [];
    const streams = [];
    const failures = [];
    const seen = new Set();
    for (const entry of found.confirmed) {
      try {
        const result = await resolvePlayer(entry.content, request, media, seen);
        if (result.status === 'ok') streams.push(...result.streams);
      } catch (error) {
        failures.push({ catalog: entry.catalog, error });
      }
    }
    failures.push(...found.failures);
    if (streams.length > 0) {
      for (const failure of failures) {
        console.warn(`[${PROVIDER_NAME}] Catálogo ${failure.catalog.name} descartado: ${failure.error.message}`);
      }
      return sortByQuality(streams);
    }
    if (failures.length > 0) {
      const causes = failures
        .map((failure) => `${failure.catalog.name}: ${failure.error.message}`)
        .join('; ');
      throw new Error(`Nenhum catálogo produziu stream: ${causes}`);
    }
    return [];
  } catch (error) {
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
