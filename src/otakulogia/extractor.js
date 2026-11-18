/**
 * Extrator do Otakulogia: consulta o detalhe de cada candidato confirmado e monta os streams MP4.
 *
 * Cada candidato é resolvido em isolamento: a falha de um detalhe gera apenas aviso e preserva os
 * demais. Se nenhum candidato produzir stream e algum tiver falhado, o erro agregado sobe até
 * `getStreams`. O idioma vem de `audioType` e a qualidade, de `videoUrlFhd`/`videoUrlSd`; nenhuma
 * requisição extra é feita para descobrir qualidade.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { DEFAULT_USER_AGENT } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchDetail } from './api.js';
import { findCandidates, selectMovieEpisodes, selectSeriesEpisodes } from './catalog.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./catalog.js').EpisodeOption} EpisodeOption
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} CandidateResult
 * @property {Stream[]} streams - Streams produzidos pelo candidato.
 * @property {{ label: string, message: string }[]} failures - Falhas isoladas do candidato.
 */

/**
 * Localiza o título no catálogo e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando o catálogo não tem o título ou a
 *   temporada/episódio pedidos.
 * @throws {Error} Em falha de rede, GraphQL, estrutura ou quando nenhum candidato produz stream e
 *   algum tiver falhado.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'Otakulogia');
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo(request);
  const candidates = await findCandidates(media);
  if (candidates.length === 0) return [];

  const results = await Promise.all(
    candidates.map((candidate) => resolveCandidate(candidate, request, media, providerName)),
  );
  const streams = [];
  const failures = [];
  for (const result of results) {
    streams.push(...result.streams);
    failures.push(...result.failures);
  }
  if (streams.length === 0 && failures.length > 0) {
    const causes = failures.map((failure) => `${failure.label}: ${failure.message}`).join('; ');
    throw new Error(`Nenhuma opção produziu stream: ${causes}`);
  }
  return streams;
}

/**
 * Resolve um candidato: consulta o detalhe, seleciona as opções e monta os streams.
 * @param {{ upstreamCid: * }} candidate - Item confirmado na busca.
 * @param {StreamRequest} request - Pedido do app.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<CandidateResult>} Streams e falhas isoladas do candidato.
 */
async function resolveCandidate(candidate, request, media, providerName) {
  const label = `Opção ${String(candidate.upstreamCid)}`;
  let detail;
  try {
    detail = await fetchDetail(candidate.upstreamCid);
  } catch (error) {
    console.warn(`[${providerName}] ${label} descartada: ${error.message}`);
    return { streams: [], failures: [{ label, message: error.message }] };
  }
  if (detail === null) return { streams: [], failures: [] };

  let options;
  try {
    options = request.mediaType === 'tv'
      ? selectSeriesEpisodes(detail, request.season, request.episode)
      : selectMovieEpisodes(detail);
  } catch (error) {
    console.warn(`[${providerName}] ${label} descartada: ${error.message}`);
    return { streams: [], failures: [{ label, message: error.message }] };
  }
  if (options.length === 0) return { streams: [], failures: [] };

  const streams = [];
  const failures = [];
  for (const option of options) {
    try {
      streams.push(buildOptionStream(option, media, request, providerName));
    } catch (error) {
      const optionLabel = request.mediaType === 'tv'
        ? `${label}, T${request.season}E${request.episode}`
        : `${label}, filme`;
      console.warn(`[${providerName}] ${optionLabel} descartada: ${error.message}`);
      failures.push({ label: optionLabel, message: error.message });
    }
  }
  return { streams, failures };
}

/**
 * Monta o stream de uma opção: escolhe a URL, a qualidade e o idioma e aplica o formatador.
 * @param {EpisodeOption} option - Episódio e áudio da temporada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {string} providerName - Nome do provedor.
 * @returns {Stream} Stream validado pelo contrato.
 * @throws {Error} Se a opção não tiver nenhuma URL HTTP(S) válida ou se o contrato rejeitar um campo.
 */
function buildOptionStream(option, media, request, providerName) {
  const source = chooseSource(option.episode);
  const fields = {
    url: source.url,
    type: 'mp4',
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
    format: formatDetails(providerName, media, request),
  };
  if (source.quality !== null) fields.quality = source.quality;
  const language = resolveAudioLanguage(option);
  if (language !== null) fields.language = language;
  return buildStream(fields);
}

/**
 * Escolhe a primeira URL HTTP(S) válida entre `videoUrl`, `videoUrlFhd` e `videoUrlSd` e classifica
 * a qualidade pelo campo de onde ela veio.
 * @param {object} episode - Episódio publicado.
 * @returns {{ url: string, quality: string|null }} URL escolhida e rótulo de qualidade.
 * @throws {Error} Se nenhum dos três campos tiver URL HTTP(S) válida.
 */
function chooseSource(episode) {
  const url = [episode.videoUrl, episode.videoUrlFhd, episode.videoUrlSd]
    .map(readHttpUrl)
    .find((value) => value !== null);
  if (url === undefined) {
    throw new Error('episódio sem URL HTTP(S) válida em videoUrl, videoUrlFhd ou videoUrlSd');
  }
  if (url === readHttpUrl(episode.videoUrlFhd)) return { url, quality: 'FHD' };
  if (url === readHttpUrl(episode.videoUrlSd)) return { url, quality: 'SD' };
  return { url, quality: null };
}

/**
 * Normaliza uma URL HTTP(S) publicada.
 * @param {*} value - Valor recebido.
 * @returns {string|null} URL aparada ou null quando ausente, vazia ou fora de HTTP(S).
 */
function readHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve o idioma pelo `audioType` do episódio, com fallback para o da temporada.
 * @param {EpisodeOption} option - Episódio e áudio da temporada.
 * @returns {string|null} Membro do enum `LANGUAGE` ou null quando não há marcação reconhecida.
 */
function resolveAudioLanguage(option) {
  const episodeType = typeof option.episode.audioType === 'string' ? option.episode.audioType : null;
  const audioType = episodeType !== null && episodeType.trim() !== '' ? episodeType : option.seasonAudioType;
  if (audioType === null || audioType.trim() === '') return null;
  const token = audioType.trim().toUpperCase();
  if (token === 'DUB') return LANGUAGE.DUBBED;
  if (token === 'LEG') return LANGUAGE.SUBTITLED;
  return null;
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {object} Valor do campo `format` de `buildStream`.
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
