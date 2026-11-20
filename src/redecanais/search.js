/**
 * Busca e confirmação de identidade no catálogo RedeCanais (PhpMelody, tema Echo).
 *
 * A busca é `GET /search.php?keywords=<termo>` com até cinco páginas de oito cartões. O cartão é
 * `div.thumbnail .caption h3 a` e o título segue `Título (Dublado|Legendado) - AAAA - Qualidade`.
 * A fonte não publica ID do TMDB: a identidade é confirmada por título e ano no `h1` e no JSON-LD
 * da ficha, como nos demais provedores do repositório.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { UNKNOWN_QUALITY, discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { hasEpisodeContainer } from './episodes.js';

/** Base única do catálogo. Domínios vizinhos têm contrato próprio e não são fallback (design D11). */
export const SOURCE_URL = 'https://redecanais.lt';

const SEARCH_TITLE = 'Buscar Conteúdo RedeCanais:';
const MAX_PAGES = 5;
const MAX_TERMS = 8;
const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const YEAR_ONLY_WITHOUT_YEAR = 0.9;
const SERIES_ROUTE = /-lista-de-episodios_/i;
const AUDIO_LABEL = /\((dublado|legendado|nacional|dublado e legendado)\)/i;
const YEAR_SUFFIX = /^(.*?)\s+-\s+(\d{4})(?:\s+-\s+(.+))?$/;
const JSON_LD = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const FOUR_DIGITS = /^\d{4}$/;

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
 * @property {string|null} audio - Rótulo de áudio do cartão.
 * @property {string} url - URL absoluta da ficha.
 * @property {'movie'|'tv'} type - Tipo derivado da rota.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {SearchCard} card - Cartão que originou o candidato.
 * @property {{ url: string, text: string }} page - Ficha baixada e URL final.
 * @property {SourceLabel} pageLabel - Identidade lida do `h1`/JSON-LD.
 */

/**
 * @typedef {object} SearchFailure
 * @property {string} label - Rótulo da opção nas mensagens.
 * @property {Error} error - Causa da falha.
 */

/**
 * Lista até oito termos de busca deduplicados, priorizando os romaji da temporada pedida.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {string[]} Termos na ordem de consulta.
 */
export function searchTerms(media, request) {
  const romaji = Array.isArray(media.romajiTitles) ? media.romajiTitles : [];
  const ordered = [];
  if (request.mediaType === 'tv') {
    for (const entry of romaji) {
      if (entry.season === request.season) ordered.push(entry.title);
    }
  }
  ordered.push(media.title, media.originalTitle);
  if (Array.isArray(media.alternativeTitles)) ordered.push(...media.alternativeTitles);
  for (const entry of romaji) ordered.push(entry.title);

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
 * Lê uma página de busca do começo ao fim, paginando até o teto de cinco páginas.
 * @param {string} term - Termo já escolhido, sem codificação.
 * @returns {Promise<SearchCard[]>} Cartões na ordem publicada; vazio quando a busca não tem resultado.
 * @throws {Error} Se a página não for a busca da fonte ou se um cartão não tiver título/href.
 */
export async function searchCards(term) {
  const cards = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${SOURCE_URL}/search.php?keywords=${encodeURIComponent(term)}${page === 1 ? '' : `&page=${page}`}`;
    const response = await fetchPage(url, { profile: 'page' });
    const parsed = parseSearchPage(response.text, response.url);
    if (parsed.cards.length === 0) break;
    for (const card of parsed.cards) {
      if (!cards.some((item) => item.url === card.url)) cards.push(card);
    }
    if (page === MAX_PAGES || !hasNextPage(response.text, response.url, page + 1)) break;
  }
  return cards;
}

/**
 * Confirma título e ano na ficha, mantendo o candidato quando a identidade coincide.
 * @param {SearchCard} card - Cartão filtrado por tipo, título e ano.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {Promise<ConfirmedCandidate|null>} Candidato confirmado; null quando a ficha diverge.
 * @throws {Error} Em falha de rede ou ficha sem `h1` nem JSON-LD utilizável.
 */
export async function confirmCandidate(card, media, request) {
  const page = await fetchPage(card.url, { profile: 'page' });
  const pageLabel = parsePageIdentity(page.text);
  if (pageLabel === null) throw new Error(`Ficha sem h1 nem JSON-LD utilizável em ${page.url}`);

  const titles = mediaTitles(media);
  if (bestScore(pageLabel.title, titles) < MIN_SCORE) return null;

  const years = acceptedYears(media, request);
  const pageYear = pageLabel.year === null ? card.year : pageLabel.year;
  if (pageYear !== null && !yearMatches(pageYear, years)) return null;

  const pageType = hasEpisodeContainer(page.text) ? 'tv' : 'movie';
  if (pageType !== request.mediaType) {
    if (card.type === 'tv') {
      throw new Error(`Página de série sem div[itemprop="description"] em ${page.url}`);
    }
    return null;
  }

  return { card, page, pageLabel };
}

/**
 * Filtra cartões de busca por rota, título e ano, aplicando a regra do cartão sem ano.
 * @param {SearchCard[]} cards - Cartões lidos da busca.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null }} request - Pedido validado.
 * @returns {SearchCard[]} Cartões aptos a confirmação, sem repetir URL.
 */
export function filterCards(cards, media, request) {
  const titles = mediaTitles(media);
  const years = acceptedYears(media, request);
  const scored = [];
  for (const card of cards) {
    // A rota com `-lista-de-episodios_` é série; a rota sem o marcador pode ser filme ou série
    // sem lista no slug (ex.: Chernobyl). Só o pedido de filme pode descartar pela rota.
    if (request.mediaType === 'movie' && card.type !== 'movie') continue;
    const score = bestScore(card.title, titles);
    if (score < MIN_SCORE) continue;
    scored.push({ card, score });
  }

  const withYear = scored
    .filter((entry) => entry.card.year !== null && yearMatches(entry.card.year, years))
    .map((entry) => entry.card);
  const highScores = scored.filter((entry) => entry.score >= YEAR_ONLY_WITHOUT_YEAR);
  const withoutYear = highScores.length === 1 && highScores[0].card.year === null
    ? [highScores[0].card]
    : [];

  const result = [];
  const seen = new Set();
  for (const card of withYear.concat(withoutYear)) {
    if (seen.has(card.url)) continue;
    seen.add(card.url);
    result.push(card);
  }
  return result;
}

/**
 * Interpreta o título publicado pela fonte, separando título, ano, qualidade e áudio.
 * @param {string} raw - Texto do cartão, do `h1` ou do JSON-LD.
 * @returns {SourceLabel|null} Partes reconhecidas; null quando o texto é vazio.
 * @example
 * parseSourceLabel('Duna: Parte Dois (Dublado) - 2024 - 1080p');
 * // { title: 'Duna: Parte Dois', year: 2024, quality: '1080p', audio: 'Dublado' }
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

  let year = null;
  let quality = null;
  const yearMatch = YEAR_SUFFIX.exec(text);
  if (yearMatch !== null) {
    text = yearMatch[1].trim();
    year = Number(yearMatch[2]);
    if (yearMatch[3] !== undefined) quality = yearMatch[3].trim();
  } else {
    const parts = text.split(/\s+-\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1].trim();
      if (!FOUR_DIGITS.test(last) && discoverQuality([last]) !== UNKNOWN_QUALITY) {
        quality = last;
        text = parts.slice(0, -1).join(' - ').trim();
      }
    }
  }

  text = text.replace(/^[-\s]+|[-\s]+$/g, '');
  if (text === '') return null;
  return { title: text, year, quality, audio };
}

/**
 * Lê a identidade da ficha pelo `h1` e, quando necessário, pelo JSON-LD.
 * @param {string} html - HTML da ficha.
 * @returns {SourceLabel|null} Título, ano, qualidade e áudio; null quando não há identidade.
 */
export function parsePageIdentity(html) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const h1 = $('h1').eq(0).text().trim();
  const heading = h1 === '' ? null : parseSourceLabel(h1);
  const jsonLd = parseJsonLd(html);

  const title = heading !== null ? heading.title : jsonLd === null ? '' : jsonLd.title;
  if (title === '') return null;
  return {
    title,
    year: heading !== null && heading.year !== null ? heading.year : jsonLd === null ? null : jsonLd.year,
    quality: heading === null ? null : heading.quality,
    audio: heading !== null && heading.audio !== null ? heading.audio : jsonLd === null ? null : jsonLd.audio,
  };
}

/**
 * Lê os campos `name` e `dateCreated` do primeiro JSON-LD de mídia da página.
 * @param {string} html - HTML da ficha.
 * @returns {{ title: string, year: number|null, audio: string|null }|null} Identidade do JSON-LD.
 */
function parseJsonLd(html) {
  const pattern = new RegExp(JSON_LD.source, 'gi');
  let match;
  while ((match = pattern.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const item = Array.isArray(data) ? data.find((entry) => hasJsonIdentity(entry)) : data;
    if (!hasJsonIdentity(item)) continue;
    const label = parseSourceLabel(item.name);
    if (label === null) continue;
    return {
      title: label.title,
      year: label.year === null ? jsonYear(item) : label.year,
      audio: label.audio,
    };
  }
  return null;
}

/**
 * Indica se o objeto JSON-LD tem `name` de texto.
 * @param {*} item - Valor interpretado do JSON-LD.
 * @returns {boolean}
 */
function hasJsonIdentity(item) {
  return item !== null && typeof item === 'object' && typeof item.name === 'string' && item.name.trim() !== '';
}

/**
 * Lê o ano de `dateCreated` ou `datePublished` do JSON-LD.
 * @param {object} item - Objeto JSON-LD.
 * @returns {number|null} Ano de quatro dígitos ou null.
 */
function jsonYear(item) {
  for (const value of [item.dateCreated, item.datePublished]) {
    if (typeof value === 'string' && /^\d{4}/.test(value)) return Number(value.slice(0, 4));
  }
  return null;
}

/**
 * Lê os cartões e valida o marcador de busca da fonte.
 * @param {string} html - HTML da página de busca.
 * @param {string} pageUrl - URL final da página.
 * @returns {{ cards: SearchCard[] }} Cartões da página.
 * @throws {Error} Se a página não for a busca da fonte ou se um cartão não tiver título/href.
 */
function parseSearchPage(html, pageUrl) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const documentTitle = $('title').eq(0).text();
  if (!documentTitle.includes(SEARCH_TITLE)) {
    throw new Error(`Busca sem o título de resultados em ${pageUrl}`);
  }

  const cards = [];
  const nodes = $('div.thumbnail .caption h3 a');
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes.eq(index);
    const href = node.attr('href');
    const raw = typeof node.attr('title') === 'string' ? node.attr('title') : node.text();
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (href === undefined || href.trim() === '') throw new Error(`Cartão de busca sem href em ${pageUrl}`);
    if (label === '') throw new Error(`Cartão de busca sem título em ${pageUrl}`);
    const parsed = parseSourceLabel(label);
    if (parsed === null) throw new Error(`Cartão de busca sem título utilizável em ${pageUrl}`);
    const url = new URL(href, pageUrl).href;
    cards.push({
      title: parsed.title,
      year: parsed.year,
      quality: parsed.quality,
      audio: parsed.audio,
      url,
      type: SERIES_ROUTE.test(url) ? 'tv' : 'movie',
    });
  }
  return { cards };
}

/**
 * Indica se a página publica o link para a próxima página.
 * @param {string} html - HTML da página.
 * @param {string} pageUrl - URL final da página.
 * @param {number} next - Número da próxima página.
 * @returns {boolean}
 */
function hasNextPage(html, pageUrl, next) {
  const { load } = require('cheerio-without-node-native');
  const $ = load(html);
  const links = $('a');
  for (let index = 0; index < links.length; index += 1) {
    const href = links.eq(index).attr('href');
    if (href === undefined || href.trim() === '') continue;
    let url;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.searchParams.get('page') === String(next)) return true;
  }
  return false;
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
