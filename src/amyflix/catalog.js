/**
 * Busca e leitura das páginas do AmyFlix.
 *
 * A busca é HTML (`/?s=`), a série publica temporadas `se-c` com `ul.episodios` e o filme ou
 * episódio publica opções DooPlay. Cada estrutura é validada antes de chegar ao extrator.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { loadHtml, textOf } from './html.js';
import { SITE } from './site.js';

const AUDIO_DECORATION = /\s+[–—-]\s+(?:dublado(?:\s+e\s+legendado)?|legendado(?:\s+e\s+dublado)?)\s*$/i;
const LEADING_VERB = /^assistir\s+/i;
const EPISODE_NUMBER = /(\d+)\s*-\s*(\d+)/;
const POSITIVE_INTEGER = /^\d+$/;

/**
 * @typedef {object} Candidate
 * @property {string} title - Título do cartão, limpo das decorações de áudio.
 * @property {string} url - URL da ficha.
 * @property {'movie'|'tv'} kind - Tipo inferido pela rota da ficha.
 */

/**
 * @typedef {object} EpisodeCard
 * @property {number} season - Temporada declarada em `div.numerando`.
 * @property {number} episode - Episódio declarado em `div.numerando`.
 * @property {string} url - URL do episódio publicada em `div.episodiotitle a`.
 */

/**
 * @typedef {object} Season
 * @property {number} number - Número da temporada em `span.se-t`.
 * @property {EpisodeCard[]} episodes - Episódios da temporada.
 */

/**
 * @typedef {object} SeriesDetail
 * @property {'tv'} kind - Tipo do detalhe.
 * @property {string} title - Título do `h1`, limpo das decorações de áudio.
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
 * @typedef {object} OptionsDetail
 * @property {'movie'|'tv'} kind - Tipo da página de onde as opções vieram.
 * @property {string} title - Título do `h1`, limpo das decorações de áudio.
 * @property {PlayerOption[]} options - Opções DooPlay com `data-nume` numérico.
 */

/**
 * Busca títulos no site.
 * @param {string} query - Termo não vazio.
 * @returns {Promise<Candidate[]>} Cartões de filme/série; lista vazia é ausência.
 * @throws {Error} Se a resposta não for 2xx ou não tiver `search-page`/`no-result`.
 */
export async function search(query) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: termo vazio (recebido: ${describe(query)})`);
  }
  const url = `${SITE}/?s=${encodeURIComponent(query.trim())}`;
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);
  const searchPage = $('div.search-page');
  const noResult = $('div.no-result');
  if (searchPage.length === 0 && noResult.length === 0) {
    throw new Error(`Busca fora do esquema em ${url}: search-page/no-result ausentes`);
  }
  if (noResult.length > 0) return [];

  const cards = $('div.result-item article');
  const candidates = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const link = card.find('.title a');
    const href = link.attr('href');
    if (typeof href !== 'string' || href.trim() === '') continue;
    const url = new URL(href, SITE).href;
    const pathName = new URL(url).pathname;
    const kind = pathName.includes('/filme/') ? 'movie' : pathName.includes('/serie/') ? 'tv' : null;
    if (kind === null) continue;
    const title = cleanTitle(textOf(link));
    if (title === '') continue;
    candidates.push({ title, url, kind });
  }
  return candidates;
}

/**
 * Abre e lê uma ficha de série.
 * @param {string} url - URL da ficha.
 * @returns {Promise<SeriesDetail>} Temporadas e episódios.
 * @throws {Error} Se a página não tiver `h1`, `div.se-c` ou `ul.episodios`.
 */
export async function fetchSeriesDetail(url) {
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);
  const title = readTitle($, url);
  const blocks = $('div.se-c');
  const lists = $('ul.episodios');
  if (blocks.length === 0 || lists.length === 0) {
    throw new Error(`Ficha de série fora do esquema em ${url}: se-c/episodios ausentes`);
  }

  const seasons = [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks.eq(blockIndex);
    const season = readPositiveInteger(textOf(block.find('span.se-t')));
    if (season === null) continue;
    const episodes = [];
    const items = block.find('ul.episodios li');
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items.eq(itemIndex);
      const pair = EPISODE_NUMBER.exec(textOf(item.find('div.numerando')));
      if (pair === null) continue;
      const href = item.find('div.episodiotitle a').attr('href');
      if (typeof href !== 'string' || href.trim() === '') continue;
      episodes.push({
        season: Number(pair[1]),
        episode: Number(pair[2]),
        url: new URL(href, SITE).href,
      });
    }
    seasons.push({ number: season, episodes });
  }
  return { kind: 'tv', title, seasons };
}

/**
 * Lê as opções DooPlay de uma página de filme ou de episódio.
 * @param {string} url - URL da página.
 * @param {'movie'|'tv'} kind - Tipo da página.
 * @returns {Promise<OptionsDetail>} Título e opções.
 * @throws {Error} Se a página não tiver `h1` ou opções DooPlay.
 */
export async function fetchOptions(url, kind) {
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);
  const title = readTitle($, url);
  const items = $('li.dooplay_player_option');
  const options = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr('data-nume');
    if (typeof nume !== 'string' || !POSITIVE_INTEGER.test(nume)) continue;
    const post = item.attr('data-post');
    const type = item.attr('data-type');
    if (typeof post !== 'string' || post.trim() === '' || typeof type !== 'string' || type.trim() === '') continue;
    options.push({ post, type, nume, label: textOf(item.find('span.title')) || `Opção ${nume}` });
  }
  if (options.length === 0) throw new Error(`Página fora do esquema em ${url}: opções DooPlay ausentes`);
  return { kind, title, options };
}

/**
 * Expande uma opção DooPlay.
 * @param {PlayerOption} option - Opção da página.
 * @param {string} referer - URL da página que contém a opção.
 * @returns {Promise<string|null>} `embed_url` ou `null` quando vazio.
 * @throws {Error} Se a resposta não for 2xx ou não for objeto com `embed_url` textual.
 */
export async function fetchPlayerEmbed(option, referer) {
  const body = await fetchJson(`${SITE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    profile: 'api',
    form: {
      action: 'doo_player_ajax',
      post: option.post,
      nume: option.nume,
      type: option.type,
    },
    headers: { Referer: referer },
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`AJAX do player fora do esquema para ${option.label}: resposta não é objeto`);
  }
  if (typeof body.embed_url !== 'string' || body.embed_url.trim() === '') return null;
  return body.embed_url.trim();
}

/**
 * Limpa as decorações de áudio do título do site.
 * @param {string} value - Título publicado.
 * @returns {string} Título sem `Assistir`, `– Dublado`, `– Legendado` ou `– Dublado e Legendado`.
 */
export function cleanTitle(value) {
  let title = String(value).replace(/\s+/g, ' ').trim();
  title = title.replace(LEADING_VERB, '');
  while (AUDIO_DECORATION.test(title)) title = title.replace(AUDIO_DECORATION, '').trim();
  return title;
}

/**
 * Lê e limpa o `h1` da página.
 * @param {*} $ - Instância do cheerio.
 * @param {string} url - URL da página, para a mensagem de erro.
 * @returns {string} Título limpo.
 * @throws {Error} Se o `h1` estiver ausente.
 */
function readTitle($, url) {
  const title = cleanTitle(textOf($('h1').eq(0)));
  if (title === '') throw new Error(`Página fora do esquema em ${url}: h1 ausente`);
  return title;
}

/**
 * Lê um inteiro positivo de um texto.
 * @param {string} text - Texto recebido.
 * @returns {number|null}
 */
function readPositiveInteger(text) {
  const match = /^\s*(\d+)\s*$/.exec(text);
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number >= 1 ? number : null;
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
