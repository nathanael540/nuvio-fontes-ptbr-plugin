/**
 * Orquestração do provedor Donghua No Sekai.
 *
 * A busca HTML reúne cartões de até quatro termos; as fichas candidatas são confirmadas por
 * título, ano e tipo; a temporada sai do marcador do `h1` e o episódio, da lista publicada. Cada
 * player é resolvido em isolamento por `players.js`.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  buildSearchTerms,
  confirmPage,
  findEpisode,
  seasonFromTitle,
} from './catalog.js';
import { resolvePlayers, sanitizeMessage } from './players.js';
import { readDetailPage, searchCards } from './site.js';

const MAX_CANDIDATES = 6;
const NOT_FOUND = /HTTP 404\b/;

/**
 * @typedef {object} Request
 * @property {string} tmdbId - ID do TMDB.
 * @property {'movie'|'tv'} mediaType - Tipo do pedido.
 * @property {number|null} season - Temporada em série.
 * @property {number|null} episode - Episódio em série.
 */

/**
 * Resolve os streams do título pedido.
 *
 * @param {Request} request - Pedido validado.
 * @returns {Promise<object[]>} Streams encontrados; lista vazia em ausência.
 * @throws {Error} Se a busca, o TMDB, a ficha ou todos os players falharem.
 * @example
 * const streams = await resolveStreams({ tmdbId: '101172', mediaType: 'tv', season: 1, episode: 1 });
 */
export async function resolveStreams(request) {
  const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: request.mediaType });
  const terms = buildSearchTerms(media);
  const cards = await collectCards(terms, request.mediaType);
  if (cards.length === 0) return [];

  const candidates = rankCards(cards, request).slice(0, MAX_CANDIDATES);
  const failures = [];

  for (const card of candidates) {
    try {
      const page = await fetchPage(card.url);
      const confirmation = confirmPage(page, request, media);
      if (confirmation.status !== 'confirmed') continue;

      const mediaResult = await resolveMedia(page, request);
      if (mediaResult.status === 'absent') continue;

      const result = await resolvePlayers(mediaResult.players, request, media);
      if (result.status === 'ok') return result.streams;
    } catch (error) {
      if (NOT_FOUND.test(String(error.message))) continue;
      failures.push(sanitizeMessage(error.message));
    }
  }

  if (failures.length > 0) throw new Error(`Nenhum candidato produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Consulta os termos e acumula os cartões do tipo pedido.
 *
 * @param {string[]} terms - Termos montados pelo catálogo.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {Promise<import('./site.js').SearchCard[]>} Cartões únicos.
 * @throws {Error} Se todos os termos falharem.
 */
async function collectCards(terms, mediaType) {
  const failures = [];
  const cards = [];
  const seen = new Set();

  for (const term of terms) {
    try {
      const found = await searchCards(term);
      for (const card of found) {
        if (!typeMatches(card.type, mediaType)) continue;
        if (seen.has(card.url)) continue;
        seen.add(card.url);
        cards.push(card);
      }
    } catch (error) {
      failures.push(`${term}: ${sanitizeMessage(error.message)}`);
    }
  }

  if (cards.length === 0 && failures.length === terms.length) {
    throw new Error(`Busca indisponível: ${failures.join('; ')}`);
  }
  return cards;
}

/**
 * Ordena os candidatos pela similaridade do cartão e pelo marcador de temporada.
 *
 * @param {import('./site.js').SearchCard[]} cards - Cartões coletados.
 * @param {Request} request - Pedido validado.
 * @returns {import('./site.js').SearchCard[]} Candidatos ordenados.
 */
function rankCards(cards, request) {
  const scored = cards.map((card, index) => {
    const season = seasonFromTitle(card.title);
    const seasonMatch = request.mediaType === 'tv' && season.number === request.season ? 1 : 0;
    return { card, index, seasonMatch };
  });

  scored.sort((left, right) => {
    if (left.seasonMatch !== right.seasonMatch) return right.seasonMatch - left.seasonMatch;
    return left.index - right.index;
  });
  return scored.map((item) => item.card);
}

/**
 * Indica se o tipo do cartão atende ao pedido.
 *
 * @param {string} type - `data-ona` do cartão.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {boolean} True quando o cartão pode ser aberto.
 */
function typeMatches(type, mediaType) {
  const value = String(type || '').trim().toLowerCase();
  if (mediaType === 'movie') return value === '' || value === 'movie';
  return value !== 'movie' && value !== 'special';
}

/**
 * Abre a ficha e lê o HTML.
 *
 * @param {string} url - URL da ficha.
 * @returns {Promise<import('./site.js').DetailPage>} Ficha lida.
 * @throws {Error} Se a resposta não for 2xx ou a página não tiver `h1`.
 */
async function fetchPage(url) {
  const html = await fetchText(url);
  return readDetailPage(html, url);
}

/**
 * Resolve a página que contém os players do pedido.
 *
 * Em filme, usa a própria ficha ou o único item de uma coleção. Em série, usa a página do
 * episódio listado, ignorando links removidos.
 *
 * @param {import('./site.js').DetailPage} page - Ficha confirmada.
 * @param {Request} request - Pedido validado.
 * @returns {Promise<{ status: 'ok', players: import('./site.js').PlayerLink[] }|{ status: 'absent' }>} Resultado.
 * @throws {Error} Se a página do episódio ou do filho falhar.
 */
async function resolveMedia(page, request) {
  if (request.mediaType === 'movie') {
    if (page.players.length > 0) return { status: 'ok', players: page.players };
    if (page.episodes.length !== 1) return { status: 'absent' };
    if (/__trashed/i.test(page.episodes[0].url)) return { status: 'absent' };
    const child = await fetchPage(page.episodes[0].url);
    if (child.players.length === 0) return { status: 'absent' };
    return { status: 'ok', players: child.players };
  }

  const episode = findEpisode(page, request.episode);
  if (episode === null) return { status: 'absent' };
  const episodePage = await fetchPage(episode.url);
  if (episodePage.players.length === 0) return { status: 'absent' };
  return { status: 'ok', players: episodePage.players };
}
