/**
 * Extrator do provedor Animes Online Blue.
 *
 * O fluxo é: TMDB -> variantes de busca -> confirmação de título e ano -> grade RSC -> episódio
 * selecionado por temporada e número -> áudios `leg`/`dub` e players do Blogger. A ausência de
 * título, temporada, episódio ou áudio é reconhecida; falha de rede, HTTP ou estrutura sobe até
 * `getStreams`.
 */

import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findCandidate } from './catalog.js';
import { resolveEpisodeStreams } from './episode.js';
import { fetchSeasons, selectEpisode } from './grid.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('./grid.js').EpisodeEntry} EpisodeEntry
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'tv'} mediaType - Tipo de mídia; filmes são recusados antes desta etapa.
 * @property {number|null} season - Temporada pedida.
 * @property {number|null} episode - Episódio pedido.
 */

/**
 * Localiza a série no Animes Online Blue e monta os streams do episódio.
 * @param {StreamRequest} request - Valores já validados pelo ponto de entrada.
 * @param {string} providerName - Nome do provedor, usado nos logs e no formatador.
 * @returns {Promise<object[]>} Streams encontrados; vazio na ausência reconhecida de título,
 *   temporada, episódio ou áudio.
 * @throws {Error} Em falha de rede, HTTP, parsing ou estrutura inesperada.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'Animes Online Blue');
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const candidate = await findCandidate(media);
  if (candidate === null) return [];

  const seasons = await fetchSeasons(candidate.slug);
  const entry = selectEpisode(seasons, request.season, request.episode);
  if (entry === null) return [];

  return resolveEpisodeStreams(entry, request, media, providerName, candidate.slug);
}
