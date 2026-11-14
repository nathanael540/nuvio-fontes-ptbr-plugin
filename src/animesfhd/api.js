/**
 * Leitura das rotas públicas do AnimesFHD.
 *
 * O catálogo anônimo é HTML; a ficha sazonal e as versões vêm do HTML/API de episódio. Cada
 * resposta é validada antes do extrator: estrutura inesperada lança erro, não ausência.
 */

import { fetchJson, fetchText } from '../_blocks/http/index.mjs';
import { loadHtml, textOf } from './html.js';
import { AUDIOS, SITE } from './site.js';

const CARD_ID = /\/serie\/(\d+)/;
const EPISODE_ID = /\/episod\/(\d+)/;
const EPISODE_LABEL = /^EP\.(\d+)/i;

/**
 * @typedef {object} Candidate
 * @property {string} seriesId - ID da ficha no site.
 * @property {string} title - Título publicado.
 * @property {number|null} year - Ano publicado, quando houver.
 */

/**
 * @typedef {object} EpisodeCard
 * @property {string} episodeId - ID do episódio no site.
 * @property {number} number - Número local do episódio.
 * @property {string} title - Rótulo completo `EP.N - ...`.
 */

/**
 * @typedef {object} SeriesPage
 * @property {string} title - Título publicado no `h1`.
 * @property {EpisodeCard[]} episodes - Cartões da página sazonal.
 */

/**
 * @typedef {object} Version
 * @property {string} seriesId - ID da página sazonal.
 * @property {number} season - Temporada da fonte.
 * @property {string} audio - Áudio da versão.
 * @property {number} episodeCount - Quantidade de episódios da versão.
 * @property {string} firstEpisodeId - ID do primeiro episódio.
 */

/**
 * @typedef {object} Source
 * @property {string} label - Rótulo da fonte.
 * @property {string} audio - Áudio anunciado.
 * @property {string} url - URL relativa ou absoluta.
 */

/**
 * @typedef {object} EpisodeData
 * @property {Version[]} versions - Versões sazonais da obra.
 * @property {Source[]} sources - Fontes do episódio consultado.
 */

/**
 * Lê os candidatos dos carrosséis, destaques e listas da home.
 * @returns {Promise<Candidate[]>} Candidatos deduplicados por ID.
 * @throws {Error} Se a resposta não for objeto com as listas esperadas.
 */
export async function fetchHomeCandidates() {
  const url = `${SITE}/api/home`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body)) throw new Error(`Home fora do esquema em ${url}: resposta não é objeto`);
  const candidates = [];
  for (const key of ['hero', 'recent', 'top', 'releasing', 'today', 'liked']) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) pushCandidate(candidates, item);
  }
  if (!Array.isArray(body.carousels)) {
    throw new Error(`Home fora do esquema em ${url}: "carousels" ausente ou fora de lista`);
  }
  for (const carousel of body.carousels) {
    if (!isPlainObject(carousel) || !Array.isArray(carousel.items)) continue;
    for (const item of carousel.items) {
      pushCandidate(candidates, {
        id: item ? item.series_id : null,
        title: item ? item.series_title : null,
      });
    }
  }
  return dedupeCandidates(candidates);
}

/**
 * Lê uma página do catálogo HTML.
 * @param {number} page - Página, a partir de 1.
 * @returns {Promise<Candidate[]>} Cartões da página.
 * @throws {Error} Se a página não for 2xx ou o HTML não tiver a lista esperada.
 */
export async function fetchCatalogPage(page) {
  if (!Number.isInteger(page) || page < 1) throw new Error(`Página inválida: ${page}`);
  const url = `${SITE}/animes?page=${page}`;
  const html = await fetchText(url, { profile: 'page' });
  const $ = loadHtml(html);
  const cards = $('a.card');
  if (cards.length === 0) {
    const text = textOf($('body'));
    if (text === '') throw new Error(`Catálogo fora do esquema em ${url}: página vazia`);
    return [];
  }
  const candidates = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const href = card.attr('href') || '';
    const match = CARD_ID.exec(href);
    if (match === null) continue;
    const title = textOf(card.find('h3.card__title'));
    if (title === '') continue;
    const sub = textOf(card.find('p.card__sub'));
    candidates.push({ seriesId: match[1], title, year: readYear(sub) });
  }
  return candidates;
}

/**
 * Lê uma ficha sazonal e os cartões `EP.N`.
 * @param {string} seriesId - ID da ficha.
 * @returns {Promise<SeriesPage|null>} Título e episódios, ou `null` quando a ficha não existe.
 * @throws {Error} Se a ficha não tiver `h1` ou cartões de episódio.
 */
export async function fetchSeriesPage(seriesId) {
  if (typeof seriesId !== 'string' || seriesId.trim() === '') throw new Error('Ficha inválida: ID vazio');
  const url = `${SITE}/serie/${encodeURIComponent(seriesId)}`;
  let html;
  try {
    html = await fetchText(url, { profile: 'page' });
  } catch (error) {
    if (/HTTP 404\b/.test(error.message)) return null;
    throw error;
  }
  const $ = loadHtml(html);
  const title = textOf($('h1').eq(0));
  if (title === '') throw new Error(`Ficha fora do esquema em ${url}: h1 ausente`);
  const cards = $('#episodes-grid a.card--ep');
  if (cards.length === 0) throw new Error(`Ficha fora do esquema em ${url}: cartões EP.N ausentes`);
  const episodes = [];
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards.eq(index);
    const href = card.attr('href') || '';
    const match = EPISODE_ID.exec(href);
    if (match === null) continue;
    const label = textOf(card.find('h3.card__title'));
    const number = readEpisodeNumber(label);
    if (number === null) continue;
    episodes.push({ episodeId: match[1], number, title: label });
  }
  if (episodes.length === 0) throw new Error(`Ficha fora do esquema em ${url}: nenhum EP.N legível`);
  return { title, episodes };
}

/**
 * Lê a API de um episódio e devolve versões e fontes.
 * @param {string} episodeId - ID do episódio.
 * @returns {Promise<EpisodeData>} Versões e fontes publicadas.
 * @throws {Error} Se a resposta não for 2xx ou estiver fora do esquema.
 */
export async function fetchEpisodeData(episodeId) {
  if (typeof episodeId !== 'string' || episodeId.trim() === '') {
    throw new Error('Episódio inválido: ID vazio');
  }
  const url = `${SITE}/api/episodes/${encodeURIComponent(episodeId)}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body)) throw new Error(`Episódio fora do esquema em ${url}: resposta não é objeto`);
  if (!Array.isArray(body.versions)) {
    throw new Error(`Episódio fora do esquema em ${url}: "versions" ausente ou fora de lista`);
  }
  const versions = body.versions.map((version, index) => readVersion(version, `versions[${index}]`, url));
  const sources = body.sources === undefined ? [] : body.sources;
  if (!Array.isArray(sources)) {
    throw new Error(`Episódio fora do esquema em ${url}: "sources" fora de lista`);
  }
  return {
    versions,
    sources: sources.map((source, index) => readSource(source, `sources[${index}]`, url)),
  };
}

/**
 * Converte um item de lista da home em candidato.
 * @param {Candidate[]} candidates - Lista acumulada.
 * @param {*} item - Item recebido.
 * @returns {void}
 */
function pushCandidate(candidates, item) {
  if (!isPlainObject(item)) return;
  const id = item.id === undefined || item.id === null ? '' : String(item.id).trim();
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (id === '' || title === '') return;
  candidates.push({
    seriesId: id,
    title,
    year: Number.isInteger(item.year) ? item.year : null,
  });
}

/**
 * Deduplica candidatos por ID.
 * @param {Candidate[]} candidates - Lista acumulada.
 * @returns {Candidate[]} Lista sem IDs repetidos.
 */
function dedupeCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.seriesId)) continue;
    seen.add(candidate.seriesId);
    unique.push(candidate);
  }
  return unique;
}

/**
 * Lê uma versão sazonal.
 * @param {*} version - Item recebido em `versions`.
 * @param {string} label - Caminho nas mensagens.
 * @param {string} url - URL do episódio.
 * @returns {Version}
 * @throws {Error} Se os campos obrigatórios estiverem ausentes.
 */
function readVersion(version, label, url) {
  if (!isPlainObject(version)) throw new Error(`Episódio fora do esquema em ${url}: ${label} não é objeto`);
  const seriesId = idText(version.series_id);
  const audio = nonEmpty(version.audio);
  const firstEpisodeId = idText(version.first_episode_id);
  if (seriesId === null || audio === null || firstEpisodeId === null) {
    throw new Error(`Episódio fora do esquema em ${url}: ${label} sem series_id/audio/first_episode_id`);
  }
  if (!Number.isInteger(version.episode_count) || version.episode_count < 1) {
    throw new Error(`Episódio fora do esquema em ${url}: ${label}.episode_count inválido`);
  }
  return {
    seriesId,
    season: Number.isInteger(version.season) ? version.season : 0,
    audio: audio.toLowerCase(),
    episodeCount: version.episode_count,
    firstEpisodeId,
  };
}

/**
 * Lê uma fonte do episódio.
 * @param {*} source - Item recebido em `sources`.
 * @param {string} label - Caminho nas mensagens.
 * @param {string} url - URL do episódio.
 * @returns {Source}
 * @throws {Error} Se a URL ou o áudio estiverem ausentes.
 */
function readSource(source, label, url) {
  if (!isPlainObject(source)) throw new Error(`Episódio fora do esquema em ${url}: ${label} não é objeto`);
  const sourceUrl = nonEmpty(source.url);
  const audio = nonEmpty(source.audio);
  if (sourceUrl === null || audio === null) {
    throw new Error(`Episódio fora do esquema em ${url}: ${label} sem url/audio`);
  }
  return {
    label: nonEmpty(source.label) || 'Player',
    audio: audio.toLowerCase(),
    url: sourceUrl,
  };
}

/**
 * Lê o número de um rótulo `EP.N`.
 * @param {string} label - Rótulo recebido.
 * @returns {number|null}
 */
function readEpisodeNumber(label) {
  const match = EPISODE_LABEL.exec(label);
  if (match === null) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

/**
 * Lê um ano de quatro dígitos.
 * @param {string} text - Texto recebido.
 * @returns {number|null}
 */
function readYear(text) {
  const match = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/.exec(text);
  return match === null ? null : Number(match[1]);
}

/**
 * Indica se o valor é texto não vazio.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function nonEmpty(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Lê um identificador publicado como texto ou número.
 * @param {*} value - Valor recebido.
 * @returns {string|null}
 */
function idText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return nonEmpty(value);
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
 * Exporta a lista de áudios aceitos para o extrator.
 * @returns {string[]} Áudios na ordem de preferência.
 */
export function audioOrder() {
  return AUDIOS.slice();
}
