/**
 * Comparação de títulos, temporada e ano do AniBunker.
 *
 * O site publica animes pelo título romaji e separa temporadas e arcos em páginas próprias. A
 * confirmação usa os títulos do TMDB (PT-BR, original, alternativos e romaji), o ano da página e um
 * marcador de temporada lido no título; sem marcador, a página é da temporada 1.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

const MIN_TITLE_SCORE = 0.85;
const MIN_BASE_SCORE = 0.9;
const YEAR_TOLERANCE = 1;
const MAX_NUMERIC_SEASON = 20;
const MAX_ROMAN_SEASON = 9;

const ROMAN_SEASONS = Object.freeze({
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
});

const EXPLICIT_SEASON_PATTERNS = [
  /\b(\d+)(?:st|nd|rd|th)\s+season\b/i,
  /\bseason\s+(\d+)\b/i,
  /\b(\d+)\s*ª?\s*temporada\b/i,
  /\btemporada\s+(\d+)\b/i,
];

/**
 * @typedef {object} MediaLike
 * @property {string} title - Título em português do Brasil.
 * @property {string} [originalTitle] - Título no idioma original.
 * @property {string[]} [alternativeTitles] - Títulos alternativos do Brasil.
 * @property {{ title: string, season: number|null }[]} [romajiTitles] - Títulos romaji do TMDB.
 * @property {{ number: number, name?: string, year?: number|null }[]} [seasons] - Temporadas do TMDB.
 * @property {number|null} [year] - Ano de lançamento.
 */

/**
 * Todos os títulos conhecidos do TMDB, sem repetição: principal, original, alternativos e romaji.
 *
 * @param {MediaLike} media - Dados do TMDB compatíveis com `MediaInfo` do bloco `tmdb-info`.
 * @returns {string[]} Títulos não vazios, na ordem de prioridade.
 * @throws {Error} Se faltar o título principal ou algum campo tiver tipo inválido.
 * @example
 * mediaTitles({ title: 'Your Name.', originalTitle: '君の名は。', romajiTitles: [{ title: 'Kimi no Na wa.', season: null }] });
 * // ['Your Name.', '君の名は。', 'Kimi no Na wa.']
 */
export function mediaTitles(media) {
  if (!media || typeof media !== 'object' || typeof media.title !== 'string' || media.title.trim() === '') {
    throw new Error('media inválido: esperado objeto com title não vazio');
  }
  const titles = [media.title];
  if (media.originalTitle !== undefined) titles.push(media.originalTitle);
  if (media.alternativeTitles !== undefined) {
    if (!Array.isArray(media.alternativeTitles)) throw new Error('media.alternativeTitles deve ser lista');
    titles.push(...media.alternativeTitles);
  }
  if (media.romajiTitles !== undefined) {
    if (!Array.isArray(media.romajiTitles)) throw new Error('media.romajiTitles deve ser lista');
    for (const item of media.romajiTitles) {
      if (!item || typeof item.title !== 'string') throw new Error('media.romajiTitles com item inválido');
      titles.push(item.title);
    }
  }
  return uniqueTitles(titles);
}

/**
 * Títulos-base usados nas consultas de busca.
 *
 * Em série com temporada maior que 1, os títulos romaji específicos da temporada ficam de fora: eles
 * entram antes, na prioridade de `buildQueries`. Para filme e temporada 1, todos os romaji entram.
 *
 * @param {MediaLike} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @returns {string[]} Títulos-base sem repetição.
 * @throws {Error} Se `media` estiver fora do contrato.
 * @example
 * baseTitles({ title: 'Jujutsu Kaisen', romajiTitles: [{ title: 'Jujutsu Kaisen', season: null }, { title: 'Jujutsu Kaisen 2', season: 2 }] }, 2);
 * // ['Jujutsu Kaisen']
 */
export function baseTitles(media, season) {
  const titles = [media.title];
  if (media.originalTitle !== undefined) titles.push(media.originalTitle);
  if (media.alternativeTitles !== undefined) {
    if (!Array.isArray(media.alternativeTitles)) throw new Error('media.alternativeTitles deve ser lista');
    titles.push(...media.alternativeTitles);
  }
  if (media.romajiTitles !== undefined) {
    if (!Array.isArray(media.romajiTitles)) throw new Error('media.romajiTitles deve ser lista');
    for (const item of media.romajiTitles) {
      if (!item || typeof item.title !== 'string') throw new Error('media.romajiTitles com item inválido');
      if (season === null || item.season === null || item.season === 1) titles.push(item.title);
    }
  }
  return uniqueTitles(titles);
}

/**
 * Lê uma temporada declarada por marcador explícito no título.
 *
 * Reconhece `2nd Season`, `Season 2`, `2ª Temporada` e `Temporada 2`. Sufixo numérico ou romano
 * isolado não conta aqui; ele só vale quando a base coincide com um título do TMDB, em
 * `readSeasonNumber`.
 *
 * @param {string} title - Título publicado pela fonte.
 * @returns {number|null} Temporada declarada ou `null` sem marcador.
 * @example
 * readExplicitSeason('Jujutsu Kaisen 2nd Season'); // 2
 * readExplicitSeason('Jujutsu Kaisen 2'); // null
 */
export function readExplicitSeason(title) {
  const text = typeof title === 'string' ? title.trim() : '';
  for (const pattern of EXPLICIT_SEASON_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) return Number(match[1]);
  }
  return null;
}

/**
 * Temporada declarada no título, com marcador explícito, sufixo numérico/romano ou temporada 1.
 *
 * O sufixo isolado só é aceito quando a base coincide com um título do TMDB, para que números do
 * próprio nome (por exemplo, `Mob Psycho 100`) não virem temporada. `Part N`/`Parte N` não é
 * temporada.
 *
 * @param {string} title - Título publicado pela fonte.
 * @param {MediaLike} media - Dados do TMDB.
 * @returns {number} Temporada declarada; 1 quando não há marcador.
 * @example
 * readSeasonNumber('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }); // 2
 * readSeasonNumber('Mob Psycho 100', { title: 'Mob Psycho 100' }); // 1
 */
export function readSeasonNumber(title, media) {
  const text = typeof title === 'string' ? title.trim() : '';
  const explicit = readExplicitSeason(text);
  if (explicit !== null) return explicit;

  const numeric = /^(.+?)\s+(\d{1,2})$/.exec(text);
  if (numeric !== null) {
    const season = Number(numeric[2]);
    if (season >= 2 && season <= MAX_NUMERIC_SEASON && isMediaBase(numeric[1], media)) return season;
  }

  const roman = /^(.+?)\s+([IVX]+)$/i.exec(text);
  if (roman !== null) {
    const season = ROMAN_SEASONS[roman[2].toUpperCase()];
    if (season !== undefined && season <= MAX_ROMAN_SEASON && isMediaBase(roman[1], media)) return season;
  }

  return 1;
}

/**
 * Indica se o candidato da busca pode representar a temporada pedida antes de abrir a página.
 *
 * O título sem marcador vale como temporada 1; o sufixo numérico/romano só conta quando a base
 * coincide com um título do TMDB. Um romaji específico da temporada também é aceito. Candidatos de
 * outra temporada são descartados antes da rede, mas a confirmação real continua na página.
 *
 * @param {string} title - Título do resultado da busca.
 * @param {MediaLike} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @returns {boolean} `true` quando o título pode representar a temporada pedida.
 * @throws {Error} Se `media` estiver fora do contrato.
 * @example
 * isSeasonCandidate('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }, 'tv', 2); // true
 * isSeasonCandidate('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }, 'tv', 1); // false
 */
export function isSeasonCandidate(title, media, mediaType, season) {
  if (mediaType !== 'tv' || !Number.isInteger(season)) return true;
  if (readSeasonNumber(title, media) === season) return true;
  return matchesSpecificRomaji(title, media, season);
}

/**
 * Ano esperado para o pedido: o da temporada do TMDB em série, o do filme em filme.
 *
 * Sem temporada cadastrada, a temporada 1 usa o ano de estreia da série e as demais não têm ano
 * esperado.
 *
 * @param {MediaLike} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @returns {number|null} Ano esperado ou `null` quando não há referência.
 * @example
 * expectedSeasonYear({ year: 2020, seasons: [{ number: 2, year: 2023 }] }, 'tv', 2); // 2023
 */
export function expectedSeasonYear(media, mediaType, season) {
  if (mediaType === 'movie') return Number.isInteger(media.year) ? media.year : null;
  if (Array.isArray(media.seasons)) {
    const found = media.seasons.find((item) => item.number === season);
    if (found && Number.isInteger(found.year)) return found.year;
  }
  return season === 1 && Number.isInteger(media.year) ? media.year : null;
}

/**
 * Confere o ano da página com o ano esperado, com tolerância de um ano.
 *
 * Sem ano na página ou sem ano esperado, não há reprovação por esse critério.
 *
 * @param {number} pageYear - Ano publicado na página.
 * @param {number|null} expectedYear - Ano esperado.
 * @returns {boolean}
 * @example
 * yearMatches(2020, 2021); // true
 * yearMatches(2010, 2021); // false
 */
export function yearMatches(pageYear, expectedYear) {
  if (!Number.isInteger(pageYear) || !Number.isInteger(expectedYear)) return true;
  return Math.abs(pageYear - expectedYear) <= YEAR_TOLERANCE;
}

/**
 * Compara o título da página com os títulos do TMDB e, quando houver, o termo da busca.
 *
 * @param {string} pageTitle - `h1` da página.
 * @param {MediaLike} media - Dados do TMDB.
 * @param {string|null} [query] - Termo que encontrou o candidato.
 * @returns {boolean} `true` quando algum título atinge a semelhança mínima.
 * @throws {Error} Se `pageTitle` ou `media` estiverem fora do contrato.
 * @example
 * titleMatches('Kimi no Na wa.', { title: 'Your Name.', romajiTitles: [{ title: 'Kimi no Na wa.', season: null }] }); // true
 */
export function titleMatches(pageTitle, media, query = null) {
  if (typeof pageTitle !== 'string' || pageTitle.trim() === '') {
    throw new Error('pageTitle inválido: esperado texto não vazio');
  }
  const titles = mediaTitles(media);
  if (typeof query === 'string' && query.trim() !== '') titles.push(query.trim());
  return titles.some((title) => titleSimilarity(pageTitle, title) >= MIN_TITLE_SCORE);
}

/**
 * Confere a temporada da página com a pedida.
 *
 * Um romaji específico da temporada no TMDB confirma sem marcador no título; nos demais casos vale
 * `readSeasonNumber`, que trata o título sem marcador como temporada 1.
 *
 * @param {string} pageTitle - `h1` da página.
 * @param {MediaLike} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {boolean}
 * @example
 * seasonMatches('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }, 2); // true
 */
export function seasonMatches(pageTitle, media, season) {
  if (!Number.isInteger(season) || season < 1) throw new Error(`season inválida: ${season}`);
  if (matchesSpecificRomaji(pageTitle, media, season)) return true;
  return readSeasonNumber(pageTitle, media) === season;
}

/**
 * Indica se o título coincide com um romaji específico da temporada no TMDB.
 * @param {string} title - Título publicado pela fonte.
 * @param {MediaLike} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {boolean}
 */
function matchesSpecificRomaji(title, media, season) {
  if (!Array.isArray(media.romajiTitles)) return false;
  return media.romajiTitles.some(
    (item) => item && item.season === season && typeof item.title === 'string' && titleSimilarity(title, item.title) >= MIN_BASE_SCORE,
  );
}

/**
 * Indica se a base de um sufixo coincide com algum título do TMDB.
 * @param {string} base - Título sem o sufixo.
 * @param {MediaLike} media - Dados do TMDB.
 * @returns {boolean}
 */
function isMediaBase(base, media) {
  const normalized = normalizeText(base);
  if (normalized === '') return false;
  return mediaTitles(media).some(
    (title) => normalizeText(title) === normalized || titleSimilarity(title, base) >= MIN_BASE_SCORE,
  );
}

/**
 * Remove títulos vazios e repetidos sem diferenciar maiúsculas.
 * @param {*[]} titles - Valores candidatos.
 * @returns {string[]}
 */
function uniqueTitles(titles) {
  const seen = new Set();
  const result = [];
  for (const item of titles) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (text === '') continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
