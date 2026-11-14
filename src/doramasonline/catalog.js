/**
 * Busca e confirmação de identidade no Doramas Online.
 *
 * A fonte é um portal WordPress com tema DooPlay: a busca é textual (`/?s=<termo>`) e devolve
 * cartões com título, ano e link. A confirmação exige o caminho do tipo pedido, semelhança de
 * título e igualdade de ano quando os dois lados publicam o ano. O primeiro candidato confirmado
 * encerra a busca.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { readDetailPage, SOURCE_URL } from './episode.js';

const MIN_TITLE_SIMILARITY = 0.85;
const MAX_CANDIDATES_PER_TERM = 3;
const MOVIE_PATH = '/br/filmes/';
const TV_PATH = '/br/series/';
const FOUR_DIGIT_YEAR = /^(\d{4})/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('./episode.js').DetailPage} DetailPage
 */

/**
 * @typedef {object} SearchCard
 * @property {string} title - Título exibido no cartão, sem entidades HTML.
 * @property {number|null} year - Ano do cartão; `null` quando ausente.
 * @property {string} url - Endereço absoluto da ficha.
 */

/**
 * @typedef {object} ConfirmedMedia
 * @property {string} url - URL final da ficha.
 * @property {string} html - HTML final da ficha.
 * @property {DetailPage} detail - Ficha lida.
 */

/**
 * Localiza a obra no catálogo e devolve a primeira ficha confirmada.
 * @param {MediaInfo} media - Título, original, alternativos e ano do TMDB.
 * @returns {Promise<ConfirmedMedia|null>} Ficha confirmada ou `null` quando nenhum candidato corresponde.
 * @throws {Error} Em falha de rede, página de busca sem estrutura ou ficha inválida.
 * @example
 * const confirmed = await findMedia({ title: 'Pousando no Amor', originalTitle: 'Crash Landing on You', alternativeTitles: [], year: 2019, mediaType: 'tv' });
 * confirmed.detail.episodes.length; // 16
 */
export async function findMedia(media) {
  const seen = new Set();
  for (const term of searchTerms(media)) {
    const page = await fetchPage(`${SOURCE_URL}/?s=${encodeURIComponent(term)}`);
    const cards = readSearchCards(page.text);
    const ranked = cards
      .filter((card) => pathType(card.url) === media.mediaType)
      .map((card) => ({ card, score: bestTitleScore(card.title, media) }))
      .filter((entry) => entry.score >= MIN_TITLE_SIMILARITY)
      .sort((a, b) => b.score - a.score);

    let opened = 0;
    for (const { card } of ranked) {
      if (opened >= MAX_CANDIDATES_PER_TERM) break;
      if (seen.has(card.url)) continue;
      seen.add(card.url);
      if (!yearMatches(card.year, media.year)) continue;
      opened += 1;
      const confirmed = await confirmCard(card, media);
      if (confirmed !== null) return confirmed;
    }
  }
  return null;
}

/**
 * Lê os cartões de uma página de busca.
 * @param {string} html - HTML da busca.
 * @returns {SearchCard[]} Cartões na ordem da página; vazio quando a busca não achou nada.
 * @throws {Error} Se a página não for a busca esperada ou um cartão não tiver título ou link.
 * @example
 * const cards = readSearchCards(html);
 * cards[0]; // { title: 'Pousando no Amor', year: 2019, url: '.../br/series/pousando-no-amor/' }
 */
export function readSearchCards(html) {
  if (typeof html !== 'string') throw new Error('Busca do Doramas Online: HTML inválido');
  const $ = loadHtml(html);
  if ($('.search-page').length === 0) {
    throw new Error('Busca do Doramas Online sem .search-page; layout inesperado ou bloqueio');
  }

  const cards = [];
  const articles = $('.search-page article');
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles.eq(index);
    const link = article.find('.title a').eq(0);
    const title = link.text().trim();
    const href = link.attr('href');
    if (title === '') throw new Error(`Cartão ${index + 1} da busca sem título em .title a`);
    if (!href) throw new Error(`Cartão ${index + 1} da busca sem link em .title a`);

    const yearText = article.find('.meta span.year').eq(0).text().trim();
    const yearMatch = FOUR_DIGIT_YEAR.exec(yearText);
    cards.push({
      title,
      year: yearMatch ? Number(yearMatch[1]) : null,
      url: new URL(href, SOURCE_URL).href,
    });
  }
  return cards;
}

/**
 * Abre e confirma uma ficha de cartão.
 * @param {SearchCard} card - Cartão da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<ConfirmedMedia|null>} Ficha confirmada ou `null` quando título ou ano divergem.
 * @throws {Error} Em falha de rede ou ficha sem estrutura.
 */
async function confirmCard(card, media) {
  const page = await fetchPage(card.url);
  const detail = readDetailPage(page.text, page.url);
  if (bestTitleScore(detail.title, media) < MIN_TITLE_SIMILARITY) return null;
  if (!yearMatches(card.year, media.year)) return null;
  if (!yearMatches(detail.year, media.year)) return null;
  if (media.year !== null && card.year === null && detail.year === null) return null;
  return { url: page.url, html: page.text, detail };
}

/**
 * Variantes de título para a busca, sem repetir a mesma consulta.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos PT-BR, original e alternativos.
 */
function searchTerms(media) {
  const seen = new Set();
  const terms = [];
  for (const value of [media.title, media.originalTitle, ...media.alternativeTitles]) {
    if (typeof value !== 'string') continue;
    const term = value.trim();
    if (term === '') continue;
    const key = normalizeText(term) || term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/**
 * Melhor semelhança entre um título da fonte e os títulos do TMDB.
 * @param {string} title - Título exibido na fonte.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number} Semelhança entre 0 e 1.
 */
function bestTitleScore(title, media) {
  const titles = [media.title, media.originalTitle, ...media.alternativeTitles].filter((value) => typeof value === 'string');
  return Math.max(...titles.map((value) => titleSimilarity(title, value)));
}

/**
 * Tipo do caminho da fonte.
 * @param {string} url - URL do cartão.
 * @returns {'movie'|'tv'|null} Tipo reconhecido, ou `null` para episódio e demais caminhos.
 */
function pathType(url) {
  const path = new URL(url).pathname;
  if (path.startsWith(MOVIE_PATH)) return 'movie';
  if (path.startsWith(TV_PATH)) return 'tv';
  return null;
}

/**
 * Confere o ano da fonte contra o ano do TMDB quando ambos existem.
 * @param {number|null} sourceYear - Ano publicado pela fonte.
 * @param {number|null} mediaYear - Ano do TMDB.
 * @returns {boolean} Resultado da conferência; sem um dos anos, não há o que comparar.
 */
function yearMatches(sourceYear, mediaYear) {
  if (sourceYear === null || mediaYear === null) return true;
  return sourceYear === mediaYear;
}

/**
 * Carrega o HTML com o cheerio fornecido pelo app.
 * @param {string} html - Documento HTML.
 * @returns {*} Instância do cheerio.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
