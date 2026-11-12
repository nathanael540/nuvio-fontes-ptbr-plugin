/**
 * Catálogo DLE do CineAgora: busca por IMDb ou título e confirmação de identidade na página.
 *
 * A busca usa `index.php?do=search&subaction=search&story=<consulta>` e lê os cartões `a.item`
 * da primeira página. O candidato só é aceito quando o caminho pertence à seção do tipo pedido,
 * o título da página bate com o TMDB, o ano confere e o IMDb confere quando conhecido.
 */

import { fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

const SOURCE_URL = 'https://cineagora.club';
const SOURCE_HOSTS = new Set(['cineagora.club', 'www.cineagora.club']);
const SEARCH_URL = `${SOURCE_URL}/index.php?do=search&subaction=search&story=`;
const SECTIONS = Object.freeze({
  movie: '/filmes-hd-online/',
  tv: '/series-online-hd-gratis/',
});
const MIN_TITLE_SCORE = 0.85;
const MAX_CANDIDATES = 3;
const NO_RESULTS = /site search yielded no results/i;

/**
 * @typedef {object} ContentRequest
 * @property {string} tmdbId - ID do TMDB já validado.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia pedido.
 * @property {number|null} season - Temporada; null em filmes.
 * @property {number|null} episode - Episódio; null em filmes.
 */

/**
 * @typedef {object} ContentPage
 * @property {string} url - URL final da página confirmada.
 * @property {string} html - HTML da página confirmada.
 * @property {string} title - Título lido na página.
 * @property {number} year - Ano lido na página.
 * @property {string|null} imdbId - IMDb lido na página, quando houver.
 */

/**
 * Localiza a página do título no catálogo.
 *
 * Consulta o IMDb, depois o título PT-BR e o título original, parando no primeiro candidato
 * confirmado. Mais de um candidato confirmado na mesma consulta é ausência por ambiguidade.
 *
 * @param {ContentRequest} request - Pedido validado recebido pelo provedor.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<ContentPage|null>} Página confirmada ou null quando o título não está no catálogo.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx ou página de resultado/candidato ilegível.
 */
export async function findContent(request, media) {
  const queries = uniqueQueries([media.imdbId, media.title, media.originalTitle]);
  for (const query of queries) {
    const searchHtml = await fetchText(`${SEARCH_URL}${encodeURIComponent(query)}`);
    const candidates = parseSearchResults(searchHtml, request.mediaType);
    const ranked = rankCandidates(candidates, media).slice(0, MAX_CANDIDATES);
    const confirmed = [];
    for (const candidate of ranked) {
      const page = await fetchPage(candidate.url);
      if (!belongsToSection(page.url, request.mediaType)) continue;
      const identity = readIdentity(page.text, page.url);
      if (!matchesIdentity(identity, media)) continue;
      confirmed.push({
        url: page.url,
        html: page.text,
        title: identity.title,
        year: identity.year,
        imdbId: identity.imdbId,
      });
    }
    if (confirmed.length > 1) return null;
    if (confirmed.length === 1) return confirmed[0];
  }
  return null;
}

/**
 * Remove consultas vazias e repetidas, preservando a ordem IMDb, título PT-BR e título original.
 * @param {(string|null|undefined)[]} values - Valores candidatos.
 * @returns {string[]} Consultas únicas e não vazias.
 */
function uniqueQueries(values) {
  const queries = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const query = value.trim();
    if (query === '') continue;
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

/**
 * Lê os cartões `a.item` da busca, filtrando o host e a seção do tipo pedido.
 *
 * Lista vazia só é ausência quando a página traz a mensagem explícita de busca sem resultados;
 * caso contrário, o layout mudou e o erro sobe.
 *
 * @param {string} html - HTML da busca.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia pedido.
 * @returns {{ title: string, url: string }[]} Resultados na ordem da página.
 * @throws {Error} Se um cartão não tiver href/título ou se nem cartões nem mensagem de ausência existirem.
 */
function parseSearchResults(html, mediaType) {
  const $ = getCheerio().load(html);
  const items = $('a.item');
  if (items.length === 0) {
    if (NO_RESULTS.test(html)) return [];
    throw new Error('Busca sem cartões nem mensagem explícita de ausência');
  }
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = item.attr('href');
    const title = item.attr('data-title');
    if (!href || typeof title !== 'string' || title.trim() === '') {
      throw new Error(`Resultado ${index + 1} da busca sem href ou data-title`);
    }
    const url = new URL(href, SOURCE_URL);
    if (!SOURCE_HOSTS.has(url.hostname)) continue;
    if (!url.pathname.startsWith(SECTIONS[mediaType])) continue;
    results.push({ title: title.trim(), url: url.href });
  }
  return results;
}

/**
 * Ordena candidatos por semelhança com os títulos do TMDB antes de abrir no máximo três páginas.
 *
 * A nota do cartão de busca é só uma pré-seleção: o título em português do cartão pode não bater
 * com o título original usado na consulta, e a confirmação real acontece em `h1.title` com
 * `matchesIdentity`. Por isso nenhum candidato é descartado só pela nota do cartão.
 *
 * @param {{ title: string, url: string }[]} candidates - Resultados da busca.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {{ title: string, url: string }[]} Candidatos do mais parecido ao menos parecido.
 */
function rankCandidates(candidates, media) {
  const titles = mediaTitles(media);
  return candidates
    .map((candidate, index) => ({ candidate, index, score: bestScore(candidate.title, titles) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}

/**
 * Lê título, ano e IMDb da página do candidato.
 * @param {string} html - HTML da página.
 * @param {string} url - URL da página, usada nas mensagens de erro.
 * @returns {{ title: string, year: number, imdbId: string|null }} Identidade lida.
 * @throws {Error} Se a página não trouxer `h1.title` ou o ano em `span.date a`.
 */
function readIdentity(html, url) {
  const $ = getCheerio().load(html);
  const title = $('h1.title').eq(0).text().trim();
  if (title === '') throw new Error(`Página ${url} sem h1.title`);
  const yearText = $('span.date a').eq(0).text().trim();
  if (!/^\d{4}$/.test(yearText)) throw new Error(`Página ${url} sem ano em span.date`);
  const imdbHref = $('div.imdb a').eq(0).attr('href') || '';
  const imdb = /tt\d{5,}/.exec(imdbHref);
  return { title, year: Number(yearText), imdbId: imdb ? imdb[0] : null };
}

/**
 * Confere a identidade lida na página com o título do TMDB.
 *
 * Ano e IMDb são comparados só quando o TMDB os conhece. Quando o TMDB conhece o IMDb, a página
 * precisa publicá-lo igual; ausência de IMDb na página descarta o candidato.
 *
 * @param {{ title: string, year: number, imdbId: string|null }} identity - Identidade da página.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} True quando o candidato pode ser aceito.
 */
function matchesIdentity(identity, media) {
  if (media.year !== null && identity.year !== media.year) return false;
  if (media.imdbId !== null && identity.imdbId !== media.imdbId) return false;
  return bestScore(identity.title, mediaTitles(media)) >= MIN_TITLE_SCORE;
}

/**
 * Verifica se a URL pertence à seção do tipo pedido.
 * @param {string} url - URL da página.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia pedido.
 * @returns {boolean} True quando o caminho está na seção correta.
 */
function belongsToSection(url, mediaType) {
  const parsed = new URL(url);
  return SOURCE_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith(SECTIONS[mediaType]);
}

/**
 * Títulos do TMDB usados na comparação.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos.
 */
function mediaTitles(media) {
  return [media.title, media.originalTitle, ...media.alternativeTitles];
}

/**
 * Maior semelhança entre um título e os títulos do TMDB.
 * @param {string} title - Título a comparar.
 * @param {string[]} titles - Títulos de referência.
 * @returns {number} Similaridade entre 0 e 1.
 */
function bestScore(title, titles) {
  return Math.max(...titles.map((reference) => titleSimilarity(title, reference)));
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
