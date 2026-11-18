/**
 * Catálogo e API da VenoPlay.
 *
 * A semente `https://www2.venoplay.com` é resolvida a cada chamada; o host final é usado na
 * busca, na página e no `get_players`, sem cache. A busca lê os cartões `div.poster-card` e a
 * página confirma título, tipo e ano no JSON-LD. O `get_players` devolve as opções de player.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';

const SEED_URL = 'https://www2.venoplay.com';
const FALLBACK_URL = 'https://w2.venoplay.site';
const SEARCH_PATH = '/busca?q=';
const API_PATH = '/api/get_players';
const SITE_ID = '4';
const NO_RESULTS = /site search yielded no results/i;
const MEDIA_ID = /const\s+mediaId\s*=\s*(\d+)/;
const MEDIA_ID_API = /get_players\?id=(\d+)/;
const CARD_URL = /location\.href\s*=\s*['"]([^'"]+)['"]/i;
const VENOPLAY_HOSTS = new Set(['w2.venoplay.site', 'www2.venoplay.com', 'venoplay.site', 'www.venoplay.site']);

/**
 * @typedef {object} VenoPlayContent
 * @property {string} url - URL final da página do título.
 * @property {string} html - HTML da página.
 * @property {string} mediaId - ID interno publicado pela página.
 * @property {string} title - Título lido no JSON-LD.
 * @property {number} year - Ano lido no JSON-LD.
 */

/**
 * @typedef {object} VenoPlayPlayer
 * @property {string} name - Rótulo do player, ex.: "Dublado".
 * @property {string} url - URL do player.
 */

/**
 * Resolve a origem vigente da VenoPlay.
 *
 * Usa `fetchPage` para seguir o redirecionamento da semente e devolve a origem final. Sem
 * redirecionamento, a própria semente é usada. Se a semente falhar, devolve o host reserva.
 *
 * @returns {Promise<string>} Origem http(s) sem barra final.
 * @throws {Error} Se a URL final da semente não for http(s).
 * @example
 * const origin = await resolveSite();
 * // 'https://w2.venoplay.site'
 */
export async function resolveSite() {
  try {
    const page = await fetchPage(SEED_URL);
    return new URL(page.url).origin;
  } catch {
    return FALLBACK_URL;
  }
}

/**
 * Localiza a página de um filme ou série.
 *
 * Busca pelo título PT-BR e, se necessário, pelo título original. Cartões de tipo divergente
 * são descartados; a página precisa confirmar o título, o tipo e o ano. Mais de um candidato
 * confirmado no mesmo termo é ausência por ambiguidade.
 *
 * @param {string} origin - Origem vigente da fonte.
 * @param {{ mediaType: 'movie'|'tv' }} request - Pedido validado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<VenoPlayContent|null>} Página confirmada ou null em ausência/ambiguidade.
 * @throws {Error} Em falha de rede, HTTP, estrutura ou página fora do formato.
 * @example
 * const content = await findContent('https://w2.venoplay.site', { mediaType: 'movie' }, media);
 * // { url: '...', html: '...', mediaId: '1518', title: 'Clube da Luta', year: 1999 }
 */
export async function findContent(origin, request, media) {
  const queries = uniqueQueries([media.title, media.originalTitle]);
  for (const query of queries) {
    const search = await fetchPage(`${origin}${SEARCH_PATH}${encodeURIComponent(query)}`);
    const cards = parseSearchResults(search.text, search.url);
    const confirmed = [];
    for (const card of cards) {
      if (!matchesType(card.type, request.mediaType)) continue;
      const page = await fetchPage(card.url);
      const identity = readIdentity(page.text, page.url, card.type);
      if (!matchesType(identity.type, request.mediaType)) continue;
      if (!matchesTitle(identity.title, media)) continue;
      if (media.year !== null && identity.year !== media.year) continue;
      confirmed.push({
        url: page.url,
        html: page.text,
        mediaId: identity.mediaId,
        title: identity.title,
        year: identity.year,
      });
    }
    if (confirmed.length > 1) return null;
    if (confirmed.length === 1) return confirmed[0];
  }
  return null;
}

/**
 * Consulta o `get_players` da página confirmada.
 *
 * Em filme, `season_number` e `episode_number` vão vazios; em série, levam as coordenadas do
 * pedido. `players` em lista vazia é ausência; fora desse contrato, é erro.
 *
 * @param {string} origin - Origem vigente da fonte.
 * @param {VenoPlayContent} content - Página confirmada.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<VenoPlayPlayer[]>} Opções de player; lista vazia é ausência.
 * @throws {Error} Em HTTP, JSON ou estrutura inválida.
 * @example
 * const players = await fetchPlayers(origin, content, request);
 * // [{ name: 'Dublado', url: 'https://mgeb.space/embed/550?media_id=1518&site_id=4' }]
 */
export async function fetchPlayers(origin, content, request) {
  const season = request.mediaType === 'tv' ? String(request.season) : '';
  const episode = request.mediaType === 'tv' ? String(request.episode) : '';
  const url = `${origin}${API_PATH}?id=${content.mediaId}&season_number=${season}&episode_number=${episode}&site_id=${SITE_ID}`;
  const data = await fetchJson(url, {
    profile: 'api',
    headers: {
      Accept: 'application/json',
      Referer: content.url,
    },
  });
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Resposta do get_players não é objeto');
  }
  if (!Array.isArray(data.players)) {
    throw new Error('Resposta do get_players sem players em lista');
  }
  return data.players.map((player, index) => readPlayer(player, index));
}

/**
 * Lê um item de `players`.
 *
 * @param {*} player - Item recebido.
 * @param {number} index - Posição para a mensagem.
 * @returns {VenoPlayPlayer} Player validado.
 * @throws {Error} Se o nome ou a URL estiverem ausentes ou fora de http(s).
 */
function readPlayer(player, index) {
  if (player === null || typeof player !== 'object' || Array.isArray(player)) {
    throw new Error(`Player ${index + 1} não é objeto`);
  }
  const name = typeof player.name === 'string' ? player.name.trim() : '';
  if (name === '') throw new Error(`Player ${index + 1} sem nome`);
  if (typeof player.url !== 'string') throw new Error(`Player ${index + 1} sem URL`);
  let url;
  try {
    url = new URL(player.url);
  } catch {
    throw new Error(`Player ${index + 1} com URL inválida`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Player ${index + 1} com URL fora de http(s)`);
  }
  return { name, url: url.href };
}

/**
 * Lê os cartões `div.poster-card`.
 *
 * @param {string} html - HTML da busca.
 * @param {string} pageUrl - URL da busca, usada para resolver links relativos.
 * @returns {{ title: string, type: string, url: string }[]} Cartões únicos na ordem da página.
 * @throws {Error} Se um cartão estiver fora do formato ou a busca não tiver cartões nem ausência.
 */
function parseSearchResults(html, pageUrl) {
  const $ = getCheerio().load(html);
  const cards = $('div.poster-card');
  if (cards.length === 0) {
    if (NO_RESULTS.test(html)) return [];
    throw new Error('Busca sem cartões nem mensagem explícita de ausência');
  }
  const results = [];
  const seen = new Set();
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const title = card.find('h3').first().text().trim();
    const type = card.find('p').first().text().trim();
    const onclick = card.attr('onclick') || '';
    const match = CARD_URL.exec(onclick);
    if (title === '' || type === '' || match === null) {
      throw new Error(`Cartão ${index + 1} da busca sem título, tipo ou location.href`);
    }
    const url = new URL(match[1], pageUrl);
    if (!VENOPLAY_HOSTS.has(url.hostname)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    results.push({ title, type, url: url.href });
  }
  return results;
}

/**
 * Lê a identidade da página, com o JSON-LD como fonte preferida.
 *
 * Várias páginas publicam um bloco JSON-LD vazio; nesse caso, o título sai do `h1`, o ano de
 * `datePublished` embutido no HTML e o tipo do cartão de busca. O `mediaId` continua obrigatório.
 *
 * @param {string} html - HTML da página.
 * @param {string} url - URL da página, usada nas mensagens de erro.
 * @param {string} cardType - Tipo publicado no cartão (`Filme`/`Série`).
 * @returns {{ title: string, type: string, year: number, mediaId: string }} Identidade lida.
 * @throws {Error} Se faltar título, ano, tipo ou `mediaId`.
 */
function readIdentity(html, url, cardType) {
  const $ = getCheerio().load(html);
  const jsonLd = readJsonLd($);
  const structuredTitle = jsonLd !== null && typeof jsonLd.name === 'string' ? jsonLd.name.trim() : '';
  const structuredDate = jsonLd !== null && typeof jsonLd.datePublished === 'string' ? jsonLd.datePublished.trim() : '';
  const title = structuredTitle !== '' ? structuredTitle : readPageTitle($);
  if (title === '') throw new Error(`Página ${url} sem título`);
  const type = jsonLd !== null && (jsonLd['@type'] === 'Movie' || jsonLd['@type'] === 'TVSeries')
    ? jsonLd['@type']
    : cardType;
  const date = structuredDate !== '' ? structuredDate : readDatePublished(html);
  const yearMatch = /^(\d{4})/.exec(date);
  if (yearMatch === null) throw new Error(`Página ${url} sem ano`);
  const mediaIdMatch = MEDIA_ID.exec(html) || MEDIA_ID_API.exec(html);
  if (mediaIdMatch === null) throw new Error(`Página ${url} sem mediaId`);
  return {
    title,
    type,
    year: Number(yearMatch[1]),
    mediaId: mediaIdMatch[1],
  };
}

/**
 * Lê o primeiro JSON-LD de filme ou série da página.
 *
 * Blocos vazios ou inválidos são ignorados; uma página sem JSON-LD utilizável devolve null.
 *
 * @param {object} $ - Instância do cheerio.
 * @returns {object|null} Objeto JSON-LD com `@type` Movie ou TVSeries, ou null.
 */
function readJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');
  for (let index = 0; index < scripts.length; index += 1) {
    if (scripts.eq(index).attr('type') !== 'application/ld+json') continue;
    const text = scripts.eq(index).text().trim();
    if (text === '') continue;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      if (value['@type'] === 'Movie' || value['@type'] === 'TVSeries') return value;
    }
  }
  return null;
}

/**
 * Lê o título visível da página.
 * @param {object} $ - Instância do cheerio.
 * @returns {string} Texto do `h1` ou, sem ele, o `<title>` sem o prefixo/sufixo do site.
 */
function readPageTitle($) {
  const heading = $('h1').first().text().replace(/\s+/g, ' ').trim();
  if (heading !== '') return heading;
  return $('title')
    .first()
    .text()
    .replace(/^Assistir\s+/i, '')
    .replace(/\s+Online Grátis.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lê o ano de `datePublished` embutido no HTML, mesmo quando o JSON-LD está vazio.
 * @param {string} html - HTML da página.
 * @returns {string} Ano em quatro dígitos ou string vazia.
 */
function readDatePublished(html) {
  const match = /"datePublished"\s*:\s*"(\d{4})/.exec(html)
    || /datePublished\s*[:=]\s*["']?(\d{4})/.exec(html);
  return match === null ? '' : match[1];
}

/**
 * Confere o tipo declarado com o tipo pedido.
 *
 * @param {string} value - Tipo do cartão (`Filme`/`Série`) ou do JSON-LD (`Movie`/`TVSeries`).
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {boolean} True quando o tipo confere.
 */
function matchesType(value, mediaType) {
  const normalized = normalizeText(value);
  if (mediaType === 'movie') return normalized === 'filme' || normalized === 'movie';
  return normalized === 'serie' || normalized === 'tvseries';
}

/**
 * Confere o título da página com os títulos do TMDB por igualdade normalizada.
 *
 * @param {string} title - Título lido no JSON-LD.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} True quando o título confere.
 */
function matchesTitle(title, media) {
  const normalized = normalizeText(title);
  if (normalized === '') return false;
  return mediaTitles(media).some((reference) => normalizeText(reference) === normalized);
}

/**
 * Títulos do TMDB usados na confirmação.
 *
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos.
 */
function mediaTitles(media) {
  return [media.title, media.originalTitle, ...media.alternativeTitles];
}

/**
 * Remove termos vazios e repetidos, preservando a ordem recebida.
 *
 * @param {(string|null|undefined)[]} values - Termos candidatos.
 * @returns {string[]} Termos únicos e não vazios.
 */
function uniqueQueries(values) {
  const queries = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const query = value.trim();
    if (query === '') continue;
    const key = normalizeText(query);
    const dedupeKey = key === '' ? query.toLowerCase() : key;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    queries.push(query);
  }
  return queries;
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
