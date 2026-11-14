/**
 * Extrator do provedor Animy.
 *
 * Localiza a entrada pelo título do TMDB, confirma tipo e identidade, agrupa as variantes de áudio
 * publicadas pela fonte e resolve o episódio pelo par temporada/número. Cada variante é resolvida
 * em isolamento; a falha de uma não descarta as demais.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchAnime, fetchEpisode, searchAnime } from './api.js';

const MIN_SCORE = 0.82;
const MAX_TERMS = 8;
const MAX_VARIANTS = 4;
const PROVIDER_LABEL = 'Animy';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./api.js').SearchItem} SearchItem
 * @typedef {import('./api.js').AnimeSheet} AnimeSheet
 * @typedef {import('./api.js').EpisodeEntry} EpisodeEntry
 * @typedef {import('./api.js').EpisodeStream} EpisodeStream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} Coordinates
 * @property {number|null} season - Temporada pedida; null em filme.
 * @property {number|null} episode - Episódio pedido; null em filme.
 */

/**
 * @typedef {object} Candidate
 * @property {SearchItem} item - Entrada confirmada.
 * @property {number} score - Similaridade com o título do TMDB.
 */

/**
 * Localiza a mídia, seleciona as variantes e monta os streams.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, JSON inválido, estrutura inesperada ou quando todas as
 *   variantes falham sem produzir stream.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'Animy');
 * // streams.map((stream) => stream.language) === ['Dublado', 'Legendado']
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);

  const candidates = await findCandidates(media, request.mediaType, coordinates.season);
  if (candidates.length === 0) return [];

  const variants = selectVariants(candidates);
  const streams = [];
  const failures = [];

  for (const candidate of variants) {
    try {
      const resolved = await resolveVariant(candidate.item, media, request.mediaType, coordinates);
      streams.push(...resolved);
    } catch (error) {
      failures.push(`${candidate.item.title}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${candidate.item.title} descartada: ${sanitizeMessage(error.message)}`);
    }
  }

  const unique = dedupeStreams(streams);
  if (unique.length > 0) return unique;
  if (failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.map(sanitizeMessage).join('; ')}`);
  }
  return [];
}

/**
 * Lê temporada e episódio do pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Coordinates} Temporada e episódio em séries; null em filmes.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readCoordinates(request) {
  if (request.mediaType !== 'tv') return { season: null, episode: null };
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Procura e confirma candidatos pelos títulos do TMDB.
 *
 * Cada termo é consultado uma vez. O candidato precisa ter o tipo pedido e similaridade mínima
 * com algum título do TMDB; o ano publicado pela fonte só soma um desempate quando coincide,
 * porque o catálogo usa o ano de publicação e não o de estreia.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {number|null} season - Temporada pedida; null em filme.
 * @returns {Promise<Candidate[]>} Candidatos confirmados, do maior para o menor score.
 */
async function findCandidates(media, mediaType, season) {
  const byId = new Map();
  for (const query of searchQueries(media, season)) {
    const items = await searchAnime(query);
    for (const item of items) {
      if (item.kind !== mediaType) continue;
      const score = matchScore(item, media);
      if (score === null) continue;
      const previous = byId.get(item.id);
      if (previous === undefined || score > previous.score) byId.set(item.id, { item, score });
    }
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * Monta os termos de busca, priorizando os romaji da temporada pedida.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida; null em filme.
 * @returns {string[]} Até oito termos não vazios e não repetidos.
 */
function searchQueries(media, season) {
  const romaji = media.romajiTitles || [];
  const focused = romaji.filter((entry) => entry.season === season).map((entry) => entry.title);
  const neutral = romaji.filter((entry) => entry.season === null).map((entry) => entry.title);
  const rest = romaji
    .filter((entry) => entry.season !== season && entry.season !== null)
    .map((entry) => entry.title);
  const terms = [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...focused,
    ...neutral,
    ...rest,
  ];
  const seen = new Set();
  const queries = [];
  for (const term of terms) {
    if (typeof term !== 'string' || term.trim() === '') continue;
    const key = normalizeText(term) || term;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(term.trim());
    if (queries.length === MAX_TERMS) break;
  }
  return queries;
}

/**
 * Calcula a similaridade de um item com os títulos do TMDB.
 * @param {SearchItem} item - Entrada da busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number|null} Score ajustado ou `null` quando não atinge o mínimo.
 */
function matchScore(item, media) {
  const itemTitles = [item.title, item.nativeTitle, ...item.altTitles]
    .filter((title) => typeof title === 'string' && title.trim() !== '');
  const mediaTitles = [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...(media.romajiTitles || []).map((entry) => entry.title),
  ].filter((title) => typeof title === 'string' && title.trim() !== '');
  if (itemTitles.length === 0 || mediaTitles.length === 0) return null;

  let best = 0;
  for (const itemTitle of itemTitles) {
    for (const mediaTitle of mediaTitles) {
      best = Math.max(best, titleSimilarity(itemTitle, mediaTitle));
    }
  }
  if (best < MIN_SCORE) return null;
  return item.year !== null && media.year !== null && item.year === media.year ? best + 0.05 : best;
}

/**
 * Escolhe até quatro entradas, priorizando as duas primeiras variantes de áudio distintas.
 * @param {Candidate[]} candidates - Candidatos confirmados.
 * @returns {Candidate[]} Entradas selecionadas.
 */
function selectVariants(candidates) {
  const selected = [];
  const selectedIds = new Set();
  const audios = new Set();

  for (const candidate of candidates) {
    const audio = normalizeText(candidate.item.audio || '');
    if (audio === '' || audios.has(audio)) continue;
    audios.add(audio);
    selected.push(candidate);
    selectedIds.add(candidate.item.id);
    if (selected.length === 2) break;
  }

  for (const candidate of candidates) {
    if (selected.length >= MAX_VARIANTS) break;
    if (selectedIds.has(candidate.item.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.item.id);
  }
  return selected;
}

/**
 * Resolve uma variante até os streams do episódio.
 * @param {SearchItem} item - Entrada confirmada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {Promise<Stream[]>} Streams da variante; vazio em ausência.
 * @throws {Error} Em ficha, episódio ou estrutura inválidos.
 */
async function resolveVariant(item, media, mediaType, coordinates) {
  const sheet = await fetchAnime(item.id);
  if (sheet.kind !== mediaType) return [];

  const episode = selectEpisode(sheet.episodes, mediaType, coordinates);
  if (episode === null) return [];

  const data = await fetchEpisode(item.id, episode.season, episode.number);
  if (data === null) return [];

  const streams = [];
  for (const stream of data.streams) {
    const language = normalizeLanguage(stream.audio || item.audio || '');
    const format = {
      template: FORMATTER.AUTO,
      addon: PROVIDER_LABEL,
      title: media.title,
    };
    if (media.year !== null) format.year = media.year;
    if (coordinates.season !== null) {
      format.season = coordinates.season;
      format.episode = coordinates.episode;
    }
    const fields = {
      url: stream.url,
      format,
      type: stream.kind,
      provider: PROVIDER_LABEL,
      languageHints: [stream.audio, item.audio].filter((value) => typeof value === 'string' && value.trim() !== ''),
    };
    if (language !== null) fields.language = language;
    streams.push(buildStream(fields));
  }
  return streams;
}

/**
 * Escolhe o episódio da variante pelo par temporada/número.
 * @param {EpisodeEntry[]} episodes - Episódios da ficha.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {EpisodeEntry|null} Entrada escolhida ou `null` em ausência.
 */
function selectEpisode(episodes, mediaType, coordinates) {
  if (mediaType === 'movie') return episodes[0] || null;
  return episodes.find(
    (episode) => episode.season === coordinates.season && episode.number === coordinates.episode,
  ) || null;
}

/**
 * Remove streams repetidos por URL e idioma.
 * @param {Stream[]} streams - Streams acumulados.
 * @returns {Stream[]} Streams sem repetição, preservando a primeira ocorrência.
 */
function dedupeStreams(streams) {
  const seen = new Set();
  const unique = [];
  for (const stream of streams) {
    const key = `${stream.url}\u0000${stream.language || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(stream);
  }
  return unique;
}

/**
 * Remove URL e hash longos das mensagens de log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}
