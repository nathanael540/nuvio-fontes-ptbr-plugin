/**
 * Extrator do provedor AnimeQ.
 *
 * A busca é HTML, a série usa blocos `se-c`/`episode-card` e o filme usa opções DooPlay. Cada
 * fonte é resolvida em isolamento; a falha de uma preserva as demais.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  fetchMovieDetail,
  fetchPlayerEmbed,
  fetchSeriesDetail,
  search,
} from './catalog.js';
import { resolveOption } from './embeds.js';
import { collectEpisodeOptions } from './players.js';
import { MAX_SEARCH_TERMS, MIN_TITLE_SCORE } from './site.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./catalog.js').Candidate} Candidate
 * @typedef {import('./catalog.js').PlayerOption} PlayerOption
 * @typedef {import('./players.js').EpisodeOption} EpisodeOption
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada; null para filmes.
 * @property {number|null} episode - Episódio; null para filmes.
 */

/**
 * @typedef {object} Coordinates
 * @property {number|null} season - Temporada; null em filme.
 * @property {number|null} episode - Episódio; null em filme.
 */

/**
 * Localiza o título e resolve as fontes.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, estrutura inválida ou quando todas as opções falham.
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);
  const candidate = await findCandidate(media, request.mediaType);
  if (candidate === null) return [];

  if (request.mediaType === 'movie') {
    return resolveMovie(candidate.url, media, providerName);
  }
  return resolveSeries(candidate.url, media, coordinates, providerName);
}

/**
 * Lê as coordenadas do pedido.
 * @param {StreamRequest} request - Valores do app.
 * @returns {Coordinates} Coordenadas validadas.
 * @throws {Error} Se uma série vier sem temporada ou episódio positivos.
 */
function readCoordinates(request) {
  if (request.mediaType !== 'tv') return { season: null, episode: null };
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode}`);
  }
  return { season, episode };
}

/**
 * Procura o melhor candidato compatível.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {Promise<Candidate|null>} Candidato confirmado ou `null`.
 */
async function findCandidate(media, mediaType) {
  let best = null;
  for (const query of searchQueries(media)) {
    const candidates = await search(query);
    for (const candidate of candidates) {
      if (candidate.kind !== mediaType) continue;
      if (mediaType === 'movie' && candidate.year !== null && media.year !== null && Math.abs(candidate.year - media.year) > 1) continue;
      const score = candidateScore(candidate, media);
      if (score === null) continue;
      if (best === null || score > best.score) best = { candidate, score };
    }
    if (best !== null && best.score >= 0.95) break;
  }
  return best === null ? null : best.candidate;
}

/**
 * Monta os termos de busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Até oito termos não repetidos.
 */
function searchQueries(media) {
  const terms = [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...(media.romajiTitles || []).map((entry) => entry.title),
  ];
  const seen = new Set();
  const queries = [];
  for (const term of terms) {
    if (typeof term !== 'string' || term.trim() === '') continue;
    const key = normalizeText(term) || term;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(term.trim());
    if (queries.length === MAX_SEARCH_TERMS) break;
  }
  return queries;
}

/**
 * Calcula a similaridade de um cartão com o TMDB.
 * @param {Candidate} candidate - Cartão encontrado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number|null} Score ou `null` abaixo do limiar.
 */
function candidateScore(candidate, media) {
  const titles = [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...(media.romajiTitles || []).map((entry) => entry.title),
  ].filter((title) => typeof title === 'string' && title.trim() !== '');
  const candidateTitles = [candidate.title, candidate.title.split(/\s*[:–—]\s*/)[0]];
  let best = 0;
  for (const candidateTitle of candidateTitles) {
    for (const title of titles) best = Math.max(best, titleSimilarity(candidateTitle, title));
  }
  if (best < MIN_TITLE_SCORE) return null;
  return candidate.year !== null && media.year !== null && candidate.year === media.year ? best + 0.05 : best;
}

/**
 * Resolve uma série.
 * @param {string} url - URL da ficha da série.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas pedidas.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<Stream[]>} Streams.
 */
async function resolveSeries(url, media, coordinates, providerName) {
  const detail = await fetchSeriesDetail(url);
  const season = detail.seasons.find((entry) => entry.number === coordinates.season);
  if (season === undefined) return [];
  const episode = season.episodes.find((entry) => entry.number === coordinates.episode);
  if (episode === undefined) return [];
  const html = await fetchTextEpisode(episode.url);
  const options = collectEpisodeOptions(html).map((option) => ({ label: option.label, url: option.url }));
  return resolveOptions(options, media, coordinates, providerName);
}

/**
 * Resolve um filme pelas opções DooPlay.
 * @param {string} url - URL da ficha do filme.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<Stream[]>} Streams.
 */
async function resolveMovie(url, media, providerName) {
  const detail = await fetchMovieDetail(url);
  const options = [];
  const failures = [];
  for (const option of detail.options) {
    try {
      const embed = await fetchPlayerEmbed(option);
      if (embed === null) {
        failures.push(`${option.label}: embed_url vazio`);
        console.warn(`[${providerName}] Opção ${option.label} descartada: embed_url vazio`);
        continue;
      }
      options.push({ label: option.label, url: embed });
    } catch (error) {
      failures.push(`${option.label}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${option.label} descartada: ${sanitizeMessage(error.message)}`);
    }
  }
  const streams = await resolveOptions(options, media, { season: null, episode: null }, providerName);
  if (streams.length > 0) return streams;
  if (failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.map(sanitizeMessage).join('; ')}`);
  }
  return [];
}

/**
 * Resolve uma lista de opções em isolamento.
 * @param {Array<{ label: string, url: string }>} options - Opções.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<Stream[]>} Streams; vazio quando todas são triagem.
 * @throws {Error} Se nenhuma opção produzir stream e alguma falhar.
 */
async function resolveOptions(options, media, coordinates, providerName) {
  const streams = [];
  const failures = [];
  for (const option of options) {
    try {
      const resolved = await resolveOption(option, { media, coordinates });
      streams.push(...resolved);
    } catch (error) {
      failures.push(`${option.label}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${option.label} descartada: ${sanitizeMessage(error.message)}`);
    }
  }
  const unique = dedupeStreams(streams);
  if (unique.length > 0) return unique;
  if (failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.map(sanitizeMessage).join('; ')}`);
  }
  return [];
}

/**
 * Baixa o HTML de um episódio.
 * @param {string} url - URL do episódio.
 * @returns {Promise<string>} HTML.
 */
async function fetchTextEpisode(url) {
  return fetchText(url, { profile: 'page' });
}

/**
 * Remove streams repetidos por URL e idioma.
 * @param {Stream[]} streams - Streams acumulados.
 * @returns {Stream[]} Streams sem repetição.
 */
function dedupeStreams(streams) {
  const seen = new Set();
  const unique = [];
  for (const stream of streams) {
    const key = `${stream.url}\u0000${stream.language || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(stream);
  }
  return unique;
}

/**
 * Remove URL e hash longos das mensagens de log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}
