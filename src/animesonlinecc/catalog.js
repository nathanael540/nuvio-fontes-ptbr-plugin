/**
 * Busca e confirmação de identidade no AnimesOnlineCC.
 *
 * A fonte não aceita o ID do TMDB. A busca é `GET /?s=<termo>` e devolve cartões `article.item` com
 * o título em `div.data h3 a`; a página não publica o ano no cartão. Como a busca pode devolver
 * resultado alheio ao termo, a identidade só é aceita depois de comparar o `h1` limpo da ficha
 * `/anime/<slug>/` e o ano de `span.date`, com tolerância de um ano.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { findBestMatch, titleSimilarity } from '../_blocks/title-match/index.mjs';
import { SITE_URL, buildSearchUrl, loadHtml, textOf } from './site.js';

const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const MAX_CANDIDATES = 4;
const FOUR_DIGIT_YEAR = /^\d{4}$/;
const ANIME_HREF = '/anime/';
const TITLE_SUFFIXES = [
  /[\s\-–—|:]+todos\s+(?:os\s+)?epis[oó]dios?(?:\s+online)?\s*$/i,
  /[\s\-–—|:]+anime\s+completo\s*$/i,
  /[\s\-–—|:]+dublado\s+e\s+legendado\s*$/i,
  /[\s\-–—|:]+(?:dublado|legendado)\s*$/i,
  /[\s\-–—|:]+(?:cl[aá]ssico|classic)\s*$/i,
  /[\s\-–—|:]+online\s*$/i,
];

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} Candidate
 * @property {string} url - Página do cartão em `/anime/<slug>/`.
 * @property {string} title - Título publicado no cartão.
 * @property {number|null} year - Ano do cartão, quando a fonte publica; hoje é sempre `null`.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {string} slug - Slug da ficha confirmada.
 * @property {string} url - URL final da ficha.
 * @property {string} title - `h1` limpo dos sufixos de catálogo.
 * @property {number} year - Ano publicado em `span.date`.
 * @property {string} html - HTML da ficha, reaproveitado na seleção do episódio.
 */

/**
 * Localiza a obra no catálogo consultando todas as variantes de título do TMDB.
 *
 * As variantes são o título PT-BR, o original, os alternativos brasileiros e os romaji/romanizados,
 * deduplicadas por `normalizeText`. Os cartões são acumulados por URL, ordenados por similaridade de
 * título e no máximo quatro fichas são abertas. A confirmação compara o `h1` limpo e o ano.
 *
 * @param {MediaInfo} media - Dados do TMDB já obtidos por `getMediaInfo`.
 * @returns {Promise<ConfirmedCandidate|null>} Ficha confirmada ou `null` na ausência reconhecida.
 * @throws {Error} Se uma busca ou ficha responder fora de 2xx, se a busca não tiver cartões nem o
 *   marcador de nenhum resultado, ou se uma ficha 200 não publicar `h1` ou `span.date`.
 * @example
 * const media = await getMediaInfo({ tmdbId: '31910', mediaType: 'tv' });
 * const candidate = await findCandidate(media);
 * // { slug: 'naruto-shippuden', url: '...', title: 'Naruto Shippuden', year: 2007, html: '...' }
 */
export async function findCandidate(media) {
  const matchingMedia = buildMatchingMedia(media);
  const candidates = new Map();

  for (const term of buildSearchTerms(media)) {
    const search = await fetchPage(buildSearchUrl(term), { profile: 'page' });
    for (const candidate of parseSearchResults(search.text, term)) {
      if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
    }
  }

  const ranked = [...candidates.values()]
    .map((candidate) => ({ candidate, score: bestTitleScore(candidate.title, matchingMedia) }))
    .sort((a, b) => b.score - a.score);

  for (const item of ranked.slice(0, MAX_CANDIDATES)) {
    const confirmed = await confirmCandidate(item.candidate, matchingMedia);
    if (confirmed !== null) return confirmed;
  }
  return null;
}

/**
 * Variantes de busca, na ordem do TMDB e sem repetição pelo texto normalizado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Variantes não vazias.
 * @throws {Error} Se algum título esperado não for texto.
 * @example
 * buildSearchTerms({ title: 'Naruto Shippuden', originalTitle: 'NARUTO', alternativeTitles: [], romajiTitles: [] });
 * // ['Naruto Shippuden', 'NARUTO']
 */
export function buildSearchTerms(media) {
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
 * Maior similaridade entre um título da fonte e os títulos do TMDB.
 * @param {string} title - Título publicado no cartão.
 * @param {{ title: string, originalTitle: string, alternativeTitles: string[] }} media - Títulos do TMDB.
 * @returns {number} Score entre 0 e 1.
 */
function bestTitleScore(title, media) {
  const titles = [media.title, media.originalTitle].concat(media.alternativeTitles);
  return Math.max(...titles.map((value) => titleSimilarity(title, value)));
}

/**
 * Lê os cartões da página de busca.
 *
 * O contêiner observado é `article.item` com o título em `div.data h3 a`; os seletores antigos
 * `div.search-page article`, `div.result-item`, `.title a` e `h2 a` continuam aceitos. A ausência é
 * reconhecida pelo marcador `div.no-result`; sem cartões e sem o marcador, é erro de estrutura.
 *
 * @param {string} html - HTML da página de busca.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {Candidate[]} Cartões com link `/anime/`, na ordem da página.
 * @throws {Error} Se a busca não tiver cartões nem o marcador de nenhum resultado, ou se um cartão
 *   de anime não tiver endereço ou título.
 * @example
 * parseSearchResults('<article class="item"><div class="data"><h3><a href="/anime/naruto/">Naruto</a></h3></div></article>', 'Naruto');
 * // [{ url: 'https://animesonlinecc.to/anime/naruto/', title: 'Naruto', year: null }]
 */
export function parseSearchResults(html, term) {
  const $ = loadHtml(html);
  const cards = $('article.item');
  const legacy = $('div.search-page article');
  const items = cards.length > 0 ? cards : legacy.length > 0 ? legacy : $('div.result-item');
  if (items.length === 0) {
    if ($('div.no-result').length > 0) return [];
    throw new Error(`Busca de "${term}" sem cartões e sem o marcador de nenhum resultado`);
  }

  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const anchor = firstAnimeAnchor(item);
    if (anchor === null) continue;
    const href = anchor.attr('href');
    const title = textOf(anchor);
    if (!href || title === '') {
      throw new Error(`Cartão de busca ${index} de "${term}" sem endereço ou título`);
    }
    results.push({ url: new URL(href, SITE_URL).href, title, year: readCardYear(item) });
  }
  return results;
}

/**
 * Primeiro link de anime do cartão, tentando os seletores de título conhecidos.
 * @param {*} item - Seleção do cartão.
 * @returns {*|null} Seleção da âncora ou `null` quando o cartão não aponta para `/anime/`.
 */
function firstAnimeAnchor(item) {
  const selectors = ['div.data h3 a', '.title a', 'h2 a', 'a'];
  for (const selector of selectors) {
    const anchors = item.find(selector);
    for (let index = 0; index < anchors.length; index += 1) {
      const anchor = anchors.eq(index);
      const href = anchor.attr('href');
      if (typeof href === 'string' && href.includes(ANIME_HREF)) return anchor;
    }
  }
  return null;
}

/**
 * Lê o ano do cartão quando a fonte o publica em `.year` ou `.meta span.year`.
 * @param {*} item - Seleção do cartão.
 * @returns {number|null} Ano de quatro dígitos ou `null` quando ausente.
 */
function readCardYear(item) {
  const text = textOf(item.find('.year')) || textOf(item.find('.meta span.year'));
  if (!FOUR_DIGIT_YEAR.test(text)) return null;
  return Number(text);
}

/**
 * Abre a ficha do cartão e confirma título e ano.
 * @param {Candidate} card - Cartão da busca.
 * @param {object} matchingMedia - Títulos e ano do TMDB.
 * @returns {Promise<ConfirmedCandidate|null>} Ficha confirmada ou `null` quando rejeitada ou removida.
 * @throws {Error} Se a ficha responder fora de 2xx (exceto 404) ou não publicar `h1`/`span.date`.
 */
async function confirmCandidate(card, matchingMedia) {
  let page;
  try {
    page = await fetchPage(card.url, { profile: 'page' });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return null;
    throw error;
  }

  const $ = loadHtml(page.text);
  const h1 = textOf($('.sheader h1').eq(0)) || textOf($('h1').eq(0));
  if (h1 === '') throw new Error(`Ficha ${page.url} sem h1`);
  const date = textOf($('.sheader span.date').eq(0));
  if (date === '') throw new Error(`Ficha ${page.url} sem span.date`);

  const candidate = { title: cleanCatalogTitle(h1), year: readYear(date, page.url) };
  const match = findBestMatch([candidate], matchingMedia, {
    minScore: MIN_SCORE,
    yearTolerance: YEAR_TOLERANCE,
  });
  if (match === null) return null;
  return {
    slug: slugFromUrl(page.url),
    url: page.url,
    title: candidate.title,
    year: candidate.year,
    html: page.text,
  };
}

/**
 * Remove os sufixos de catálogo do `h1` da ficha, em qualquer ordem e repetidamente.
 * @param {string} h1 - Título principal da ficha.
 * @returns {string} Título limpo.
 * @throws {Error} Se o título ficar vazio depois da limpeza.
 * @example
 * cleanCatalogTitle('Naruto Clássico Dublado'); // 'Naruto'
 * cleanCatalogTitle('Naruto Shippuden Todos os Episodios Online'); // 'Naruto Shippuden'
 */
export function cleanCatalogTitle(h1) {
  let text = typeof h1 === 'string' ? h1.trim() : '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TITLE_SUFFIXES) {
      const next = text.replace(pattern, '').trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  if (text === '') throw new Error(`Título de ficha vazio depois da limpeza: "${String(h1)}"`);
  return text;
}

/**
 * Lê o ano de `span.date`.
 * @param {string} text - Texto publicado.
 * @param {string} pageUrl - URL da ficha, para a mensagem de erro.
 * @returns {number} Ano de quatro dígitos.
 * @throws {Error} Se o texto não tiver um ano.
 */
function readYear(text, pageUrl) {
  const match = /\b(\d{4})\b/.exec(text);
  if (match === null) throw new Error(`Ficha ${pageUrl} com span.date sem ano: "${text}"`);
  return Number(match[1]);
}

/**
 * Extrai o slug da URL final da ficha.
 * @param {string} pageUrl - URL de `/anime/<slug>/`.
 * @returns {string} Slug decodificado.
 * @throws {Error} Se a URL não seguir o formato da ficha.
 */
function slugFromUrl(pageUrl) {
  const segments = new URL(pageUrl).pathname.split('/').filter(Boolean);
  const slug = segments[0] === 'anime' ? segments[1] : undefined;
  if (slug === undefined) throw new Error(`URL de ficha fora do formato /anime/<slug>/: ${pageUrl}`);
  return decodeURIComponent(slug);
}
