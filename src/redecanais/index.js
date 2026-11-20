/**
 * Provedor RedeCanais: fronteira do contrato do Nuvio.
 *
 * O app entrega o ID do TMDB; o provedor busca o título no catálogo PhpMelody, confirma a ficha
 * por título e ano, seleciona o episódio pelo par publicado e resolve o player `player3`.
 */

import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { extractStreams } from './extractor.js';

const PROVIDER_NAME = 'RedeCanais';

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "693134").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia em ausência ou falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode }, PROVIDER_NAME);
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

module.exports = { getStreams };
