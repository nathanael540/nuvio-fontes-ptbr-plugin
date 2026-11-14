/**
 * Busca e confirmação de identidade no AnimesDigital.
 *
 * O catálogo não aceita o ID do TMDB. A busca é textual (`/?s=<termo>`), redireciona para
 * `/pesquisa/<termo>/` e devolve cartões `div.itemA`/`div.itemE`. A ficha `/anime/a/<slug>` confirma
 * título e ano, distingue série (`div.item_ep`) de filme (sufixo `-filme` ou mídia única com um link
 * `/video/a/<id>`) e lista os episódios pelo número declarado em `div.title_anime`.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { findBestMatch, titleSimilarity } from '../_blocks/title-match/index.mjs';
import { loadHtml } from './html.js';

/** Origem do catálogo, usada como base de URLs relativas e como `Referer` das páginas. */
export const SITE_URL = 'https://animesdigital.org/';

/**
 * Cabeçalhos de contexto enviados às páginas públicas da fonte.
 * @type {Readonly<Record<string, string>>}
 */
export const SITE_HEADERS = Object.freeze({ Referer: SITE_URL });

const SEARCH_PATH = '/pesquisa/';
const ANIME_PATH = '/anime/a/';
const VIDEO_PATH = '/video/a/';
const MIN_SCORE = 0.85;
const MAX_CANDIDATES = 3;
const YEAR_TOLERANCE = 1;
const EPISODE_NUMBER = /epis[oó]dio\s+0*(\d+)(?![\d.,])/i;
const FOUR_DIGIT_YEAR = /^\d{4}$/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} Coordinates
 * @property {number|null} season - Temporada pedida; null em filme.
 * @property {number|null} episode - Episódio pedido; null em filme.
 */

/**
 * @typedef {object} SearchCard
 * @property {string} title - Título publicado no cartão.
 * @property {string} url - URL absoluta da ficha.
 * @property {string} slug - Slug lido do caminho `/anime/a/<slug>`.
 */

/**
 * @typedef {object} EpisodeCard
 * @property {string} label - Texto publicado em `div.title_anime`.
 * @property {number|null} number - Número lido de `Episódio N`, ou null quando o cartão não o declara.
 * @property {string} url - URL absoluta do link `/video/a/<id>`.
 */

/**
 * @typedef {object} DetailPage
 * @property {string} title - Texto do `h1`.
 * @property {string} cleanTitle - Título sem decorações, usado na confirmação.
 * @property {number|null} year - Ano de `div.info` (`Ano`), ou null quando ausente.
 * @property {number|null} seasonMarker - Temporada declarada no título, ou null.
 * @property {'movie'|'series'|'unknown'} kind - Tipo confirmado pela estrutura da página.
 * @property {EpisodeCard[]} episodeCards - Cartões de episódio na ordem da página.
 * @property {string[]} videoLinks - Links distintos `/video/a/<id>`.
 * @property {string} url - URL final da ficha.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {SearchCard} card - Cartão que levou à ficha.
 * @property {DetailPage} detail - Ficha confirmada.
 */

/**
 * @typedef {object} SelectedMedia
 * @property {string} url - URL absoluta da página `/video/a/<id>`.
 * @property {string} label - Título do episódio ou do filme escolhido.
 */

/**
 * Localiza a obra no catálogo pela primeira variante de título que confirmar um candidato.
 *
 * As variantes são o título PT-BR, o original, os alternativos brasileiros e os romaji do TMDB,
 * deduplicadas por `normalizeText`. Em cada variante, os cartões são pontuados por
 * `titleSimilarity`; até três candidatos são abertos. A confirmação usa `findBestMatch` com o ano de
 * `div.info` e tolerância de um ano. Candidato sem ano só é aceito quando é o único compatível; dois
 * candidatos sem ano são ambiguidade e encerram a busca com ausência.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Temporada e episódio pedidos.
 * @returns {Promise<ConfirmedCandidate|null>} Candidato confirmado ou `null` na ausência.
 * @throws {Error} Se a busca, a ficha ou a leitura da estrutura falharem.
 * @example
 * const candidate = await findCandidate(media, { season: 1, episode: 1 });
 * // candidate.detail.kind === 'series'
 */
export async function findCandidate(media, coordinates) {
  const terms = buildSearchTerms(media);
  const matchingMedia = buildMatchingMedia(media, coordinates);

  for (const term of terms) {
    const page = await fetchPage(buildSearchUrl(term), { headers: SITE_HEADERS });
    const cards = readSearchCards(page, term);
    if (cards.length === 0) continue;

    const eligible = media.mediaType === 'tv'
      ? cards.filter((card) => isSeasonEligible(readSeasonMarker(card.title), coordinates.season))
      : cards;
    const ranked = rankCards(eligible, matchingMedia).slice(0, MAX_CANDIDATES);
    if (ranked.length === 0) continue;

    const confirmed = [];
    for (const card of ranked) {
      const detail = await readDetailPage(card);
      if (!matchesType(detail, media.mediaType)) continue;
      if (media.mediaType === 'tv' && !matchesSeason(detail.seasonMarker, coordinates.season)) continue;
      if (!matchesMedia(detail, matchingMedia)) continue;
      confirmed.push({ card, detail });
      if (detail.year !== null) break;
    }

    const chosen = chooseCandidate(confirmed);
    if (chosen === AMBIGUOUS) return null;
    if (chosen !== null) return chosen;
  }

  return null;
}

/**
 * Escolhe o link da mídia na ficha confirmada.
 *
 * Em série, usa o cartão cujo `div.title_anime` declara o episódio pedido, nunca a posição na
 * lista. Em filme, exige exatamente um link `/video/a/<id>`.
 *
 * @param {DetailPage} detail - Ficha confirmada.
 * @param {Coordinates} coordinates - Temporada e episódio pedidos.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {SelectedMedia|null} Mídia escolhida ou `null` na ausência reconhecida.
 * @throws {Error} Se o catálogo declarar o episódio ou o filme com mais de um link distinto.
 * @example
 * const media = selectMedia(detail, { season: 1, episode: 25 }, 'tv');
 * // media.url === 'https://animesdigital.org/video/a/25345b001'
 */
export function selectMedia(detail, coordinates, mediaType) {
  if (mediaType === 'movie') {
    if (detail.videoLinks.length === 0) return null;
    if (detail.videoLinks.length > 1) {
      throw new Error(`Página de filme com ${detail.videoLinks.length} links de vídeo em ${detail.url}`);
    }
    return { url: detail.videoLinks[0], label: detail.title };
  }
  if (detail.kind !== 'series') return null;

  const matches = detail.episodeCards.filter((card) => card.number === coordinates.episode);
  const urls = [...new Set(matches.map((card) => card.url))];
  if (urls.length === 0) return null;
  if (urls.length > 1) {
    throw new Error(`Episódio ${coordinates.episode} com mais de um link em ${detail.url}`);
  }
  const card = matches.find((item) => item.url === urls[0]);
  return { url: urls[0], label: card.label };
}

// Marcador de resultado ambíguo, distinto de ausência e de candidato escolhido.
const AMBIGUOUS = Symbol('ambiguous');

/**
 * Escolhe o candidato confirmado: o primeiro com ano comprovado vence; sem ano comprovado, só um
 * candidato pode ser aceito.
 * @param {ConfirmedCandidate[]} confirmed - Candidatos que passaram em título, tipo e temporada.
 * @returns {ConfirmedCandidate|null|symbol} Candidato, `null` na ausência ou `AMBIGUOUS`.
 */
function chooseCandidate(confirmed) {
  if (confirmed.length === 0) return null;
  const dated = confirmed.find((item) => item.detail.year !== null);
  if (dated !== undefined) return dated;
  if (confirmed.length === 1) return confirmed[0];
  return AMBIGUOUS;
}

/**
 * Variantes de busca, na ordem do TMDB e sem repetição pelo texto normalizado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Variantes não vazias.
 * @throws {Error} Se algum título esperado não for texto.
 */
function buildSearchTerms(media) {
  const terms = [media.title, media.originalTitle]
    .concat(media.alternativeTitles, media.romajiTitles.map((item) => item.title));
  const seen = new Set();
  const result = [];
  for (const value of terms) {
    if (typeof value !== 'string') {
      throw new Error(`título de busca inválido: ${String(value)} (esperado texto)`);
    }
    const term = value.trim();
    const key = normalizeText(term) || term.toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

/**
 * Dados do TMDB usados na comparação, incluindo os títulos romaji como alternativos.
 *
 * Em série, o ano comparado é o da temporada pedida quando o TMDB a informa; sem essa informação,
 * vale o ano de estreia da série. Em filme, vale o ano do filme.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Temporada e episódio pedidos.
 * @returns {{ title: string, originalTitle: string, alternativeTitles: string[], year: number|null }} Objeto aceito por `findBestMatch`.
 */
function buildMatchingMedia(media, coordinates) {
  let year = media.year;
  if (coordinates.season !== null) {
    const season = media.seasons.find((item) => item.number === coordinates.season);
    if (season !== undefined && season.year !== null) year = season.year;
  }
  return {
    title: media.title,
    originalTitle: media.originalTitle,
    alternativeTitles: media.alternativeTitles.concat(media.romajiTitles.map((item) => item.title)),
    year,
  };
}

/**
 * Monta a URL da busca.
 * @param {string} term - Termo de busca.
 * @returns {string} URL absoluta de `/?s=<termo>`.
 * @throws {Error} Se o termo não for texto não vazio.
 * @example
 * buildSearchUrl('Kimetsu no Yaiba');
 * // 'https://animesdigital.org/?s=Kimetsu+no+Yaiba'
 */
function buildSearchUrl(term) {
  if (typeof term !== 'string' || term.trim() === '') {
    throw new Error(`termo de busca inválido: ${String(term)} (esperado texto não vazio)`);
  }
  return `${SITE_URL}?${new URLSearchParams({ s: term.trim() }).toString()}`;
}

/**
 * Lê e valida os cartões de uma página de pesquisa.
 * @param {{ url: string, text: string }} page - Página final após o redirecionamento.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {SearchCard[]} Cartões com link de anime e título, sem repetir a URL.
 * @throws {Error} Se a página não for a pesquisa esperada ou não tiver estrutura reconhecível.
 */
function readSearchCards(page, term) {
  const path = new URL(page.url).pathname;
  if (!path.startsWith(SEARCH_PATH)) {
    throw new Error(`Busca fora do esquema para "${term}": URL final ${page.url} não está em ${SEARCH_PATH}`);
  }

  const $ = loadHtml(page.text);
  const hasHeader = $('div.header_title').length > 0;
  const nodes = $('div.itemA').length + $('div.itemE').length;
  if (!hasHeader && nodes === 0) {
    throw new Error(`Busca fora do esquema para "${term}": sem header_title e sem cartões`);
  }

  const cards = new Map();
  for (const selector of ['div.itemA', 'div.itemE']) {
    const items = $(selector);
    for (let index = 0; index < items.length; index += 1) {
      const anchor = items.eq(index).find('a').eq(0);
      const href = nonEmptyText(anchor.attr('href'));
      const title = nonEmptyText(anchor.attr('title')) || nonEmptyText(anchor.text());
      if (href === null || title === null) continue;

      let url;
      try {
        url = new URL(href, page.url);
      } catch (error) {
        throw new Error(`Cartão de busca com link inválido em "${term}": "${href}"`, { cause: error });
      }
      if (!url.pathname.startsWith(ANIME_PATH)) continue;
      const slug = readSlug(url, `cartão de busca em "${term}"`);
      if (!cards.has(url.href)) cards.set(url.href, { title, url: url.href, slug });
    }
  }

  if (nodes > 0 && cards.size === 0) {
    return [];
  }
  return [...cards.values()];
}

/**
 * Pontua e ordena os cartões pela semelhança de título com o TMDB.
 * @param {SearchCard[]} cards - Cartões lidos.
 * @param {{ title: string, originalTitle: string, alternativeTitles: string[], year: number|null }} media - Dados de comparação.
 * @returns {SearchCard[]} Cartões com score maior ou igual a `MIN_SCORE`, do maior para o menor.
 */
function rankCards(cards, media) {
  const titles = [media.title, media.originalTitle].concat(media.alternativeTitles);
  return cards
    .map((card, index) => {
      const clean = cleanTitle(card.title);
      return { card, index, clean, score: bestTitleScore(clean, titles) };
    })
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.clean.length - b.clean.length || a.index - b.index)
    .map((entry) => entry.card);
}

/**
 * Maior similaridade entre um título e a lista do TMDB.
 * @param {string} title - Título do cartão sem decorações.
 * @param {string[]} titles - Títulos do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 */
function bestTitleScore(title, titles) {
  let best = 0;
  for (const candidate of titles) {
    const score = titleSimilarity(title, candidate);
    if (score > best) best = score;
  }
  return best;
}

/**
 * Abre a ficha de um cartão e lê a estrutura.
 * @param {SearchCard} card - Cartão escolhido.
 * @returns {Promise<DetailPage>} Ficha lida.
 * @throws {Error} Se a página responder fora de 2xx ou não tiver `h1`/`Ano` legíveis.
 */
async function readDetailPage(card) {
  const page = await fetchPage(card.url, { headers: SITE_HEADERS });
  const $ = loadHtml(page.text);
  const title = nonEmptyText($('h1').eq(0).text());
  if (title === null) throw new Error(`Página de detalhe sem h1 em ${page.url}`);

  const slug = readSlug(new URL(page.url), `ficha ${page.url}`);
  const episodeCards = readEpisodeCards($, page.url);
  const videoLinks = readVideoLinks($, page.url);
  const kind = classifyDetail({ slug, episodeCards, videoLinks, url: page.url });
  return {
    title,
    cleanTitle: cleanTitle(title),
    year: readYear($, page.url),
    seasonMarker: readSeasonMarker(title),
    kind,
    episodeCards,
    videoLinks,
    url: page.url,
  };
}

/**
 * Lê o ano de `div.info` com o rótulo `Ano`.
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - Ficha, para a mensagem de erro.
 * @returns {number|null} Ano de quatro dígitos ou `null` quando o campo está ausente ou vazio.
 * @throws {Error} Se o campo existir com valor fora de quatro dígitos.
 */
function readYear($, pageUrl) {
  const infos = $('div.info');
  for (let index = 0; index < infos.length; index += 1) {
    const info = infos.eq(index);
    const label = info.find('span').eq(0).text().trim();
    if (normalizeText(label) !== 'ano') continue;
    const full = info.text().trim();
    const value = full.startsWith(label) ? full.slice(label.length).trim() : full;
    if (value === '') return null;
    if (!FOUR_DIGIT_YEAR.test(value)) {
      throw new Error(`Ano inválido em ${pageUrl}: "${value}" (esperado quatro dígitos)`);
    }
    return Number(value);
  }
  return null;
}

/**
 * Lê os cartões `div.item_ep` da ficha.
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - Ficha, para a mensagem de erro.
 * @returns {EpisodeCard[]} Cartões na ordem da página.
 * @throws {Error} Se um cartão com título não tiver link de vídeo.
 */
function readEpisodeCards($, pageUrl) {
  const cards = [];
  const items = $('div.item_ep');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const label = item.find('div.title_anime').eq(0).text().trim();
    if (label === '') continue;
    const href = nonEmptyText(item.find('a').eq(0).attr('href'));
    if (href === null) throw new Error(`Cartão de episódio sem link em ${pageUrl}`);
    const url = resolveVideoUrl(href, pageUrl);
    cards.push({ label, number: readEpisodeNumber(label), url });
  }
  return cards;
}

/**
 * Lê os links distintos `/video/a/<id>` da ficha.
 * @param {*} $ - Instância do cheerio.
 * @param {string} pageUrl - Ficha, para resolver relativos.
 * @returns {string[]} URLs absolutas sem repetição, na ordem da página.
 */
function readVideoLinks($, pageUrl) {
  const links = new Set();
  const anchors = $('a');
  for (let index = 0; index < anchors.length; index += 1) {
    const href = nonEmptyText(anchors.eq(index).attr('href'));
    if (href === null) continue;
    const url = new URL(href, pageUrl);
    if (!url.pathname.startsWith(VIDEO_PATH)) continue;
    links.add(url.href);
  }
  return [...links];
}

/**
 * Confirma o tipo pela estrutura da ficha.
 * @param {{ slug: string, episodeCards: EpisodeCard[], videoLinks: string[], url: string }} detail - Partes lidas.
 * @returns {'movie'|'series'|'unknown'} Tipo confirmado.
 * @throws {Error} Se a página misturar estrutura de filme e de série.
 */
function classifyDetail({ slug, episodeCards, videoLinks, url }) {
  const isMovieSlug = slug.endsWith('-filme');
  if (isMovieSlug && episodeCards.length > 1) {
    throw new Error(`Página de filme com ${episodeCards.length} cartões de episódio em ${url}`);
  }
  if (isMovieSlug) return 'movie';
  if (episodeCards.length > 0) return 'series';
  if (videoLinks.length === 1) return 'movie';
  if (videoLinks.length > 1) {
    throw new Error(`Página sem lista de episódios com ${videoLinks.length} links de vídeo em ${url}`);
  }
  return 'unknown';
}

/**
 * Indica se a ficha corresponde ao tipo pedido.
 *
 * Para filme, além da ficha marcada como filme, aceita uma página com um único link de vídeo e no
 * máximo um cartão de episódio numerado como 1: o catálogo publica alguns filmes em `/anime/a/` com
 * um pseudoepisódio `Episódio 01`, sem o sufixo `-filme` no endereço.
 *
 * @param {DetailPage} detail - Ficha lida.
 * @param {'movie'|'tv'} mediaType - Tipo do pedido.
 * @returns {boolean}
 */
function matchesType(detail, mediaType) {
  if (mediaType === 'movie') return detail.kind === 'movie' || isSingleMediaPage(detail);
  return detail.kind === 'series';
}

/**
 * Indica se a ficha representa uma mídia única (filme ou episódio avulso).
 * @param {DetailPage} detail - Ficha lida.
 * @returns {boolean} True com um único link e nenhum cartão além do episódio 1.
 */
function isSingleMediaPage(detail) {
  if (detail.videoLinks.length !== 1) return false;
  if (detail.episodeCards.length === 0) return true;
  return detail.episodeCards.length === 1 && detail.episodeCards[0].number === 1;
}

/**
 * Indica se o marcador de temporada do cartão permite abrir a ficha para a temporada pedida.
 * Cartão sem marcador continua elegível porque pode ser a página da temporada sem o número.
 * @param {number|null} marker - Temporada declarada no cartão.
 * @param {number|null} requested - Temporada pedida.
 * @returns {boolean}
 */
function isSeasonEligible(marker, requested) {
  return marker === null || marker === requested;
}

/**
 * Indica se a temporada declarada atende ao pedido.
 *
 * Temporada 1 é aceita sem marcador. Temporada maior exige marcador igual ao número pedido.
 *
 * @param {number|null} marker - Temporada declarada no título.
 * @param {number|null} requested - Temporada pedida.
 * @returns {boolean}
 */
function matchesSeason(marker, requested) {
  if (marker === null) return requested === 1;
  return marker === requested;
}

/**
 * Confirma título e ano com `findBestMatch`.
 * @param {DetailPage} detail - Ficha lida.
 * @param {{ title: string, originalTitle: string, alternativeTitles: string[], year: number|null }} matchingMedia - Dados do TMDB.
 * @returns {boolean} True quando o título é compatível e o ano não diverge mais de um ano.
 */
function matchesMedia(detail, matchingMedia) {
  return findBestMatch(
    [{ title: detail.cleanTitle, year: detail.year }],
    matchingMedia,
    { yearTolerance: YEAR_TOLERANCE },
  ) !== null;
}

/**
 * Lê o número declarado em `div.title_anime`, sem aceitar decimais como `Episódio 13.5`.
 * @param {string} label - Texto do cartão.
 * @returns {number|null} Número do episódio ou `null`.
 */
function readEpisodeNumber(label) {
  const match = EPISODE_NUMBER.exec(label);
  return match === null ? null : Number(match[1]);
}

/**
 * Resolve um link de vídeo da ficha.
 * @param {string} href - Valor publicado.
 * @param {string} pageUrl - Ficha de origem.
 * @returns {string} URL absoluta em `/video/a/`.
 * @throws {Error} Se o valor não formar URL de vídeo.
 */
function resolveVideoUrl(href, pageUrl) {
  let url;
  try {
    url = new URL(href, pageUrl);
  } catch (error) {
    throw new Error(`Link de vídeo inválido em ${pageUrl}: "${href}"`, { cause: error });
  }
  if (!url.pathname.startsWith(VIDEO_PATH)) {
    throw new Error(`Link fora de ${VIDEO_PATH} em ${pageUrl}: "${href}"`);
  }
  return url.href;
}

/**
 * Lê o slug de uma URL de ficha.
 * @param {URL} url - URL da ficha.
 * @param {string} label - Contexto para a mensagem de erro.
 * @returns {string} Slug decodificado, sem barras finais.
 * @throws {Error} Se o caminho não for de anime ou não tiver slug.
 */
function readSlug(url, label) {
  if (!url.pathname.startsWith(ANIME_PATH)) {
    throw new Error(`URL fora de ${ANIME_PATH} em ${label}: ${url.href}`);
  }
  const raw = url.pathname.slice(ANIME_PATH.length).replace(/\/+$/, '');
  if (raw === '') throw new Error(`URL de anime sem slug em ${label}: ${url.href}`);
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    throw new Error(`Slug inválido em ${label}: ${url.href}`, { cause: error });
  }
}

/**
 * Remove as decorações do título publicado (prefixo `Assistir`; áudio, tipo e sufixos de página).
 * Marcadores de temporada são preservados.
 * @param {string} raw - Título publicado.
 * @returns {string} Título sem as decorações.
 */
function stripTrailingDecorations(raw) {
  let title = raw.replace(/\s+/g, ' ').trim().replace(/^assistir\s+/i, '');
  let previous;
  do {
    previous = title;
    title = title.replace(/\s*[-–—]\s*(?:dublado|legendado|filme)\b\s*$/i, '');
    title = title.replace(/\s*\b(?:dublado|legendado|filme)\b\s*$/i, '');
    title = title.replace(/\s*[-–—]?\s*(?:todos os epis[oó]dios|completo|online em hd|online|em hd)\s*$/i, '');
    title = title.replace(/\s{2,}/g, ' ').trim();
  } while (title !== previous && title !== '');
  return title.replace(/\s*[-–—:]\s*$/, '').trim();
}

/**
 * Limpa o título para comparação: remove decorações, áudio/tipo e marcadores de temporada.
 * @param {string} raw - Título publicado.
 * @returns {string} Título comparável.
 * @example
 * cleanTitle('Assistir Kimetsu no Yaiba Dublado Online em HD'); // 'Kimetsu no Yaiba'
 */
function cleanTitle(raw) {
  let title = stripTrailingDecorations(raw);
  let previous;
  do {
    previous = title;
    title = title.replace(/\s*[-–—]?\s*(?:temporada|season)\s+\d+\s*$/i, '');
    title = title.replace(/\s*[-–—]?\s*\d+\s*ª\s*temporada\s*$/i, '');
    title = title.replace(/\s*[-–—]\s*\d+\s*$/i, '');
    title = title.replace(/\s{2,}/g, ' ').trim();
  } while (title !== previous && title !== '');
  title = title.replace(/\s+\d+\s*$/, '').trim();
  return title.replace(/\s*[-–—:,]\s*$/, '').trim();
}

/**
 * Lê a temporada declarada no título do candidato.
 * @param {string} raw - Título publicado.
 * @returns {number|null} Número declarado (`Temporada N`, `Season N`, `Nª Temporada` ou sufixo numérico).
 * @example
 * readSeasonMarker('Jujutsu Kaisen 2'); // 2
 * readSeasonMarker('Kimetsu no Yaiba: Yuukaku-hen'); // null
 */
function readSeasonMarker(raw) {
  const title = stripTrailingDecorations(raw);
  let match = /(?:temporada|season)\s+(\d+)/i.exec(title);
  if (match !== null) return Number(match[1]);
  match = /(\d+)\s*ª\s*temporada/i.exec(title);
  if (match !== null) return Number(match[1]);
  match = /(?:[-–—]\s*|\s)(\d+)\s*$/.exec(title);
  return match === null ? null : Number(match[1]);
}

/**
 * Devolve o texto aparado ou `null` quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}
