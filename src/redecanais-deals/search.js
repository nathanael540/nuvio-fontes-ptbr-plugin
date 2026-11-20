/**
 * Busca e confirmação de identidade no catálogo `redecanais.deals`.
 *
 * A busca é `GET /search.php?keywords=<termo>` em página única. A lista publica
 * `Título - AAAA - Qualidade (Dublado)` (filme) ou `Título (Dublado)` (série), seguida de um link
 * `Acessar`. A rota separa filme de série; o `vid` do player confirma o TMDB (ver `player.js`).
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { UNKNOWN_QUALITY, discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';

/** Base única do catálogo. Domínios vizinhos têm contrato próprio e não são fallback (design D11). */
export const SOURCE_URL = 'https://redecanais.deals';

const SEARCH_TITLE = 'Buscar Conteúdo RedeCanais:';
const NO_RESULTS = 'Nenhum conteúdo encontrado.';
const MAX_TERMS = 8;
const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const SERIES_ROUTE = /-lista-de-episodios_/i;
const AUDIO_LABEL = /\((?:dublado e legendado|dublado|legendado|nacional)\)/i;
const YEAR_PART = /^\d{4}$/;

/**
 * @typedef {object} SourceLabel
 * @property {string} title - Título sem ano, qualidade nem rótulo de áudio.
 * @property {number|null} year - Ano de quatro dígitos ou null quando ausente.
 * @property {string|null} quality - Qualidade publicada, sem normalização.
 * @property {string|null} audio - Rótulo de áudio publicado (ex.: "Dublado").
 */

/**
 * @typedef {object} SearchCard
 * @property {string} title - Título limpo do cartão.
 * @property {number|null} year - Ano do cartão.
 * @property {string|null} quality - Qualidade do cartão, sem normalização.
 * @property {string} url - URL absoluta da ficha.
 * @property {'movie'|'tv'} type - Tipo derivado da rota.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {SearchCard} card - Cartão que originou o candidato.
 * @property {{ url: string, text: string }} page - Ficha baixada e URL final.
 * @property {SourceLabel} pageLabel - Identidade lida do `h1`.
 */

/**
 * Lista até oito termos de busca deduplicados por texto normalizado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos na ordem de consulta.
 */
export function searchTerms(media) {
  const ordered = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) ordered.push(...media.alternativeTitles);

  const terms = [];
  const seen = new Set();
  for (const value of ordered) {
    if (typeof value !== 'string') continue;
    const term = value.trim();
    if (term === '') continue;
    const key = normalizeText(term) || term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/**
 * Lê a página única de busca da fonte.
 * @param {string} term - Termo já escolhido, sem codificação.
 * @returns {Promise<SearchCard[]>} Cartões na ordem publicada; vazio quando não há resultado.
 * @throws {Error} Se a página não for a busca da fonte ou se um cartão não tiver título/href.
 */
export async function searchCards(term) {
  const url = `${SOURCE_URL}/search.php?keywords=${encodeURIComponent(term)}`;
  const page = await fetchPage(url, { profile: 'page' });
  return parseSearchPage(page.text, page.url);
}

/**
 * Filtra cartões por rota, título e ano antes de abrir a ficha.
 * @param {SearchCard[]} cards - Cartões lidos da busca.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {SearchCard[]} Cartões aptos à confirmação, sem repetir URL.
 */
export function filterCards(cards, media, request) {
  const titles = mediaTitles(media);
  const years = acceptedYears(media, request);
  const result = [];
  const seen = new Set();
  for (const card of cards) {
    if (card.type !== request.mediaType) continue;
    if (bestScore(card.title, titles) < MIN_SCORE) continue;
    if (card.year !== null && !yearMatches(card.year, years)) continue;
    if (seen.has(card.url)) continue;
    seen.add(card.url);
    result.push(card);
  }
  return result;
}

/**
 * Confirma título e ano na ficha, mantendo o candidato quando a identidade coincide.
 * @param {SearchCard} card - Cartão filtrado por tipo, título e ano.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {Promise<ConfirmedCandidate|null>} Candidato confirmado; null quando a ficha diverge.
 * @throws {Error} Em falha de rede ou ficha sem `h1` utilizável.
 */
export async function confirmCandidate(card, media, request) {
  const page = await fetchPage(card.url, { profile: 'page' });
  const pageLabel = parsePageIdentity(page.text);
  if (pageLabel === null) throw new Error(`Ficha sem h1 utilizável em ${page.url}`);

  const titles = mediaTitles(media);
  if (bestScore(pageLabel.title, titles) < MIN_SCORE) return null;

  const years = acceptedYears(media, request);
  const pageYear = pageLabel.year === null ? card.year : pageLabel.year;
  if (pageYear !== null && !yearMatches(pageYear, years)) return null;

  return { card, page, pageLabel };
}

/**
 * Interpreta o título publicado pela fonte, separando título, ano, qualidade e áudio.
 * @param {string} raw - Texto do cartão ou do `h1`.
 * @returns {SourceLabel|null} Partes reconhecidas; null quando o texto é vazio.
 * @example
 * parseSourceLabel('Vingadores: Era de Ultron - 2015 (Dublado) - 1080p');
 * // { title: 'Vingadores: Era de Ultron', year: 2015, quality: '1080p', audio: 'Dublado' }
 */
export function parseSourceLabel(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim().replace(/\s+/g, ' ');
  if (text === '') return null;

  let audio = null;
  const audioMatch = AUDIO_LABEL.exec(text);
  if (audioMatch !== null) {
    audio = audioMatch[1];
    text = `${text.slice(0, audioMatch.index)} ${text.slice(audioMatch.index + audioMatch[0].length)}`.trim();
  }

  const titleParts = [];
  let year = null;
  let quality = null;
  for (const part of text.split(/\s+-\s+/)) {
    const value = part.trim();
    if (value === '') continue;
    if (year === null && YEAR_PART.test(value)) {
      year = Number(value);
      continue;
    }
    if (quality === null && discoverQuality([value]) !== UNKNOWN_QUALITY) {
      quality = value;
      continue;
    }
    titleParts.push(value);
  }

  const title = titleParts.join(' - ').trim();
  if (title === '') return null;
  return { title, year, quality, audio };
}

/**
 * Lê a identidade do `h1` da ficha.
 * @param {string} html - HTML da ficha.
 * @returns {SourceLabel|null} Título, ano, qualidade e áudio; null quando não há `h1` utilizável.
 */
export function parsePageIdentity(html) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const heading = $('h1').eq(0).text().trim();
  if (heading === '') return null;
  return parseSourceLabel(heading);
}

/**
 * Lê os cartões e valida o marcador de busca da fonte.
 * @param {string} html - HTML da página de busca.
 * @param {string} pageUrl - URL final da página.
 * @returns {SearchCard[]} Cartões da página; vazio quando a fonte publica a ausência.
 * @throws {Error} Se a página não for a busca da fonte ou se um cartão não tiver título/href.
 */
function parseSearchPage(html, pageUrl) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const documentTitle = $('title').eq(0).text();
  if (!documentTitle.includes(SEARCH_TITLE)) {
    throw new Error(`Busca sem o título de resultados em ${pageUrl}`);
  }

  const list = $('div.listagem').eq(0);
  if (list.length === 0) throw new Error(`Busca sem a lista de resultados em ${pageUrl}`);
  if (list.text().includes(NO_RESULTS)) return [];

  const cards = [];
  const items = list.find('div');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = item.find('a').eq(0).attr('href');
    if (href === undefined || href.trim() === '') continue;
    const label = item.find('span').eq(0).text().trim();
    if (label === '') throw new Error(`Cartão de busca sem título em ${pageUrl}`);
    const parsed = parseSourceLabel(label);
    if (parsed === null) throw new Error(`Cartão de busca sem título utilizável em ${pageUrl}`);
    const url = new URL(href, pageUrl).href;
    cards.push({
      title: parsed.title,
      year: parsed.year,
      quality: parsed.quality,
      url,
      type: SERIES_ROUTE.test(url) ? 'tv' : 'movie',
    });
  }
  return cards;
}

/**
 * Títulos do TMDB usados na comparação de identidade.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos.
 */
function mediaTitles(media) {
  const titles = [media.title, media.originalTitle];
  if (Array.isArray(media.alternativeTitles)) titles.push(...media.alternativeTitles);
  return titles.filter((title) => typeof title === 'string' && title.trim() !== '');
}

/**
 * Anos aceitos: o da mídia e, em série, o da temporada pedida.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {number[]}
 */
function acceptedYears(media, request) {
  const years = [];
  if (Number.isInteger(media.year)) years.push(media.year);
  if (request.mediaType === 'tv' && Array.isArray(media.seasons)) {
    const season = media.seasons.find((entry) => entry.number === request.season);
    if (season && Number.isInteger(season.year)) years.push(season.year);
  }
  return years;
}

/**
 * Compara um ano com os anos aceitos, respeitando a tolerância de um.
 * @param {number} year - Ano da fonte.
 * @param {number[]} years - Anos aceitos.
 * @returns {boolean} True quando não há ano esperado ou quando a diferença é de até um.
 */
function yearMatches(year, years) {
  if (years.length === 0) return true;
  return years.some((expected) => Math.abs(year - expected) <= YEAR_TOLERANCE);
}

/**
 * Maior similaridade entre o título da fonte e os títulos do TMDB.
 * @param {string} title - Título da fonte.
 * @param {string[]} titles - Títulos do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 */
function bestScore(title, titles) {
  let best = 0;
  for (const candidate of titles) {
    best = Math.max(best, titleSimilarity(title, candidate));
  }
  return best;
}
