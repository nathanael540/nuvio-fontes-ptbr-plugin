/** Provedor DooPlay PT-BR: fronteira do contrato do Nuvio. */
import { redact } from '../_blocks/fireplayer/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { PROVIDER } from './log.js';
import { SOURCES, resolveSource } from './sources.js';

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
  let media;
  try {
    request.stage = 'TMDB';
    media = await getMediaInfo({ tmdbId: String(request.tmdbId).trim(), mediaType: request.mediaType });
  } catch (error) {
    console.error(`[${PROVIDER}] TMDB: ${redact(error.message)}`);
    return [];
  }
  const classes = [];
  let failed = false;
  for (const source of SOURCES) {
    try {
      const result = await resolveSource(source, media, request);
      if (result.status === 'sucesso') return sortByQuality(result.streams);
      classes.push(`${source.domain}=ausencia`);
      console.log(`[${PROVIDER}] ${source.domain} ausência: ${result.reason}`);
    } catch (error) {
      failed = true;
      classes.push(`${source.domain}=falha`);
      console.warn(`[${PROVIDER}] ${source.domain} ${request.stage}: ${redact(error.message)}`);
    }
  }
  const summary = classes.join('; ');
  if (failed) console.error(`[${PROVIDER}] Nenhuma origem entregou streams: ${summary}`);
  else console.log(`[${PROVIDER}] Nenhuma origem entregou streams: ${summary}`);
  return [];
}

function validate(request) {
  if (!/^\d+$/.test(String(request.tmdbId).trim())) throw new Error('ID do TMDB inválido');
  if (!['movie', 'tv'].includes(request.mediaType)) throw new Error('Tipo de mídia inválido');
  if (request.mediaType === 'tv' &&
      ![request.season, request.episode].every((number) => Number.isInteger(number) && number > 0)) {
    throw new Error('Temporada e episódio devem ser inteiros positivos');
  }
}

module.exports = { getStreams };
