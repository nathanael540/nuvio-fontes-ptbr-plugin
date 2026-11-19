/**
 * Identidade, temporada e episódio do catálogo Donghua No Sekai.
 *
 * A fonte usa fichas por temporada (`Doupo Cangqiong – 2ª Temporada`) e fichas únicas com
 * numeração contínua (`Swallowed Star` 1..248). A confirmação compara o `h1` e os títulos
 * alternativos com os títulos do TMDB, aceitando um ano de diferença. Títulos chineses são
 * comparados por igualdade bruta porque o `normalizeText` do repositório remove os ideogramas.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

const MIN_TITLE_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const MAX_SEARCH_TERMS = 4;
const HAN = /[\u3400-\u9fff]/;

/**
 * @typedef {object} Request
 * @property {string} tmdbId - ID do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo do pedido.
 * @property {number|null} season - Temporada em série.
 * @property {number|null} episode - Episódio em série.
 */

/**
 * @typedef {object} Confirmation
 * @property {'confirmed'|'skip'} status - Resultado da confirmação.
 * @property {number} score - Similaridade usada na decisão.
 * @property {number|null} season - Temporada lida do `h1`; `null` sem marcador.
 */

/**
 * Monta os termos de busca a partir do TMDB.
 *
 * A ordem privilegia a forma limpa do título principal e a forma curta do original chinês,
 * porque títulos entre parênteses/colchetes devolvem zero e originais longos devolvem resultados
 * irrelevantes. O total fica limitado a quatro termos.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos distintos, na ordem de consulta.
 * @throws {Error} Se `media` não tiver `title` string.
 * @example
 * buildSearchTerms({ title: 'Doupo Cangqiong', originalTitle: '斗破苍穹' });
 * // ['Doupo Cangqiong', '斗破苍穹']
 */
export function buildSearchTerms(media) {
  if (typeof media !== 'object' || media === null || typeof media.title !== 'string') {
    throw new Error('Mídia inválida: esperado objeto com title string');
  }

  const terms = [];
  const add = (value) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text === '') return;
    if (terms.some((term) => term.toLowerCase() === text.toLowerCase())) return;
    terms.push(text);
  };

  add(cleanTitle(media.title));
  add(chineseShort(media.originalTitle));
  add(media.originalTitle);
  const fallback = (media.alternativeTitles || [])[0] || (media.romajiTitles || [])[0];
  if (typeof fallback === 'string') add(cleanTitle(fallback));
  else if (fallback && typeof fallback.title === 'string') add(cleanTitle(fallback.title));

  return terms.slice(0, MAX_SEARCH_TERMS);
}

/**
 * Confirma uma ficha contra o pedido e o TMDB.
 *
 * @param {import('./site.js').DetailPage} page - Ficha lida.
 * @param {Request} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Confirmation} Confirmação com a temporada lida.
 * @throws {Error} Se `page` não tiver título.
 */
export function confirmPage(page, request, media) {
  if (typeof page.title !== 'string' || page.title.trim() === '') {
    throw new Error('Ficha sem título');
  }

  const score = bestTitleScore(pageTitleCandidates(page), mediaTitleCandidates(media));
  if (score < MIN_TITLE_SCORE) return { status: 'skip', score, season: null };
  if (isSpecial(page.title)) return { status: 'skip', score, season: null };

  const pageType = String(page.type || '').trim().toLowerCase();
  if (request.mediaType === 'movie' && pageType !== '' && pageType !== 'movie') {
    return { status: 'skip', score, season: null };
  }
  if (request.mediaType === 'tv' && pageType === 'movie') {
    return { status: 'skip', score, season: null };
  }

  const mediaYear = request.mediaType === 'movie' ? media.year : seasonYear(media, request.season);
  if (page.year !== null && mediaYear !== null && Math.abs(page.year - mediaYear) > YEAR_TOLERANCE) {
    return { status: 'skip', score, season: null };
  }

  const season = seasonFromTitle(page.title);
  if (request.mediaType === 'tv') {
    if (season.multi) return { status: 'skip', score, season: season.number };
    if (season.number !== null) {
      if (season.number !== request.season) return { status: 'skip', score, season: season.number };
    } else if (!basePageSeasonMatches(media, request)) {
      return { status: 'skip', score, season: null };
    }
  }

  return { status: 'confirmed', score, season: season.number };
}

/**
 * Procura o episódio exato na lista da ficha, ignorando faixas e links removidos.
 *
 * @param {import('./site.js').DetailPage} page - Ficha confirmada.
 * @param {number} episode - Número pedido.
 * @returns {import('./site.js').EpisodeLink|null} Item do episódio ou `null`.
 */
export function findEpisode(page, episode) {
  const items = page.episodes || [];
  for (const item of items) {
    if (item.range) continue;
    if (item.number !== episode) continue;
    if (/__trashed/i.test(item.url)) continue;
    return item;
  }
  return null;
}

/**
 * Lê o marcador de temporada de um título.
 *
 * @param {string} value - Título da ficha.
 * @returns {{ number: number|null, multi: boolean }} Temporada encontrada e marca de faixa.
 * @example
 * seasonFromTitle('Doupo Cangqiong – 2ª Temporada'); // { number: 2, multi: false }
 */
export function seasonFromTitle(value) {
  const text = String(value || '');
  const multi = /\d{1,2}\s*[ªº°]?\s*e\s*\d{1,2}\s*(?:temporada|temp)\b/i.test(text);
  const patterns = [
    /(\d{1,2})\s*[ªº°]?\s*(?:temporada|temp)\b(?:\s*final)?/i,
    /(?:temporada|temp)\s*(\d{1,2})\b/i,
    /season\s*(\d{1,2})\b/i,
    /(\d{1,2})(?:st|nd|rd|th)\s+season\b/i,
    /第\s*(\d{1,2})\s*季/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match !== null) return { number: Number(match[1]), multi };
  }
  return { number: null, multi };
}

/**
 * Remove marcadores de temporada, sufixos de filme e versão para comparar títulos.
 *
 * @param {string} value - Título original.
 * @returns {string} Título limpo.
 * @example
 * cleanTitle('Doupo Cangqiong – 2ª Temporada'); // 'Doupo Cangqiong'
 */
export function cleanTitle(value) {
  let text = String(value || '').trim();
  text = text.replace(/\s*[-–—]\s*\d{1,2}\s*[ªº°]?\s*(?:temporada|temp)\b(?:\s*final)?/gi, '');
  text = text.replace(/\s*[-–—]\s*(?:temporada|temp)\s*\d{1,2}\b/gi, '');
  text = text.replace(/\s*[-–—]\s*season\s*\d{1,2}\b/gi, '');
  text = text.replace(/\s*\(\s*\d{1,2}\s*[ªº°]?\s*e\s*\d{1,2}\s*(?:temporada|temp)\s*\)/gi, '');
  text = text.replace(/\s*\(?\s*\d{1,2}\s*[ªº°]?\s*(?:temporada|temp)\b(?:\s*final)?\s*\)?/gi, '');
  text = text.replace(/\s*\(?\s*(?:temporada|temp)\s*\d{1,2}\s*\)?/gi, '');
  text = text.replace(/\s*\(?\s*season\s*\d{1,2}\s*\)?/gi, '');
  text = text.replace(/\s*\(?\s*\d{1,2}(?:st|nd|rd|th)\s+season\s*\)?/gi, '');
  text = text.replace(/\s*\(\s*v\d+\s*\)/gi, ' ');
  text = text.replace(/\s*[-–—]\s*o\s+filme\b/gi, '');
  text = text.replace(/\s*\(\s*filme\s*\)/gi, '');
  text = text.replace(/\s*\bfilme\b/gi, '');
  text = text.replace(/\s*\bthe movie\b/gi, '');
  text = text.replace(/\s*\bmovie\b/gi, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '');
}

/**
 * Similaridade entre dois títulos, com tratamento separado para títulos chineses.
 *
 * @param {string} a - Primeiro título.
 * @param {string} b - Segundo título.
 * @returns {number} Similaridade entre 0 e 1.
 */
export function titleScore(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0;
  const left = a.trim();
  const right = b.trim();
  if (left === '' || right === '') return 0;
  if (left.toLowerCase() === right.toLowerCase()) return 1;

  const plainLeft = stripPunctuation(left);
  const plainRight = stripPunctuation(right);
  if (plainLeft !== '' && plainLeft === plainRight) return 1;
  if (HAN.test(left) && HAN.test(right) && (plainLeft.includes(plainRight) || plainRight.includes(plainLeft))) {
    return Math.min(plainLeft.length, plainRight.length) >= 2 ? 0.95 : 0;
  }

  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (normalizedLeft === '' || normalizedRight === '') return 0;
  if (normalizedLeft === normalizedRight) return 1;
  return titleSimilarity(left, right);
}

/**
 * Maior similaridade entre duas listas de títulos.
 *
 * @param {string[]} siteTitles - Títulos publicados pela ficha.
 * @param {string[]} mediaTitles - Títulos do TMDB.
 * @returns {number} Maior similaridade.
 */
function bestTitleScore(siteTitles, mediaTitles) {
  let best = 0;
  for (const siteTitle of siteTitles) {
    for (const mediaTitle of mediaTitles) {
      best = Math.max(best, titleScore(siteTitle, mediaTitle));
      const cleanSite = cleanTitle(siteTitle);
      const cleanMedia = cleanTitle(mediaTitle);
      if (cleanSite !== '' && cleanMedia !== '') {
        best = Math.max(best, titleScore(cleanSite, cleanMedia));
      }
    }
  }
  return best;
}

/**
 * Títulos da ficha: `h1` e alternativos publicados.
 *
 * @param {import('./site.js').DetailPage} page - Ficha.
 * @returns {string[]} Títulos.
 */
function pageTitleCandidates(page) {
  return [page.title].concat(page.alternativeTitles || []);
}

/**
 * Títulos do TMDB, incluindo formas sem parênteses/colchetes.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos.
 */
function mediaTitleCandidates(media) {
  const titles = [];
  const add = (value) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text === '' || titles.includes(text)) return;
    titles.push(text);
  };

  add(media.title);
  add(media.originalTitle);
  for (const value of media.alternativeTitles || []) add(value);
  for (const value of media.romajiTitles || []) add(value.title);

  for (const value of [...titles]) {
    const cut = firstBracketIndex(value);
    if (cut > 0) add(value.slice(0, cut).trim());
    const withoutBrackets = value.replace(/\s*(?:\[[^\]]*\]|\([^)]*\))\s*/g, ' ').trim();
    if (withoutBrackets !== '') add(withoutBrackets);
  }

  return titles;
}

/**
 * Índice do primeiro `[` ou `(` do título.
 *
 * @param {string} value - Título.
 * @returns {number} Índice ou `-1`.
 */
function firstBracketIndex(value) {
  const square = value.indexOf('[');
  const round = value.indexOf('(');
  if (square === -1) return round;
  if (round === -1) return square;
  return Math.min(square, round);
}

/**
 * Forma curta de um título chinês, cortando pontuação e o separador `之`.
 *
 * @param {string} value - Título original.
 * @returns {string} Forma curta ou o próprio título.
 * @example
 * chineseShort('白蛇：缘起'); // '白蛇'
 */
function chineseShort(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text === '') return '';
  const segments = text.split(/[：:，,（(【[\s]+/).filter((part) => part !== '');
  let candidate = segments[0] || text;
  if (candidate.length > 4) {
    const separator = candidate.indexOf('之');
    if (separator >= 2) candidate = candidate.slice(0, separator);
  }
  return candidate;
}

/**
 * Verifica se a ficha sem marcador corresponde à temporada pedida.
 *
 * Só a temporada 1 é aceita: com uma única temporada regular, pelo número dela; com várias, pela
 * contagem de episódios da temporada 1. Nunca há mapeamento por posição ou numeração absoluta.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {Request} request - Pedido de série.
 * @returns {boolean} True quando a ficha única pode atender ao pedido.
 */
function basePageSeasonMatches(media, request) {
  const regular = (media.seasons || []).filter((season) => season.number > 0);
  if (regular.length === 0) return false;
  if (regular.length === 1) return request.season === regular[0].number;
  if (request.season !== 1) return false;
  const first = regular.find((season) => season.number === 1);
  if (first === undefined) return false;
  return request.episode <= first.episodeCount;
}

/**
 * Ano de uma temporada no TMDB, com o ano da série como reserva.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {number|null} Ano ou `null`.
 */
function seasonYear(media, season) {
  const info = (media.seasons || []).find((item) => item.number === season);
  if (info && Number.isInteger(info.year)) return info.year;
  return media.year;
}

/**
 * Reconhece títulos de especiais e OVAs, que não entram em temporada regular.
 *
 * @param {string} value - Título da ficha.
 * @returns {boolean} True quando é especial.
 */
function isSpecial(value) {
  return /especial|special|\bova\b/i.test(String(value || ''));
}

/**
 * Remove pontuação e espaços de um título, preservando ideogramas.
 *
 * @param {string} value - Título.
 * @returns {string} Texto comparável.
 */
function stripPunctuation(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\s.,:;!?'"()[\]{}<>/\\|_\-–—]+/g, '')
    .trim();
}
