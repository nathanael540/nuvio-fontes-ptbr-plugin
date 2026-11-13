/**
 * Catálogo do Dattebayo BR: busca por título e confirmação da ficha.
 *
 * A busca é `GET /busca?busca=<termo>` (até três páginas por termo) e lê os cartões
 * `.ultimosAnimesHomeItem` do contêiner `.aniContainer`. Cada termo consulta uma vez por idioma
 * (`Dublado` e `Legendado`); a ficha confirma `Tipo`, `Ano` e, em série, o título base da família.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { isBaseTitle, readDetail } from './seasons.js';

const SOURCE_URL = 'https://www.dattebayo-br.com';
const SOURCE_HOSTS = new Set(['dattebayo-br.com', 'www.dattebayo-br.com']);
const SEARCH_PATH = '/busca';
const SECTIONS = new Set(['animes', 'anime-dublado', 'tokusatsus', 'doramas', 'donghua']);
const DUBBED_SECTION = 'anime-dublado';
const DUBBED_SUFFIX = /\s*-\s*dublado\s*$/i;
const MAX_SEARCH_PAGES = 3;
const MAX_ALTERNATIVE_TERMS = 2;
const LANGUAGE_ORDER = [LANGUAGE.DUBBED, LANGUAGE.SUBTITLED];

/**
 * @typedef {object} SearchCard
 * @property {string} title - Título exibido no cartão.
 * @property {string} url - URL absoluta da ficha.
 * @property {string} language - `Dublado` ou `Legendado` pela seção ou pelo sufixo do título.
 * @property {number|null} episodeCount - Contagem de episódios anunciada no cartão, quando houver.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {string} title - Título do cartão.
 * @property {string} url - URL da ficha.
 * @property {string} language - Idioma da entrada.
 * @property {object} detail - Ficha lida por `readDetail`.
 */

/**
 * Localiza fichas confirmadas do título no catálogo.
 *
 * Tenta o título PT-BR, o original e até dois alternativos, nessa ordem, e encerra no primeiro
 * termo que produzir ficha confirmada. Em cada termo, escolhe um candidato por idioma com
 * `findBestMatch` e ano nulo, porque o cartão de busca não traz ano.
 *
 * @param {object} request - Pedido validado recebido pelo provedor.
 * @param {'movie'|'tv'} request.mediaType - Tipo de mídia pedido.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<ConfirmedCandidate[]>} Fichas confirmadas, uma por idioma no máximo.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, layout de busca/ficha ou dado obrigatório ausente.
 */
export async function findCandidates(request, media) {
  for (const term of searchTerms(media)) {
    const state = {
      cards: [],
      seenUrls: new Set(),
      usedUrls: new Set(),
      details: new Map(),
      confirmed: [],
    };
    for (let page = 1; page <= MAX_SEARCH_PAGES; page += 1) {
      const url = searchPageUrl(term, page);
      const cards = parseSearchPage(await fetchText(url), url);
      for (const card of cards) {
        if (state.seenUrls.has(card.url)) continue;
        state.seenUrls.add(card.url);
        state.cards.push(card);
      }
      await confirmCandidates(state, request, media);
      if (state.confirmed.length > 0) return state.confirmed;
      if (cards.length === 0) break;
    }
  }
  return [];
}

/**
 * Termos de busca na ordem do design, sem repetição e com no máximo dois alternativos.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Termos não vazios.
 */
function searchTerms(media) {
  const values = [media.title, media.originalTitle].concat(media.alternativeTitles.slice(0, MAX_ALTERNATIVE_TERMS));
  const terms = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const term = value.trim();
    if (term === '') continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/**
 * Monta a URL de busca; a página 1 não recebe o parâmetro `page`.
 * @param {string} term - Termo consultado.
 * @param {number} page - Página, a partir de 1.
 * @returns {string} URL da busca.
 */
function searchPageUrl(term, page) {
  const params = new URLSearchParams({ busca: term });
  if (page > 1) params.set('page', String(page));
  return `${SOURCE_URL}${SEARCH_PATH}?${params.toString()}`;
}

/**
 * Lê os cartões de uma página de busca.
 *
 * Contêiner `.aniContainer` ausente é erro de layout; contêiner vazio é ausência reconhecida.
 * Cartões de seção desconhecida são ignorados, e cartão sem link ou título é erro de layout.
 *
 * @param {string} html - HTML da busca.
 * @param {string} pageUrl - URL da página, usada nas mensagens de erro e na resolução relativa.
 * @returns {SearchCard[]} Cartões válidos na ordem da página.
 * @throws {Error} Se o contêiner esperado não existir ou um cartão estiver incompleto.
 */
function parseSearchPage(html, pageUrl) {
  const $ = getCheerio().load(html);
  if ($('.aniContainer').length === 0) {
    throw new Error(`Busca sem o contêiner .aniContainer em ${pageUrl}`);
  }
  const cards = $('.ultimosAnimesHomeItem');
  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const anchor = card.find('a').eq(0);
    const href = anchor.attr('href');
    const title = card.find('.ultimosAnimesHomeItemInfosNome').eq(0).text().trim()
      || anchor.text().trim()
      || (anchor.attr('title') || '').trim();
    if (!href || title === '') {
      throw new Error(`Cartão ${index + 1} da busca em ${pageUrl} sem link ou título`);
    }
    const url = new URL(href, pageUrl);
    if (!SOURCE_HOSTS.has(url.hostname)) continue;
    const section = sectionOf(url.pathname);
    if (!SECTIONS.has(section)) continue;
    const countText = card.find('.ultimosAnimesHomeItemQntEps').eq(0).text() || card.text();
    results.push({
      title,
      url: url.href,
      language: languageFor(section, title),
      episodeCount: readEpisodeCount(countText),
    });
  }
  return results;
}

/**
 * Classifica o idioma pela seção do catálogo ou pelo sufixo `- Dublado`.
 * @param {string} section - Primeiro segmento do caminho da ficha.
 * @param {string} title - Título do cartão.
 * @returns {string} `LANGUAGE.DUBBED` ou `LANGUAGE.SUBTITLED`.
 */
function languageFor(section, title) {
  return section === DUBBED_SECTION || DUBBED_SUFFIX.test(title) ? LANGUAGE.DUBBED : LANGUAGE.SUBTITLED;
}

/**
 * Lê a contagem de episódios anunciada no cartão, se existir.
 * @param {string} text - Texto completo do cartão.
 * @returns {number|null} Quantidade positiva ou null.
 */
function readEpisodeCount(text) {
  const fraction = /(\d+)\s*\/\s*(\d+)\s*epis[oó]dios?/i.exec(text);
  if (fraction) return Number(fraction[1]);
  const match = /(\d+)\s*epis[oó]dios?/i.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Primeiro segmento de um caminho (`/animes/slug` vira `animes`).
 * @param {string} pathname - Caminho da URL.
 * @returns {string}
 */
function sectionOf(pathname) {
  return pathname.split('/').filter((part) => part !== '')[0] || '';
}

/**
 * Escolhe e confirma um candidato por idioma entre os cartões já lidos.
 * @param {object} state - Cartões, fichas já consultadas e confirmações da busca corrente.
 * @param {object} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<void>} Atualiza `state.confirmed`.
 * @throws {Error} Se uma ficha confirmada estiver sem dado obrigatório.
 */
async function confirmCandidates(state, request, media) {
  for (const language of LANGUAGE_ORDER) {
    if (state.confirmed.some((candidate) => candidate.language === language)) continue;
    while (true) {
      const pending = state.cards.filter((card) => card.language === language && !state.usedUrls.has(card.url));
      if (pending.length === 0) break;
      const match = findBestMatch(
        pending.map((card) => ({ title: stripDubbed(card.title), url: card.url })),
        matchMedia(media),
      );
      if (match === null) break;
      const card = pending.find((item) => item.url === match.candidate.url);
      state.usedUrls.add(card.url);
      const detail = await loadDetail(card.url, state.details);
      if (!confirmDetail(detail, request, media)) continue;
      state.confirmed.push({ title: card.title, url: card.url, language, detail });
      break;
    }
  }
}

/**
 * Dados do TMDB para a pré-seleção, sem ano porque o cartão de busca não informa ano.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {{ title: string, originalTitle: string, alternativeTitles: string[], year: null }}
 */
function matchMedia(media) {
  return {
    title: media.title,
    originalTitle: media.originalTitle,
    alternativeTitles: media.alternativeTitles,
    year: null,
  };
}

/**
 * Remove o sufixo `- Dublado` do título apenas para comparação.
 * @param {string} title - Título do cartão.
 * @returns {string} Título sem o sufixo.
 */
function stripDubbed(title) {
  return title.replace(DUBBED_SUFFIX, '').trim();
}

/**
 * Busca e lê a ficha de um cartão, reaproveitando leituras na mesma busca.
 * @param {string} url - URL da ficha.
 * @param {Map<string, object>} cache - Fichas já lidas.
 * @returns {Promise<object>} Ficha lida.
 */
async function loadDetail(url, cache) {
  if (cache.has(url)) return cache.get(url);
  const detail = readDetail(await fetchText(url), url);
  cache.set(url, detail);
  return detail;
}

/**
 * Confere tipo, ano e, em série, a ficha base da família.
 *
 * Tipo incompatível é descarte silencioso. Dado obrigatório ausente depois de o tipo bater é
 * erro de layout: série sem `Episódios` ou sem lista, e ficha sem `Ano`.
 *
 * @param {object} detail - Ficha lida.
 * @param {object} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} True quando a ficha pode ser usada.
 * @throws {Error} Se faltar ano, contagem de episódios ou lista de episódios.
 */
function confirmDetail(detail, request, media) {
  const expectedType = request.mediaType === 'movie' ? 'Filme' : 'TV';
  if (detail.type !== expectedType) return false;
  if (detail.year === null) throw new Error(`Ficha ${detail.url} sem Ano`);
  if (media.year !== null && Math.abs(detail.year - media.year) > 1) return false;
  if (request.mediaType === 'tv') {
    if (!isBaseTitle(detail.title, media)) return false;
    if (detail.availableEpisodes === null) throw new Error(`Ficha ${detail.url} sem Episódios`);
    if (detail.episodes === null) throw new Error(`Ficha ${detail.url} sem lista de episódios`);
  }
  return true;
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
