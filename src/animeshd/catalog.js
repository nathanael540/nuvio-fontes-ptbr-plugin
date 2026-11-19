/**
 * Busca e confirmação de identidade no AnimesHD.
 *
 * A fonte não aceita o ID do TMDB. A busca é `GET /?s=<termo>` e devolve cartões `div.result-item`
 * com o título em `div.title a` e o ano em `span.year`. O `h1` da ficha combina romaji e título em
 * inglês entre parênteses, então a confirmação compara o texto inteiro, o texto antes dos parênteses
 * e cada grupo entre parênteses com os títulos do TMDB.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { SITE_URL, buildSearchUrl, loadHtml, readYear, textOf } from './site.js';

const MIN_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const MAX_CANDIDATES = 4;
const FOUR_DIGIT_YEAR = /^\d{4}$/;
const TITLE_SUFFIXES = [
  /[\s\-–—|:]+todos\s+(?:os\s+)?epis[oó]dios?(?:\s+online)?\s*$/i,
  /[\s\-–—|:]+anime\s+completo\s*$/i,
  /[\s\-–—|:]+dublado\s+e\s+legendado\s*$/i,
  /[\s\-–—|:]+(?:dublado|legendado)\s*$/i,
  /[\s\-–—|:]+(?:cl[aá]ssico|classic)\s*$/i,
  /[\s\-–—|:]+online\s*$/i,
  /[\s\-–—|:]+hd\s*$/i,
];

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 */

/**
 * @typedef {object} Candidate
 * @property {string} url - Página do cartão em `/animes/<slug>/`.
 * @property {string} title - Título publicado no cartão.
 * @property {number|null} year - Ano do cartão, quando a fonte publica.
 */

/**
 * @typedef {object} ConfirmedCandidate
 * @property {string} url - URL final da ficha.
 * @property {string} title - `h1` limpo dos sufixos de catálogo.
 * @property {number} year - Ano publicado em `span.date`.
 * @property {string} html - HTML da ficha, reaproveitado na seleção do episódio.
 */

/**
 * @typedef {object} MatchingMedia
 * @property {string} title - Título PT-BR do TMDB.
 * @property {string} originalTitle - Título original do TMDB.
 * @property {string[]} alternativeTitles - Alternativos brasileiros e romaji do TMDB.
 * @property {number|null} year - Ano do TMDB.
 */

/**
 * Localiza a série no catálogo pelas variantes de título do TMDB.
 *
 * As variantes são consultadas na ordem romaji geral, PT-BR, original, alternativos brasileiros e
 * romaji com temporada, sem repetição pelo texto normalizado. Os cartões são acumulados por URL e
 * no máximo quatro fichas são abertas, priorizadas pela similaridade com os títulos do TMDB.
 *
 * @param {MediaInfo} media - Dados do TMDB já obtidos por `getMediaInfo`.
 * @param {string} [providerName] - Nome do provedor, usado no aviso de termo descartado.
 * @returns {Promise<ConfirmedCandidate|null>} Ficha confirmada ou `null` na ausência reconhecida.
 * @throws {Error} Se uma busca ou ficha responder fora de 2xx, se a busca não tiver cartões nem o
 *   marcador de nenhum resultado, ou se uma ficha 200 não publicar `h1` ou `span.date`.
 * @example
 * const media = await getMediaInfo({ tmdbId: '85937', mediaType: 'tv' });
 * const candidate = await findCandidate(media, 'AnimesHD');
 * // { url: 'https://animeshd.to/animes/kimetsu-no-yaiba-demon-slayer-online/', ... }
 */
export async function findCandidate(media, providerName) {
  const matching = buildMatchingMedia(media);
  const candidates = new Map();
  const failures = [];

  for (const term of buildSearchTerms(media)) {
    let results;
    try {
      const search = await fetchPage(buildSearchUrl(term), { profile: 'page' });
      results = parseSearchResults(search.text, term);
    } catch (error) {
      const message = error.message;
      failures.push({ term, message });
      if (providerName !== undefined) {
        console.warn(`[${providerName}] Busca "${term}" descartada: ${message}`);
      }
      continue;
    }
    for (const result of results) {
      if (!candidates.has(result.url)) candidates.set(result.url, result);
    }
  }

  const ranked = [...candidates.values()]
    .map((candidate) => ({ candidate, score: bestTitleScore(candidate.title, matching) }))
    .sort((left, right) => right.score - left.score);

  for (const item of ranked.slice(0, MAX_CANDIDATES)) {
    const confirmed = await confirmCandidate(item.candidate, matching);
    if (confirmed !== null) return confirmed;
  }

  if (failures.length > 0) {
    const causes = failures.map((failure) => `${failure.term}: ${failure.message}`).join('; ');
    throw new Error(`Nenhuma busca produziu candidato: ${causes}`);
  }
  return null;
}

/**
 * Variantes de busca, na ordem do TMDB e sem repetição pelo texto normalizado.
 *
 * O romaji geral vem primeiro porque a fonte publica a ficha pelo título romaji mesmo quando o
 * TMDB tem um título PT-BR diferente. Os romaji com temporada ficam por último: a fonte agrupa as
 * temporadas em uma única ficha e o título do arco pode não existir como página própria.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Variantes não vazias.
 * @throws {Error} Se algum título esperado não for texto.
 * @example
 * buildSearchTerms({ title: 'Demon Slayer: Kimetsu no Yaiba', originalTitle: '鬼滅の刃', alternativeTitles: [], romajiTitles: [{ title: 'Kimetsu no Yaiba', season: null }] });
 * // ['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba', '鬼滅の刃']
 */
export function buildSearchTerms(media) {
  const romaji = Array.isArray(media.romajiTitles) ? media.romajiTitles : [];
  const generalRomaji = romaji.filter((item) => item.season === null).map((item) => item.title);
  const seasonRomaji = romaji.filter((item) => item.season !== null).map((item) => item.title);
  const alternatives = Array.isArray(media.alternativeTitles) ? media.alternativeTitles : [];
  const values = [...generalRomaji, media.title, media.originalTitle, ...alternatives, ...seasonRomaji];

  const seen = new Set();
  const terms = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      throw new Error(`Título de busca inválido: ${String(value)} (esperado texto)`);
    }
    const term = value.trim();
    const key = normalizeText(term) || term.toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

/**
 * Dados do TMDB usados na comparação.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {MatchingMedia} Títulos do TMDB, com romaji acrescentados aos alternativos.
 */
function buildMatchingMedia(media) {
  const romaji = Array.isArray(media.romajiTitles) ? media.romajiTitles.map((item) => item.title) : [];
  const alternatives = Array.isArray(media.alternativeTitles) ? media.alternativeTitles : [];
  return {
    title: media.title,
    originalTitle: media.originalTitle,
    alternativeTitles: alternatives.concat(romaji),
    year: media.year,
  };
}

/**
 * Lê os cartões da página de busca.
 *
 * O contêiner observado é `div.result-item` com o título em `div.title a` e o ano em `span.year`.
 * A ausência é reconhecida pelo marcador `body.search-no-results`; sem cartões e sem o marcador, a
 * página é tratada como mudança de layout.
 *
 * @param {string} html - HTML da página de busca.
 * @param {string} term - Termo consultado, para a mensagem de erro.
 * @returns {Candidate[]} Cartões na ordem da página.
 * @throws {Error} Se a busca não tiver cartões nem o marcador de nenhum resultado, ou se um cartão
 *   não tiver endereço ou título.
 * @example
 * parseSearchResults('<div class="result-item"><div class="title"><a href="/animes/naruto/">Naruto</a></div><span class="year">2002</span></div>', 'Naruto');
 * // [{ url: 'https://animeshd.to/animes/naruto/', title: 'Naruto', year: 2002 }]
 */
export function parseSearchResults(html, term) {
  const $ = loadHtml(html);
  const cards = $('div.result-item');
  if (cards.length === 0) {
    if ($('body.search-no-results').length > 0) return [];
    throw new Error(`Busca de "${term}" sem cartões e sem o marcador de nenhum resultado`);
  }

  const results = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const anchor = card.find('div.title a').eq(0);
    const href = anchor.attr('href');
    const title = textOf(anchor);
    if (!href || title === '') {
      throw new Error(`Cartão de busca ${index} de "${term}" sem endereço ou título`);
    }
    results.push({ url: new URL(href, SITE_URL).href, title, year: readCardYear(card) });
  }
  return results;
}

/**
 * Lê o ano do cartão quando a fonte publica `span.year`.
 * @param {*} card - Seleção do cartão.
 * @returns {number|null} Ano de quatro dígitos ou `null` quando ausente.
 */
function readCardYear(card) {
  const text = textOf(card.find('span.year').eq(0));
  if (!FOUR_DIGIT_YEAR.test(text)) return null;
  return Number(text);
}

/**
 * Abre a ficha do cartão e confirma título e ano.
 * @param {Candidate} card - Cartão da busca.
 * @param {MatchingMedia} matching - Títulos e ano do TMDB.
 * @returns {Promise<ConfirmedCandidate|null>} Ficha confirmada ou `null` quando rejeitada ou removida.
 * @throws {Error} Se a ficha responder fora de 2xx (exceto 404) ou não publicar `h1`/`span.date`.
 */
async function confirmCandidate(card, matching) {
  let page;
  try {
    page = await fetchPage(card.url, { profile: 'page' });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return null;
    throw error;
  }

  const $ = loadHtml(page.text);
  const h1 = textOf($('.sheader h1').eq(0)) || textOf($('h1').eq(0));
  if (h1 === '') throw new Error(`Ficha ${page.url} sem h1`);
  const date = textOf($('.sheader span.date').eq(0));
  if (date === '') throw new Error(`Ficha ${page.url} sem span.date`);
  const year = readYear(date);
  if (year === null) throw new Error(`Ficha ${page.url} com span.date sem ano: "${date}"`);

  if (!yearMatches(year, matching.year)) return null;
  if (bestTitleScore(h1, matching) < MIN_SCORE) return null;
  return { url: page.url, title: cleanCatalogTitle(h1), year, html: page.text };
}

/**
 * Indica se o ano da ficha está dentro da tolerância do ano do TMDB.
 * @param {number} candidateYear - Ano publicado pela fonte.
 * @param {number|null} mediaYear - Ano do TMDB.
 * @returns {boolean}
 */
function yearMatches(candidateYear, mediaYear) {
  if (mediaYear === null) return true;
  return Math.abs(candidateYear - mediaYear) <= YEAR_TOLERANCE;
}

/**
 * Maior similaridade entre o título da fonte e os títulos do TMDB.
 * @param {string} title - Título publicado na busca ou na ficha.
 * @param {MatchingMedia} matching - Títulos do TMDB.
 * @returns {number} Score entre 0 e 1.
 */
function bestTitleScore(title, matching) {
  const titles = [matching.title, matching.originalTitle].concat(matching.alternativeTitles);
  let best = 0;
  for (const variant of titleVariants(title)) {
    for (const candidate of titles) {
      if (typeof candidate !== 'string') continue;
      best = Math.max(best, titleSimilarity(variant, candidate));
    }
  }
  return best;
}

/**
 * Partes comparáveis de um título publicado.
 *
 * Além do texto limpo, considera o texto antes dos parênteses e cada grupo entre parênteses. É o
 * que confirma `Shingeki No Kyojin (Attack on Titan)` pelo título inglês e
 * `Kimetsu no Yaiba (Demon Slayer)` pelo romaji.
 *
 * @param {string} title - Título publicado.
 * @returns {string[]} Partes não vazias, sem repetição.
 * @throws {Error} Se o título ficar vazio depois da limpeza.
 * @example
 * titleVariants('Shingeki No Kyojin (Attack on Titan)');
 * // ['Shingeki No Kyojin (Attack on Titan)', 'Shingeki No Kyojin', 'Attack on Titan']
 */
export function titleVariants(title) {
  const cleaned = cleanCatalogTitle(title);
  const variants = [cleaned];
  const groups = [];
  const pattern = /\(([^)]+)\)/g;
  let match = pattern.exec(cleaned);
  while (match !== null) {
    const group = match[1].trim();
    if (group !== '') groups.push(group);
    match = pattern.exec(cleaned);
  }
  const base = cleaned.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (base !== '' && base !== cleaned) variants.push(base);
  for (const group of groups) {
    if (!variants.includes(group)) variants.push(group);
  }
  return variants;
}

/**
 * Remove os sufixos de catálogo do título publicado, em qualquer ordem e repetidamente.
 * @param {string} title - Título principal da ficha ou do cartão.
 * @returns {string} Título limpo.
 * @throws {Error} Se o título ficar vazio depois da limpeza.
 * @example
 * cleanCatalogTitle('Dragon Ball Z Dublado'); // 'Dragon Ball Z'
 * cleanCatalogTitle('One Piece Todos os Episódios Online'); // 'One Piece'
 */
export function cleanCatalogTitle(title) {
  let text = typeof title === 'string' ? title.trim() : '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TITLE_SUFFIXES) {
      const next = text.replace(pattern, '').trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  if (text === '') throw new Error(`Título de ficha vazio depois da limpeza: "${String(title)}"`);
  return text;
}
