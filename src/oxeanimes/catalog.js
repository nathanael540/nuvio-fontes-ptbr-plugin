/**
 * Busca e classificação de candidatos do OxeAnimes.
 *
 * A fonte não aceita o ID do TMDB: a busca é textual e separa dublado e legendado em páginas
 * distintas. Cada variante de título do TMDB é consultada e os itens de `/anime/` são acumulados
 * por `href`; a escolha de cada áudio usa `titleSimilarity` com limiar de 0,60.
 */

import { fetchJson } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { buildSearchUrl, SITE_HEADERS } from './site.js';

const MIN_SCORE = 0.6;
const ANIME_PATH = '/anime/';
const DUBBED_MARKER = 'dublado';

/**
 * @typedef {object} SearchItem
 * @property {string} title - Título publicado no resultado da busca.
 * @property {string} href - Caminho publicado, começando por `/anime/`.
 * @property {string} slug - Slug da obra, lido do `href`.
 */

/**
 * @typedef {object} AudioCandidate
 * @property {string} title - Título do resultado na fonte.
 * @property {string} href - Caminho `/anime/<slug>`.
 * @property {string} slug - Slug da obra.
 * @property {number} score - Maior similaridade contra os títulos do TMDB.
 * @property {number} seasonScore - Similaridade contra o título da temporada pedida; desempate.
 */

/**
 * @typedef {object} AudioCandidates
 * @property {AudioCandidate[]} dubbed - Candidatos dublados, do maior para o menor score.
 * @property {AudioCandidate[]} subtitled - Candidatos legendados, do maior para o menor score.
 */

/**
 * Consulta todas as variantes de título e devolve os candidatos separados por áudio.
 *
 * Cada termo é consultado mesmo que os anteriores já tenham devolvido itens; os itens são
 * acumulados por `href`. Um item é dublado quando o título ou o slug contém `dublado`, e legendado
 * nos demais casos. Só entram candidatos com score maior ou igual a 0,60.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ season: number|null, episode: number|null }} coordinates - Coordenadas do pedido.
 * @returns {Promise<AudioCandidates>} Candidatos dublados e legendados, sem repetir `href`.
 * @throws {Error} Se a busca responder fora de 2xx, não for JSON válido ou estiver fora do esquema.
 * @example
 * const candidates = await findAudioCandidates(media, { season: 1, episode: 1 });
 * // candidates.dubbed[0].slug === 'kimetsu-no-yaiba-dublado'
 */
export async function findAudioCandidates(media, coordinates) {
  const searchTerms = buildSearchTerms(media, coordinates);
  const items = new Map();

  for (const term of searchTerms) {
    const body = await fetchJson(buildSearchUrl(term), { profile: 'api', headers: SITE_HEADERS });
    for (const item of readSearchItems(body, term)) {
      if (!item.href.startsWith(ANIME_PATH)) continue;
      if (!items.has(item.href)) items.set(item.href, { ...item, slug: readSlug(item.href, term) });
    }
  }

  const mediaTitles = buildMediaTitles(media, coordinates);
  const seasonTitles = buildSeasonTitles(media, coordinates);
  const dubbed = [];
  const subtitled = [];
  for (const item of items.values()) {
    const score = bestScore(item.title, mediaTitles);
    if (score < MIN_SCORE) continue;
    const candidate = { ...item, score, seasonScore: bestScore(item.title, seasonTitles) };
    if (isDubbed(item.title, item.href)) dubbed.push(candidate);
    else subtitled.push(candidate);
  }

  return { dubbed: sortCandidates(dubbed), subtitled: sortCandidates(subtitled) };
}

/**
 * Termos de busca, na ordem do TMDB, sem repetição pelo texto normalizado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ season: number|null }} coordinates - Coordenadas do pedido.
 * @returns {string[]} Variantes não vazias.
 * @throws {Error} Se algum título esperado não for texto.
 */
function buildSearchTerms(media, coordinates) {
  const terms = [media.title, media.originalTitle].concat(media.alternativeTitles);
  for (const item of media.romajiTitles) terms.push(item.title);
  if (media.mediaType === 'tv' && coordinates.season !== null && coordinates.season > 1) {
    terms.push(`${media.title} ${coordinates.season}`);
    for (const item of media.romajiTitles) {
      if (item.season === coordinates.season) terms.push(item.title);
    }
  }
  return uniqueTexts(terms);
}

/**
 * Títulos usados na pontuação, incluindo romaji e o termo de temporada quando aplicável.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ season: number|null }} coordinates - Coordenadas do pedido.
 * @returns {string[]} Títulos não vazios.
 * @throws {Error} Se algum título esperado não for texto.
 */
function buildMediaTitles(media, coordinates) {
  return uniqueTexts(buildSearchTerms(media, coordinates));
}

/**
 * Remove textos vazios e repetidos pela normalização.
 * @param {string[]} values - Textos candidatos.
 * @returns {string[]} Textos aparados e únicos.
 * @throws {Error} Se algum valor não for texto.
 */
function uniqueTexts(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new Error(`título de busca inválido: ${String(value)} (esperado texto)`);
    }
    const trimmed = value.trim();
    const key = normalizeText(trimmed);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Lê e valida a resposta da busca.
 * @param {*} body - Corpo interpretado como JSON.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {SearchItem[]} Itens válidos.
 * @throws {Error} Se a resposta estiver fora do esquema.
 */
function readSearchItems(body, term) {
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    throw new Error(`Busca fora do esquema para "${term}": "items" ausente ou fora de array`);
  }
  return body.items.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new Error(`Busca fora do esquema para "${term}": items[${index}] não é objeto`);
    }
    const title = nonEmptyText(item.title);
    const href = nonEmptyText(item.href);
    if (title === null || href === null) {
      throw new Error(`Busca fora do esquema para "${term}": items[${index}] sem "title" ou "href"`);
    }
    return { title, href };
  });
}

/**
 * Extrai o slug de um `href` de obra.
 * @param {string} href - Caminho `/anime/<slug>`.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {string} Slug decodificado.
 * @throws {Error} Se o caminho de anime não tiver slug.
 */
function readSlug(href, term) {
  const path = href.split(/[?#]/)[0];
  const slug = path.slice(ANIME_PATH.length);
  if (slug === '') {
    throw new Error(`Busca fora do esquema para "${term}": "${href}" sem slug`);
  }
  try {
    return decodeURIComponent(slug);
  } catch (error) {
    throw new Error(`Busca fora do esquema para "${term}": slug inválido em "${href}"`, { cause: error });
  }
}

/**
 * Indica se o item pertence à página dublada.
 * @param {string} title - Título publicado.
 * @param {string} href - Caminho publicado.
 * @returns {boolean} True quando o título ou o slug contém `dublado`.
 */
function isDubbed(title, href) {
  return normalizeText(title).includes(DUBBED_MARKER) || normalizeText(href).includes(DUBBED_MARKER);
}

/**
 * Maior similaridade entre o título do item e os títulos do TMDB.
 * @param {string} title - Título do item.
 * @param {string[]} mediaTitles - Títulos do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 */
function bestScore(title, mediaTitles) {
  let best = 0;
  for (const mediaTitle of mediaTitles) {
    const score = titleSimilarity(title, mediaTitle);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Títulos específicos da temporada pedida, usados só como desempate.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ season: number|null }} coordinates - Coordenadas do pedido.
 * @returns {string[]} Termos de temporada; vazio em filme e na temporada 1.
 * @throws {Error} Se algum título esperado não for texto.
 */
function buildSeasonTitles(media, coordinates) {
  if (media.mediaType !== 'tv' || coordinates.season === null || coordinates.season <= 1) return [];
  const titles = [`${media.title} ${coordinates.season}`];
  for (const item of media.romajiTitles) {
    if (item.season === coordinates.season) titles.push(item.title);
  }
  return uniqueTexts(titles);
}

/**
 * Ordena candidatos do maior para o menor score, usando o título da temporada como desempate e a
 * ordem da busca quando ambos empatam.
 * @param {AudioCandidate[]} candidates - Candidatos já pontuados.
 * @returns {AudioCandidate[]} Novo array ordenado.
 */
function sortCandidates(candidates) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => b.candidate.score - a.candidate.score
      || b.candidate.seasonScore - a.candidate.seasonScore
      || a.index - b.index)
    .map((entry) => entry.candidate);
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Devolve o texto aparado ou `null` quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}
