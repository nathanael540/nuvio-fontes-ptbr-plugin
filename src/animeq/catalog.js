/**
 * Busca e leitura das páginas do AnimeQ.
 *
 * A busca é HTML (`/?s=`), a série publica temporadas `se-c` e cartões `episode-card`, e o filme
 * publica opções DooPlay. Cada estrutura é validada antes de chegar ao extrator.
 */

import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { loadHtml, textOf } from './html.js';
import { SITE } from './site.js';

/**
 * @typedef {object} Candidate
 * @property {string} title - Título do cartão.
 * @property {string} url - URL da ficha.
 * @property {number|null} year - Ano do cartão.
 * @property {'movie'|'tv'|null} kind - Tipo inferido pela rota da ficha.
 */

/**
 * @typedef {object} EpisodeCard
 * @property {number} number - Número declarado em `data-episode-number`.
 * @property {string} url - URL do episódio.
 */

/**
 * @typedef {object} Season
 * @property {number} number - Número da temporada.
 * @property {EpisodeCard[]} episodes - Episódios da temporada.
 */

/**
 * @typedef {object} SeriesDetail
 * @property {'tv'} kind - Tipo do detalhe.
 * @property {string} title - Título do `h1`.
 * @property {Season[]} seasons - Temporadas publicadas.
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} post - ID do post.
 * @property {string} type - Tipo DooPlay.
 * @property {string} nume - Número da opção.
 * @property {string} label - Rótulo exibido.
 */

/**
 * @typedef {object} MovieDetail
 * @property {'movie'} kind - Tipo do detalhe.
 * @property {string} title - Título do `h1`.
 * @property {PlayerOption[]} options - Opções DooPlay.
 */

/**
 * Busca títulos no site.
 * @param {string} query - Termo não vazio.
 * @returns {Promise<Candidate[]>} Cartões encontrados; lista vazia é ausência.
 * @throws {Error} Se a resposta não for 2xx ou não tiver `search-page`/`no-result`.
 */
export async function search(query) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: termo vazio (recebido: ${describe(query)})`);
  }
  const url = `${SITE}/?s=${encodeURIComponent(query.trim())}`;
  const html = await fetchText(url, { profile: 'page' });
  const $ = loadHtml(html);
  const page = $('div.search-page');
  const noResult = $('div.no-result');
  if (page.length === 0 && noResult.length === 0) {
    throw new Error(`Busca fora do esquema em ${url}: search-page/no-result ausentes`);
  }
  if (noResult.length > 0) return [];
  const cards = $('div.result-item');
  const candidates = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const link = card.find('.title a');
    const href = link.attr('href');
    const title = textOf(link);
    if (typeof href !== 'string' || href.trim() === '' || title === '') continue;
    const yearText = textOf(card.find('.year'));
    const url = new URL(href, SITE).href;
    const pathName = new URL(url).pathname;
    const kind = pathName.includes('/filme/') ? 'movie' : pathName.includes('/anime/') ? 'tv' : null;
    candidates.push({ title, url, year: readYear(yearText), kind });
  }
  return candidates;
}

/**
 * Abre e lê uma ficha de série.
 * @param {string} url - URL da ficha.
 * @returns {Promise<SeriesDetail>} Temporadas e episódios.
 * @throws {Error} Se a página não tiver blocos `se-c`/`episode-card`.
 */
export async function fetchSeriesDetail(url) {
  const html = await fetchText(url, { profile: 'page' });
  const $ = loadHtml(html);
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error(`Ficha de série fora do esquema em ${url}: h1 ausente`);
  const blocks = $('div.se-c');
  const cards = $('div.episode-card');
  if (blocks.length === 0 && cards.length === 0) {
    throw new Error(`Ficha de série fora do esquema em ${url}: se-c/episode-card ausentes`);
  }
  const seasons = [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks.eq(blockIndex);
    const seasonText = textOf(block.find('span.se-t'));
    const season = readNumber(seasonText);
    if (season === null) continue;
    const episodes = [];
    const episodeCards = block.find('div.episode-card');
    for (let cardIndex = 0; cardIndex < episodeCards.length; cardIndex += 1) {
      const card = episodeCards.eq(cardIndex);
      const number = readNumber(card.attr('data-episode-number'));
      if (number === null) continue;
      const links = card.find('a');
      let episodeUrl = null;
      for (let linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
        const href = links.eq(linkIndex).attr('href');
        if (typeof href === 'string' && href.includes('/episodio/')) {
          episodeUrl = new URL(href, SITE).href;
          break;
        }
      }
      if (episodeUrl !== null) episodes.push({ number, url: episodeUrl });
    }
    seasons.push({ number: season, episodes });
  }
  return { kind: 'tv', title, seasons };
}

/**
 * Abre e lê uma ficha de filme.
 * @param {string} url - URL da ficha.
 * @returns {Promise<MovieDetail>} Opções DooPlay.
 * @throws {Error} Se a página não tiver opções de player.
 */
export async function fetchMovieDetail(url) {
  const html = await fetchText(url, { profile: 'page' });
  const $ = loadHtml(html);
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error(`Ficha de filme fora do esquema em ${url}: h1 ausente`);
  const items = $('li.dooplay_player_option');
  const options = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr('data-nume');
    if (typeof nume !== 'string' || !/^\d+$/.test(nume)) continue;
    const post = item.attr('data-post');
    const type = item.attr('data-type');
    if (typeof post !== 'string' || post.trim() === '' || typeof type !== 'string' || type.trim() === '') continue;
    options.push({ post, type, nume, label: textOf(item.find('.title')) || `Opção ${nume}` });
  }
  if (options.length === 0) throw new Error(`Ficha de filme fora do esquema em ${url}: opções DooPlay ausentes`);
  return { kind: 'movie', title, options };
}

/**
 * Expande uma opção DooPlay.
 * @param {PlayerOption} option - Opção da ficha.
 * @returns {Promise<string|null>} `embed_url` ou `null` quando vazio.
 * @throws {Error} Se a resposta não for 2xx ou não for objeto com `embed_url`.
 */
export async function fetchPlayerEmbed(option) {
  const body = await fetchJson(`${SITE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    profile: 'api',
    form: {
      action: 'doo_player_ajax',
      post: option.post,
      nume: option.nume,
      type: option.type,
    },
    headers: { Referer: `${SITE}/` },
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`AJAX do player fora do esquema para ${option.label}: resposta não é objeto`);
  }
  if (typeof body.embed_url !== 'string' || body.embed_url.trim() === '') return null;
  return body.embed_url.trim();
}

/**
 * Lê um número inteiro de texto ou atributo.
 * @param {*} value - Valor recebido.
 * @returns {number|null}
 */
function readNumber(value) {
  if (value === undefined || value === null) return null;
  const match = /^\s*(\d+)\s*$/.exec(String(value));
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

/**
 * Lê um ano de quatro dígitos.
 * @param {string} text - Texto recebido.
 * @returns {number|null}
 */
function readYear(text) {
  const match = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/.exec(text);
  return match === null ? null : Number(match[1]);
}

/**
 * Descreve um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  return typeof value === 'string' ? `"${value}"` : String(value);
}
