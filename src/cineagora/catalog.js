/**
 * Busca e confirmação de identidade nos catálogos da rede BrStream.
 *
 * Cada catálogo roda isolado: a busca consulta IMDb, título PT-BR e título original, abre no
 * máximo três candidatos por termo e confirma a identidade na página. A falha de um catálogo é
 * devolvida separada para o `index.js` decidir entre aviso e erro agregado.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { bestTitleScore, CATALOGS } from './catalogs.js';

const MAX_CANDIDATES = 3;

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
 * @property {object} catalog - Catálogo de origem, com o seletor de espelhos.
 * @property {string} title - Título lido na página.
 * @property {number} year - Ano confirmado.
 * @property {string|null} imdbId - IMDb publicado, quando houver.
 */

/**
 * @typedef {object} CatalogFailure
 * @property {object} catalog - Catálogo que falhou.
 * @property {Error} error - Causa da falha.
 */

/**
 * Localiza os títulos em todos os catálogos configurados.
 *
 * As buscas rodam em paralelo, com cada promessa convertida em resultado ou falha antes de
 * `Promise.all`. O retorno preserva a ordem de `CATALOGS`, que é a ordem da deduplicação.
 *
 * @param {ContentRequest} request - Pedido validado recebido pelo provedor.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<{ confirmed: { catalog: object, content: ContentPage }[], failures: CatalogFailure[] }>}
 *   Catálogos confirmados e falhas isoladas.
 * @example
 * const found = await findContent(request, media);
 * // { confirmed: [{ catalog, content }], failures: [] }
 */
export async function findContent(request, media) {
  const settled = await Promise.all(CATALOGS.map((catalog) => searchCatalog(catalog, request, media).then(
    (value) => ({ ok: true, catalog, value }),
    (error) => ({ ok: false, catalog, error }),
  )));
  const confirmed = [];
  const failures = [];
  for (const entry of settled) {
    if (!entry.ok) {
      failures.push({ catalog: entry.catalog, error: entry.error });
      continue;
    }
    if (entry.value !== null) confirmed.push({ catalog: entry.catalog, content: entry.value });
  }
  return { confirmed, failures };
}

/**
 * Busca e confirma um título em um catálogo.
 *
 * @param {object} catalog - Configuração do catálogo.
 * @param {ContentRequest} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<ContentPage|null>} Página confirmada ou null em ausência/ambiguidade.
 * @throws {Error} Em falha de rede, HTTP ou estrutura daquele catálogo.
 */
async function searchCatalog(catalog, request, media) {
  const queries = uniqueQueries([media.imdbId, media.title, media.originalTitle]);
  for (const query of queries) {
    const search = await fetchPage(`${catalog.searchUrl}${encodeURIComponent(query)}`, {
      headers: catalog.pageHeaders,
    });
    const $ = getCheerio().load(search.text);
    const results = catalog.parseResults($, search.url, catalog)
      .filter((result) => belongsToSection(result.url, request.mediaType, catalog));
    const candidates = uniqueByUrl(results)
      .map((result, index) => ({ result, index, score: bestTitleScore(result.titles, media) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_CANDIDATES);
    const confirmed = [];
    for (const entry of candidates) {
      const page = await fetchPage(entry.result.url, { headers: catalog.pageHeaders });
      if (!belongsToSection(page.url, request.mediaType, catalog)) continue;
      const page$ = getCheerio().load(page.text);
      const identity = catalog.readIdentity(page$, page.text, page.url, entry.result);
      if (!catalog.matchesIdentity(identity, media)) continue;
      confirmed.push({
        url: page.url,
        html: page.text,
        catalog,
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
 * Verifica se a URL pertence ao host e à seção do tipo pedido.
 *
 * @param {string} url - URL da página.
 * @param {'movie'|'tv'} mediaType - Tipo de mídia pedido.
 * @param {object} catalog - Configuração do catálogo.
 * @returns {boolean} True quando o caminho está na seção correta.
 */
function belongsToSection(url, mediaType, catalog) {
  const parsed = new URL(url);
  return catalog.hosts.includes(parsed.hostname)
    && parsed.pathname.startsWith(catalog.sections[mediaType]);
}

/**
 * Remove consultas vazias e repetidas, preservando a ordem IMDb, título PT-BR e original.
 *
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
 * Remove resultados repetidos pela URL, mantendo a primeira ocorrência.
 *
 * @param {{ url: string }[]} results - Resultados na ordem da página.
 * @returns {{ url: string }[]} Resultados únicos.
 */
function uniqueByUrl(results) {
  const seen = new Set();
  const unique = [];
  for (const result of results) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    unique.push(result);
  }
  return unique;
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
