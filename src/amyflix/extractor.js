/**
 * Extrator do provedor AmyFlix.
 *
 * A busca é HTML, a série usa `div.se-c`/`ul.episodios` e o filme ou episódio usa opções DooPlay.
 * Cada fonte é resolvida em isolamento; a falha de uma preserva as demais.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  fetchOptions,
  fetchPlayerEmbed,
  fetchSeriesDetail,
  search,
} from './catalog.js';
import { resolveOption } from './embeds.js';
import { MAX_SEARCH_TERMS, MIN_TITLE_SCORE } from './site.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./catalog.js').Candidate} Candidate
 * @typedef {import('./catalog.js').PlayerOption} PlayerOption
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
 * @param {string} providerName - Nome do provedor, exibido nos avisos.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, estrutura inválida ou quando todas as opções falham.
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);
  const candidate = await findCandidate(media, request.mediaType);
  if (candidate === null) return [];

  if (request.mediaType === 'movie') return resolveMovie(candidate.url, media, providerName);
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
 * Procura o candidato compatível e sem empate.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {Promise<Candidate|null>} Candidato confirmado ou `null`.
 */
async function findCandidate(media, mediaType) {
  for (const query of searchQueries(media)) {
    const candidates = (await search(query)).filter((candidate) => candidate.kind === mediaType);
    const scored = candidates
      .map((candidate) => ({ candidate, score: bestSimilarity(candidate.title, media) }))
      .filter((entry) => entry.score >= MIN_TITLE_SCORE);
    if (scored.length === 0) continue;
    const top = Math.max(...scored.map((entry) => entry.score));
    const best = scored.filter((entry) => entry.score === top);
    if (best.length === 1) return best[0].candidate;
  }
  return null;
}

/**
 * Monta os termos de busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Até oito termos não repetidos.
 */
function searchQueries(media) {
  const terms = [media.title, media.originalTitle, ...(media.alternativeTitles || [])];
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
 * Compara um título da fonte com os títulos do TMDB.
 * @param {string} title - Título da fonte.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number} Maior similaridade encontrada.
 */
function bestSimilarity(title, media) {
  const titles = [media.title, media.originalTitle, ...(media.alternativeTitles || [])].filter(
    (entry) => typeof entry === 'string' && entry.trim() !== '',
  );
  let best = 0;
  for (const entry of titles) best = Math.max(best, titleSimilarity(title, entry));
  return best;
}

/**
 * Confirma o título da ficha contra o TMDB.
 * @param {string} title - Título limpo da ficha.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {boolean} `true` quando o título é compatível.
 */
function isConfirmed(title, media) {
  return bestSimilarity(title, media) >= MIN_TITLE_SCORE;
}

/**
 * Resolve um filme pelas opções DooPlay da própria página.
 * @param {string} url - URL da ficha.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<Stream[]>} Streams.
 */
async function resolveMovie(url, media, providerName) {
  const detail = await fetchOptions(url, 'movie');
  if (!isConfirmed(detail.title, media)) return [];
  return resolveOptions(detail.options, media, { season: null, episode: null }, providerName, url);
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
  if (!isConfirmed(detail.title, media)) return [];
  const episode = detail.seasons
    .flatMap((season) => season.episodes)
    .find((entry) => entry.season === coordinates.season && entry.episode === coordinates.episode);
  if (episode === undefined) return [];
  const page = await fetchOptions(episode.url, 'tv');
  return resolveOptions(page.options, media, coordinates, providerName, episode.url);
}

/**
 * Resolve uma lista de opções em isolamento.
 * @param {PlayerOption[]} options - Opções DooPlay.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas.
 * @param {string} providerName - Nome do provedor.
 * @param {string} referer - URL da página que contém as opções.
 * @returns {Promise<Stream[]>} Streams; vazio quando todas são triagem.
 * @throws {Error} Se nenhuma opção produzir stream e alguma falhar.
 */
async function resolveOptions(options, media, coordinates, providerName, referer) {
  const streams = [];
  const failures = [];
  for (const option of options) {
    try {
      const embed = await fetchPlayerEmbed(option, referer);
      if (embed === null) {
        failures.push(`${option.label}: embed_url vazio`);
        console.warn(`[${providerName}] Opção ${option.label} descartada: embed_url vazio`);
        continue;
      }
      const resolved = await resolveOption({ label: option.label, url: embed }, { media, coordinates });
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
 * Remove streams repetidos por URL.
 * @param {Stream[]} streams - Streams acumulados.
 * @returns {Stream[]} Streams sem repetição.
 */
function dedupeStreams(streams) {
  const seen = new Set();
  const unique = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
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
