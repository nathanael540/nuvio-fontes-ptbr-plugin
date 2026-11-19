/**
 * Extração do Super Animes (AnimesTVS): catálogo, temporada, episódio e montagem dos streams.
 *
 * O catálogo e as listas de episódios são baixados uma vez por chamada. Cada áudio é uma opção
 * independente: a falha de uma lista de episódios descarta apenas aquele áudio, com aviso, e o
 * erro agregado só sobe quando nenhuma opção produz stream e alguma falhou.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchCatalog, fetchEpisodeList } from './api.js';
import { selectMovieMatches, selectSeriesMatches } from './catalog.js';
import { selectEpisodeRows } from './episodes.js';

const STREAM_PROVIDER = 'AnimesTVS';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID numérico do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} SelectedMatch
 * @property {object} entry - Entrada do catálogo.
 * @property {'Dublado'|'Legendado'} audio - Áudio da entrada.
 * @property {number} localEpisode - Episódio dentro da entrada.
 */

/**
 * Localiza a mídia no catálogo e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título.
 * @throws {Error} Em falha de entrada, TMDB, catálogo ou quando todas as opções de áudio falham.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'Super Animes');
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const catalog = await fetchCatalog();
  const matches = request.mediaType === 'movie'
    ? selectMovieMatches(media, catalog)
    : selectSeriesMatches(media, request.season, request.episode, catalog);
  if (matches.length === 0) return [];

  const episodeLists = new Map();
  const streams = [];
  const failures = [];
  for (const match of matches) {
    const label = `${match.audio} ${match.entry.titulo}`;
    try {
      if (!episodeLists.has(match.audio)) episodeLists.set(match.audio, fetchEpisodeList(match.audio));
      const list = await episodeLists.get(match.audio);
      const localEpisode = request.mediaType === 'movie' ? 1 : match.localEpisode;
      const rows = selectEpisodeRows(list, match.entry.titulo, localEpisode);
      for (const row of rows) {
        streams.push(buildFields(row, match, media, request, providerName));
      }
    } catch (error) {
      failures.push({ label, error });
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    const causes = failures.map((failure) => `${failure.label}: ${failure.error.message}`).join('; ');
    throw new Error(`Nenhuma opção produziu stream: ${causes}`);
  }
  return streams;
}

/**
 * Monta o stream de uma linha de episódio.
 * @param {{ url: string, quality: string|null }} row - Linha selecionada.
 * @param {SelectedMatch} match - Entrada e áudio escolhidos.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido original.
 * @param {string} providerName - Nome do provedor.
 * @returns {Stream} Stream validado pelo contrato.
 */
function buildFields(row, match, media, request, providerName) {
  const fields = {
    url: row.url,
    type: 'mp4',
    language: match.audio === 'Dublado' ? LANGUAGE.DUBBED : LANGUAGE.SUBTITLED,
    provider: STREAM_PROVIDER,
    format: formatDetails(providerName, media, request),
  };
  if (row.quality !== null) fields.quality = row.quality;
  return buildStream(fields);
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido original.
 * @returns {object} Valor do campo `format`.
 */
function formatDetails(providerName, media, request) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  return format;
}
