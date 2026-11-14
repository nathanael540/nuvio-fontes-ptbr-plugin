/**
 * Busca do AniBunker.
 *
 * A busca é `POST /php/search.php` com formulário `query` e responde JSON mesmo com
 * `Content-Type: text/html`; cada item traz `name` e `url`, sendo `url` o slug da página
 * `/anime/<slug>`. A resposta não traz ano nem tipo, então a identidade só é confirmada na página.
 */

import { fetchJson } from '../_blocks/http/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { SEARCH_URL, SOURCE_URL } from './site.js';
import { baseTitles } from './titles.js';

const MIN_SEARCH_SCORE = 0.6;
const MAX_QUERIES = 10;
const ANIBUNKER_HOSTS = new Set(['anibunker.com', 'www.anibunker.com']);

/**
 * @typedef {object} SearchQuery
 * @property {string} query - Texto enviado à busca.
 * @property {number|null} season - Temporada que a variante pretende representar; `null` em filme.
 */

/**
 * @typedef {object} SearchCandidate
 * @property {string} title - Nome publicado pela busca.
 * @property {string} url - Página absoluta em `/anime/<slug>`.
 */

/**
 * Monta as variantes de busca em ordem de prioridade.
 *
 * Em série com temporada maior que 1, o romaji específico da temporada vem primeiro; depois as
 * variantes com o número ou o nome da temporada do TMDB e, por último, os títulos-base. Filme e
 * temporada 1 usam somente os títulos-base. A lista é sem repetição e limitada a dez consultas.
 *
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo` do bloco `tmdb-info`.
 * @param {string} media.title - Título em português do Brasil.
 * @param {string} [media.originalTitle] - Título no idioma original.
 * @param {string[]} [media.alternativeTitles] - Títulos alternativos do Brasil.
 * @param {{ title: string, season: number|null }[]} [media.romajiTitles] - Títulos romaji do TMDB.
 * @param {{ number: number, name?: string }[]} [media.seasons] - Temporadas do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @returns {SearchQuery[]} Variantes sem repetição, na ordem de tentativa.
 * @throws {Error} Se `media` ou o pedido estiverem fora do contrato.
 * @example
 * buildQueries({ title: 'Jujutsu Kaisen', originalTitle: 'Jujutsu Kaisen', romajiTitles: [] }, 'tv', 2);
 * // [{ query: 'Jujutsu Kaisen 2', season: 2 }, { query: 'Jujutsu Kaisen Temporada 2', season: 2 }, ..., { query: 'Jujutsu Kaisen', season: 1 }]
 */
export function buildQueries(media, mediaType, season) {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`mediaType inválido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === 'tv' && (!Number.isInteger(season) || season < 1)) {
    throw new Error(`Série sem temporada válida: ${season}`);
  }

  const queries = [];
  const seen = new Set();
  const add = (query, querySeason) => {
    if (queries.length >= MAX_QUERIES) return;
    const text = typeof query === 'string' ? query.trim() : '';
    if (text === '') return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ query: text, season: querySeason });
  };

  const requestedSeason = mediaType === 'tv' ? season : null;
  if (requestedSeason !== null && requestedSeason > 1) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === requestedSeason) add(item.title, requestedSeason);
    }
  }

  const bases = baseTitles(media, requestedSeason);
  if (requestedSeason !== null && requestedSeason > 1) {
    const seasonName = readSeasonName(media, requestedSeason);
    for (const base of bases) {
      add(`${base} ${requestedSeason}`, requestedSeason);
      if (seasonName !== null) add(`${base} ${seasonName}`, requestedSeason);
      add(`${base} Temporada ${requestedSeason}`, requestedSeason);
      add(`${base} ${requestedSeason}ª Temporada`, requestedSeason);
    }
  }

  for (const base of bases) add(base, requestedSeason === null ? null : 1);

  return queries;
}

/**
 * Lê o corpo da busca e devolve os candidatos.
 *
 * Lista vazia é ausência válida. Item sem `name`/`url` ou resposta fora de lista é erro de
 * estrutura, não ausência. `url` é o slug publicado; uma URL absoluta só é aceita no domínio do
 * AniBunker.
 *
 * @param {*} data - Corpo JSON da busca.
 * @returns {SearchCandidate[]} Candidatos na ordem da fonte.
 * @throws {Error} Se a resposta não for lista ou algum item estiver fora do esquema.
 * @example
 * parseSearchResults([{ name: 'Kimi no Na wa.', url: 'kimi-no-na-wa' }]);
 * // [{ title: 'Kimi no Na wa.', url: 'https://anibunker.com/anime/kimi-no-na-wa' }]
 */
export function parseSearchResults(data) {
  if (!Array.isArray(data)) {
    throw new Error(`Busca do AniBunker fora do esquema: esperada lista (recebido: ${typeof data})`);
  }
  return data.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Busca do AniBunker fora do esquema: item ${index} não é objeto`);
    }
    const title = typeof item.name === 'string' ? item.name.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (title === '' || url === '') {
      throw new Error(`Busca do AniBunker fora do esquema: item ${index} sem name/url`);
    }
    return { title, url: pageUrl(url) };
  });
}

/**
 * Consulta a busca pública com um termo.
 *
 * @param {string} query - Termo enviado no formulário `query`.
 * @returns {Promise<SearchCandidate[]>} Candidatos na ordem da fonte.
 * @throws {Error} Se o termo for vazio, a resposta não for 2xx, o corpo não for JSON válido ou a
 *   lista estiver fora do esquema.
 * @example
 * const candidates = await searchCandidates('Kimi no Na wa');
 * // [{ title: 'Kimi no Na wa.', url: 'https://anibunker.com/anime/kimi-no-na-wa' }]
 */
export async function searchCandidates(query) {
  const text = typeof query === 'string' ? query.trim() : '';
  if (text === '') throw new Error('Termo de busca vazio');
  const data = await fetchJson(SEARCH_URL, { method: 'POST', profile: 'api', form: { query: text } });
  return parseSearchResults(data);
}

/**
 * Escolhe o candidato mais próximo dos títulos do TMDB.
 *
 * A busca não traz ano, então a escolha só ordena: o candidato devolvido ainda precisa ser
 * confirmado na página. `null` significa que nenhum resultado atinge a semelhança mínima.
 *
 * @param {SearchCandidate[]} candidates - Candidatos de uma consulta.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @returns {SearchCandidate|null} Melhor candidato ou `null`.
 * @throws {Error} Se `candidates` ou `media` estiverem fora do contrato.
 * @example
 * selectCandidate([{ title: 'Jujutsu Kaisen', url: 'https://anibunker.com/anime/jujutsu-kaisen' }], { title: 'Jujutsu Kaisen' });
 * // { title: 'Jujutsu Kaisen', url: 'https://anibunker.com/anime/jujutsu-kaisen' }
 */
export function selectCandidate(candidates, media) {
  if (!Array.isArray(candidates)) throw new Error('candidates deve ser lista');
  if (!media || typeof media !== 'object' || typeof media.title !== 'string') {
    throw new Error('media inválido: esperado objeto com title');
  }
  const alternativeTitles = [];
  if (Array.isArray(media.alternativeTitles)) alternativeTitles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) {
    if (item && typeof item.title === 'string') alternativeTitles.push(item.title);
  }
  const match = findBestMatch(
    candidates.map((candidate) => ({ title: candidate.title, url: candidate.url })),
    { title: media.title, originalTitle: media.originalTitle, alternativeTitles },
    { minScore: MIN_SEARCH_SCORE },
  );
  return match === null ? null : match.candidate;
}

/**
 * Lê o nome da temporada no TMDB.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {string|null}
 */
function readSeasonName(media, season) {
  if (!Array.isArray(media.seasons)) return null;
  const found = media.seasons.find((item) => item && item.number === season);
  const name = found && typeof found.name === 'string' ? found.name.trim() : '';
  return name === '' ? null : name;
}

/**
 * Converte o `url` da busca em página absoluta do catálogo.
 * @param {string} value - Slug ou URL publicada.
 * @returns {string}
 * @throws {Error} Se o valor estiver vazio ou apontar para outro domínio.
 */
function pageUrl(value) {
  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      throw new Error(`Resultado de busca com URL inválida: "${value}"`, { cause: error });
    }
    if (!ANIBUNKER_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(`Resultado de busca fora do AniBunker: "${parsed.hostname}"`);
    }
    if (!parsed.pathname.startsWith('/anime/')) {
      throw new Error(`Resultado de busca fora de /anime/: "${parsed.pathname}"`);
    }
    return `${SOURCE_URL}${parsed.pathname}`;
  }
  const slug = value.replace(/^\/+|\/+$/g, '');
  if (slug === '') throw new Error('Resultado de busca com url vazia');
  return `${SOURCE_URL}/anime/${slug}`;
}
