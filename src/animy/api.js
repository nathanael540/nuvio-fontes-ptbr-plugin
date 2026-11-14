/**
 * Leitura da API pública do Animy.
 *
 * A fonte publica busca, ficha e episódio em JSON, com uma entrada de catálogo por variante de
 * áudio. Cada resposta é validada antes de chegar ao extrator: JSON fora do esquema lança erro de
 * estrutura, nunca ausência. A rota de episódio usa `fetch` direto para reconhecer o 404
 * `{"error":"episode not found"}` como ausência.
 */

import { fetchJson } from '../_blocks/http/index.mjs';

const API_BASE = 'https://animy.net/api/v1';
const SEARCH_LIMIT = 24;
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {object} SearchItem
 * @property {string} id - ID da entrada no catálogo.
 * @property {string} title - Título publicado pela fonte.
 * @property {string|null} nativeTitle - Título nativo/alternativo publicado.
 * @property {number|null} year - Ano publicado em `y`; pode ser o ano de publicação no catálogo.
 * @property {string} kind - Tipo publicado (`movie` ou `tv`).
 * @property {string|null} audio - Variante de áudio publicada.
 * @property {string[]} altTitles - Títulos alternativos publicados.
 */

/**
 * @typedef {object} EpisodeEntry
 * @property {number} season - Temporada declarada.
 * @property {number} number - Número do episódio dentro da temporada.
 * @property {string|null} title - Título do episódio, quando publicado.
 */

/**
 * @typedef {object} AnimeSheet
 * @property {string} id - ID da entrada.
 * @property {string} kind - Tipo publicado.
 * @property {string|null} audio - Variante de áudio da entrada.
 * @property {EpisodeEntry[]} episodes - Episódios declarados.
 */

/**
 * @typedef {object} EpisodeStream
 * @property {string} kind - Tipo de mídia publicado (observado `mp4`).
 * @property {string} url - URL HTTP(S) da mídia.
 * @property {string|null} audio - Variante de áudio do stream.
 */

/**
 * @typedef {object} EpisodeData
 * @property {EpisodeStream[]} streams - Streams publicados para o episódio.
 */

/**
 * Busca entradas de anime pelo título.
 *
 * @param {string} query - Termo de busca não vazio.
 * @returns {Promise<SearchItem[]>} Itens da busca, na ordem da fonte.
 * @throws {Error} Se o termo for inválido, a resposta não for 2xx, o JSON for inválido ou a
 *   estrutura não tiver `items` em lista.
 * @example
 * const items = await searchAnime('Kimetsu no Yaiba');
 * // items[0].id === '84'
 */
export async function searchAnime(query) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: título vazio (recebido: ${describe(query)})`);
  }
  const params = new URLSearchParams({
    limit: String(SEARCH_LIMIT),
    offset: '0',
    sort: 'popular',
    search: query.trim(),
  });
  const url = `${API_BASE}/animes?${params.toString()}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body) || !Array.isArray(body.items)) {
    throw new Error(`Busca fora do esquema em ${url}: "items" ausente ou fora de lista`);
  }
  return body.items.map((item, index) => readSearchItem(item, `items[${index}]`));
}

/**
 * Busca a ficha de uma entrada do catálogo.
 *
 * @param {string} id - ID devolvido pela busca.
 * @returns {Promise<AnimeSheet>} Tipo, áudio e episódios da entrada.
 * @throws {Error} Se o ID for vazio, a resposta não for 2xx, o JSON for inválido ou a estrutura
 *   não tiver `kind`/`episodes` no formato esperado.
 * @example
 * const sheet = await fetchAnime('84');
 * // sheet.kind === 'tv', sheet.episodes[0].season === 1
 */
export async function fetchAnime(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Ficha inválida: ID vazio (recebido: ${describe(id)})`);
  }
  const url = `${API_BASE}/animes/${encodeURIComponent(id.trim())}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body)) throw new Error(`Ficha fora do esquema em ${url}: resposta não é objeto`);
  const kind = nonEmptyText(body.kind);
  if (kind === null) throw new Error(`Ficha fora do esquema em ${url}: "kind" ausente`);
  if (!Array.isArray(body.episodes)) {
    throw new Error(`Ficha fora do esquema em ${url}: "episodes" ausente ou fora de lista`);
  }
  const episodes = body.episodes.map((episode, index) => readEpisode(episode, `episodes[${index}]`, url));
  return {
    id: String(body.id ?? id).trim(),
    kind,
    audio: nonEmptyText(body.audio),
    episodes,
  };
}

/**
 * Busca os streams de um episódio pela rota de reprodução.
 *
 * A rota responde 404 com `{"error":"episode not found"}` quando o par temporada/episódio não
 * existe; esse caso é ausência reconhecida. Qualquer outro erro HTTP, JSON inválido ou estrutura
 * fora do esquema sobe como erro.
 *
 * @param {string} id - ID da entrada do catálogo.
 * @param {number} season - Temporada, inteiro a partir de 1.
 * @param {number} episode - Episódio, inteiro a partir de 1.
 * @returns {Promise<EpisodeData|null>} Streams publicados ou `null` quando o episódio não existe.
 * @throws {Error} Se a rota responder fora de 2xx sem ser o 404 de ausência, o JSON for inválido
 *   ou `streams` estiver fora de lista.
 * @example
 * const episode = await fetchEpisode('84', 1, 1);
 * // episode.streams[0].kind === 'mp4'
 */
export async function fetchEpisode(id, season, episode) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`Episódio inválido: ID vazio (recebido: ${describe(id)})`);
  }
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Episódio inválido: temporada=${season} episódio=${episode} (esperados inteiros a partir de 1)`);
  }
  const url = `${API_BASE}/animes/${encodeURIComponent(id.trim())}/episodes/${season}/${episode}`;
  const response = await fetch(url);
  const text = await response.text();
  if (response.status === 404) {
    const body = parseJson(text);
    if (isPlainObject(body) && body.error === 'episode not found') return null;
    throw new Error(`HTTP 404 em ${url}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  const body = parseJson(text);
  if (!isPlainObject(body) || !Array.isArray(body.streams)) {
    throw new Error(`Episódio fora do esquema em ${url}: "streams" ausente ou fora de lista`);
  }
  return { streams: body.streams.map((stream, index) => readStream(stream, `streams[${index}]`, url)) };
}

/**
 * Lê um item da busca.
 * @param {*} item - Item recebido em `items`.
 * @param {string} label - Caminho do item nas mensagens de erro.
 * @returns {SearchItem}
 * @throws {Error} Se o item estiver fora do esquema.
 */
function readSearchItem(item, label) {
  if (!isPlainObject(item)) throw new Error(`Busca fora do esquema: ${label} não é objeto`);
  const id = item.id === undefined || item.id === null ? '' : String(item.id).trim();
  if (id === '') throw new Error(`Busca fora do esquema: ${label} sem "id"`);
  const title = nonEmptyText(item.t);
  if (title === null) throw new Error(`Busca fora do esquema: ${label} sem "t"`);
  const kind = nonEmptyText(item.kind);
  if (kind === null) throw new Error(`Busca fora do esquema: ${label} sem "kind"`);
  return {
    id,
    title,
    nativeTitle: nonEmptyText(item.nativeTitle),
    year: Number.isInteger(item.y) ? item.y : null,
    kind,
    audio: readAudio(item),
    altTitles: readAltTitles(item.altTitles),
  };
}

/**
 * Lê um episódio da ficha.
 * @param {*} episode - Entrada recebida em `episodes`.
 * @param {string} label - Caminho do item nas mensagens de erro.
 * @param {string} url - URL da ficha, usada na mensagem.
 * @returns {EpisodeEntry}
 * @throws {Error} Se a temporada ou o número não forem inteiros.
 */
function readEpisode(episode, label, url) {
  if (!isPlainObject(episode)) throw new Error(`Ficha fora do esquema em ${url}: ${label} não é objeto`);
  const { season, number } = episode;
  if (!Number.isInteger(season) || season < 1) {
    throw new Error(`Ficha fora do esquema em ${url}: ${label}.season inválido`);
  }
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Ficha fora do esquema em ${url}: ${label}.number inválido`);
  }
  return { season, number, title: nonEmptyText(episode.title) };
}

/**
 * Lê um stream do episódio.
 * @param {*} stream - Entrada recebida em `streams`.
 * @param {string} label - Caminho do item nas mensagens de erro.
 * @param {string} url - URL do episódio, usada na mensagem.
 * @returns {EpisodeStream}
 * @throws {Error} Se o tipo, a URL ou o áudio estiverem fora do esquema.
 */
function readStream(stream, label, url) {
  if (!isPlainObject(stream)) throw new Error(`Episódio fora do esquema em ${url}: ${label} não é objeto`);
  const kind = nonEmptyText(stream.kind);
  if (kind === null) throw new Error(`Episódio fora do esquema em ${url}: ${label}.kind ausente`);
  const mediaUrl = nonEmptyText(stream.url);
  if (mediaUrl === null || !isHttpUrl(mediaUrl)) {
    throw new Error(`Episódio fora do esquema em ${url}: ${label}.url fora de HTTP(S)`);
  }
  return { kind, url: mediaUrl, audio: nonEmptyText(stream.audio) };
}

/**
 * Lê a variante de áudio da entrada.
 * @param {object} item - Item da busca.
 * @returns {string|null} Áudio principal ou o primeiro de `audios`, quando existir.
 */
function readAudio(item) {
  const direct = nonEmptyText(item.audio);
  if (direct !== null) return direct;
  if (!Array.isArray(item.audios)) return null;
  for (const audio of item.audios) {
    const text = nonEmptyText(audio);
    if (text !== null) return text;
  }
  return null;
}

/**
 * Lê títulos alternativos.
 * @param {*} raw - Valor de `altTitles`.
 * @returns {string[]} Títulos não vazios, sem repetição.
 */
function readAltTitles(raw) {
  if (!Array.isArray(raw)) return [];
  const titles = [];
  const seen = new Set();
  for (const item of raw) {
    const title = isPlainObject(item) ? nonEmptyText(item.title) : null;
    if (title === null || seen.has(title)) continue;
    seen.add(title);
    titles.push(title);
  }
  return titles;
}

/**
 * Interpreta JSON sem lançar; usado apenas no corpo do 404.
 * @param {string} text - Corpo bruto.
 * @returns {*} JSON interpretado ou `null`.
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Indica se o valor é um texto não vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null} Texto aparado ou `null`.
 */
function nonEmptyText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Indica se o valor é URL HTTP(S).
 * @param {string} value - Texto recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  try {
    return HTTP_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Indica se o valor é objeto simples.
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Descreve um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  return typeof value === 'string' ? `"${value}"` : String(value);
}
