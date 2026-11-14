/**
 * Ponto de entrada do Doramas Online: filmes e séries do portal WordPress com tema DooPlay.
 *
 * A busca e a ficha são etapas fatais. Cada opção de player é resolvida em isolamento; só
 * `getStreams` captura a falha final, registra com `[Doramas Online]` e devolve lista vazia.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findMedia } from './catalog.js';
import { selectEpisode } from './episode.js';
import { resolveOptions } from './players.js';

const PROVIDER_NAME = 'Doramas Online';
const TMDB_ID = /^\d+$/;

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID numérico do TMDB (ex.: "94796").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte não tem o título, a coordenada ou em falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const streams = await extractStreams({ tmdbId, mediaType, season, episode });
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

/**
 * Localiza a obra, escolhe a página do episódio ou do filme e resolve as opções de player.
 * @param {{ tmdbId: string, mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Valores recebidos do app.
 * @returns {Promise<Array<object>>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em entrada inválida, falha de rede/estrutura ou quando todas as opções falham.
 */
async function extractStreams(request) {
  const normalized = readRequest(request);
  const media = await getMediaInfo({ tmdbId: normalized.tmdbId, mediaType: normalized.mediaType });
  const confirmed = await findMedia(media);
  if (confirmed === null) return [];

  const selected = selectEpisode(confirmed.detail, media.mediaType, normalized.episode);
  if (selected === null) return [];

  const page = selected.current
    ? { url: confirmed.url, text: confirmed.html }
    : await fetchPage(selected.url);

  return resolveOptions(page.text, {
    pageUrl: page.url,
    media,
    episode: normalized.episode,
    providerName: PROVIDER_NAME,
  });
}

/**
 * Valida a entrada antes de qualquer requisição.
 * @param {{ tmdbId: *, mediaType: *, season: *, episode: * }} request - Valores recebidos do app.
 * @returns {{ tmdbId: string, mediaType: 'movie'|'tv', episode: { season: number, episode: number }|null }} Entrada normalizada.
 * @throws {Error} Se o ID não for numérico, o tipo for inválido ou uma série vier sem temporada/episódio válidos.
 */
function readRequest(request) {
  const tmdbId = String(request.tmdbId).trim();
  if (!TMDB_ID.test(tmdbId)) {
    throw new Error(`tmdbId inválido: "${request.tmdbId}" (esperado ID numérico do TMDB)`);
  }
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${request.mediaType}" (esperado "movie" ou "tv")`);
  }

  if (request.mediaType === 'movie') {
    return { tmdbId, mediaType: 'movie', episode: null };
  }

  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { tmdbId, mediaType: 'tv', episode: { season, episode } };
}

module.exports = { getStreams };
