/**
 * Busca e confirmação de identidade no Animes Online Blue.
 *
 * A fonte não aceita o ID do TMDB. A busca é `GET /api/search?q=<termo>` e devolve JSON com
 * `results[]` (`slug`, `title`, `year`, `tipo`, `audios` e `episodeCount`). O título PT-BR composto
 * pode não encontrar a série (Demon Slayer devolve o filme de 2025), então todas as variantes do
 * TMDB são consultadas e os candidatos são acumulados por slug antes da escolha por título e ano.
 */

import { fetchJson } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';

/** Origem do catálogo, usada como base das URLs e dos cabeçalhos de contexto. */
export const SITE_URL = 'https://animesonline.blue';

const SEARCH_PATH = '/api/search';
const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const FOUR_DIGIT_YEAR = /^\d{4}$/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} Candidate
 * @property {string} slug - Slug da ficha em `/anime/<slug>`.
 * @property {string} title - Título publicado pela fonte.
 * @property {number|null} year - Ano publicado pela fonte, ou `null` quando ausente.
 */

/**
 * Localiza a obra no catálogo consultando todas as variantes de título do TMDB.
 *
 * As variantes são o título PT-BR, o original, os alternativos brasileiros e os romaji/romanizados,
 * deduplicadas por `normalizeText`. Os resultados são acumulados por slug e a escolha usa título e
 * ano com `findBestMatch` (score mínimo 0,85 e tolerância de um ano).
 *
 * @param {MediaInfo} media - Dados do TMDB já obtidos por `getMediaInfo`.
 * @returns {Promise<Candidate|null>} Candidato confirmado ou `null` na ausência reconhecida.
 * @throws {Error} Se uma busca responder fora de 2xx, o JSON for inválido ou a estrutura não tiver
 *   a lista `results`.
 * @example
 * const media = await getMediaInfo({ tmdbId: '85937', mediaType: 'tv' });
 * const candidate = await findCandidate(media);
 * // { slug: 'kimetsu-no-yaiba', title: 'Kimetsu no Yaiba', year: 2019 }
 */
export async function findCandidate(media) {
  const terms = buildSearchTerms(media);
  const matchingMedia = buildMatchingMedia(media);
  const candidates = new Map();

  for (const term of terms) {
    const data = await fetchJson(buildSearchUrl(term), { profile: 'api' });
    for (const candidate of readResults(data, term)) {
      if (!candidates.has(candidate.slug)) candidates.set(candidate.slug, candidate);
    }
  }

  if (candidates.size === 0) return null;
  const match = findBestMatch([...candidates.values()], matchingMedia, {
    minScore: MIN_SCORE,
    yearTolerance: YEAR_TOLERANCE,
  });
  return match === null ? null : match.candidate;
}

/**
 * Variantes de busca, na ordem do TMDB e sem repetição pelo texto normalizado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Variantes não vazias.
 * @throws {Error} Se algum título esperado não for texto.
 */
function buildSearchTerms(media) {
  const values = [media.title, media.originalTitle]
    .concat(media.alternativeTitles, media.romajiTitles.map((item) => item.title));
  const seen = new Set();
  const terms = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new Error(`Título de busca inválido: ${String(value)} (esperado texto)`);
    }
    const term = value.trim();
    const key = normalizeText(term) || term.toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/**
 * Dados do TMDB usados na comparação, com os romaji acrescentados aos alternativos.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {{ title: string, originalTitle: string, alternativeTitles: string[], year: number|null }} Objeto aceito por `findBestMatch`.
 */
function buildMatchingMedia(media) {
  return {
    title: media.title,
    originalTitle: media.originalTitle,
    alternativeTitles: media.alternativeTitles.concat(media.romajiTitles.map((item) => item.title)),
    year: media.year,
  };
}

/**
 * Monta a URL da busca JSON.
 * @param {string} term - Termo de busca.
 * @returns {string} URL absoluta de `/api/search?q=<termo>`.
 * @throws {Error} Se o termo não for texto não vazio.
 * @example
 * buildSearchUrl('Kimetsu no Yaiba');
 * // 'https://animesonline.blue/api/search?q=Kimetsu+no+Yaiba'
 */
function buildSearchUrl(term) {
  if (typeof term !== 'string' || term.trim() === '') {
    throw new Error(`Termo de busca inválido: ${String(term)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}${SEARCH_PATH}?${new URLSearchParams({ q: term.trim() }).toString()}`;
}

/**
 * Lê e valida os resultados de uma busca.
 * @param {*} data - Corpo JSON da busca.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {Candidate[]} Candidatos na ordem da fonte, sem repetir slug.
 * @throws {Error} Se a resposta não tiver a lista `results` ou um item estiver fora do contrato.
 */
function readResults(data, term) {
  if (data === null || typeof data !== 'object' || !Array.isArray(data.results)) {
    throw new Error(`Busca de "${term}" sem a lista results`);
  }

  const candidates = new Map();
  data.results.forEach((item, index) => {
    const candidate = readCandidate(item, `results[${index}] da busca de "${term}"`);
    if (!candidates.has(candidate.slug)) candidates.set(candidate.slug, candidate);
  });
  return [...candidates.values()];
}

/**
 * Lê um resultado da busca.
 * @param {*} item - Item bruto.
 * @param {string} label - Contexto para a mensagem de erro.
 * @returns {Candidate}
 * @throws {Error} Se `slug` ou `title` não forem texto não vazio ou se `year` estiver inválido.
 */
function readCandidate(item, label) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`${label}: resultado não é objeto`);
  }
  const slug = readText(item.slug, `${label}.slug`);
  const title = readText(item.title, `${label}.title`);
  return { slug, title, year: readYear(item.year, `${label}.year`) };
}

/**
 * Lê o ano publicado pela fonte, que pode vir em texto.
 * @param {*} value - Valor recebido.
 * @param {string} label - Contexto para a mensagem de erro.
 * @returns {number|null} Ano de quatro dígitos ou `null` quando ausente.
 * @throws {Error} Se o valor existir fora do formato de quatro dígitos.
 */
function readYear(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string' && FOUR_DIGIT_YEAR.test(value.trim())) return Number(value.trim());
  throw new Error(`${label} inválido: "${String(value)}" (esperado ano de quatro dígitos)`);
}

/**
 * Lê um texto obrigatório e não vazio.
 * @param {*} value - Valor recebido.
 * @param {string} label - Contexto para a mensagem de erro.
 * @returns {string} Texto aparado.
 * @throws {Error} Se não for texto não vazio.
 */
function readText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} inválido: ${String(value)} (esperado texto não vazio)`);
  }
  return value.trim();
}
