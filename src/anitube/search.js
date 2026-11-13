/**
 * Busca, limpeza de título e confirmação de identidade do AniTube.
 *
 * O site publica cartões `.aniItem` com título decorado e um rótulo `.aniCC` (`Dublado`,
 * `Legendado` ou `Filme`). A identidade só é aceita depois de comparar o título limpo, os aliases
 * entre parênteses, o tipo, a temporada e o ano da ficha.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { loadHtml, textOf } from './html.js';

const MIN_TITLE_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const MAX_NUMERIC_SEASON = 30;
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
  /\b(\d+)\s*ª\s*temporada\b/i,
  /\btemporada\s+(\d+)\b/i,
];

const EPISODES_DECORATION = /[\s–—-]*todos\s+(?:os\s+)?epis[oó]dios?\s*$/i;
const MOVIE_DECORATION = /[\s–—-]*filme(?:\s+dublado\s+e\s+legendado)?\s*$/i;
const AUDIO_PARENTHESIS = /\((?:dublado|legendado|filme)\)/gi;
const AUDIO_WORD = /\b(?:dublado|legendado)\b/gi;
const PARENTHESIS = /\(([^()]+)\)/g;
const PARENTHESIS_TEXT = /\([^()]*\)/g;

/**
 * @typedef {object} SearchQuery
 * @property {string} query - Texto enviado à busca.
 * @property {number|null} season - Temporada pretendida pela variante; `null` em filme.
 */

/**
 * @typedef {object} SearchCandidate
 * @property {string} url - Página do cartão.
 * @property {string} rawTitle - Título como publicado.
 * @property {string} title - Título sem decorações e sem parênteses.
 * @property {string[]} aliases - Conteúdo dos parênteses que não era rótulo de áudio.
 * @property {'movie'|'tv'} type - Tipo declarado pelo cartão.
 * @property {string|null} audio - `Dublado`, `Legendado` ou `null`.
 */

/**
 * Monta as variantes de busca em ordem de prioridade.
 *
 * Em série com temporada maior que 1, o título romaji específico da temporada vem primeiro. Depois
 * entram título PT-BR, original, alternativos brasileiros e romaji sem temporada (ou temporada 1),
 * seguidos das variantes com sufixo numérico, ordinal, `Season N`, `Nª Temporada`, `Temporada N` e
 * numeral romano.
 *
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo` do bloco `tmdb-info`.
 * @param {string} media.title - Título em português do Brasil.
 * @param {string} media.originalTitle - Título no idioma original.
 * @param {string[]} [media.alternativeTitles] - Títulos alternativos do Brasil.
 * @param {{ title: string, season: number|null }[]} [media.romajiTitles] - Títulos romaji/romanizados.
 * @param {{ number: number }[]} [media.seasons] - Temporadas conhecidas.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @returns {SearchQuery[]} Variantes sem repetição, na ordem de tentativa.
 * @throws {Error} Se `media` ou o pedido estiverem fora do contrato.
 * @example
 * buildQueries({ title: 'Jujutsu Kaisen', originalTitle: 'Jujutsu Kaisen', alternativeTitles: [] }, { mediaType: 'tv', season: 2 });
 * // [{ query: 'Jujutsu Kaisen', season: 1 }, { query: 'Jujutsu Kaisen 2', season: 2 }, ...]
 */
export function buildQueries(media, request) {
  readMedia(media);
  readRequest(request);
  const season = request.mediaType === 'tv' ? request.season : null;
  const queries = [];
  const seen = new Set();
  const add = (query, querySeason) => {
    const text = typeof query === 'string' ? query.trim() : '';
    if (text === '') return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ query: text, season: querySeason });
  };

  if (season !== null && season > 1) {
    for (const item of media.romajiTitles || []) {
      if (item.season === season) add(item.title, season);
    }
  }

  const bases = baseTitles(media, season);
  for (const title of bases) add(title, season === null ? null : 1);

  if (season !== null && season > 1) {
    for (const title of bases) {
      add(`${title} ${season}`, season);
      add(`${title} ${ordinal(season)} Season`, season);
      add(`${title} Season ${season}`, season);
      add(`${title} ${season}ª Temporada`, season);
      add(`${title} Temporada ${season}`, season);
      const roman = romanForSeason(season);
      if (roman !== null) add(`${title} ${roman}`, season);
    }
  }

  return queries;
}

/**
 * Limpa as decorações de um título de cartão e separa os aliases entre parênteses.
 *
 * Remove `– Todos os Episódios`, `- Todos Episódios`, `– Filme Dublado e Legendado`, `- Filme`,
 * `– Filme`, `(Dublado)`, `Dublado`, `(Legendado)` e `Legendado`, além de um `Filme` final sem
 * travessão, como em `A Viagem de Chihiro (Dublado) Filme`.
 *
 * @param {string} rawTitle - Título como publicado no cartão.
 * @returns {{ title: string, aliases: string[] }} Título limpo e aliases sem repetição.
 * @example
 * cleanCardTitle('Kimi no Na wa (Your Name) Dublado – Filme');
 * // { title: 'Kimi no Na wa', aliases: ['Your Name'] }
 */
export function cleanCardTitle(rawTitle) {
  let text = typeof rawTitle === 'string' ? rawTitle : '';
  text = text.replace(AUDIO_PARENTHESIS, ' ');
  text = text.replace(MOVIE_DECORATION, ' ');
  text = text.replace(EPISODES_DECORATION, ' ');
  text = text.replace(AUDIO_WORD, ' ');

  const aliases = [];
  for (const match of text.matchAll(PARENTHESIS)) {
    const alias = match[1].trim();
    if (alias !== '') aliases.push(alias);
  }

  return {
    title: text.replace(PARENTHESIS_TEXT, ' ').replace(/\s+/g, ' ').trim(),
    aliases: uniqueTitles(aliases),
  };
}

/**
 * Lê a temporada declarada no título limpo.
 *
 * Marcadores explícitos (`2nd Season`, `Season 2`, `2ª Temporada`, `Temporada 2`) vêm primeiro;
 * `Final Season` devolve o marcador final; sufixo numérico ou romano só vale quando o título sem o
 * sufixo coincide com um título do TMDB. `Part N`/`Parte N` não é temporada. Sem marcador, a
 * temporada é 1.
 *
 * @param {string} title - Título já limpo.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @returns {{ season: number|null, final: boolean }} Temporada declarada ou marcador final.
 * @example
 * readSeason('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen', originalTitle: 'Jujutsu Kaisen' });
 * // { season: 2, final: false }
 */
export function readSeason(title, media) {
  const text = typeof title === 'string' ? title.trim() : '';
  const explicit = readExplicitSeason(text);
  if (explicit !== null) return { season: explicit, final: false };
  if (/\bfinal\s+season\b/i.test(text)) return { season: null, final: true };
  if (/\bpart(?:e)?\s+\d+\s*$/i.test(text)) return { season: 1, final: false };

  const numeric = /\s+(\d+)\s*$/.exec(text);
  if (numeric !== null) {
    const season = Number(numeric[1]);
    const base = text.slice(0, numeric.index).trim();
    if (season >= 2 && season <= MAX_NUMERIC_SEASON && matchesMediaTitle(base, media)) {
      return { season, final: false };
    }
  }

  const roman = /\s+([IVX]+)\s*$/i.exec(text);
  if (roman !== null) {
    const season = ROMAN_SEASONS[roman[1].toUpperCase()];
    const base = text.slice(0, roman.index).trim();
    if (season !== undefined && season <= MAX_ROMAN_SEASON && matchesMediaTitle(base, media)) {
      return { season, final: false };
    }
  }

  return { season: 1, final: false };
}

/**
 * Confirma a identidade de um cartão contra a ficha da fonte.
 *
 * Exige tipo compatível, título (ou alias) semelhante ao TMDB, temporada compatível e ano da ficha
 * a no máximo um ano do ano da temporada ou do filme. Ano ausente na ficha não reprova sozinho.
 *
 * @param {SearchCandidate} candidate - Cartão limpo.
 * @param {{ h1: string, type: string, year: number|null, audio: string|null }} page - Dados da ficha.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @param {SearchQuery} query - Variante que encontrou o cartão.
 * @returns {{ audio: string|null }|null} Áudio confirmado ou `null` quando a ficha é descartada.
 * @example
 * confirmCandidate(candidate, page, media, { mediaType: 'tv', season: 2 }, { query: 'Jujutsu Kaisen 2', season: 2 });
 * // { audio: 'Dublado' }
 */
export function confirmCandidate(candidate, page, media, request, query) {
  if (!candidate || !page) return null;
  if (request.mediaType === 'tv' && candidate.type !== 'tv') return null;
  if (!titleMatches(candidate, media, request, query)) return null;
  if (request.mediaType === 'tv' && !seasonMatches(candidate, media, request, query)) return null;
  if (!yearMatches(page, media, request)) return null;
  if (!audioMatches(candidate, page)) return null;

  const pageAudio = readAudio(page.audio);
  return { audio: pageAudio === null ? candidate.audio : pageAudio };
}

/**
 * Indica se o título é um romaji específico da temporada pedida.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @param {string} title - Título limpo do cartão.
 * @param {number} season - Temporada pedida.
 * @returns {boolean}
 * @example
 * isSpecificRomaji({ romajiTitles: [{ title: 'Kimetsu no Yaiba: Mugen Ressha-hen', season: 2 }] }, 'Kimetsu no Yaiba: Mugen Ressha-hen', 2);
 * // true
 */
export function isSpecificRomaji(media, title, season) {
  const normalized = normalizeText(title);
  if (normalized === '') return false;
  return (media.romajiTitles || []).some(
    (item) => item.season === season && normalizeText(item.title) === normalized,
  );
}

/**
 * Maior temporada conhecida no TMDB.
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @returns {number|null} Maior número de temporada ou `null` quando não há lista.
 * @example
 * maxSeason({ seasons: [{ number: 1 }, { number: 4 }] }); // 4
 */
export function maxSeason(media) {
  let max = null;
  for (const item of media.seasons || []) {
    if (Number.isInteger(item.number) && (max === null || item.number > max)) max = item.number;
  }
  return max;
}

/**
 * Lê os cartões de uma página de busca.
 * @param {string} html - HTML da busca.
 * @param {string} baseUrl - URL da busca, para resolver links relativos.
 * @returns {SearchCandidate[]} Cartões na ordem da página.
 * @throws {Error} Se a busca não tiver o contêiner esperado ou um cartão não tiver endereço/título.
 */
export function parseSearchResults(html, baseUrl) {
  const $ = loadHtml(html);
  if ($('.searchPagContainer').length === 0) {
    throw new Error('Busca do AniTube sem .searchPagContainer');
  }

  const items = $('.aniItem');
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const anchor = item.find('a').eq(0);
    const href = anchor.attr('href');
    if (!href) throw new Error(`Cartão de busca ${index} sem endereço`);
    const rawTitle = anchor.attr('title') || textOf(item.find('.aniItemNome')) || textOf(anchor);
    if (!rawTitle) throw new Error(`Cartão de busca ${index} sem título`);

    const label = textOf(item.find('.aniCC'));
    const cleaned = cleanCardTitle(rawTitle);
    results.push({
      url: new URL(href, baseUrl).href,
      rawTitle,
      title: cleaned.title,
      aliases: cleaned.aliases,
      type: label === 'Filme' || MOVIE_DECORATION.test(rawTitle) ? 'movie' : 'tv',
      audio: readAudio(label),
    });
  }
  return results;
}

/**
 * Títulos-base da busca: PT-BR, original, alternativos brasileiros e romaji sem temporada (ou 1).
 * @param {object} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida; `null` em filme.
 * @returns {string[]}
 */
function baseTitles(media, season) {
  const titles = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) titles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) {
    if (season === null || item.season === null || item.season === 1) titles.push(item.title);
  }
  return uniqueTitles(titles);
}

/**
 * Todos os títulos do TMDB, sem repetição.
 * @param {object} media - Dados do TMDB.
 * @returns {string[]}
 */
function allMediaTitles(media) {
  const titles = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) titles.push(...media.alternativeTitles);
  for (const item of media.romajiTitles || []) titles.push(item.title);
  return uniqueTitles(titles);
}

/**
 * Compara o título do cartão e seus aliases com os títulos do TMDB e com a consulta.
 * @param {SearchCandidate} candidate - Cartão limpo.
 * @param {object} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @param {SearchQuery} query - Variante que encontrou o cartão.
 * @returns {boolean}
 */
function titleMatches(candidate, media, request, query) {
  const titles = allMediaTitles(media);
  if (query && query.season === request.season && typeof query.query === 'string') titles.push(query.query);
  const candidates = [candidate.title, ...candidate.aliases].filter((item) => typeof item === 'string' && item.trim() !== '');
  for (const item of candidates) {
    for (const title of titles) {
      if (titleSimilarity(item, title) >= MIN_TITLE_SCORE) return true;
    }
  }
  return false;
}

/**
 * Confere a temporada do cartão com a pedida, incluindo romaji específico e marcador final.
 * @param {SearchCandidate} candidate - Cartão limpo.
 * @param {object} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @param {SearchQuery} query - Variante que encontrou o cartão.
 * @returns {boolean}
 */
function seasonMatches(candidate, media, request, query) {
  const declared = readSeason(candidate.title, media);
  if (declared.final) {
    const max = maxSeason(media);
    return max !== null && max === request.season;
  }
  let season = declared.season;
  if (season === 1 && query && query.season === request.season && isSpecificRomaji(media, candidate.title, request.season)) {
    season = request.season;
  }
  return season === request.season;
}

/**
 * Confere o ano da ficha com o ano da temporada (série) ou do filme.
 * @param {{ year: number|null }} page - Dados da ficha.
 * @param {object} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @returns {boolean}
 */
function yearMatches(page, media, request) {
  if (!Number.isInteger(page.year)) return true;
  const expected = expectedYear(media, request);
  if (!Number.isInteger(expected)) return true;
  return Math.abs(page.year - expected) <= YEAR_TOLERANCE;
}

/**
 * Ano esperado para o pedido: temporada da série ou filme.
 * @param {object} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido do app.
 * @returns {number|null}
 */
function expectedYear(media, request) {
  if (request.mediaType === 'movie') return media.year;
  const season = (media.seasons || []).find((item) => item.number === request.season);
  if (season && Number.isInteger(season.year)) return season.year;
  // Temporada não listada no TMDB: o ano de estreia da série não representa a temporada pedida.
  return request.season === 1 ? media.year : null;
}

/**
 * Confere se o rótulo de áudio do cartão e o da ficha são consistentes.
 * @param {SearchCandidate} candidate - Cartão limpo.
 * @param {{ audio: string|null }} page - Dados da ficha.
 * @returns {boolean}
 */
function audioMatches(candidate, page) {
  const pageAudio = readAudio(page.audio);
  return candidate.audio === null || pageAudio === null || candidate.audio === pageAudio;
}

/**
 * Normaliza o rótulo de áudio da fonte.
 * @param {*} value - Texto do rótulo.
 * @returns {string|null} `Dublado`, `Legendado` ou `null`.
 */
function readAudio(value) {
  const text = typeof value === 'string' ? value : '';
  if (/\bdublado\b/i.test(text)) return 'Dublado';
  if (/\blegendado\b/i.test(text)) return 'Legendado';
  return null;
}

/**
 * Lê uma temporada declarada por marcador explícito.
 * @param {string} text - Título limpo.
 * @returns {number|null}
 */
function readExplicitSeason(text) {
  for (const pattern of EXPLICIT_SEASON_PATTERNS) {
    const match = pattern.exec(text);
    if (match !== null) return Number(match[1]);
  }
  return null;
}

/**
 * Indica se o título-base coincide com algum título do TMDB.
 * @param {string} base - Título sem o sufixo de temporada.
 * @param {object} media - Dados do TMDB.
 * @returns {boolean}
 */
function matchesMediaTitle(base, media) {
  const normalized = normalizeText(base);
  if (normalized === '') return false;
  return allMediaTitles(media).some((title) => normalizeText(title) === normalized);
}

/**
 * Ordinal em inglês, como o site publica em `2nd Season`.
 * @param {number} number - Número inteiro positivo.
 * @returns {string}
 */
function ordinal(number) {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const value = number % 100;
  return `${number}${suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]}`;
}

/**
 * Numeral romano aceito para temporada.
 * @param {number} season - Temporada.
 * @returns {string|null}
 */
function romanForSeason(season) {
  for (const [roman, value] of Object.entries(ROMAN_SEASONS)) {
    if (value === season) return roman;
  }
  return null;
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

/**
 * Valida o objeto de mídia usado na busca.
 * @param {*} media - Dados do TMDB.
 * @returns {void}
 * @throws {Error} Se faltar o título principal.
 */
function readMedia(media) {
  if (!media || typeof media !== 'object' || typeof media.title !== 'string' || media.title.trim() === '') {
    throw new Error('media inválido: esperado objeto com title não vazio');
  }
}

/**
 * Valida o pedido usado na busca.
 * @param {*} request - Pedido do app.
 * @returns {void}
 * @throws {Error} Se o tipo for inválido ou a série vier sem temporada válida.
 */
function readRequest(request) {
  if (!request || (request.mediaType !== 'movie' && request.mediaType !== 'tv')) {
    throw new Error('request inválido: esperado mediaType "movie" ou "tv"');
  }
  if (request.mediaType === 'tv' && (!Number.isInteger(request.season) || request.season < 1)) {
    throw new Error(`Série sem temporada válida: ${request.season}`);
  }
}
