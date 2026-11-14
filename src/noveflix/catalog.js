/**
 * Busca e leitura das fichas do NoveFlix.
 *
 * A busca é HTML (`/?s=`) e a ficha publica `span.date` com o ano e um botão DooPlay. O ano da
 * ficha separa a novela original do remake.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { loadHtml, textOf } from './html.js';
import { SITE } from './site.js';

const YEAR = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/;

/**
 * @typedef {object} Candidate
 * @property {string} title - Título do cartão.
 * @property {string} url - URL da ficha `/assistir/<slug>/`.
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} post - ID do post.
 * @property {string} nume - Número da opção.
 */

/**
 * @typedef {object} ShowDetail
 * @property {string} title - Título do `h1`.
 * @property {number|null} year - Ano de `span.date`; `null` quando ausente ou inválido.
 * @property {string} url - URL final da ficha.
 * @property {PlayerOption} option - Único botão DooPlay da novela.
 */

/**
 * Busca novelas no site.
 * @param {string} query - Termo não vazio.
 * @returns {Promise<Candidate[]>} Cartões `/assistir/<slug>/`; lista vazia é ausência.
 * @throws {Error} Se a resposta não for 2xx ou não tiver `search-page`/`no-result`.
 */
export async function search(query) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: termo vazio (recebido: ${describe(query)})`);
  }
  const url = `${SITE}/?s=${encodeURIComponent(query.trim())}`;
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);
  const searchPage = $('.search-page');
  const noResult = $('.no-result');
  if (searchPage.length === 0 && noResult.length === 0) {
    throw new Error(`Busca fora do esquema em ${url}: search-page/no-result ausentes`);
  }
  if (noResult.length > 0) return [];

  const articles = $('.search-page article');
  const candidates = [];
  for (let index = 0; index < articles.length; index += 1) {
    const link = articles.eq(index).find('.title a');
    const href = link.attr('href');
    if (typeof href !== 'string' || href.trim() === '') continue;
    const candidateUrl = new URL(href, SITE).href;
    if (!new URL(candidateUrl).pathname.includes('/assistir/')) continue;
    const title = textOf(link);
    if (title === '') continue;
    candidates.push({ title, url: candidateUrl });
  }
  return candidates;
}

/**
 * Abre e lê uma ficha de novela.
 * @param {string} url - URL da ficha.
 * @returns {Promise<ShowDetail>} Título, ano e botão DooPlay.
 * @throws {Error} Se a página não tiver `h1` ou um botão com `data-post`.
 */
export async function fetchShow(url) {
  const page = await fetchPage(url, { profile: 'page' });
  const $ = loadHtml(page.text);
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error(`Ficha fora do esquema em ${url}: h1 ausente`);
  const year = readYear(textOf($('span.date').eq(0)));

  const items = $('li.dooplay_player_option');
  let option = null;
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const post = item.attr('data-post');
    const nume = item.attr('data-nume');
    if (typeof post !== 'string' || post.trim() === '' || typeof nume !== 'string' || !/^\d+$/.test(nume)) {
      continue;
    }
    option = { post, nume };
    break;
  }
  if (option === null) throw new Error(`Ficha fora do esquema em ${url}: botão DooPlay com data-post ausente`);
  return { title, year, url: page.url, option };
}

/**
 * Expande o botão DooPlay.
 * @param {PlayerOption} option - Botão da ficha.
 * @param {string} referer - URL da ficha.
 * @returns {Promise<string|null>} `embed_url` HTTP(S) ou `null` quando ausente.
 * @throws {Error} Se a resposta não for JSON de objeto ou o `embed_url` não for HTTP(S).
 */
export async function fetchEmbed(option, referer) {
  const body = await fetchJson(`${SITE}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    profile: 'api',
    form: {
      action: 'doo_player_ajax',
      post: option.post,
      nume: option.nume,
      type: 'movie',
    },
    headers: { Referer: referer },
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('AJAX do player fora do esquema: resposta não é objeto');
  }
  if (typeof body.embed_url !== 'string' || body.embed_url.trim() === '') return null;
  const embed = body.embed_url.trim();
  let parsed;
  try {
    parsed = new URL(embed);
  } catch {
    throw new Error('AJAX do player com embed_url inválido');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AJAX do player com embed_url fora de HTTP(S)');
  }
  return embed;
}

/**
 * Lê um ano de quatro dígitos.
 * @param {string} text - Texto recebido.
 * @returns {number|null}
 */
function readYear(text) {
  const match = YEAR.exec(text);
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
