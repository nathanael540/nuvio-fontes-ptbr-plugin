/**
 * Acesso HTTP e leitura do HTML do Donghua No Sekai.
 *
 * A busca é `GET /?s=<termo>`; a ficha publica `h1`, a lista de informação, os episódios em
 * `div.episode_list` e os players em `div.slideItem[data-video-url]`. O carregamento do cheerio
 * fica dentro das funções para não fazer trabalho no carregamento do módulo.
 */

import { fetchText } from '../_blocks/http/index.mjs';

/** URL base do catálogo. */
export const SITE_URL = 'https://donghuanosekai.com';

/** Nome usado no formatador e nos logs. */
export const ADDON_NAME = 'Donghua No Sekai';

/**
 * @typedef {object} SearchCard
 * @property {string} url - URL absoluta da ficha.
 * @property {string} title - Título exibido no cartão.
 * @property {string} type - Valor de `data-ona` (`Movie`, `ONA`, `TV`, `Special` ou vazio).
 */

/**
 * @typedef {object} EpisodeLink
 * @property {string} url - URL absoluta do episódio.
 * @property {number|null} number - Número local lido de `span.episode`; `null` em rótulo sem número.
 * @property {string} label - Texto do rótulo, ex.: `Episódio 19 (184)`.
 * @property {boolean} range - True quando o rótulo cobre uma faixa (`Episódios 34-35`).
 */

/**
 * @typedef {object} PlayerLink
 * @property {string} url - URL absoluta da página do player.
 * @property {string} label - Rótulo publicado, ex.: `Player 1`.
 */

/**
 * @typedef {object} DetailPage
 * @property {string} url - URL da ficha.
 * @property {string} title - Texto do primeiro `h1`.
 * @property {string[]} alternativeTitles - Títulos de `Titulo Alternativo`, separados por vírgula.
 * @property {number|null} year - Ano de `Ano`, quando publicado.
 * @property {string} type - Tipo de `Tipo` (`Movie`, `ONA`, `TV` ou vazio).
 * @property {number|null} episodeCount - Contagem de `Episódios`, quando numérica.
 * @property {EpisodeLink[]} episodes - Itens de `div.episode_list`.
 * @property {PlayerLink[]} players - Itens de `div.slideItem`.
 */

/**
 * Carrega um HTML com o cheerio fornecido pelo app.
 *
 * @param {string} html - HTML da página.
 * @returns {*} Instância do cheerio.
 * @throws {Error} Se o HTML não for texto.
 */
export function loadHtml(html) {
  if (typeof html !== 'string') throw new Error(`HTML inválido: ${typeof html} (esperado texto)`);
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Texto de um nó com entidades numéricas decodificadas e espaços normalizados.
 *
 * @param {*} node - Seleção do cheerio.
 * @returns {string} Texto aparado.
 */
export function textOf(node) {
  return decodeEntities(node.text()).replace(/\s+/g, ' ').trim();
}

/**
 * Atributo de um nó com entidades decodificadas.
 *
 * @param {*} node - Seleção do cheerio.
 * @param {string} name - Nome do atributo.
 * @returns {string|null} Valor aparado ou `null` quando ausente.
 */
export function attrOf(node, name) {
  const value = node.attr(name);
  return value === undefined || value === null ? null : decodeEntities(String(value)).trim();
}

/**
 * Executa a busca HTML e devolve os cartões publicados.
 *
 * @param {string} term - Termo pesquisado.
 * @returns {Promise<SearchCard[]>} Cartões na ordem do site; lista vazia é ausência válida.
 * @throws {Error} Se a resposta não for 2xx ou a página não tiver o contêiner de resultados.
 * @example
 * const cards = await searchCards('Swallowed Star');
 */
export async function searchCards(term) {
  const url = `${SITE_URL}/?s=${encodeURIComponent(term)}`;
  const html = await fetchText(url);
  return readSearchPage(html);
}

/**
 * Lê os cartões de uma página de busca.
 *
 * @param {string} html - HTML da busca.
 * @returns {SearchCard[]} Cartões encontrados.
 * @throws {Error} Se a página não tiver o contêiner `div.titleD`.
 */
export function readSearchPage(html) {
  const $ = loadHtml(html);
  if ($('div.titleD').length === 0) throw new Error('Busca sem o contêiner de resultados');

  const cards = [];
  const nodes = $('div.itemE.capa');
  for (let index = 0; index < nodes.length; index += 1) {
    const card = nodes.eq(index);
    const url = attrOf(card.find('a').eq(0), 'href');
    const title = textOf(card.find('h3').eq(0));
    if (url === null || title === '') continue;
    const type = attrOf(card.find('div.selos').eq(0), 'data-ona');
    cards.push({ url: absoluteUrl(url, SITE_URL), title, type: type === null ? '' : type });
  }
  return cards;
}

/**
 * Lê uma ficha de série, filme ou coleção.
 *
 * @param {string} html - HTML da ficha.
 * @param {string} pageUrl - URL da ficha, usada para resolver links relativos.
 * @returns {DetailPage} Dados publicados pela ficha.
 * @throws {Error} Se a página não tiver `h1`.
 */
export function readDetailPage(html, pageUrl) {
  const $ = loadHtml(html);
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error('Página sem h1');

  const info = readInfo($);
  return {
    url: pageUrl,
    title,
    alternativeTitles: splitAlternatives(info.alternative),
    year: readYear(info.year),
    type: info.type === undefined ? '' : info.type,
    episodeCount: readCount(info.episodes),
    episodes: readEpisodes($, pageUrl),
    players: readPlayers($, pageUrl),
  };
}

/**
 * Lê a lista `li` de informação da ficha, preservando a primeira ocorrência de cada campo.
 *
 * @param {*} $ - Instância do cheerio.
 * @returns {{ alternative?: string, year?: string, type?: string, episodes?: string }} Campos crus.
 */
function readInfo($) {
  const info = {};
  const items = $('li');
  for (let index = 0; index < items.length; index += 1) {
    const text = textOf(items.eq(index));
    const match = /^(Titulo Alternativo|Status|Ano|Tipo|Epis[oó]dios):\s*(.*)$/i.exec(text);
    if (match === null) continue;
    const field = match[1].toLowerCase();
    if (info[field] !== undefined) continue;
    info[field] = match[2].trim();
  }
  return {
    alternative: info['titulo alternativo'],
    year: info.ano,
    type: info.tipo,
    episodes: info['episódios'] === undefined ? info.episodios : info['episódios'],
  };
}

/**
 * Lê os itens de `div.episode_list`.
 *
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - URL da ficha.
 * @returns {EpisodeLink[]} Episódios publicados.
 */
function readEpisodes($, pageUrl) {
  const episodes = [];
  const items = $('div.episode_list div.item');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = attrOf(item.find('a').eq(0), 'href');
    if (href === null) continue;
    const label = textOf(item.find('span.episode').eq(0));
    episodes.push({
      url: absoluteUrl(href, pageUrl),
      number: readEpisodeNumber(label),
      label,
      range: /epis[oó]dios\s*\d+\s*[-–—]\s*\d+/i.test(label),
    });
  }
  return episodes;
}

/**
 * Lê os players de `div.slideItem`.
 *
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - URL da ficha.
 * @returns {PlayerLink[]} Players publicados.
 */
function readPlayers($, pageUrl) {
  const players = [];
  const items = $('div.slideItem');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = attrOf(item, 'data-video-url');
    if (href === null || href === '') continue;
    const label = textOf(item) || `Player ${index + 1}`;
    players.push({ url: absoluteUrl(href, pageUrl), label });
  }
  return players;
}

/**
 * Lê o número local do rótulo de episódio.
 *
 * `Episódio 19 (184)` e `Episódio 263 Final` valem 19 e 263; `Episódio Filme` vale `null`.
 *
 * @param {string} label - Texto de `span.episode`.
 * @returns {number|null} Número local ou `null`.
 */
export function readEpisodeNumber(label) {
  const match = /epis[oó]dios?\s*(?:n[º°o]?\s*)?(\d+)/i.exec(String(label));
  return match === null ? null : Number(match[1]);
}

/**
 * Divide a lista de títulos alternativos publicados em uma linha.
 *
 * @param {string|undefined} value - Texto de `Titulo Alternativo`.
 * @returns {string[]} Títulos aparados e sem vazios.
 */
function splitAlternatives(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

/**
 * Lê um ano de quatro dígitos no início do texto.
 *
 * @param {string|undefined} value - Valor do campo.
 * @returns {number|null} Ano ou `null`.
 */
function readYear(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})/.exec(value.trim());
  return match === null ? null : Number(match[1]);
}

/**
 * Lê a contagem de episódios quando o campo é numérico.
 *
 * @param {string|undefined} value - Valor do campo.
 * @returns {number|null} Contagem ou `null` em `Indefinido`, `Filme` ou vazio.
 */
function readCount(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)/.exec(value.trim());
  return match === null ? null : Number(match[1]);
}

/**
 * Resolve um link contra a URL da página.
 *
 * @param {string} href - Link absoluto, iniciado por `/` ou por `//`.
 * @param {string} base - URL da página.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o link não formar uma URL http(s).
 */
function absoluteUrl(href, base) {
  const value = href.startsWith('//') ? `https:${href}` : href;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error(`Link inválido na página: ${href}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Link fora de http(s) na página: ${href}`);
  }
  return url.href;
}

/**
 * Decodifica entidades HTML numéricas e nomeadas usadas pelo site.
 *
 * @param {string} value - Texto com entidades.
 * @returns {string} Texto decodificado.
 */
function decodeEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
