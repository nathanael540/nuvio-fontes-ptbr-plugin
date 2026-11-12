/** Catálogo WordPress da VaqueiroFilmes: busca, confirmação de identidade e início da cadeia. */
import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  decodeEntities,
  isConfirmed,
  rankCandidates,
  readMovieIdentity,
} from './identity.js';
import { resolveStreams } from './players.js';

export const SOURCE_URL = 'https://vaqueirofilmes.com';
const SEARCH_PATH = '/wp-json/wp/v2/search';
const PAGE_SIZE = 20;
const MAX_PAGES = 2;

/**
 * Localiza o filme pedido no catálogo e resolve as opções de player até os streams.
 * @param {{ tmdbId: string, mediaType: 'movie', season: number|null, episode: number|null }} request - Pedido do app.
 * @param {string} providerName - Nome exibido pelo formatador.
 * @returns {Promise<object[]>} Streams; vazio quando o filme ou a opção EmbedPlay não existe.
 * @throws {Error} Em falha de rede, parsing, identidade ambígua ou opção de player que falhou.
 */
export async function extractStreams(request, providerName) {
  const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: 'movie' });
  const movie = await findMovie(media);
  if (movie === null) return [];
  const result = await resolveStreams(media, movie.url, providerName);
  if (!result.streams.length && result.failures.length) {
    throw new Error(result.failures.join('; '));
  }
  return result.streams;
}

/**
 * Procura o filme pelo título PT-BR e, se nenhum candidato for confirmado, pelo título original.
 * @param {object} media - Dados do TMDB.
 * @returns {Promise<{ url: string, title: string }|null>} Página confirmada ou `null` em ausência/ambiguidade.
 * @throws {Error} Em erro HTTP, JSON inválido ou página de candidato sem JSON-LD.
 */
async function findMovie(media) {
  const queries = [media.title, media.originalTitle];
  const seen = new Set();
  for (const query of queries) {
    const key = normalizeText(query);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    const results = await search(query);
    const confirmed = [];
    for (const candidate of rankCandidates(results, media)) {
      const page = await fetchPage(candidate.url, { headers: { Referer: `${SOURCE_URL}/` } });
      const identity = readMovieIdentity(page.text, page.url);
      if (isConfirmed(identity, media)) confirmed.push({ url: page.url, title: candidate.title });
    }
    if (confirmed.length === 1) return confirmed[0];
    if (confirmed.length > 1) return null;
  }
  return null;
}

/**
 * Consulta a REST de busca do WordPress, em até duas páginas de 20 resultados.
 * @param {string} query - Título consultado.
 * @returns {Promise<Array<{ title: string, url: string, year: number|null }>>} Resultados do tipo filme.
 * @throws {Error} Se a resposta não for uma lista válida.
 */
async function search(query) {
  const results = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const queryString = new URLSearchParams({
      search: query,
      subtype: 'movie',
      per_page: String(PAGE_SIZE),
      page: String(page),
      _fields: 'id,title,url,subtype,type',
    });
    const data = await fetchJson(`${SOURCE_URL}${SEARCH_PATH}?${queryString}`, {
      profile: 'api',
      headers: { Referer: `${SOURCE_URL}/` },
    });
    if (!Array.isArray(data)) throw new Error('Busca do WordPress sem lista de resultados');
    for (const item of data) {
      const result = readSearchItem(item);
      if (result !== null) results.push(result);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return dedupe(results);
}

/**
 * Lê e valida um resultado da busca.
 * @param {*} item - Item da resposta JSON.
 * @returns {{ title: string, url: string, year: number|null }|null} Resultado normalizado ou `null` para outro subtipo.
 * @throws {Error} Se um resultado de filme não tiver título ou endereço válido.
 */
function readSearchItem(item) {
  if (item === null || typeof item !== 'object') throw new Error('Resultado de busca inválido');
  if (item.subtype !== 'movie') return null;
  if (typeof item.title !== 'string' || item.title.trim() === '') throw new Error('Resultado de busca sem título');
  if (typeof item.url !== 'string' || item.url.trim() === '') throw new Error('Resultado de busca sem endereço');
  const title = decodeEntities(item.title.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const url = new URL(item.url, SOURCE_URL).href;
  const year = readYear(title);
  return { title: stripYear(title), url, year };
}

/**
 * Remove endereços repetidos.
 * @param {Array<{ title: string, url: string, year: number|null }>} results - Resultados lidos.
 * @returns {Array<{ title: string, url: string, year: number|null }>}
 */
function dedupe(results) {
  const seen = new Set();
  const kept = [];
  for (const item of results) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    kept.push(item);
  }
  return kept;
}

/**
 * Ano entre parênteses no título do resultado, quando houver.
 * @param {string} title - Título recebido.
 * @returns {number|null}
 */
function readYear(title) {
  const match = /\b(?:19|20)\d{2}\b/.exec(title);
  return match ? Number(match[0]) : null;
}

/**
 * Remove o ano entre parênteses do título exibido.
 * @param {string} title - Título recebido.
 * @returns {string}
 */
function stripYear(title) {
  return title.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim();
}
