/**
 * Catálogo do AniZero: busca JSON, ficha do anime, temporada, episódios e iframe do player.
 *
 * A fonte é WordPress com tema próprio. A busca em tempo real e a lista de episódios são JSON;
 * a ficha e a página do vídeo são HTML. Nenhuma função faz rede no carregamento do módulo.
 */

import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { decodeEntities, readAttribute, stripTags } from './support.js';
import {
  MIN_TITLE_SCORE,
  matchAnimePage,
  readSeasonNumber,
  scoreCandidate,
  stripSeasonMarker,
} from './titles.js';

/** Raiz pública da fonte. */
export const SITE_URL = 'https://anizero.org';
/** Endpoint AJAX do WordPress usado pela busca e pela lista de animes. */
export const AJAX_URL = `${SITE_URL}/wp-admin/admin-ajax.php`;
/** Endpoint próprio do tema para a lista de episódios. */
export const API_URL = `${SITE_URL}/api/`;
/** Quantidade máxima de fichas abertas por busca. */
export const MAX_CANDIDATES = 4;
/** Teto de saltos na cadeia de temporadas. */
export const MAX_SEASON_CHAIN = 12;

/**
 * @typedef {object} SearchCandidate
 * @property {string} title - Título decodificado do cartão.
 * @property {string} url - URL absoluta da ficha.
 * @property {string|null} tipo - Tipo publicado pela busca (`Episódios`, `Filmes` etc.).
 */

/**
 * @typedef {object} AnimePage
 * @property {string} url - URL final da ficha.
 * @property {string} title - Título publicado.
 * @property {string} baseTitle - Título sem o marcador de temporada.
 * @property {number|null} season - Temporada lida do título; null quando não há marcador.
 * @property {number} year - Ano publicado.
 * @property {number} animeId - ID interno usado pelo endpoint `show_videos`.
 * @property {string|null} previousUrl - Link `tempAnterior` na fonte.
 * @property {string|null} nextUrl - Link `tempProxima` na fonte.
 */

/**
 * @typedef {object} EpisodeEntry
 * @property {string|number} epi_num - Número publicado.
 * @property {string} epi_url - Página do vídeo.
 * @property {number} [epi_id] - ID interno do episódio.
 * @property {string} [epi_title] - Título publicado.
 */

/**
 * @typedef {object} ShowVideos
 * @property {Object<string, EpisodeEntry>} episodios - Episódios regulares indexados pelo número.
 * @property {Object<string, EpisodeEntry>} ovas - OVAs.
 * @property {Object<string, EpisodeEntry>} filmes - Filmes da franquia.
 */

/**
 * Busca o título no endpoint em tempo real e devolve os cartões válidos.
 *
 * As consultas usam o título PT-BR, o original, as alternativas e os romaji do TMDB; em temporada
 * maior que 1, também são tentadas variantes com o sufixo `S<n>`. A busca para na primeira consulta
 * que devolve um cartão com similaridade suficiente.
 *
 * @param {object} media - Dados do TMDB compatíveis com `MediaInfo`.
 * @param {number} season - Temporada pedida.
 * @returns {Promise<SearchCandidate[]>} Cartões sem repetição de URL, na ordem da fonte.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx ou JSON fora do esquema.
 * @example
 * const candidates = await searchCandidates(media, 1);
 */
export async function searchCandidates(media, season) {
  const candidates = [];
  const seenUrls = new Set();

  for (const query of buildQueries(media, season)) {
    const response = await fetchJson(AJAX_URL, {
      method: 'POST',
      profile: 'api',
      headers: { Referer: `${SITE_URL}/` },
      form: { action: 'buscar_anime_rt', termo: query },
    });
    const items = readSearchResponse(response, query);
    for (const item of items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      candidates.push(item);
    }
    if (candidates.some((item) => scoreCandidate(item, media) >= MIN_TITLE_SCORE)) break;
  }

  return candidates;
}

/**
 * Abre uma ficha do anime e lê título, ano, ID interno e links de temporada.
 *
 * @param {string} url - URL da ficha.
 * @param {Map<string, AnimePage>} [cache] - Cache da chamada, por URL.
 * @returns {Promise<AnimePage>} Ficha lida.
 * @throws {Error} Em falha de rede ou ficha 200 sem título, ano ou `anime_id`.
 * @example
 * const page = await readAnimePage('https://anizero.org/anime/attack-on-titan/');
 */
export async function readAnimePage(url, cache) {
  if (cache && cache.has(url)) return cache.get(url);

  const response = await fetchPage(url, {
    profile: 'page',
    headers: { Referer: `${SITE_URL}/` },
  });
  const html = response.text;
  const titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i);
  const yearMatch = html.match(/itemprop="copyrightYear"[^>]*>\s*(\d{4})\s*</i);
  const idMatch = html.match(/const\s+anime_id\s*=\s*(\d+)\s*;/);

  const missing = [];
  if (titleMatch === null) missing.push('h1');
  if (yearMatch === null) missing.push('copyrightYear');
  if (idMatch === null) missing.push('anime_id');
  if (missing.length > 0) {
    throw new Error(`Ficha fora do esquema em ${response.url}: ausente ${missing.join(', ')}`);
  }

  const title = decodeEntities(stripTags(titleMatch[1])).replace(/\s+/g, ' ').trim();
  if (title === '') throw new Error(`Ficha sem título em ${response.url}`);

  const page = {
    url: response.url,
    title,
    baseTitle: stripSeasonMarker(title),
    season: readSeasonNumber(title),
    year: Number(yearMatch[1]),
    animeId: Number(idMatch[1]),
    previousUrl: resolveSourceLink(readLinkByClass(html, 'tempAnterior'), response.url),
    nextUrl: resolveSourceLink(readLinkByClass(html, 'tempProxima'), response.url),
  };
  if (cache) cache.set(url, page);
  return page;
}

/**
 * Abre até quatro fichas da busca, confirma título/ano e devolve as compatíveis.
 *
 * Candidato 404 é removido da busca. Ficha 200 sem a estrutura esperada é erro; se nenhuma ficha
 * confirmar e alguma estiver fora do esquema, o erro sobe.
 *
 * @param {SearchCandidate[]} candidates - Cartões da busca.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {Map<string, AnimePage>} cache - Cache da chamada.
 * @returns {Promise<Array<{ page: AnimePage, score: number }>>} Fichas confirmadas.
 * @throws {Error} Em falha de rede, ficha fora do esquema ou quando só há fichas inválidas.
 */
export async function confirmCandidates(candidates, media, season, cache) {
  const ordered = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, media) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  const confirmed = [];
  const structureErrors = [];
  for (const item of ordered) {
    let page;
    try {
      page = await readAnimePage(item.candidate.url, cache);
    } catch (error) {
      if (/HTTP 404/.test(error.message)) continue;
      structureErrors.push(error);
      continue;
    }
    const match = matchAnimePage(page, media, season);
    if (match !== null) confirmed.push({ page, score: match.score });
  }

  if (confirmed.length === 0 && structureErrors.length > 0) throw structureErrors[0];
  return confirmed;
}

/**
 * Escolhe a ficha da temporada pedida, percorrendo a cadeia de temporadas quando necessário.
 *
 * A ordem é: marcador exato, página base, caminhada por `tempAnterior` até a raiz e caminhada por
 * `tempProxima` até o marcador esperado. Uma próxima página só é aceita quando continua
 * compatível com o TMDB e tem o marcador da temporada seguinte.
 *
 * @param {Array<{ page: AnimePage, score: number }>} confirmed - Fichas confirmadas.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {Map<string, AnimePage>} cache - Cache da chamada.
 * @returns {Promise<AnimePage|null>} Ficha da temporada ou null quando não publicada.
 */
export async function resolveSeasonPage(confirmed, media, season, cache) {
  const direct = confirmed.filter(({ page }) => page.season === season);
  if (direct.length > 0) return direct[0].page;
  if (season === 1) {
    const base = confirmed.find(({ page }) => page.season === null || page.season === 1);
    if (base) return base.page;
  }

  const base = confirmed.find(({ page }) => page.season === null || page.season === 1);
  const start = base || confirmed.reduce((lowest, item) => {
    if (lowest === null) return item;
    return normalizeSeason(item.page) < normalizeSeason(lowest.page) ? item : lowest;
  }, null);
  if (!start) return null;

  let current = start.page;
  const visited = new Set([current.url]);
  let steps = 0;
  while (current.previousUrl && steps < MAX_SEASON_CHAIN) {
    const previous = await loadChainPage(current.previousUrl, media, season, cache);
    if (!previous) break;
    const currentSeason = normalizeSeason(current);
    const previousSeason = normalizeSeason(previous);
    if (currentSeason === null || previousSeason === null || previousSeason !== currentSeason - 1) break;
    if (visited.has(previous.url)) break;
    visited.add(previous.url);
    current = previous;
    steps += 1;
  }

  if (normalizeSeason(current) === season) return current;

  steps = 0;
  while (current.nextUrl && steps < MAX_SEASON_CHAIN) {
    const next = await loadChainPage(current.nextUrl, media, season, cache);
    if (!next) break;
    const currentSeason = normalizeSeason(current);
    const nextSeason = normalizeSeason(next);
    if (currentSeason === null || nextSeason === null || nextSeason !== currentSeason + 1) break;
    if (visited.has(next.url)) break;
    visited.add(next.url);
    current = next;
    steps += 1;
    if (normalizeSeason(current) === season) return current;
  }

  return null;
}

/**
 * Consulta a lista de episódios de uma ficha.
 * @param {number} animeId - ID interno da ficha.
 * @returns {Promise<ShowVideos>} Listas publicadas.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou `episodios` fora do esquema.
 * @example
 * const videos = await fetchShowVideos(101746);
 */
export async function fetchShowVideos(animeId) {
  const response = await fetchJson(API_URL, {
    method: 'POST',
    profile: 'api',
    headers: { Referer: `${SITE_URL}/` },
    form: { action: 'show_videos', anime_id: String(animeId) },
  });

  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error(`Lista de episódios fora do esquema para anime_id ${animeId}`);
  }
  const { episodios } = response;
  if (episodios === undefined || episodios === null || typeof episodios !== 'object' || Array.isArray(episodios)) {
    throw new Error(`Lista de episódios sem "episodios" para anime_id ${animeId}`);
  }

  return {
    episodios,
    ovas: readOptionalList(response.ovas),
    filmes: readOptionalList(response.filmes),
  };
}

/**
 * Escolhe o episódio pelo número exato em `epi_num`.
 * @param {ShowVideos} videos - Lista publicada.
 * @param {number} target - Número local ou absoluto.
 * @returns {EpisodeEntry|null} Entrada do episódio ou null quando ausente.
 * @throws {Error} Se a entrada escolhida não tiver `epi_url` HTTP(S) válida.
 * @example
 * const entry = selectEpisode(videos, 1);
 */
export function selectEpisode(videos, target) {
  for (const entry of Object.values(videos.episodios)) {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`Episódio fora do esquema: item não é objeto em anime_id ${videos.animeId || ''}`);
    }
    if (Number(entry.epi_num) !== target) continue;
    if (typeof entry.epi_url !== 'string' || entry.epi_url.trim() === '') {
      throw new Error(`Episódio ${target} sem epi_url`);
    }
    let url;
    try {
      url = new URL(entry.epi_url);
    } catch {
      throw new Error(`Episódio ${target} com epi_url inválida`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Episódio ${target} com epi_url fora de HTTP(S)`);
    }
    return entry;
  }
  return null;
}

/**
 * Calcula o número absoluto do episódio para uma fonte de página única com numeração global.
 *
 * Só aceita a conversão quando a quantidade de episódios publicados fica entre 0,9 e 1,1 do total
 * de episódios regulares do TMDB. Fora dessa faixa, devolve null para não escolher episódio errado.
 *
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @param {ShowVideos} videos - Lista publicada na página única.
 * @returns {number|null} Número absoluto ou null quando a conversão não é comprovada.
 */
export function absoluteEpisode(media, season, episode, videos) {
  const regular = (media.seasons || [])
    .filter((item) => Number.isInteger(item.number) && item.number > 0 && Number.isInteger(item.episodeCount) && item.episodeCount > 0)
    .sort((a, b) => a.number - b.number);
  if (!regular.some((item) => item.number === season)) return null;

  const total = regular.reduce((sum, item) => sum + item.episodeCount, 0);
  const pageCount = Object.keys(videos.episodios).length;
  if (pageCount < total * 0.9 || pageCount > total * 1.1) return null;

  const before = regular
    .filter((item) => item.number < season)
    .reduce((sum, item) => sum + item.episodeCount, 0);
  return before + episode;
}

/**
 * Abre a página do vídeo e lê o iframe do player.
 * @param {string} videoUrl - Página `/video/<id>/`.
 * @returns {Promise<{ url: string, referer: string }>} URL do player e Referer da página do vídeo.
 * @throws {Error} Em falha de rede ou página sem iframe `/player`.
 */
export async function readVideoPlayerUrl(videoUrl) {
  const response = await fetchPage(videoUrl, {
    profile: 'page',
    headers: { Referer: `${SITE_URL}/` },
  });
  const iframes = response.text.match(/<iframe\b[^>]*>/gi) || [];
  for (const tag of iframes) {
    const src = readAttribute(tag, 'src');
    if (src === null) continue;
    const decoded = decodeEntities(src);
    if (!decoded.includes('/player')) continue;
    const url = resolveSourceLink(decoded, response.url);
    if (url !== null) return { url, referer: response.url };
  }
  throw new Error(`Página do vídeo sem iframe do player em ${response.url}`);
}

/**
 * Lê um link `tempAnterior`/`tempProxima` pelo nome da classe.
 * @param {string} html - HTML da ficha.
 * @param {string} className - Classe procurada.
 * @returns {string|null} `href` bruto ou null.
 */
function readLinkByClass(html, className) {
  const tags = html.match(/<a\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const classes = readAttribute(tag, 'class');
    if (classes === null || !classes.split(/\s+/).includes(className)) continue;
    const href = readAttribute(tag, 'href');
    if (href !== null) return href;
  }
  return null;
}

/**
 * Resolve um link contra a página e mantém apenas o domínio da fonte.
 * @param {string|null} link - Link bruto.
 * @param {string} base - URL da página.
 * @returns {string|null} URL absoluta na fonte ou null.
 */
function resolveSourceLink(link, base) {
  if (link === null || link.trim() === '') return null;
  let url;
  try {
    url = new URL(link, base);
  } catch {
    return null;
  }
  if (url.hostname !== 'anizero.org' && url.hostname !== 'www.anizero.org') return null;
  return url.href;
}

/**
 * Normaliza a temporada de uma ficha; ausência de marcador é a temporada 1.
 * @param {AnimePage} page - Ficha.
 * @returns {number|null} Temporada ou null quando o marcador é inválido.
 */
function normalizeSeason(page) {
  if (page.season === null) return 1;
  return Number.isInteger(page.season) ? page.season : null;
}

/**
 * Abre uma ficha da cadeia e exige que ela continue correspondendo ao TMDB.
 * @param {string} url - URL da ficha.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {Map<string, AnimePage>} cache - Cache da chamada.
 * @returns {Promise<AnimePage|null>} Ficha compatível ou null quando 404/fora do título.
 */
async function loadChainPage(url, media, season, cache) {
  let page;
  try {
    page = await readAnimePage(url, cache);
  } catch (error) {
    if (/HTTP 404/.test(error.message)) return null;
    throw error;
  }
  return matchAnimePage(page, media, season) === null ? null : page;
}

/**
 * Monta as consultas de busca a partir dos títulos do TMDB.
 * @param {object} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {string[]} Consultas sem repetição normalizada.
 */
function buildQueries(media, season) {
  const titles = [media.title, media.originalTitle];
  for (const alternative of media.alternativeTitles || []) titles.push(alternative);
  for (const romaji of media.romajiTitles || []) titles.push(romaji.title);

  const seen = new Set();
  const queries = [];
  const add = (value) => {
    if (typeof value !== 'string' || value.trim() === '') return;
    const key = normalizeText(value);
    if (key === '' || seen.has(key)) return;
    seen.add(key);
    queries.push(value.trim());
  };

  for (const title of titles) add(title);
  if (season > 1) {
    for (const title of titles.slice(0, 3)) add(`${title} S${season}`);
  }
  return queries.slice(0, 8);
}

/**
 * Valida a resposta da busca em tempo real.
 * @param {*} response - JSON recebido.
 * @param {string} query - Consulta, para a mensagem de erro.
 * @returns {SearchCandidate[]} Cartões válidos.
 * @throws {Error} Se a resposta não for lista nem o erro de ausência da fonte.
 */
function readSearchResponse(response, query) {
  if (Array.isArray(response)) {
    const items = [];
    for (const item of response) {
      if (item === null || typeof item !== 'object') {
        throw new Error(`Busca fora do esquema para "${query}": item não é objeto`);
      }
      if (typeof item.title !== 'string' || typeof item.url !== 'string') {
        throw new Error(`Busca fora do esquema para "${query}": item sem title/url`);
      }
      if (/^filme/i.test(typeof item.tipo === 'string' ? item.tipo : '')) continue;
      const url = resolveSourceLink(item.url, SITE_URL);
      if (url === null || !new URL(url).pathname.startsWith('/anime/')) continue;
      items.push({
        title: decodeEntities(item.title).replace(/\s+/g, ' ').trim(),
        url,
        tipo: typeof item.tipo === 'string' ? item.tipo : null,
      });
    }
    return items;
  }

  if (response !== null && typeof response === 'object' && typeof response.error === 'string') {
    return [];
  }

  throw new Error(`Busca fora do esquema para "${query}"`);
}

/**
 * Normaliza uma lista opcional da API (`ovas`/`filmes`) para objeto vazio quando ausente.
 * A fonte publica essas listas como array; o provedor não as usa em pedido de série.
 * @param {*} value - Valor recebido.
 * @returns {Object<string, EpisodeEntry>} Objeto validado.
 */
function readOptionalList(value) {
  if (value === undefined || value === null) return {};
  if (Array.isArray(value)) return {};
  if (typeof value !== 'object') {
    throw new Error('Lista opcional de vídeos fora do esquema');
  }
  return value;
}
