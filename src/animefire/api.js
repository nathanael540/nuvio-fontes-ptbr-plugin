/**
 * Leitura da API pública do AnimeFire.
 *
 * A SPA do site consulta `https://api.animefire.one` para busca, ficha do anime e opções de
 * reprodução. Cada resposta é validada antes de chegar ao extrator: JSON fora do esquema lança
 * erro de estrutura, nunca ausência.
 */

import { fetchJson } from '../_blocks/http/index.mjs';

const API_BASE = 'https://api.animefire.one';
const TITLE_KEYS = ['BR', 'US', 'JP'];
const PUBLISHED_AT = /^(\d{4})-\d{2}-\d{2}/;

/**
 * @typedef {object} SearchItem
 * @property {string} id - ID opaco do anime na fonte.
 * @property {string[]} titles - Títulos publicados (BR, US e JP), sem vazios.
 * @property {number|null} year - Ano de estreia lido de `published_at`.
 */

/**
 * @typedef {object} SearchPage
 * @property {SearchItem[]} items - Itens da página.
 * @property {number} lastPage - Última página informada por `meta.last_page`.
 */

/**
 * @typedef {object} AnimeEpisode
 * @property {string} id - ID opaco do episódio na fonte.
 * @property {number|null} season - Temporada declarada; `null` em filme.
 * @property {number} number - Número do episódio dentro da temporada.
 */

/**
 * @typedef {object} AnimeSheet
 * @property {string} format - Tipo publicado pela fonte (`tv` ou `movie`).
 * @property {AnimeEpisode[]} episodes - Episódios declarados na ficha.
 */

/**
 * @typedef {object} EpisodeOption
 * @property {string} audio - Áudio anunciado (`dublado`, `legendado` ou outro texto da fonte).
 * @property {boolean} isOffline - Opção marcada como indisponível pela própria fonte.
 * @property {string|null} url - Master HLS publicado; `null` quando a URL não veio.
 * @property {string[]} qualities - Resoluções declaradas pela fonte.
 */

/**
 * Busca animes por título.
 *
 * @param {string} query - Título a procurar.
 * @param {number} page - Página, a partir de 1.
 * @returns {Promise<SearchPage>} Itens da página e a última página.
 * @throws {Error} Se a resposta não for 2xx, não for JSON válido ou estiver fora do esquema.
 * @example
 * const page = await searchAnime('Naruto', 1);
 * // page.items[0].titles[0] === 'Naruto', page.lastPage === 3
 */
export async function searchAnime(query, page) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: título vazio (recebido: ${describe(query)})`);
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Busca inválida: página "${page}" (esperado inteiro a partir de 1)`);
  }

  const url = `${API_BASE}/animes/pesquisar?${new URLSearchParams({ q: query.trim(), page: String(page) }).toString()}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body)) throw new Error(`Busca fora do esquema em ${url}: resposta não é objeto`);
  if (!Array.isArray(body.data)) throw new Error(`Busca fora do esquema em ${url}: "data" ausente ou fora de array`);
  if (!isPlainObject(body.meta) || !Number.isInteger(body.meta.last_page) || body.meta.last_page < 1) {
    throw new Error(`Busca fora do esquema em ${url}: "meta.last_page" inválido`);
  }

  const items = body.data.map((item, index) => readSearchItem(item, `data[${index}]`));
  return { items, lastPage: body.meta.last_page };
}

/**
 * Busca a ficha de um anime pelo ID opaco.
 *
 * @param {string} id - ID devolvido pela busca.
 * @returns {Promise<AnimeSheet>} Tipo e episódios declarados.
 * @throws {Error} Se a resposta não for 2xx, não for JSON válido ou estiver fora do esquema.
 * @example
 * const sheet = await fetchAnime('eU7t5IvcNKU');
 * // sheet.format === 'tv', sheet.episodes[0].season === 1
 */
export async function fetchAnime(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Ficha inválida: ID vazio (recebido: ${describe(id)})`);
  }

  const url = `${API_BASE}/anime/${encodeURIComponent(id.trim())}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error(`Ficha fora do esquema em ${url}: "data" ausente ou fora de objeto`);
  }

  const { data } = body;
  const format = nonEmptyText(data.format);
  if (format === null) throw new Error(`Ficha fora do esquema em ${url}: "format" ausente`);
  if (!isPlainObject(data.hero)) throw new Error(`Ficha fora do esquema em ${url}: "hero" ausente`);
  readTitles(data.hero.titles, 'data.hero.titles', url);
  if (!Array.isArray(data.episodes)) {
    throw new Error(`Ficha fora do esquema em ${url}: "episodes" ausente ou fora de array`);
  }

  const episodes = data.episodes.map((episode, index) => readEpisodeEntry(episode, `data.episodes[${index}]`, url));
  return { format, episodes };
}

/**
 * Busca as opções de áudio de um episódio.
 *
 * @param {string} id - ID do episódio declarado na ficha.
 * @returns {Promise<{ streams: EpisodeOption[] }>} Opções publicadas pela fonte.
 * @throws {Error} Se a resposta não for 2xx, não for JSON válido ou estiver fora do esquema.
 * @example
 * const episode = await fetchEpisode('3yBBx4G2tnw');
 * // episode.streams[0].audio === 'dublado'
 */
export async function fetchEpisode(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Episódio inválido: ID vazio (recebido: ${describe(id)})`);
  }

  const url = `${API_BASE}/episode/${encodeURIComponent(id.trim())}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error(`Episódio fora do esquema em ${url}: "data" ausente ou fora de objeto`);
  }
  if (!Array.isArray(body.data.streams)) {
    throw new Error(`Episódio fora do esquema em ${url}: "streams" ausente ou fora de array`);
  }

  const streams = body.data.streams.map((stream, index) => readStream(stream, `data.streams[${index}]`, url));
  return { streams };
}

/**
 * Lê um item da busca.
 * @param {*} item - Item recebido em `data`.
 * @param {string} label - Caminho do item nas mensagens de erro.
 * @returns {SearchItem}
 * @throws {Error} Se o item estiver fora do esquema.
 */
function readSearchItem(item, label) {
  if (!isPlainObject(item)) throw new Error(`Busca fora do esquema: ${label} não é objeto`);
  const id = nonEmptyText(item.id);
  if (id === null) throw new Error(`Busca fora do esquema: ${label} sem "id"`);
  const titles = readTitles(item.titles, `${label}.titles`, 'busca');
  return { id, titles, year: readPublishedYear(item.published_at, `${label}.published_at`) };
}

/**
 * Lê os títulos publicados de um anime.
 * @param {*} titles - Objeto `titles` da fonte.
 * @param {string} label - Caminho nas mensagens de erro.
 * @param {string} context - Contexto (busca ou ficha) para a mensagem.
 * @returns {string[]} Títulos BR, US e JP não vazios.
 * @throws {Error} Se `titles` não for objeto ou não tiver nenhum título válido.
 */
function readTitles(titles, label, context) {
  if (!isPlainObject(titles)) throw new Error(`${context} fora do esquema: ${label} não é objeto`);
  const values = [];
  for (const key of TITLE_KEYS) {
    const value = titles[key];
    if (value === undefined || value === null) continue;
    const text = nonEmptyText(value);
    if (text === null) throw new Error(`${context} fora do esquema: ${label}.${key} inválido`);
    values.push(text);
  }
  if (values.length === 0) throw new Error(`${context} fora do esquema: ${label} sem títulos BR, US ou JP`);
  return values;
}

/**
 * Lê o ano de estreia de `published_at`.
 * @param {*} value - Data publicada pela fonte.
 * @param {string} label - Caminho nas mensagens de erro.
 * @returns {number|null} Ano ou `null` quando a fonte não informa.
 * @throws {Error} Se o valor não for data textual, `null` ou `undefined`.
 */
function readPublishedYear(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`Busca fora do esquema: ${label} não é data textual`);
  const match = PUBLISHED_AT.exec(value);
  if (!match) throw new Error(`Busca fora do esquema: ${label} inválido ("${value}")`);
  return Number(match[1]);
}

/**
 * Lê uma entrada de episódio da ficha.
 * @param {*} episode - Item recebido em `data.episodes`.
 * @param {string} label - Caminho nas mensagens de erro.
 * @param {string} url - URL da ficha para a mensagem.
 * @returns {AnimeEpisode}
 * @throws {Error} Se a entrada estiver fora do esquema.
 */
function readEpisodeEntry(episode, label, url) {
  if (!isPlainObject(episode)) throw new Error(`Ficha fora do esquema em ${url}: ${label} não é objeto`);
  const id = nonEmptyText(episode.id);
  if (id === null) throw new Error(`Ficha fora do esquema em ${url}: ${label} sem "id"`);
  const { season, number } = episode;
  if (season !== null && (!Number.isInteger(season) || season < 0)) {
    throw new Error(`Ficha fora do esquema em ${url}: ${label}.season inválido`);
  }
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Ficha fora do esquema em ${url}: ${label}.number inválido`);
  }
  return { id, season, number };
}

/**
 * Lê uma opção de áudio do episódio.
 * @param {*} stream - Item recebido em `data.streams`.
 * @param {string} label - Caminho nas mensagens de erro.
 * @param {string} url - URL do episódio para a mensagem.
 * @returns {EpisodeOption}
 * @throws {Error} Se a opção estiver fora do esquema.
 */
function readStream(stream, label, url) {
  if (!isPlainObject(stream)) throw new Error(`Episódio fora do esquema em ${url}: ${label} não é objeto`);
  const audio = nonEmptyText(stream.audio);
  if (audio === null) throw new Error(`Episódio fora do esquema em ${url}: ${label} sem "audio"`);
  if (stream.is_offline !== undefined && typeof stream.is_offline !== 'boolean') {
    throw new Error(`Episódio fora do esquema em ${url}: ${label}.is_offline inválido`);
  }
  if (stream.url !== undefined && stream.url !== null && typeof stream.url !== 'string') {
    throw new Error(`Episódio fora do esquema em ${url}: ${label}.url inválido`);
  }
  if (!Array.isArray(stream.qualities)) {
    throw new Error(`Episódio fora do esquema em ${url}: ${label}.qualities ausente ou fora de array`);
  }
  const qualities = stream.qualities.map((quality, index) => {
    const text = nonEmptyText(quality);
    if (text === null) {
      throw new Error(`Episódio fora do esquema em ${url}: ${label}.qualities[${index}] inválido`);
    }
    return text;
  });
  return { audio, isOffline: stream.is_offline === true, url: nonEmptyText(stream.url), qualities };
}

/**
 * Indica se o valor é objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Devolve o texto sem espaços nas pontas ou `null` quando vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Representação curta de um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  return typeof value === 'string' ? `"${value}"` : String(value);
}
