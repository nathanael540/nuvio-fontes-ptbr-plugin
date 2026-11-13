/**
 * Catálogo do Primeflix: busca pública, confirmação da ficha e identificação do tipo.
 *
 * Fluxo observado em 12/11/2026:
 * 1. `GET /live-search?q=<termo>` devolve JSON com `title` e `link`, ou `null` sem resultados.
 * 2. `GET /search?q=<termo>` devolve cartões `.grid-item.l2` com o mesmo `link` em `/movie/<slug>`.
 * 3. A ficha `/movie/<slug>` traz `<title><título> - Primeflix</title>`, `Year:` e o player Playerjs
 *    com `v_id`; série lista pares `season=<s>&episode=<e>` e `playlist`, filme tem um `file` único.
 *
 * A busca não informa ano nem tipo; cada candidato é confirmado na ficha antes de virar stream.
 */

import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';

export const SOURCE_URL = 'https://primeflix.sh';
export const SOURCE_ORIGIN = 'https://primeflix.sh';
const MAX_DETAILS_PER_TERM = 5;
const MOVIE_PATH = '/movie/';
const YEAR_LABEL = /\bYear:\s*(\d{4})/;
const PLAYER_BLOCK = /<div id="player">([\s\S]*?)<\/div>/;
const V_ID = /\bv_id\s*=\s*(\d+)/;
const EPISODE_PAIR = /\bseason=(\d+)&episode=(\d+)/g;
const SERIES_MARKER = /\bplaylist\b|Temporada\s+\d+/i;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada, ignorada em filmes.
 * @property {number|null} episode - Episódio, ignorado em filmes.
 */

/**
 * @typedef {object} SearchResult
 * @property {string} title - Título exibido no resultado.
 * @property {string} url - Endereço absoluto da ficha.
 */

/**
 * @typedef {object} Detail
 * @property {string} title - Título exibido na ficha.
 * @property {number} year - Primeiro ano de quatro dígitos do rótulo `Year:`.
 * @property {string} vId - ID do player Playerjs.
 * @property {'movie'|'tv'} type - Tipo confirmado pelo player.
 * @property {Set<string>} episodes - Pares `temporada:episódio` anunciados na ficha.
 * @property {string} url - Endereço da ficha, usado como `Referer`.
 */

/**
 * Localiza a ficha confirmada para o pedido do app.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Promise<{ media: MediaInfo, detail: Detail }|null>} Ficha confirmada ou null em ausência.
 * @throws {Error} Em falha de rede, busca inválida ou layout alterado.
 */
export async function findCandidate(request) {
  const media = await getMediaInfo(request);
  for (const term of searchTerms(media)) {
    const jsonResults = await searchJson(term);
    const fromJson = await confirmCandidates(jsonResults, media, request.mediaType);
    if (fromJson !== null) return { media, detail: fromJson };

    const htmlResults = await searchHtml(term);
    const fromHtml = await confirmCandidates(htmlResults, media, request.mediaType);
    if (fromHtml !== null) return { media, detail: fromHtml };
  }
  return null;
}

/**
 * Títulos do TMDB a tentar, na ordem: PT-BR, original e alternativos, sem repetição.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos de busca não vazios.
 */
function searchTerms(media) {
  const terms = [media.title, media.originalTitle].concat(media.alternativeTitles);
  const seen = new Set();
  const result = [];
  for (const term of terms) {
    const text = typeof term === 'string' ? term.trim() : '';
    const key = text.toLowerCase();
    if (text === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * Consulta a busca JSON da fonte.
 * @param {string} term - Título a pesquisar.
 * @returns {Promise<SearchResult[]>} Resultados na ordem da fonte; vazio quando a resposta é null.
 * @throws {Error} Se a resposta não for uma lista de `{ title, link }` válidos.
 */
async function searchJson(term) {
  const query = new URLSearchParams({ q: term });
  const data = await fetchJson(`${SOURCE_URL}/live-search?${query}`, { profile: 'api' });
  if (data === null) return [];
  if (!Array.isArray(data)) {
    throw new Error('Busca JSON do Primeflix não devolveu lista nem null');
  }
  return data.map((item, index) => {
    if (item === null || typeof item !== 'object' || typeof item.title !== 'string' || typeof item.link !== 'string') {
      throw new Error(`Busca JSON do Primeflix com item ${index + 1} inválido`);
    }
    const title = item.title.trim();
    if (title === '') throw new Error(`Busca JSON do Primeflix com item ${index + 1} sem título`);
    return { title, url: movieUrl(item.link, `item ${index + 1} da busca JSON`) };
  });
}

/**
 * Consulta a página HTML de busca, usada quando o JSON não confirma candidato.
 * @param {string} term - Título a pesquisar.
 * @returns {Promise<SearchResult[]>} Cartões na ordem da página; vazio sem cartões.
 * @throws {Error} Se a página não tiver o contêiner de resultados ou um cartão estiver incompleto.
 */
async function searchHtml(term) {
  const query = new URLSearchParams({ q: term });
  const html = await fetchText(`${SOURCE_URL}/search?${query}`, { profile: 'page' });
  const $ = loadHtml(html);
  if (!$('.generic-grid').length) {
    throw new Error('Busca HTML do Primeflix sem o contêiner .generic-grid');
  }
  const cards = $('.grid-item.l2');
  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const anchor = card.find('a').eq(0);
    const href = anchor.attr('href');
    if (typeof href !== 'string' || href.trim() === '') {
      throw new Error(`Cartão ${index + 1} da busca HTML sem link`);
    }
    const title = (anchor.attr('title') || card.find('.item-title').text()).trim();
    if (title === '') throw new Error(`Cartão ${index + 1} da busca HTML sem título`);
    results.push({ title, url: movieUrl(href, `cartão ${index + 1} da busca HTML`) });
  }
  return results;
}

/**
 * Abre até cinco fichas, descarta 404 e tipo incompatível e escolhe pelo título/ano do TMDB.
 * @param {SearchResult[]} results - Resultados da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {Promise<Detail|null>} Ficha escolhida ou null sem candidato confirmável.
 * @throws {Error} Se uma ficha 200 tiver layout incompleto ou a rede falhar fora do 404.
 */
async function confirmCandidates(results, media, mediaType) {
  const candidates = [];
  for (const result of results.slice(0, MAX_DETAILS_PER_TERM)) {
    const detail = await readDetail(result.url);
    if (detail === null || detail.type !== mediaType) continue;
    candidates.push({ title: detail.title, year: detail.year, detail });
  }
  if (candidates.length === 0) return null;
  const match = findBestMatch(candidates, media);
  return match === null ? null : match.candidate.detail;
}

/**
 * Lê uma ficha; 404 é candidato removido e vira ausência.
 * @param {string} url - Endereço da ficha.
 * @returns {Promise<Detail|null>} Ficha interpretada ou null em 404.
 * @throws {Error} Em falha de rede ou layout alterado.
 */
async function readDetail(url) {
  let html;
  try {
    html = await fetchText(url, { profile: 'page' });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return null;
    throw error;
  }
  return parseDetail(html, url);
}

/**
 * Interpreta título, ano, `v_id`, tipo e pares de episódios da ficha.
 * @param {string} html - HTML da ficha.
 * @param {string} url - Endereço da ficha.
 * @returns {Detail} Dados confirmados.
 * @throws {Error} Se o título, o ano, o player ou o `v_id` faltarem.
 */
function parseDetail(html, url) {
  const $ = loadHtml(html);
  const pageTitle = $('title').text().trim();
  const titleMatch = /^(.*?)\s+-\s+Primeflix$/.exec(pageTitle);
  if (titleMatch === null || titleMatch[1].trim() === '') {
    throw new Error(`Ficha ${url} sem título no formato "<título> - Primeflix"`);
  }
  const meta = $('p.meta').text();
  const yearMatch = YEAR_LABEL.exec(meta);
  if (yearMatch === null) throw new Error(`Ficha ${url} sem Year: de quatro dígitos`);
  const playerMatch = PLAYER_BLOCK.exec(html);
  if (playerMatch === null) throw new Error(`Ficha ${url} sem o player #player`);
  const player = playerMatch[1];
  const vIdMatch = V_ID.exec(player);
  if (vIdMatch === null) throw new Error(`Ficha ${url} sem v_id no player`);

  const episodes = new Set();
  const pair = new RegExp(EPISODE_PAIR.source, 'g');
  let match;
  while ((match = pair.exec(player)) !== null) {
    episodes.add(`${Number(match[1])}:${Number(match[2])}`);
  }
  const isSeries = episodes.size > 0 || SERIES_MARKER.test(player);

  return {
    title: titleMatch[1].trim(),
    year: Number(yearMatch[1]),
    vId: vIdMatch[1],
    type: isSeries ? 'tv' : 'movie',
    episodes,
    url,
  };
}

/**
 * Resolve um link de resultado contra a origem e exige a rota `/movie/`.
 * @param {string} href - Link relativo ou absoluto.
 * @param {string} origin - Origem para a mensagem de erro.
 * @returns {string} URL absoluta da ficha.
 * @throws {Error} Se o link sair de HTTP(S) ou da rota `/movie/` da fonte.
 */
function movieUrl(href, origin) {
  let url;
  try {
    url = new URL(href, SOURCE_URL);
  } catch {
    throw new Error(`Link inválido no ${origin}`);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== SOURCE_ORIGIN || !url.pathname.startsWith(MOVIE_PATH)) {
    throw new Error(`Link fora de /movie/ no domínio da fonte em ${origin}`);
  }
  return url.href;
}

/**
 * Carrega o cheerio durante o pedido, como exige o runtime do app.
 * @param {string} html - HTML a interpretar.
 * @returns {*} Função `$` do cheerio.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
