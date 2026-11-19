/**
 * Catálogo do Super Animes (AnimesTVS): identidade de filmes e séries, temporada, episódio e
 * fallback por numeração absoluta.
 *
 * A fonte cataloga cada arco/temporada como uma entrada própria, com título em romaji e contagem
 * de episódios. A correspondência usa os títulos do TMDB (PT-BR, original, alternativos e romaji)
 * e o ano; a temporada é localizada pelo marcador declarado no título (`Season N`, `Nth Season`,
 * `Temporada N`, `Nª Temporada` ou número final) e pelos romaji específicos de temporada do TMDB.
 * Quando a fonte publica a série inteira em uma única entrada, o episódio é localizado pela
 * numeração absoluta calculada a partir das temporadas regulares do TMDB.
 */

import { normalizeText } from '../_blocks/slugify/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import {
  cleanTitle,
  isPlainObject,
  isSpecialTitle,
  parsePart,
  parseSeason,
  readAudio,
  readCount,
  readYear,
  yearMatches,
} from './text.js';

const MOVIE_MIN_SCORE = 0.85;
const SERIES_IDENTITY_SCORE = 0.85;
const BASE_SCORE = 0.97;
const SEASON_TITLE_SCORE = 0.85;
const DISTINCT_TITLE_SCORE = 0.85;
const YEAR_TOLERANCE = 1;
const PART_YEAR_TOLERANCE = 2;
const MIN_TV_EPISODES = 4;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/tmdb-info/index.mjs').SeasonInfo} SeasonInfo
 */

/**
 * @typedef {object} CatalogEntry
 * @property {string} titulo - Título publicado, com sufixo de áudio.
 * @property {string} [audio] - `Dublado` ou `Legendado`.
 * @property {string} [tipo] - `dublado` ou `legendado` (fallback de áudio).
 * @property {string} [episodios] - Contagem de episódios em texto.
 * @property {number|string|null} [ano] - Ano de estreia.
 */

/**
 * @typedef {object} SeriesCandidate
 * @property {CatalogEntry} entry - Entrada do catálogo.
 * @property {'Dublado'|'Legendado'} audio - Áudio da entrada.
 * @property {string} title - Título sem o sufixo de áudio.
 * @property {number|null} count - Episódios declarados.
 * @property {number} part - Parte declarada (`Part N`), 1 quando ausente.
 * @property {number|null} year - Ano declarado.
 * @property {number|null} explicit - Temporada declarada no título.
 * @property {'base'|'explicit'|'specific'|'distinct'} reason - Regra que selecionou a entrada.
 * @property {number} baseScore - Similaridade com os títulos do TMDB.
 * @property {number} specificScore - Similaridade com os romaji da temporada pedida.
 * @property {number} distinctScore - Similaridade com os romaji de arco sem temporada.
 */

/**
 * @typedef {object} Match
 * @property {CatalogEntry} entry - Entrada escolhida.
 * @property {'Dublado'|'Legendado'} audio - Áudio da entrada.
 * @property {number} localEpisode - Episódio dentro da entrada escolhida.
 */

/**
 * Seleciona a melhor entrada de filme por áudio.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {CatalogEntry[]} catalog - Catálogo completo.
 * @returns {Array<{ entry: CatalogEntry, audio: 'Dublado'|'Legendado' }>} Entradas escolhidas, uma por áudio.
 * @example
 * const matches = selectMovieMatches(media, catalog);
 * // [{ entry: { titulo: 'Akira (Dublado)' }, audio: 'Dublado' }]
 */
export function selectMovieMatches(media, catalog) {
  const titles = knownTitles(media);
  const bestByAudio = new Map();
  for (const entry of catalog) {
    if (!isPlainObject(entry) || typeof entry.titulo !== 'string') continue;
    const audio = readAudio(entry);
    if (audio === null) continue;
    if (readCount(entry.episodios) !== 1) continue;
    if (!yearMatches(entry.ano, media.year, YEAR_TOLERANCE)) continue;
    const title = cleanTitle(entry.titulo);
    const score = bestScore(title, titles);
    if (score < MOVIE_MIN_SCORE) continue;
    const candidate = { entry, audio, score, exactYear: readYear(entry.ano) === media.year };
    const current = bestByAudio.get(audio);
    if (current === undefined || isBetterMovie(candidate, current)) bestByAudio.set(audio, candidate);
  }
  return [...bestByAudio.values()].map(({ entry, audio }) => ({ entry, audio }));
}

/**
 * Seleciona as entradas de série que cobrem a temporada e o episódio pedidos.
 *
 * Cada áudio é resolvido em separado. Quando os candidatos da temporada não cobrem o episódio, a
 * numeração absoluta do TMDB é aplicada sobre a entrada que publica a série inteira.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida, a partir de 1.
 * @param {number} episode - Episódio pedido, a partir de 1.
 * @param {CatalogEntry[]} catalog - Catálogo completo.
 * @returns {Match[]} Entradas e episódios locais, no máximo uma por áudio.
 * @example
 * selectSeriesMatches(media, 3, 13, catalog);
 * // [{ entry: { titulo: 'Shingeki no Kyojin Season 3 Part 2' }, audio: 'Dublado', localEpisode: 1 }]
 */
export function selectSeriesMatches(media, season, episode, catalog) {
  const seasonInfo = media.seasons.find((item) => item.number === season);
  if (seasonInfo === undefined) return [];
  const candidates = seriesCandidates(media, season, seasonInfo, catalog);
  const byAudio = groupByAudio(candidates);
  const matches = [];
  for (const audio of ['Dublado', 'Legendado']) {
    const group = byAudio.get(audio);
    if (group !== undefined && group.length > 0) {
      const mapped = mapEpisode(group, episode, season, seasonInfo.episodeCount);
      if (mapped !== null) {
        matches.push({ entry: mapped.entry, audio, localEpisode: mapped.localEpisode });
        continue;
      }
    }
    const absolute = absoluteEpisode(media, season, episode);
    const fallback = findAbsoluteBase(media, catalog, audio, absolute);
    if (fallback !== null) matches.push({ entry: fallback, audio, localEpisode: absolute });
  }
  return matches;
}

/**
 * Títulos conhecidos do TMDB, sem repetição pelo texto normalizado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original, alternativos e romaji.
 * @example
 * knownTitles(media); // ['Demon Slayer: Kimetsu no Yaiba', '鬼滅の刃', 'Kimetsu no Yaiba']
 */
function knownTitles(media) {
  const texts = [media.title, media.originalTitle]
    .concat(media.alternativeTitles)
    .concat(media.romajiTitles.map((item) => item.title));
  const seen = new Set();
  const titles = [];
  for (const text of texts) {
    if (typeof text !== 'string' || text.trim() === '') continue;
    const normalized = normalizeText(text);
    if (normalized === '' || seen.has(normalized)) continue;
    seen.add(normalized);
    titles.push(text.trim());
  }
  return titles;
}

/**
 * Maior similaridade entre um título e uma lista.
 * @param {string} title - Título da fonte.
 * @param {string[]} candidates - Títulos do TMDB.
 * @returns {number} Similaridade entre 0 e 1.
 * @example
 * bestScore('Kimetsu no Yaiba', ['Kimetsu no Yaiba']); // 1
 */
function bestScore(title, candidates) {
  return Math.max(0, ...candidates.map((candidate) => titleSimilarity(title, candidate)));
}

/**
 * Indica se o título da fonte começa pelo título do TMDB.
 * @param {string} title - Título da fonte.
 * @param {string[]} candidates - Títulos do TMDB.
 * @returns {boolean} True quando um dos títulos é prefixo do título da fonte.
 * @example
 * startsWithTitle('Kimetsu no Yaiba 2: Yuukaku-hen', ['Kimetsu no Yaiba']); // true
 */
function startsWithTitle(title, candidates) {
  const normalized = normalizeText(title);
  return candidates.some((candidate) => {
    const base = normalizeText(candidate);
    if (base === '') return false;
    return normalized === base || normalized.startsWith(`${base} `);
  });
}

/**
 * Indica se a entrada pertence à obra do TMDB.
 * @param {string} title - Título sem o sufixo de áudio.
 * @param {string[]} titles - Títulos do TMDB.
 * @returns {boolean} True quando o título começa por um título conhecido ou tem similaridade suficiente.
 */
function sameSeries(title, titles) {
  return startsWithTitle(title, titles) || bestScore(title, titles) >= SERIES_IDENTITY_SCORE;
}

/**
 * Romaji do TMDB que nomeiam arcos fora das temporadas numeradas.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Romaji sem temporada explícita e diferente do título principal.
 */
function distinctRomaji(media) {
  const main = new Set([media.title, media.originalTitle].concat(media.alternativeTitles).map((title) => normalizeText(title)));
  return media.romajiTitles
    .filter((item) => item.season === null && !main.has(normalizeText(item.title)))
    .map((item) => item.title);
}

/**
 * Romaji do TMDB que nomeiam a temporada pedida.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @returns {string[]} Títulos romaji com o marcador da temporada.
 */
function seasonRomaji(media, season) {
  return media.romajiTitles.filter((item) => item.season === season).map((item) => item.title);
}

/**
 * Indica se o próprio título do TMDB nomeia a temporada, como `Koori no Jouheki 2nd Season`.
 * Nesse caso, o marcador faz parte do nome da obra e não deve ser lido como temporada da fonte.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada declarada no título da fonte.
 * @returns {boolean} True quando um título do TMDB também declara a mesma temporada.
 */
function mediaNamesSeason(media, season) {
  const texts = [media.title, media.originalTitle]
    .concat(media.alternativeTitles)
    .concat(media.romajiTitles.map((item) => item.title));
  return texts.some((text) => parseSeason(text) === season);
}

/**
 * Monta os candidatos de série para uma temporada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {SeasonInfo} seasonInfo - Temporada do TMDB.
 * @param {CatalogEntry[]} catalog - Catálogo completo.
 * @returns {SeriesCandidate[]} Candidatos ordenados por parte, ano e contagem.
 */
function seriesCandidates(media, season, seasonInfo, catalog) {
  const titles = knownTitles(media);
  const specific = seasonRomaji(media, season);
  const distinct = season > 1 ? distinctRomaji(media) : [];
  const candidates = [];
  for (const entry of catalog) {
    if (!isPlainObject(entry) || typeof entry.titulo !== 'string') continue;
    const audio = readAudio(entry);
    if (audio === null) continue;
    const title = cleanTitle(entry.titulo);
    if (isSpecialTitle(title)) continue;
    const count = readCount(entry.episodios);
    if (count === 0) continue;
    if (!sameSeries(title, titles)) continue;
    const baseScore = bestScore(title, titles);
    const seriesYear = yearMatches(entry.ano, media.year, YEAR_TOLERANCE);
    const parsedSeason = parseSeason(title);
    const explicit = parsedSeason !== null && baseScore >= BASE_SCORE && seriesYear && mediaNamesSeason(media, parsedSeason)
      ? null
      : parsedSeason;
    const specificScore = bestScore(title, specific);
    const distinctScore = distinct.length === 0 ? 0 : bestScore(title, distinct);
    const isBase = explicit === null && baseScore >= BASE_SCORE && seriesYear;
    const reason = classifyCandidate({ season, explicit, baseScore, specificScore, distinctScore, isBase, entry, seasonInfo });
    if (reason === null) continue;
    if (count !== null && count < MIN_TV_EPISODES && seasonInfo.episodeCount >= MIN_TV_EPISODES) continue;
    candidates.push({
      entry,
      audio,
      title,
      count,
      part: parsePart(title),
      year: readYear(entry.ano),
      explicit,
      reason,
      baseScore,
      specificScore,
      distinctScore,
    });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

/**
 * Aplica a regra de seleção de uma entrada para a temporada pedida.
 * @param {object} context - Valores lidos da entrada e da temporada.
 * @returns {'base'|'explicit'|'specific'|'distinct'|null} Regra aplicada ou null.
 */
function classifyCandidate(context) {
  const { season, explicit, specificScore, distinctScore, isBase, entry, seasonInfo } = context;
  if (season === 1) {
    if (explicit === 1) return 'explicit';
    if (specificScore >= SEASON_TITLE_SCORE) return 'specific';
    if (isBase) return 'base';
    return null;
  }
  if (explicit !== null) return explicit === season ? 'explicit' : null;
  if (isBase) return null;
  if (specificScore >= SEASON_TITLE_SCORE) return 'specific';
  if (distinctScore >= DISTINCT_TITLE_SCORE) {
    const part = parsePart(cleanTitle(entry.titulo));
    const tolerance = part > 1 ? PART_YEAR_TOLERANCE : YEAR_TOLERANCE;
    const entryYear = readYear(entry.ano);
    const withinYear = entryYear === null || seasonInfo.year === null || Math.abs(entryYear - seasonInfo.year) <= tolerance;
    return withinYear ? 'distinct' : null;
  }
  return null;
}

/**
 * Ordena candidatos pela parte, pelo ano e pela contagem decrescente.
 * @param {SeriesCandidate} a - Primeiro candidato.
 * @param {SeriesCandidate} b - Segundo candidato.
 * @returns {number} Ordem de comparação.
 */
function compareCandidates(a, b) {
  if (a.part !== b.part) return a.part - b.part;
  const yearA = a.year === null ? 0 : a.year;
  const yearB = b.year === null ? 0 : b.year;
  if (yearA !== yearB) return yearA - yearB;
  return (b.count === null ? 0 : b.count) - (a.count === null ? 0 : a.count);
}

/**
 * Agrupa candidatos por áudio.
 * @param {SeriesCandidate[]} candidates - Candidatos da temporada.
 * @returns {Map<string, SeriesCandidate[]>} Candidatos por áudio.
 */
function groupByAudio(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.audio)) groups.set(candidate.audio, []);
    groups.get(candidate.audio).push(candidate);
  }
  return groups;
}

/**
 * Localiza o episódio dentro dos candidatos da temporada.
 * @param {SeriesCandidate[]} group - Candidatos de um áudio.
 * @param {number} episode - Episódio pedido.
 * @param {number} season - Temporada pedida.
 * @param {number} seasonEpisodeCount - Episódios da temporada no TMDB.
 * @returns {{ entry: CatalogEntry, localEpisode: number }|null} Entrada e episódio local, ou null.
 */
function mapEpisode(group, episode, season, seasonEpisodeCount) {
  if (season === 1) {
    const labelled = group.filter((candidate) => candidate.reason !== 'base');
    if (labelled.length > 0) {
      const mapped = walkCandidates(labelled, episode);
      if (mapped !== null) return mapped;
    }
    const bases = group.filter((candidate) => candidate.reason === 'base');
    if (bases.length === 0) return null;
    const base = pickBase(bases, seasonEpisodeCount);
    if (base.count !== null && base.count < episode) return null;
    return { entry: base.entry, localEpisode: episode };
  }
  return walkCandidates(group, episode);
}

/**
 * Percorre as partes na ordem e desconta os episódios até achar o pedido.
 * @param {SeriesCandidate[]} candidates - Partes da temporada.
 * @param {number} episode - Episódio pedido.
 * @returns {{ entry: CatalogEntry, localEpisode: number }|null} Entrada e episódio local, ou null.
 */
function walkCandidates(candidates, episode) {
  let remaining = episode;
  for (const candidate of candidates) {
    if (candidate.count === null) return { entry: candidate.entry, localEpisode: remaining };
    if (remaining <= candidate.count) return { entry: candidate.entry, localEpisode: remaining };
    remaining -= candidate.count;
  }
  return null;
}

/**
 * Escolhe a melhor entrada de base para a temporada 1.
 * @param {SeriesCandidate[]} bases - Candidatos de base.
 * @param {number} seasonEpisodeCount - Episódios da temporada no TMDB.
 * @returns {SeriesCandidate} Entrada escolhida.
 */
function pickBase(bases, seasonEpisodeCount) {
  return bases
    .slice()
    .sort((a, b) => {
      if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
      const distanceA = a.count === null ? Number.MAX_SAFE_INTEGER : Math.abs(a.count - seasonEpisodeCount);
      const distanceB = b.count === null ? Number.MAX_SAFE_INTEGER : Math.abs(b.count - seasonEpisodeCount);
      if (distanceA !== distanceB) return distanceA - distanceB;
      return (b.count === null ? 0 : b.count) - (a.count === null ? 0 : a.count);
    })[0];
}

/**
 * Soma os episódios das temporadas regulares anteriores e o episódio pedido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {number} Número absoluto do episódio.
 * @example
 * absoluteEpisode(media, 2, 1); // 53 para uma temporada 1 com 52 episódios
 */
function absoluteEpisode(media, season, episode) {
  let total = 0;
  for (const info of media.seasons) {
    if (info.number >= 1 && info.number < season) total += info.episodeCount;
  }
  return total + episode;
}

/**
 * Procura a entrada que publica a série inteira para aplicar a numeração absoluta.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {CatalogEntry[]} catalog - Catálogo completo.
 * @param {'Dublado'|'Legendado'} audio - Áudio pedido.
 * @param {number} absolute - Episódio absoluto.
 * @returns {CatalogEntry|null} Entrada de base ou null.
 */
function findAbsoluteBase(media, catalog, audio, absolute) {
  const titles = knownTitles(media);
  let best = null;
  for (const entry of catalog) {
    if (!isPlainObject(entry) || typeof entry.titulo !== 'string') continue;
    if (readAudio(entry) !== audio) continue;
    const title = cleanTitle(entry.titulo);
    if (isSpecialTitle(title) || parseSeason(title) !== null) continue;
    if (!yearMatches(entry.ano, media.year, YEAR_TOLERANCE)) continue;
    const score = bestScore(title, titles);
    if (score < BASE_SCORE) continue;
    const count = readCount(entry.episodios);
    if (count === null || count < absolute) continue;
    const candidate = { entry, score, count };
    if (best === null || score > best.score || (score === best.score && count > best.count)) best = candidate;
  }
  return best === null ? null : best.entry;
}

/**
 * Compara dois candidatos de filme pelo score, depois pelo ano exato.
 * @param {{ score: number, exactYear: boolean }} a - Primeiro candidato.
 * @param {{ score: number, exactYear: boolean }} b - Segundo candidato.
 * @returns {boolean} True quando `a` é melhor que `b`.
 */
function isBetterMovie(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  return a.exactYear && !b.exactYear;
}
