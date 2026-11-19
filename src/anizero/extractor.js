/**
 * Extrator do AniZero: busca o título, resolve temporada/episódio e decodifica o player.
 *
 * As etapas de catálogo e de página são fatais; cada opção de áudio é resolvida em isolamento.
 * A ausência reconhecida (título, temporada, episódio, vídeo não pronto ou player vazio) devolve
 * lista vazia sem erro. O erro agregado sobe quando nenhuma opção produz stream e alguma falhou.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { playbackHeaders } from '../_blocks/http/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { decodePlayerUrl, resolveEmbed, resolvePlayerPage } from './player.js';
import {
  absoluteEpisode,
  confirmCandidates,
  fetchShowVideos,
  readVideoPlayerUrl,
  resolveSeasonPage,
  searchCandidates,
  selectEpisode,
} from './site.js';
import { sanitizeMessage } from './support.js';

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null em filme.
 * @property {number|null} episode - Episódio (1-based); null em filme.
 */

/**
 * Localiza e monta os streams do pedido.
 *
 * @param {StreamRequest} request - Pedido validado do app.
 * @param {string} providerName - Nome exibido no formatador e nos logs.
 * @returns {Promise<object[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, estrutura inesperada ou quando todas as opções falham.
 * @example
 * const streams = await extractStreams({ tmdbId: '1429', mediaType: 'tv', season: 1, episode: 1 }, 'AniZero');
 */
export async function extractStreams(request, providerName) {
  if (request.mediaType !== 'tv') return [];

  const media = await getMediaInfo(request);
  const cache = new Map();
  const candidates = await searchCandidates(media, request.season);
  if (candidates.length === 0) return [];

  const confirmed = await confirmCandidates(candidates, media, request.season, cache);
  if (confirmed.length === 0) return [];

  const seasonPage = await resolveSeasonPage(confirmed, media, request.season, cache);
  let page;
  let videos;
  let targetEpisode;

  if (seasonPage !== null) {
    page = seasonPage;
    videos = await fetchShowVideos(page.animeId);
    targetEpisode = request.episode;
  } else {
    const base = confirmed.find(({ page: item }) => item.season === null || item.season === 1);
    if (!base) return [];
    page = base.page;
    videos = await fetchShowVideos(page.animeId);
    targetEpisode = absoluteEpisode(media, request.season, request.episode, videos);
    if (targetEpisode === null) return [];
  }

  const entry = selectEpisode(videos, targetEpisode);
  if (entry === null) return [];

  const playerReference = await readVideoPlayerUrl(entry.epi_url);
  const player = await resolvePlayerPage(playerReference.url, playerReference.referer);
  if (player.options.length === 0) return [];

  const streams = [];
  const failures = [];
  const seenUrls = new Set();

  for (const option of player.options) {
    try {
      const embedUrl = decodePlayerUrl(option.script);
      const embed = await resolveEmbed(embedUrl, player.url);
      if (embed.notReady) continue;
      if (embed.sources.length === 0) continue;

      const headers = playbackHeaders(embed.url);
      for (const source of embed.sources) {
        if (seenUrls.has(source.url)) continue;
        seenUrls.add(source.url);

        const fields = {
          url: source.url,
          headers,
          provider: new URL(source.url).host,
          type: 'hls',
          languageHints: [option.label, page.title],
          qualityHints: source.label === null ? [] : [source.label],
          format: formatDetails(providerName, media, request),
        };
        if (embed.subtitles.length > 0) fields.subtitles = embed.subtitles;
        streams.push(buildStream(fields));
      }
    } catch (error) {
      failures.push({ label: option.label, error });
      console.warn(`[${providerName}] Opção ${option.label} descartada: ${sanitizeMessage(error.message)}`);
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) {
    const details = failures
      .map(({ label, error }) => `${label}: ${sanitizeMessage(error.message)}`)
      .join('; ');
    throw new Error(`Nenhuma opção produziu stream: ${details}`);
  }
  return [];
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido.
 * @returns {object} Campo `format` de `buildStream`.
 */
function formatDetails(providerName, media, request) {
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    season: request.season,
    episode: request.episode,
  };
  if (Number.isInteger(media.year)) format.year = media.year;
  return format;
}
