/**
 * Ponto de entrada do Doramogo: catálogo PT-BR de doramas e filmes asiáticos em HLS.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'Doramogo';

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "94796").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte não tem o título ou em falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
    return sortByQuality(dedupeByUrl(streams));
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

/**
 * Remove streams repetidos pela URL, preservando a primeira ocorrência.
 * @param {Array<object>} streams - Streams resolvidos.
 * @returns {Array<object>} Streams sem URL repetida.
 */
function dedupeByUrl(streams) {
  const seen = new Set();
  return streams.filter((stream) => {
    if (seen.has(stream.url)) return false;
    seen.add(stream.url);
    return true;
  });
}

module.exports = { getStreams };
