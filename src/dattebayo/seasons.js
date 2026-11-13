/**
 * Fichas, temporadas e episódios do Dattebayo BR.
 *
 * A ficha publica `Tipo`, `Ano` e `Episódios` em `.animeInfo`, os links `tempAnterior` e
 * `tempProxima` e a lista de `.episodio` com `/videos/<id>` e o texto `Episódio NN`. A família de
 * TV é montada pela cadeia de temporadas, respeitando a seção de idioma, e a paginação da ficha usa
 * `/page/<n>` com 24 itens por página em média.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { extractPlayerOptions } from './player.js';

const SOURCE_HOSTS = new Set(['dattebayo-br.com', 'www.dattebayo-br.com']);
const EPISODES_PER_PAGE = 24;
const MAX_FAMILY = 12;
const MIN_BASE_SCORE = 0.85;
const DUBBED_SUFFIX = /\s*-\s*dublado\s*$/i;
const EXCLUDED_MARKER = /\b(?:ova|ona|especial|especiais|filme|filmes|movie)\b/;

/**
 * @typedef {object} EpisodeLink
 * @property {number} number - Número exibido no cartão.
 * @property {string} url - URL absoluta de `/videos/<id>`.
 */

/**
 * @typedef {object} Detail
 * @property {string} url - URL da ficha.
 * @property {string} title - Título canônico de `h1`.
 * @property {'Filme'|'TV'} type - Tipo informado pela ficha.
 * @property {number|null} year - Ano informado pela ficha.
 * @property {number|null} availableEpisodes - Parte disponível de `disponíveis/total`.
 * @property {number|null} totalEpisodes - Total de `disponíveis/total`.
 * @property {string|null} previousUrl - Link de `tempAnterior`.
 * @property {string|null} nextUrl - Link de `tempProxima`.
 * @property {number|null} lastPage - Última página da paginação da ficha, quando publicada.
 * @property {EpisodeLink[]|null} episodes - Primeira página de episódios; null sem lista reconhecida.
 */

/**
 * @typedef {object} SeasonTarget
 * @property {Detail} detail - Ficha que contém o episódio.
 * @property {number} localEpisode - Número local na ficha escolhida.
 */

/**
 * Coleta as opções de player das fichas confirmadas.
 *
 * Filme usa o primeiro link de vídeo da ficha. Série monta a família, mapeia a temporada pedida,
 * localiza o episódio na paginação e lê as abas do player. Temporada não mapeada, episódio ausente
 * e ficha de filme sem vídeo são ausência daquela ficha, não erro.
 *
 * @param {object[]} candidates - Fichas confirmadas pela busca.
 * @param {object} request - Pedido validado recebido pelo provedor.
 * @param {'movie'|'tv'} request.mediaType - Tipo de mídia.
 * @param {number|null} request.season - Temporada em séries.
 * @param {number|null} request.episode - Episódio em séries.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {Promise<object[]>} Opções de player com `language` e `videoPageUrl`.
 * @throws {Error} Em falha de rede, layout de ficha/player ou dado obrigatório ausente.
 */
export async function collectOptions(candidates, request, media) {
  const options = [];
  for (const candidate of candidates) {
    let videoUrl;
    if (request.mediaType === 'movie') {
      const episodes = candidate.detail.episodes;
      if (episodes === null || episodes.length === 0) continue;
      videoUrl = episodes[0].url;
    } else {
      const family = await buildFamily(candidate.detail);
      const target = resolveSeasonTarget(family, candidate.detail, media, request.season, request.episode);
      if (target === null) continue;
      videoUrl = await resolveEpisodeLink(target.detail, target.localEpisode);
      if (videoUrl === null) continue;
    }
    const html = await fetchText(videoUrl);
    for (const option of extractPlayerOptions(html, videoUrl)) {
      options.push({ ...option, language: candidate.language, videoPageUrl: videoUrl });
    }
  }
  return options;
}

/**
 * Lê a ficha: título, tipo, ano, contagem de episódios, links de temporada e primeira página.
 * @param {string} html - HTML da ficha.
 * @param {string} url - URL da ficha, usada nas mensagens de erro.
 * @returns {Detail} Ficha lida; campos ausentes ficam null.
 * @throws {Error} Se faltar `h1`, `.animeInfo`, `Tipo` ou um link de episódio válido.
 */
export function readDetail(html, url) {
  const $ = getCheerio().load(html);
  const title = $('h1').eq(0).text().trim();
  if (title === '') throw new Error(`Ficha ${url} sem h1`);
  const info = $('.aniInfosSingleNums').length > 0 ? $('.aniInfosSingleNums') : $('.animeInfo');
  if (info.length === 0) throw new Error(`Ficha ${url} sem os dados de .aniInfosSingleNums`);
  const infoText = info.text();
  const type = readType(infoText, url);
  const counts = readEpisodeCounts(infoText);
  return {
    url,
    title,
    type,
    year: readYear(infoText),
    availableEpisodes: counts === null ? null : counts.available,
    totalEpisodes: counts === null ? null : counts.total,
    previousUrl: readChainLink($, 'a.tempAnterior', url),
    nextUrl: readChainLink($, 'a.tempProxima', url),
    lastPage: readLastPage($),
    episodes: readEpisodes($, url, type === 'Filme'),
  };
}

/**
 * Indica se o título é a ficha base do título do TMDB, sem marcador de temporada.
 * @param {string} title - Título de `h1` da ficha.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @returns {boolean} True quando a ficha é a entrada base da família.
 */
export function isBaseTitle(title, media) {
  const references = [media.title, media.originalTitle, ...media.alternativeTitles];
  let best = null;
  for (const reference of references) {
    if (typeof reference !== 'string') continue;
    const score = titleSimilarity(stripDubbed(title), reference);
    if (best === null || score > best.score) best = { reference, score };
  }
  if (best === null || best.score < MIN_BASE_SCORE) return false;
  return readSeasonMarker(stripDubbed(title), best.reference).kind === 'base';
}

/**
 * Lê o tipo da ficha.
 * @param {string} infoText - Texto de `.animeInfo`.
 * @param {string} url - URL da ficha.
 * @returns {'Filme'|'TV'} Tipo lido.
 * @throws {Error} Se o campo `Tipo` não existir.
 */
function readType(infoText, url) {
  const match = /Tipo\s*:?\s*(Filme|TV)/i.exec(infoText);
  if (!match) throw new Error(`Ficha ${url} sem Tipo`);
  return match[1].toLowerCase() === 'filme' ? 'Filme' : 'TV';
}

/**
 * Lê o ano da ficha.
 * @param {string} infoText - Texto de `.animeInfo`.
 * @returns {number|null} Ano de quatro dígitos ou null.
 */
function readYear(infoText) {
  const match = /Ano\s*:?\s*(\d{4})/i.exec(infoText);
  return match ? Number(match[1]) : null;
}

/**
 * Lê a contagem de episódios no formato `disponíveis/total`, aceitando `??` no lugar do total.
 * @param {string} infoText - Texto de `.aniInfosSingleNums` ou `.animeInfo`.
 * @returns {{ available: number|null, total: number|null }|null} Contagens ou null.
 */
function readEpisodeCounts(infoText) {
  const match = /Epis[oó]dios\s*:?\s*(\d+|\?\?)\s*\/\s*(\d+|\?\?)/i.exec(infoText);
  if (!match) return null;
  return {
    available: match[1] === '??' ? null : Number(match[1]),
    total: match[2] === '??' ? null : Number(match[2]),
  };
}

/**
 * Lê um link da cadeia de temporadas.
 * @param {Function} $ - Instância do cheerio.
 * @param {string} selector - Seletor do link.
 * @param {string} url - URL da ficha para resolver caminhos relativos.
 * @returns {string|null} URL absoluta ou null.
 */
function readChainLink($, selector, url) {
  const href = $(selector).eq(0).attr('href');
  return href ? new URL(href, url).href : null;
}

/**
 * Lê a última página da paginação publicada na ficha (`/page/<n>`).
 * @param {Function} $ - Instância do cheerio.
 * @returns {number|null} Maior página encontrada ou null sem paginação.
 */
function readLastPage($) {
  const links = $('a');
  let last = null;
  for (let index = 0; index < links.length; index += 1) {
    const href = links.eq(index).attr('href');
    if (!href) continue;
    const match = /\/page\/(\d+)\/?$/.exec(href);
    if (!match) continue;
    const page = Number(match[1]);
    if (last === null || page > last) last = page;
  }
  return last;
}

/**
 * Lê a lista de episódios da página.
 * @param {Function} $ - Instância do cheerio.
 * @param {string} url - URL da página, usada nas mensagens de erro.
 * @param {boolean} [allowUnnumbered] - Aceita item de filme sem `Episódio NN`; padrão false.
 * @returns {EpisodeLink[]|null} Lista na ordem da página; null sem lista reconhecida.
 * @throws {Error} Se um item não tiver link de `/videos/` ou o texto `Episódio NN` obrigatório.
 */
function readEpisodes($, url, allowUnnumbered = false) {
  const items = episodeItems($);
  if (items === null) return null;
  const episodes = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const href = item.attr('href') || item.find('a').eq(0).attr('href');
    if (!href) throw new Error(`Item de episódio ${index + 1} de ${url} sem href`);
    const videoUrl = new URL(href, url);
    if (!SOURCE_HOSTS.has(videoUrl.hostname) || !videoUrl.pathname.startsWith('/videos/')) {
      throw new Error(`Item de episódio ${index + 1} de ${url} não aponta para /videos/`);
    }
    const match = /Epis[oó]dio\s+(\d+)/i.exec(item.text());
    if (!match && !allowUnnumbered) {
      throw new Error(`Item de episódio ${index + 1} de ${url} sem "Episódio NN"`);
    }
    episodes.push({ number: match ? Number(match[1]) : index + 1, url: videoUrl.href });
  }
  return episodes;
}

/**
 * Coleção de itens da lista de episódios, aceitando o markup atual e o alternativo.
 * @param {Function} $ - Instância do cheerio.
 * @returns {object|null} Coleção de itens ou null quando a página não tem lista reconhecida.
 */
function episodeItems($) {
  const current = $('.ultimosEpisodiosHomeItem');
  if (current.length > 0) return current;
  if ($('.episodios').length > 0) return $('.episodio');
  if ($('.episodio').length > 0) return $('.episodio');
  return null;
}

/**
 * Monta a família da ficha base seguindo `tempProxima` e `tempAnterior` na mesma seção.
 *
 * Só entra ficha base ou título com marcador de temporada reconhecido; outro texto encerra a
 * cadeia. O conjunto é limitado a 12 fichas.
 *
 * @param {Detail} baseDetail - Ficha base confirmada na busca.
 * @returns {Promise<Detail[]>} Fichas na ordem da cadeia.
 * @throws {Error} Em falha de rede ou ficha da cadeia ilegível.
 */
async function buildFamily(baseDetail) {
  const baseTitle = stripDubbed(baseDetail.title);
  const cache = new Map([[baseDetail.url, baseDetail]]);
  const seen = new Set([baseDetail.url]);
  const forward = [];
  let current = baseDetail;
  while (forward.length < MAX_FAMILY - 1 && current.nextUrl !== null) {
    if (seen.has(current.nextUrl) || !sameSection(baseDetail.url, current.nextUrl)) break;
    const next = await loadDetail(current.nextUrl, cache);
    if (!isRecognizedFamilyTitle(next.title, baseTitle)) break;
    seen.add(next.url);
    forward.push(next);
    current = next;
  }
  const backward = [];
  current = baseDetail;
  while (backward.length + forward.length < MAX_FAMILY - 1 && current.previousUrl !== null) {
    if (seen.has(current.previousUrl) || !sameSection(baseDetail.url, current.previousUrl)) break;
    const previous = await loadDetail(current.previousUrl, cache);
    if (!isRecognizedFamilyTitle(previous.title, baseTitle)) break;
    seen.add(previous.url);
    backward.push(previous);
    current = previous;
  }
  return backward.reverse().concat(baseDetail, forward);
}

/**
 * Confere se o título pertence à família: base ou marcador de temporada reconhecido.
 * @param {string} title - Título da ficha.
 * @param {string} baseTitle - Título da ficha base, sem sufixo de idioma.
 * @returns {boolean}
 */
function isRecognizedFamilyTitle(title, baseTitle) {
  const marker = readSeasonMarker(title, baseTitle);
  return marker.kind !== 'outside' && marker.kind !== 'excluded';
}

/**
 * Lê e reaproveita fichas da cadeia.
 * @param {string} url - URL da ficha.
 * @param {Map<string, Detail>} cache - Fichas já lidas.
 * @returns {Promise<Detail>} Ficha lida.
 */
async function loadDetail(url, cache) {
  if (cache.has(url)) return cache.get(url);
  const detail = readDetail(await fetchText(url), url);
  cache.set(url, detail);
  return detail;
}

/**
 * Confere se duas URLs pertencem à mesma seção de idioma da fonte.
 * @param {string} urlA - Primeira URL.
 * @param {string} urlB - Segunda URL.
 * @returns {boolean} True quando host e primeiro segmento coincidem.
 */
function sameSection(urlA, urlB) {
  const a = new URL(urlA);
  const b = new URL(urlB);
  return SOURCE_HOSTS.has(a.hostname) && SOURCE_HOSTS.has(b.hostname) && sectionOf(a.pathname) === sectionOf(b.pathname);
}

/**
 * Primeiro segmento de um caminho.
 * @param {string} pathname - Caminho da URL.
 * @returns {string}
 */
function sectionOf(pathname) {
  return pathname.split('/').filter((part) => part !== '')[0] || '';
}

/**
 * Lê o marcador de temporada do título em relação à ficha base.
 * @param {string} title - Título da ficha.
 * @param {string} baseTitle - Título da ficha base.
 * @returns {{ kind: string, number?: number, part?: number|null }} Marcador reconhecido.
 */
function readSeasonMarker(title, baseTitle) {
  const normalizedTitle = normalizeText(stripDubbed(title));
  const normalizedBase = normalizeText(stripDubbed(baseTitle));
  if (normalizedBase === '' || normalizedTitle === '') return { kind: 'outside' };
  if (normalizedTitle === normalizedBase) return { kind: 'base' };
  if (!normalizedTitle.startsWith(`${normalizedBase} `)) return { kind: 'outside' };
  const rest = normalizedTitle.slice(normalizedBase.length + 1);
  if (EXCLUDED_MARKER.test(rest)) return { kind: 'excluded' };
  let match = /^season (\d+)(?: part (\d+))?$/.exec(rest);
  if (match) return { kind: 'season', number: Number(match[1]), part: readPart(match[2]) };
  match = /^(\d+)(?:st|nd|rd|th) season(?: part (\d+))?$/.exec(rest);
  if (match) return { kind: 'season', number: Number(match[1]), part: readPart(match[2]) };
  match = /^(\d+)(?: part (\d+))?$/.exec(rest);
  if (match) return { kind: 'season', number: Number(match[1]), part: readPart(match[2]) };
  match = /^(?:the )?final season(?: part (\d+))?$/.exec(rest);
  if (match) return { kind: 'final', part: readPart(match[1]) };
  match = /^part (\d+)$/.exec(rest);
  if (match) return { kind: 'part', number: Number(match[1]) };
  return { kind: 'outside' };
}

/**
 * Converte a parte capturada em número ou null.
 * @param {string|undefined} value - Valor da captura.
 * @returns {number|null}
 */
function readPart(value) {
  return value === undefined ? null : Number(value);
}

/**
 * Remove o sufixo `- Dublado` do título apenas para comparação.
 * @param {string} title - Título da ficha.
 * @returns {string} Título sem o sufixo.
 */
function stripDubbed(title) {
  return title.replace(DUBBED_SUFFIX, '').trim();
}

/**
 * Mapeia a temporada pedida para uma ficha e um episódio local.
 *
 * Entrada base é a temporada 1; `Season N`, `Nth Season` e sufixo numérico valem N; `Final Season`
 * usa a última temporada regular do TMDB (ou a anterior da cadeia mais um); `Part N` herda a
 * temporada da parte anterior. Fichas com o mesmo número de parte, ou duas entradas independentes
 * na mesma temporada, são ambiguidade e devolvem null.
 *
 * @param {Detail[]} family - Fichas na ordem da cadeia.
 * @param {Detail} baseDetail - Ficha base confirmada.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {SeasonTarget|null} Ficha e episódio local, ou null quando não há mapeamento inequívoco.
 * @throws {Error} Se uma ficha necessária estiver sem contagem de episódios.
 */
function resolveSeasonTarget(family, baseDetail, media, season, episode) {
  const baseTitle = stripDubbed(baseDetail.title);
  const lastSeason = lastRegularSeason(media.seasons);
  if (lastSeason !== null && season > lastSeason) return null;
  let previousSeason = null;
  const entries = family.map((detail) => {
    const marker = readSeasonMarker(detail.title, baseTitle);
    let seasonNumber = null;
    let partNumber = null;
    if (marker.kind === 'base') {
      seasonNumber = 1;
    } else if (marker.kind === 'season') {
      seasonNumber = marker.number;
      partNumber = marker.part;
    } else if (marker.kind === 'final') {
      seasonNumber = lastSeason === null ? (previousSeason === null ? null : previousSeason + 1) : lastSeason;
      partNumber = marker.part === null ? 1 : marker.part;
    } else if (marker.kind === 'part') {
      seasonNumber = previousSeason;
      partNumber = marker.number;
    }
    if (seasonNumber !== null) previousSeason = seasonNumber;
    return { detail, marker, seasonNumber, partNumber };
  });

  const targets = entries.filter((entry) => entry.seasonNumber === season);
  if (targets.length === 0) return resolveAbsoluteTarget(entries, media, season, episode);
  if (targets.length === 1) {
    const detail = targets[0].detail;
    const available = requireEpisodeCount(detail);
    return episode <= available ? { detail, localEpisode: episode } : null;
  }

  const parts = targets.map((entry) => ({
    detail: entry.detail,
    partNumber: entry.partNumber === null ? 1 : entry.partNumber,
  }));
  const seenParts = new Set();
  for (const part of parts) {
    if (seenParts.has(part.partNumber)) return null;
    seenParts.add(part.partNumber);
  }
  parts.sort((a, b) => a.partNumber - b.partNumber);
  let offset = 0;
  for (const part of parts) {
    const available = requireEpisodeCount(part.detail);
    if (episode > offset && episode <= offset + available) {
      return { detail: part.detail, localEpisode: episode - offset };
    }
    offset += available;
  }
  return null;
}

/**
 * Resolve o caso de entrada única que cobre o total de episódios do TMDB (numeração absoluta).
 * @param {{ detail: Detail, marker: object }[]} entries - Fichas mapeadas.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {SeasonTarget|null} Ficha e episódio absoluto, ou null.
 * @throws {Error} Se a entrada única estiver sem contagem de episódios.
 */
function resolveAbsoluteTarget(entries, media, season, episode) {
  if (entries.length !== 1 || entries[0].marker.kind !== 'base') return null;
  const detail = entries[0].detail;
  const total = totalRegularEpisodes(media.seasons);
  if (total === null) return null;
  const available = requireEpisodeCount(detail);
  if (available < total) return null;
  const absolute = absoluteEpisode(media.seasons, season, episode);
  if (absolute === null || absolute > available) return null;
  return { detail, localEpisode: absolute };
}

/**
 * Converte temporada e episódio do TMDB em número absoluto, ignorando a temporada 0.
 * @param {object[]} seasons - Temporadas do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {number|null} Número absoluto ou null sem os dados necessários.
 */
function absoluteEpisode(seasons, season, episode) {
  if (!Array.isArray(seasons)) return null;
  let offset = 0;
  for (let number = 1; number < season; number += 1) {
    const item = seasons.find((candidate) => candidate.number === number);
    if (!item || !Number.isInteger(item.episodeCount) || item.episodeCount < 0) return null;
    offset += item.episodeCount;
  }
  return offset + episode;
}

/**
 * Última temporada regular do TMDB (maior número maior que zero).
 * @param {object[]} seasons - Temporadas do TMDB.
 * @returns {number|null} Número da última temporada ou null.
 */
function lastRegularSeason(seasons) {
  if (!Array.isArray(seasons)) return null;
  let last = null;
  for (const season of seasons) {
    if (!season || !Number.isInteger(season.number) || season.number < 1) continue;
    if (last === null || season.number > last) last = season.number;
  }
  return last;
}

/**
 * Total de episódios regulares do TMDB, sem a temporada 0.
 * @param {object[]} seasons - Temporadas do TMDB.
 * @returns {number|null} Total positivo ou null sem os dados necessários.
 */
function totalRegularEpisodes(seasons) {
  if (!Array.isArray(seasons)) return null;
  let total = 0;
  for (const season of seasons) {
    if (!season || !Number.isInteger(season.number) || season.number < 1) continue;
    if (!Number.isInteger(season.episodeCount) || season.episodeCount < 0) return null;
    total += season.episodeCount;
  }
  return total > 0 ? total : null;
}

/**
 * Exige a contagem de episódios de uma ficha de série.
 * @param {Detail} detail - Ficha da família.
 * @returns {number} Episódios disponíveis.
 * @throws {Error} Se a ficha não trouxer `Episódios` em `disponíveis/total`.
 */
function requireEpisodeCount(detail) {
  if (!Number.isInteger(detail.availableEpisodes) || detail.availableEpisodes < 0) {
    throw new Error(`Ficha ${detail.url} sem Episódios`);
  }
  return detail.availableEpisodes;
}

/**
 * Localiza a URL de `/videos/<id>` do episódio na paginação da ficha.
 *
 * A primeira página já vem da ficha. A estimativa `ceil(episódio / 24)` e as páginas vizinhas são
 * conferidas antes da leitura sequencial de fallback. Episódio acima do disponível é ausência.
 *
 * @param {Detail} detail - Ficha que contém o episódio.
 * @param {number} episode - Episódio local pedido.
 * @returns {Promise<string|null>} URL do vídeo ou null quando o episódio não existe.
 * @throws {Error} Se a ficha estiver sem lista de episódios ou uma página não tiver o contêiner.
 */
async function resolveEpisodeLink(detail, episode) {
  const available = requireEpisodeCount(detail);
  if (detail.episodes === null) throw new Error(`Ficha ${detail.url} sem lista de episódios`);
  if (episode > available) return null;
  const lastPage = detail.lastPage === null
    ? Math.max(1, Math.ceil(available / EPISODES_PER_PAGE))
    : Math.max(1, detail.lastPage);
  const order = [1];
  const estimated = Math.max(1, Math.ceil(episode / EPISODES_PER_PAGE));
  for (const page of [estimated, estimated - 1, estimated + 1]) {
    if (page >= 1 && page <= lastPage && order.indexOf(page) === -1) order.push(page);
  }
  for (let page = 2; page <= lastPage; page += 1) {
    if (order.indexOf(page) === -1) order.push(page);
  }

  const cache = new Map([[1, detail.episodes]]);
  for (const page of order) {
    const list = await loadEpisodePage(detail.url, page, cache);
    const found = list.find((item) => item.number === episode);
    if (found) return found.url;
  }
  return null;
}

/**
 * Lê uma página de episódios, reaproveitando páginas já lidas.
 * @param {string} detailUrl - URL da ficha base.
 * @param {number} page - Número da página.
 * @param {Map<number, EpisodeLink[]>} cache - Páginas já lidas.
 * @returns {Promise<EpisodeLink[]>} Episódios da página.
 * @throws {Error} Se a página não tiver o contêiner `.episodios`.
 */
async function loadEpisodePage(detailUrl, page, cache) {
  if (cache.has(page)) return cache.get(page);
  const url = `${detailUrl.replace(/\/+$/, '')}/page/${page}`;
  const list = readEpisodes(getCheerio().load(await fetchText(url)), url);
  if (list === null) throw new Error(`Página ${url} sem lista de episódios`);
  cache.set(page, list);
  return list;
}

/**
 * Carrega o cheerio fornecido pelo app.
 * @returns {object} Módulo do cheerio.
 */
function getCheerio() {
  return require('cheerio-without-node-native');
}
