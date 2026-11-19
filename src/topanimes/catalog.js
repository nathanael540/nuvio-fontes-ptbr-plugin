/**
 * Catálogo do TopAnimes: busca HTML, limpeza de título, confirmação de identidade,
 * seleção de episódio e leitura das opções DooPlay.
 *
 * Fluxo observado em 19/11/2026:
 * 1. `GET /?s=<termo>` devolve cartões `article` com `.title a`, `.year` e tipo pela rota
 *    (`/filmes/` ou `/animes/`).
 * 2. A ficha publica o título em `h1`; `.sheader span.date` é título alternativo em série e data
 *    em filme, mas não é usado como ano.
 * 3. A lista de episódios fica em `ul.episodios`; `.numerando` traz `temporada - episódio` e
 *    `.epnumber` traz o número (absoluto em títulos antigos).
 * 4. Cada opção de player é um `li.dooplay_player_option` com `data-nume` e o iframe em
 *    `#source-player-<nume>`.
 */

import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';

/** Endereço público da fonte, sem barra no final. */
export const SOURCE_URL = 'https://topanimes.net';

const SOURCE_HOST = 'topanimes.net';
const MAX_SEARCH_TERMS = 8;
const MIN_TITLE_SCORE = 0.88;
const YEAR_TOLERANCE = 1;
const NUMERANDO = /^(\d+)\s*-\s*(\d+)$/;
const TRAILING_YEAR = /(\d{4})\s*$/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} SearchResult
 * @property {string} title - Título do cartão.
 * @property {number|null} year - Ano do cartão.
 * @property {string} url - Endereço absoluto da ficha.
 * @property {'movie'|'tv'|null} kind - Tipo inferido pela rota.
 */

/**
 * @typedef {object} Candidate
 * @property {SearchResult} result - Cartão original.
 * @property {string} cleanTitle - Título limpo para comparação.
 * @property {number} score - Similaridade com os títulos do TMDB.
 * @property {number} seasonScore - 1 quando o título declara a temporada pedida.
 */

/**
 * @typedef {object} Detail
 * @property {string} title - Texto do `h1`.
 */

/**
 * @typedef {object} PlayerOption
 * @property {number} number - Valor numérico de `data-nume`.
 * @property {string} label - Rótulo do `.title`.
 * @property {string} url - URL absoluta do iframe.
 */

/**
 * Monta os termos de busca a partir do TMDB, priorizando os romaji da temporada pedida.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida em série; null em filme.
 * @returns {string[]} Até oito termos únicos e não vazios.
 * @throws {Error} Se `media` não tiver título em texto.
 * @example
 * buildSearchTerms({ title: 'Solo Leveling', originalTitle: 'Ore dake...', alternativeTitles: [], romajiTitles: [] }, 2);
 * // ['Ore dake Level Up na Ken Season 2', 'Solo Leveling', 'Ore dake...']
 */
export function buildSearchTerms(media, season) {
  if (media === null || typeof media !== 'object' || typeof media.title !== 'string') {
    throw new Error('media inválida: esperado objeto com title string');
  }
  const terms = [];
  const seen = new Set();
  const add = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    const key = normalizeText(text);
    if (text === '' || key === '' || seen.has(key)) return;
    seen.add(key);
    terms.push(text);
  };

  if (Number.isInteger(season)) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === season) add(item.title);
    }
  }
  add(media.title);
  add(media.originalTitle);
  for (const item of media.romajiTitles || []) add(item && item.title);
  for (const title of media.alternativeTitles || []) add(title);

  return terms.slice(0, MAX_SEARCH_TERMS);
}

/**
 * Monta a URL de busca HTML, que não exige o nonce da API `wp-json/dooplay/search/`.
 * @param {string} term - Termo já validado.
 * @returns {string} URL da busca.
 * @example
 * searchUrl('Solo Leveling'); // 'https://topanimes.net/?s=Solo%20Leveling'
 */
export function searchUrl(term) {
  return `${SOURCE_URL}/?s=${encodeURIComponent(term)}`;
}

/**
 * Lê os cartões de uma página de busca.
 * @param {string} html - HTML da busca.
 * @returns {SearchResult[]} Cartões na ordem da página; vazio quando não há resultado.
 * @throws {Error} Se a página não for uma busca, ou um cartão não tiver link/título.
 * @example
 * parseSearchResults('<div class="search-page"><article><div class="title"><a href="/animes/x/">X</a></div><span class="year">2024</span></article></div>');
 * // [{ title: 'X', year: 2024, url: 'https://topanimes.net/animes/x/', kind: 'tv' }]
 */
export function parseSearchResults(html) {
  const $ = loadHtml(html);
  if (!$('.search-page').length) throw new Error('Busca sem o contêiner .search-page');
  if ($('.no-result').length) return [];

  const cards = $('article');
  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const link = card.find('.title a').eq(0);
    const href = link.attr('href');
    const title = link.text().trim();
    if (typeof href !== 'string' || href.trim() === '') {
      throw new Error(`Cartão ${index + 1} da busca sem link`);
    }
    if (title === '') throw new Error(`Cartão ${index + 1} da busca sem título`);
    const url = resolveUrl(href, SOURCE_URL);
    results.push({
      title,
      year: readCardYear(card.find('.year').text(), card.find('.meta').text()),
      url: url.href,
      kind: readKind(url),
    });
  }
  return results;
}

/**
 * Limpa o título do cartão/ficha para comparação: remove marcas de áudio, formato e temporada.
 * @param {string} title - Título publicado.
 * @param {'movie'|'tv'} kind - Tipo do conteúdo.
 * @returns {string} Título limpo.
 * @example
 * cleanTitle('Boku no Hero Academia 7 Dublado', 'tv'); // 'Boku no Hero Academia'
 */
export function cleanTitle(title, kind) {
  let text = title.replace(/\s+/g, ' ').trim();
  text = text.replace(/\s*\((?:tv|camrip|cam-rip|dublado|legendado)\)\s*$/i, '');
  text = text.replace(/[\s\-–—]*(?:dublado|legendado)\s*$/i, '');
  text = text.replace(/[\s\-–—]*(?:online|filme)\s*$/i, '');
  if (kind === 'tv') {
    text = text.replace(/[\s\-–—]*(?:season|temporada)\s*\d+\s*$/i, '');
    text = text.replace(/[\s\-–—]*\d+\s*ª\s*temporada\s*$/i, '');
    text = text.replace(/[\s\-–—]*(?:part|parte)\s*\d+\s*$/i, '');
    text = text.replace(/\s+\d{1,2}\s*$/, '');
  }
  return text.trim();
}

/**
 * Lê a temporada declarada no título de uma página, quando existe.
 * @param {string} title - Título publicado.
 * @returns {number|null} Temporada declarada ou null.
 * @example
 * declaredSeason('Solo Leveling 2'); // 2
 * declaredSeason('Shingeki no Kyojin 3 Part 2'); // null (parte ambígua)
 */
export function declaredSeason(title) {
  const text = title
    .replace(/\s*\((?:tv|camrip|cam-rip|dublado|legendado)\)\s*$/i, '')
    .replace(/[\s\-–—]*(?:dublado|legendado)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const named = /(?:season|temporada)\s*(\d+)/i.exec(text) || /(\d+)\s*ª\s*temporada/i.exec(text);
  if (named) return Number(named[1]);
  if (/(?:part|parte)\s*\d+/i.test(text)) return null;
  const trailing = /\s(\d{1,2})\s*$/.exec(text);
  return trailing ? Number(trailing[1]) : null;
}

/**
 * Filtra e pontua um cartão contra o TMDB.
 * @param {SearchResult} result - Cartão da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida em série.
 * @returns {Candidate|null} Candidato aceito ou null.
 * @example
 * matchCandidate({ title: 'Solo Leveling', year: 2024, url: 'https://topanimes.net/animes/solo-leveling/', kind: 'tv' }, media, 1);
 */
export function matchCandidate(result, media, season) {
  if (result.kind !== media.mediaType) return null;

  const expected = expectedYear(media, season);
  if (result.year !== null && expected !== null && Math.abs(result.year - expected) > YEAR_TOLERANCE) {
    return null;
  }

  const clean = cleanTitle(result.title, media.mediaType);
  const keys = titleKeys(media, season);
  const score = Math.max(...keys.map((key) => titleSimilarity(clean, key)));
  const prefix = media.mediaType === 'tv' && keys.some((key) => startsWithTitle(clean, key));
  if (score < MIN_TITLE_SCORE && !prefix) return null;

  return {
    result,
    cleanTitle: clean,
    score,
    seasonScore: Number.isInteger(season) && declaredSeason(result.title) === season ? 1 : 0,
  };
}

/**
 * Lê o título de uma ficha.
 * @param {string} html - HTML da ficha.
 * @returns {Detail} Dados da ficha.
 * @throws {Error} Se a ficha não tiver `h1`.
 * @example
 * readDetail('<h1>Naruto Shippuden Dublado</h1>'); // { title: 'Naruto Shippuden Dublado' }
 */
export function readDetail(html) {
  const $ = loadHtml(html);
  const title = $('h1').eq(0).text().trim();
  if (title === '') throw new Error('Ficha sem h1');
  return { title };
}

/**
 * Seleciona o `href` do episódio pedido.
 * @param {string} html - HTML da ficha da série.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @param {string} pageTitle - `h1` da ficha, para detectar a temporada declarada.
 * @returns {string|null} URL absoluta do episódio ou null quando o par não existe.
 * @throws {Error} Se a ficha confirmada tiver um item de episódio sem link.
 * @example
 * selectEpisode(html, media, 2, 1, 'Solo Leveling 2'); // 'https://topanimes.net/episodio/...'
 */
export function selectEpisode(html, media, season, episode, pageTitle) {
  const $ = loadHtml(html);
  const list = $('ul.episodios');
  if (!list.length) return null;

  const hasNumerando = $('.numerando').length > 0;
  const declared = declaredSeason(pageTitle);
  const target = !hasNumerando && declared === season
    ? episode
    : absoluteEpisode(media, season, episode);

  const items = list.find('li');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = item.find('a[href]').eq(0).attr('href');
    if (typeof href !== 'string' || href.trim() === '') {
      throw new Error(`Episódio ${index + 1} da lista sem link`);
    }

    if (hasNumerando) {
      const match = NUMERANDO.exec(item.find('.numerando').eq(0).text().trim());
      if (match && Number(match[1]) === season && Number(match[2]) === episode) {
        return resolveUrl(href, SOURCE_URL).href;
      }
      continue;
    }

    const number = readEpisodeNumber(item);
    if (number === target) return resolveUrl(href, SOURCE_URL).href;
  }
  return null;
}

/**
 * Soma os episódios das temporadas regulares anteriores do TMDB.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {number} Número absoluto do episódio.
 * @example
 * absoluteEpisode(media, 2, 1); // 33 quando a temporada 1 tem 32 episódios
 */
export function absoluteEpisode(media, season, episode) {
  let total = episode;
  for (const item of media.seasons || []) {
    if (item.number > 0 && item.number < season) total += item.episodeCount;
  }
  return total;
}

/**
 * Lê as opções de player de uma ficha de filme ou de uma página de episódio.
 * @param {string} html - HTML da página.
 * @param {string} baseUrl - URL final da página, para resolver o iframe.
 * @returns {PlayerOption[]} Opções numéricas com iframe.
 * @example
 * readOptions('<li class="dooplay_player_option" data-nume="1"><span class="title">Blogger</span></li><div id="source-player-1"><iframe src="https://host/e/1"></iframe></div>', 'https://topanimes.net/episodio/x/');
 * // [{ number: 1, label: 'Blogger', url: 'https://host/e/1' }]
 */
export function readOptions(html, baseUrl) {
  const $ = loadHtml(html);
  const options = [];
  const items = $('li.dooplay_player_option');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr('data-nume');
    if (typeof nume !== 'string' || !/^\d+$/.test(nume.trim())) continue;

    const number = Number(nume.trim());
    const label = item.find('.title').eq(0).text().trim() || `Opção ${number}`;
    const iframe = $(`#source-player-${number} iframe`).eq(0).attr('src');
    if (typeof iframe !== 'string' || iframe.trim() === '') continue;

    options.push({ number, label, url: resolveUrl(iframe, baseUrl).href });
  }
  return options;
}

/**
 * Títulos do TMDB usados na comparação, com os romaji da temporada primeiro.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida.
 * @returns {string[]} Títulos únicos não vazios.
 */
export function titleKeys(media, season) {
  const keys = [];
  const seen = new Set();
  const add = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    const key = normalizeText(text);
    if (text === '' || key === '' || seen.has(key)) return;
    seen.add(key);
    keys.push(text);
  };

  if (Number.isInteger(season)) {
    for (const item of media.romajiTitles || []) {
      if (item && item.season === season) add(item.title);
    }
  }
  add(media.title);
  add(media.originalTitle);
  for (const item of media.romajiTitles || []) add(item && item.title);
  for (const title of media.alternativeTitles || []) add(title);
  return keys;
}

/**
 * Ano esperado para o cartão: o da temporada pedida em série, com fallback para o da série.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida.
 * @returns {number|null} Ano ou null.
 */
export function expectedYear(media, season) {
  if (media.mediaType !== 'tv' || !Number.isInteger(season)) return media.year;
  const found = (media.seasons || []).find((item) => item.number === season);
  return found && found.year !== null ? found.year : media.year;
}

/**
 * Confirma a identidade na ficha usando o mesmo critério da busca.
 * @param {Detail} detail - Dados da ficha.
 * @param {Candidate} candidate - Candidato da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida.
 * @returns {boolean} True quando o `h1` corresponde ao TMDB.
 * @example
 * confirmDetail({ title: 'Solo Leveling Dublado', altTitle: 'Ore dake Level Up na Ken' }, candidate, media, 1); // true
 */
export function confirmDetail(detail, candidate, media, season) {
  const checked = matchCandidate(
    { ...candidate.result, title: detail.title },
    media,
    season,
  );
  return checked !== null;
}

/**
 * Indica se o texto declara áudio dublado ou legendado, sem ambiguidade.
 * @param {string} text - Título do cartão ou da ficha.
 * @returns {string|null} `Dublado`, `Legendado` ou null.
 * @example
 * audioFromText('Solo Leveling Dublado'); // 'Dublado'
 * audioFromText('Dublado e Legendado'); // null
 */
export function audioFromText(text) {
  const dublado = /\bdublado\b/i.test(text);
  const legendado = /\blegendado\b/i.test(text);
  if (dublado && !legendado) return 'Dublado';
  if (legendado && !dublado) return 'Legendado';
  return null;
}

/**
 * Lê o ano de um cartão pelo `.year` ou pelo fim do `.meta` ("IMDb 8.52007").
 * @param {string} yearText - Texto de `.year`.
 * @param {string} metaText - Texto de `.meta`.
 * @returns {number|null} Ano ou null.
 */
function readCardYear(yearText, metaText) {
  const direct = /^\s*(\d{4})\s*$/.exec(yearText);
  if (direct) return Number(direct[1]);
  const match = TRAILING_YEAR.exec(metaText.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Tipo do conteúdo pela rota da ficha.
 * @param {URL} url - URL da ficha.
 * @returns {'movie'|'tv'|null} Tipo ou null quando a rota não é reconhecida.
 */
function readKind(url) {
  if (url.hostname !== SOURCE_HOST) return null;
  if (url.pathname.startsWith('/filmes/')) return 'movie';
  if (url.pathname.startsWith('/animes/')) return 'tv';
  return null;
}

/**
 * Número do episódio em um item da lista, com fallback para o texto do link.
 * @param {*} item - Elemento `li` do cheerio.
 * @returns {number|null} Número ou null.
 */
function readEpisodeNumber(item) {
  const hidden = Number(item.find('.epnumber').eq(0).text().trim());
  if (Number.isInteger(hidden) && hidden > 0) return hidden;
  const text = Number(item.find('a').eq(0).text().trim());
  return Number.isInteger(text) && text > 0 ? text : null;
}

/**
 * Indica se o título limpo começa pelo título do TMDB como palavra completa.
 * @param {string} clean - Título do cartão já limpo.
 * @param {string} key - Título do TMDB.
 * @returns {boolean}
 */
function startsWithTitle(clean, key) {
  const a = normalizeText(clean);
  const b = normalizeText(key);
  return a !== '' && b !== '' && (a === b || a.startsWith(`${b} `));
}

/**
 * Resolve uma URL relativa ou absoluta contra a base.
 * @param {string} value - Endereço lido.
 * @param {string} base - URL da página.
 * @returns {URL} URL resolvida.
 * @throws {Error} Se o endereço não for válido.
 */
function resolveUrl(value, base) {
  try {
    return new URL(value, base);
  } catch (error) {
    throw new Error(`Endereço inválido: "${value}"`, { cause: error });
  }
}

/**
 * Carrega o cheerio durante o pedido, como exige o runtime do app.
 * @param {string} html - HTML a interpretar.
 * @returns {*} Função `$` do cheerio.
 * @throws {Error} Se o módulo não estiver disponível.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
