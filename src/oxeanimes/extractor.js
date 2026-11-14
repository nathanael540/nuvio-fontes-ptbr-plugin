/**
 * Extrator do provedor OxeAnimes.
 *
 * Localiza a obra pelas variantes de título do TMDB, escolhe um candidato dublado e um legendado de
 * forma independente, seleciona o episódio na página da obra e resolve o HLS do proxy de streaming.
 * Cada áudio é uma opção isolada; a falha de um não interrompe o outro.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { DEFAULT_USER_AGENT } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findAudioCandidates } from './catalog.js';
import { fetchEpisodeMedia } from './episode.js';
import { findEpisodeLink } from './page.js';
import { SITE_URL } from './site.js';

const STREAM_TYPE = 'hls';
const MAX_CANDIDATES = 3;

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} Coordinates
 * @property {number|null} season - Temporada pedida; null em filme.
 * @property {number|null} episode - Episódio pedido; null em filme.
 */

/**
 * @typedef {object} AudioOption
 * @property {string} label - Rótulo usado no aviso e nos testes (`dublado` ou `legendado`).
 * @property {string} language - Membro do enum `LANGUAGE` da opção.
 * @property {import('./catalog.js').AudioCandidate[]} candidates - Candidatos daquele áudio.
 */

/**
 * Localiza a obra, seleciona o episódio e monta os streams.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<import('../_blocks/stream-build/index.mjs').Stream[]>} Streams encontrados;
 *   vazio em ausência reconhecida.
 * @throws {Error} Em entrada inválida, falha de rede, JSON inválido, estrutura inesperada ou
 *   ausência de stream quando alguma opção falhou.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'OxeAnimes');
 * // streams[0].language === 'Legendado'
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);
  const candidates = await findAudioCandidates(media, coordinates);
  const audios = [
    { label: 'dublado', language: LANGUAGE.DUBBED, candidates: candidates.dubbed },
    { label: 'legendado', language: LANGUAGE.SUBTITLED, candidates: candidates.subtitled },
  ];
  const context = { media, coordinates, providerName };

  const results = await Promise.all(audios.map(async (audio) => {
    try {
      return { ok: true, stream: await resolveAudioStream(audio, context) };
    } catch (error) {
      return { ok: false, label: audio.label, error };
    }
  }));

  const streams = [];
  const failures = [];
  for (const result of results) {
    if (!result.ok) {
      const reason = sanitizeMessage(result.error.message);
      failures.push(`${result.label}: ${reason}`);
      console.warn(`[${providerName}] Opção ${result.label} descartada: ${reason}`);
      continue;
    }
    if (result.stream !== null) streams.push(result.stream);
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Resolve uma opção de áudio percorrendo até três candidatos.
 * @param {AudioOption} audio - Opção de áudio.
 * @param {{ media: import('../_blocks/tmdb-info/index.mjs').MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {Promise<import('../_blocks/stream-build/index.mjs').Stream|null>} Stream ou `null` na ausência.
 * @throws {Error} Em falha de rede ou estrutura inesperada na página ou na API do episódio.
 */
async function resolveAudioStream(audio, context) {
  const { media, coordinates } = context;
  for (const candidate of audio.candidates.slice(0, MAX_CANDIDATES)) {
    const link = await findEpisodeLink(candidate, media.mediaType, coordinates.episode);
    if (link === null) continue;
    const episode = await fetchEpisodeMedia(link, candidate.slug, audio.language);
    if (episode === null) return null;
    return buildAudioStream(episode, context);
  }
  return null;
}

/**
 * Monta o stream de uma opção de áudio.
 * @param {import('./episode.js').EpisodeMedia} episode - Mídia resolvida pela API.
 * @param {{ media: import('../_blocks/tmdb-info/index.mjs').MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {import('../_blocks/stream-build/index.mjs').Stream} Stream validado pelo contrato.
 * @throws {Error} Se o contrato recusar algum campo.
 */
function buildAudioStream(episode, context) {
  const fields = {
    url: episode.url,
    format: formatDetails(context),
    headers: { Referer: SITE_URL, 'User-Agent': DEFAULT_USER_AGENT },
    provider: context.providerName,
    type: STREAM_TYPE,
    language: episode.language,
  };
  if (episode.quality !== undefined) fields.quality = episode.quality;
  return buildStream(fields);
}

/**
 * Detalhes de apresentação do stream para o formatador.
 * @param {{ media: import('../_blocks/tmdb-info/index.mjs').MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {import('../_blocks/custom-formatter/index.mjs').FormatDetails} Valor do campo `format`.
 */
function formatDetails(context) {
  const { media, coordinates, providerName } = context;
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
  };
  if (media.year !== null) format.year = media.year;
  if (coordinates.season !== null) {
    format.season = coordinates.season;
    format.episode = coordinates.episode;
  }
  return format;
}

/**
 * Lê temporada e episódio do pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Coordinates} Temporada e episódio em séries; null em filmes.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readCoordinates(request) {
  if (request.mediaType !== 'tv') return { season: null, episode: null };
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Remove URL das mensagens para os logs não carregarem mídia.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, '[url]');
}
