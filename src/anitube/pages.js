/**
 * Leitura das fichas do AniTube: série, página agregadora de filme e ficha direta de filme.
 *
 * A lista de episódios fica em `div.pagAniListaContainer`; o episódio é escolhido pelo número
 * declarado no título do link, nunca pela posição visual. Entradas de filme são lidas pelo título.
 */

import { loadHtml, textOf } from './html.js';

const EPISODE_NUMBER = /epis[oó]dio\s+0*(\d+)/i;
const SERIES_TITLE = /todos\s+(?:os\s+)?epis[oó]dios?/i;
const MOVIE_WORD = /\bfilme\b/i;
const NON_EPISODE = /\b(?:ova|ovas|especial|especiais|filme|filmes)\b/i;

/**
 * @typedef {object} PageInfo
 * @property {string} h1 - Título principal da ficha.
 * @property {string} type - Texto de `Tipo de Episódio`.
 * @property {number|null} year - Ano da ficha.
 * @property {string|null} audio - `Dublado`, `Legendado` ou `null`.
 */

/**
 * @typedef {object} MovieEntry
 * @property {string} url - Página da entrada de filme.
 * @property {string} title - Título publicado da entrada.
 * @property {string|null} audio - `Dublado`, `Legendado` ou `null`.
 */

/**
 * Lê `h1`, `Tipo de Episódio` e `Ano` de uma ficha.
 * @param {string} html - HTML da ficha.
 * @returns {PageInfo} Dados disponíveis.
 * @example
 * readPageInfo('<h1>Jujutsu Kaisen 2 – Todos os Episódios</h1>...');
 * // { h1: 'Jujutsu Kaisen 2 – Todos os Episódios', type: 'Dublado', year: 2023, audio: 'Dublado' }
 */
export function readPageInfo(html) {
  const $ = loadHtml(html);
  const h1 = textOf($('h1').eq(0));
  let type = '';
  let year = null;

  const lines = $('.boxAnimeSobreLinha');
  for (let index = 0; index < lines.length; index += 1) {
    const text = textOf(lines.eq(index));
    const typeMatch = /tipo\s+de\s+epis[oó]dio:\s*(.+)$/i.exec(text);
    if (typeMatch !== null) type = typeMatch[1].trim();
    const yearMatch = /\bano:\s*(\d{4})\b/i.exec(text);
    if (yearMatch !== null) year = Number(yearMatch[1]);
  }

  return { h1, type, year, audio: readAudio(type) || readAudio(h1) };
}

/**
 * Indica se a página é uma ficha de série.
 * @param {string} html - HTML da ficha.
 * @returns {boolean}
 * @example
 * isSeriesPage('<h1>Bleach – Todos os Episódios</h1><div class="pagAniListaContainer">...</div>'); // true
 */
export function isSeriesPage(html) {
  const $ = loadHtml(html);
  const h1 = textOf($('h1').eq(0));
  if (SERIES_TITLE.test(h1)) return true;
  return $('.pagAniListaContainer').length > 0 && !MOVIE_WORD.test(h1);
}

/**
 * Indica se a página pode atender um pedido de filme.
 * @param {string} html - HTML da ficha.
 * @returns {boolean}
 * @example
 * isMoviePage('<h1>Kimi no Na wa (Your Name) – Filme Dublado e Legendado</h1>...'); // true
 */
export function isMoviePage(html) {
  const $ = loadHtml(html);
  const h1 = textOf($('h1').eq(0));
  if (MOVIE_WORD.test(h1) && !SERIES_TITLE.test(h1)) return true;
  const links = $('.pagAniListaContainer a');
  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    if (MOVIE_WORD.test(link.attr('title') || textOf(link))) return true;
  }
  return false;
}

/**
 * Seleciona o episódio pelo número declarado no título do link.
 * @param {string} html - HTML da ficha de série.
 * @param {string} pageUrl - URL da ficha, para resolver links relativos.
 * @param {{ episode: number }} request - Episódio pedido.
 * @returns {{ url: string, title: string }|null} Link do episódio ou `null` quando não existe.
 * @throws {Error} Se a ficha de série não tiver a estrutura da lista de episódios.
 * @example
 * selectEpisode(html, 'https://www.anitube.zip/video/970537b002', { episode: 7 });
 * // { url: 'https://www.anitube.zip/video/970546/', title: 'Jujutsu Kaisen 2 (Dublado) – Episódio 07' }
 */
export function selectEpisode(html, pageUrl, request) {
  const $ = loadHtml(html);
  const links = $('.pagAniListaContainer a');
  if (links.length === 0) throw new Error('Ficha de série sem lista de episódios');

  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    const title = link.attr('title') || textOf(link);
    if (NON_EPISODE.test(title)) continue;
    const match = EPISODE_NUMBER.exec(title);
    if (match === null || Number(match[1]) !== request.episode) continue;
    const href = link.attr('href');
    if (!href) throw new Error(`Episódio ${request.episode} sem endereço`);
    return { url: new URL(href, pageUrl).href, title };
  }
  return null;
}

/**
 * Lê as entradas de filme de uma ficha direta ou de uma página agregadora.
 *
 * A página agregadora não tem players: cada link de filme é uma entrada independente. A ficha
 * direta tem players e é a própria entrada. Uma página de série só atende filme quando a lista
 * contém entradas com `Filme`; sem elas, o pedido de filme fica sem resultado.
 *
 * @param {string} html - HTML da ficha.
 * @param {string} pageUrl - URL da ficha, para resolver links relativos.
 * @returns {{ kind: 'direct'|'aggregator'|'none', entries: MovieEntry[], page: PageInfo }} Entradas encontradas.
 * @example
 * readMovieEntries(aggregatorHtml, 'https://www.anitube.zip/video/892906/');
 * // { kind: 'aggregator', entries: [{ url: '...', title: 'Kimi no Na wa (Your Name) – Filme', audio: null }], page: {...} }
 */
export function readMovieEntries(html, pageUrl) {
  const $ = loadHtml(html);
  const page = readPageInfo(html);
  const links = $('.pagAniListaContainer a');
  const entries = [];

  for (let index = 0; index < links.length; index += 1) {
    const link = links.eq(index);
    const title = link.attr('title') || textOf(link);
    if (!MOVIE_WORD.test(title)) continue;
    const href = link.attr('href');
    if (!href) throw new Error(`Entrada de filme ${index} sem endereço`);
    entries.push({ url: new URL(href, pageUrl).href, title, audio: readAudio(title) });
  }

  if (entries.length > 0) return { kind: 'aggregator', entries, page };
  if (MOVIE_WORD.test(page.h1) && !SERIES_TITLE.test(page.h1)) {
    return { kind: 'direct', entries: [{ url: pageUrl, title: page.h1, audio: page.audio }], page };
  }
  return { kind: 'none', entries: [], page };
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
