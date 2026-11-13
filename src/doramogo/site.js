/**
 * Leitura das páginas do Doramogo: cartões de busca, ficha, página de episódio e caminho HLS.
 *
 * O site não usa WordPress. A busca é textual e devolve cartões com o ID do TMDB no nome da imagem;
 * a ficha publica o rótulo `Áudio:` e a lista de episódios; a página do episódio publica
 * `var urlConfig` e `const FALLBACK_URL`, de onde saem o caminho e o host alternativo da mídia.
 *
 * O script da página é lido sobre a string HTML, porque o cheerio do NuvioTV não expõe `<script>`
 * de forma confiável. Nas demais leituras usa-se apenas a API básica do cheerio.
 */

import { extractScriptString } from '../_blocks/script-extract/index.mjs';

const SOURCE_URL = 'https://www.doramogo.net';
const SEARCH_MARKER = 'doramogo-search-results';
const DETAIL_MARKER = 'id="info_drama"';
const TMDB_POSTER_ID = /cdn\.doramogo\.net\/imagens\/(\d+)_/;
const EPISODE_COORDINATE = /temporada-(\d+)\/episodio-(\d+)/;
const AUDIO_LABEL = /<b[^>]*>\s*Áudio:\s*<\/b>\s*([^<]+)/i;
const VIDEO_URL_CONFIG = /var\s+urlConfig\s*=\s*\{([\s\S]*?)\}\s*;/;
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {object} SearchCard
 * @property {string} title - Título exibido no cartão.
 * @property {string} type - Tipo exibido: `Filme` ou `Dorama`.
 * @property {string} url - Endereço absoluto da ficha.
 * @property {string|null} tmdbId - ID do TMDB lido do pôster; `null` quando a imagem não o traz.
 */

/**
 * @typedef {object} EpisodeLink
 * @property {number} season - Temporada a partir de 1.
 * @property {number} episode - Episódio a partir de 1.
 * @property {string} url - Endereço absoluto da página do episódio.
 */

/**
 * @typedef {object} DetailPage
 * @property {string} title - Título principal da ficha.
 * @property {string} posterUrl - URL do pôster principal.
 * @property {string|null} tmdbId - ID do TMDB lido do pôster principal.
 * @property {string|null} audioLabel - Valor do rótulo `Áudio:`; `null` quando ausente.
 * @property {EpisodeLink[]} episodes - Episódios listados, em qualquer temporada.
 */

/**
 * @typedef {object} EpisodeConfig
 * @property {string} slug - Slug publicado no `urlConfig`.
 * @property {'doramas'|'filmes'} tipo - Tipo publicado no `urlConfig`.
 * @property {number} season - Temporada publicada no `urlConfig`.
 * @property {number} episode - Episódio publicado no `urlConfig`.
 * @property {string} fallbackUrl - Host alternativo publicado em `FALLBACK_URL`.
 */

/**
 * Lê os cartões da página de busca.
 * @param {string} html - HTML da página de busca.
 * @param {string} baseUrl - Origem do site, usada para resolver links relativos.
 * @returns {SearchCard[]} Cartões na ordem da página.
 * @throws {Error} Se a página não for a busca esperada ou um cartão não tiver título, tipo ou link.
 */
export function readSearchCards(html, baseUrl) {
  if (typeof html !== 'string' || !html.includes(SEARCH_MARKER)) {
    throw new Error('Página de busca do Doramogo sem a lista de resultados');
  }
  const $ = loadHtml(html);
  const cards = [];
  const cardsSelector = $('.doramogo-search-result-card');
  for (let index = 0; index < cardsSelector.length; index += 1) {
    const card = cardsSelector.eq(index);
    const title = card.find('#doramogo-search-result-title').text().trim();
    const type = card.find('#doramogo-search-result-type').text().trim();
    const href = card.find('a[href]').eq(0).attr('href');
    const posterUrl = card.find('img').eq(0).attr('src');
    if (title === '') throw new Error(`Cartão ${index + 1} da busca sem título`);
    if (type === '') throw new Error(`Cartão ${index + 1} da busca sem tipo`);
    if (!href) throw new Error(`Cartão ${index + 1} da busca sem link`);
    cards.push({
      title,
      type,
      url: new URL(href, baseUrl).href,
      tmdbId: readPosterId(posterUrl),
    });
  }
  return cards;
}

/**
 * Lê a ficha de uma série ou de um filme.
 * @param {string} html - HTML da ficha.
 * @returns {DetailPage} Dados usados na confirmação, na seleção e no idioma.
 * @throws {Error} Se a página não for uma ficha ou não tiver título, pôster ou lista de episódios válida.
 */
export function readDetailPage(html) {
  if (typeof html !== 'string' || !html.includes(DETAIL_MARKER)) {
    throw new Error('Ficha do Doramogo sem #info_drama');
  }
  const $ = loadHtml(html);
  const title = $('#info_drama h1').eq(0).text().trim();
  const posterUrl = $('#info_drama .thumbnail img').eq(0).attr('src');
  if (title === '') throw new Error('Ficha do Doramogo sem título');
  if (!posterUrl) throw new Error('Ficha do Doramogo sem pôster principal');
  return {
    title,
    posterUrl,
    tmdbId: readPosterId(posterUrl),
    audioLabel: readAudioLabel(html),
    episodes: readEpisodeLinks($),
  };
}

/**
 * Lê `urlConfig` e `FALLBACK_URL` da página do episódio.
 * @param {string} html - HTML da página do episódio.
 * @returns {EpisodeConfig} Configuração publicada pela página.
 * @throws {Error} Se a página não for de episódio, se faltar configuração ou se um campo for inválido.
 */
export function readEpisodeConfig(html) {
  if (typeof html !== 'string' || !html.includes(DETAIL_MARKER)) {
    throw new Error('Página do episódio inválida (sem #info_drama)');
  }
  const config = VIDEO_URL_CONFIG.exec(html);
  if (!config) throw new Error('Página do episódio sem urlConfig');
  const body = config[1];
  const slug = readConfigString(body, 'slug');
  const tipo = readConfigString(body, 'tipo');
  if (tipo !== 'doramas' && tipo !== 'filmes') {
    throw new Error(`urlConfig com tipo desconhecido: "${tipo}" (esperado "doramas" ou "filmes")`);
  }
  const fallbackUrl = extractScriptString(html, 'FALLBACK_URL');
  if (fallbackUrl === null) throw new Error('Página do episódio sem FALLBACK_URL');
  assertHttpUrl(fallbackUrl, 'FALLBACK_URL');
  return {
    slug,
    tipo,
    season: readConfigNumber(body, 'temporada'),
    episode: readConfigNumber(body, 'episodio'),
    fallbackUrl,
  };
}

/**
 * Monta a URL HLS publicada pela página do episódio.
 * @param {EpisodeConfig} config - Configuração lida da página; o `fallbackUrl` vira o host.
 * @returns {string} URL HLS do host alternativo publicado.
 * @throws {Error} Se o tipo for desconhecido ou se o host não for uma URL http(s).
 */
export function buildHlsUrl(config) {
  assertHttpUrl(config.fallbackUrl, 'FALLBACK_URL');
  if (config.tipo !== 'doramas' && config.tipo !== 'filmes') {
    throw new Error(`tipo desconhecido no urlConfig: "${config.tipo}" (esperado "doramas" ou "filmes")`);
  }
  const host = config.fallbackUrl.replace(/\/+$/, '');
  const letter = config.slug.charAt(0).toUpperCase();
  if (config.tipo === 'filmes') return `${host}/${letter}/${config.slug}/stream/stream.m3u8`;
  return `${host}/${letter}/${config.slug}/${pad2(config.season)}-temporada/${pad2(config.episode)}/stream.m3u8`;
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

/**
 * Extrai o ID do TMDB do nome do arquivo da imagem.
 * @param {string|undefined} posterUrl - URL do pôster.
 * @returns {string|null} ID numérico ou `null` quando a imagem não o traz.
 */
function readPosterId(posterUrl) {
  if (typeof posterUrl !== 'string') return null;
  const match = TMDB_POSTER_ID.exec(posterUrl);
  return match ? match[1] : null;
}

/**
 * Lê o valor do rótulo `Áudio:` da ficha.
 * @param {string} html - HTML da ficha.
 * @returns {string|null} Valor do rótulo ou `null` quando ausente.
 */
function readAudioLabel(html) {
  const match = AUDIO_LABEL.exec(html);
  return match ? match[1].trim() : null;
}

/**
 * Lê todos os links de episódio da ficha, em qualquer temporada.
 * @param {*} $ - Instância do cheerio.
 * @returns {EpisodeLink[]} Links com temporada e episódio.
 * @throws {Error} Se um link de episódio não tiver coordenada válida.
 */
function readEpisodeLinks($) {
  const links = [];
  const items = $('a.dorama-one-episode-item');
  for (let index = 0; index < items.length; index += 1) {
    const href = items.eq(index).attr('href');
    if (!href) throw new Error(`Link de episódio ${index + 1} sem href na ficha`);
    const match = EPISODE_COORDINATE.exec(href);
    if (!match) throw new Error(`Link de episódio sem coordenada na ficha: "${href}"`);
    links.push({
      season: Number(match[1]),
      episode: Number(match[2]),
      url: new URL(href, SOURCE_URL).href,
    });
  }
  return links;
}

/**
 * Lê uma string do corpo do `urlConfig`.
 * @param {string} body - Conteúdo entre as chaves do `urlConfig`.
 * @param {string} key - Nome do campo.
 * @returns {string} Valor não vazio.
 * @throws {Error} Se o campo não existir ou estiver vazio.
 */
function readConfigString(body, key) {
  const pattern = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*"([^"]*)"`);
  const match = pattern.exec(body);
  if (!match || match[1].trim() === '') throw new Error(`urlConfig sem "${key}"`);
  return match[1].trim();
}

/**
 * Lê um inteiro do corpo do `urlConfig`.
 * @param {string} body - Conteúdo entre as chaves do `urlConfig`.
 * @param {string} key - Nome do campo.
 * @returns {number} Inteiro maior ou igual a 1.
 * @throws {Error} Se o campo não existir ou não for inteiro positivo.
 */
function readConfigNumber(body, key) {
  const pattern = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*(\\d+)`);
  const match = pattern.exec(body);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(value) || value < 1) throw new Error(`urlConfig sem "${key}" positivo`);
  return value;
}

/**
 * Formata um número com pelo menos dois dígitos.
 * @param {number} value - Temporada ou episódio.
 * @returns {string}
 */
function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Exige uma URL http(s).
 * @param {string} value - URL recebida.
 * @param {string} label - Nome do campo na mensagem de erro.
 * @returns {void}
 * @throws {Error} Se a URL for inválida ou não usar http(s).
 */
function assertHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} inválida: "${value}"`);
  }
  if (!HTTP_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(`${label} deve usar http ou https: "${value}"`);
  }
}
