/**
 * Extrator do provedor AnimeFire.
 *
 * Localiza o anime pela busca pública, confirma título, ano e tipo na ficha, escolhe o episódio
 * pelo par `season`/`number` e resolve o master HLS de cada opção de áudio publicada.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { normalizeQuality } from '../_blocks/quality-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { findBestMatch } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchAnime, fetchEpisode, searchAnime } from './api.js';

const SITE_URL = 'https://animefire.one/';
const STREAM_TYPE = 'hls';
const PLAYBACK_MESSAGE = 'Reprodução adaptativa';
const FOUR_K = '4K';
const UHD_HEIGHT = 2160;
const QUALITY_TOKEN = /^(\d+)p$/;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./api.js').AnimeEpisode} AnimeEpisode
 * @typedef {import('./api.js').EpisodeOption} EpisodeOption
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
 * Localiza o anime, seleciona o episódio e monta os streams.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, JSON inválido, estrutura inesperada ou ausência de stream
 *   quando alguma opção falhou.
 * @example
 * const streams = await extractStreams({ tmdbId: '46260', mediaType: 'tv', season: 1, episode: 1 }, 'AnimeFire');
 * // streams[0].quality === '1080p'
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);

  const sheet = await findSheet(media, request.mediaType);
  if (sheet === null) return [];

  const selected = selectEpisode(sheet.episodes, request.mediaType, coordinates);
  if (selected === null) return [];

  const episode = await fetchEpisode(selected.id);
  return resolveStreams(episode.streams, { media, coordinates, providerName });
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
 * Procura a ficha confirmada pelas variantes de título do TMDB.
 *
 * Cada variante é consultada página a página. Os candidatos de todas as páginas já lidas são
 * comparados com `findBestMatch`; ficha de tipo diferente do pedido é descartada e a busca
 * continua. A primeira ficha do tipo pedido encerra a procura.
 *
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {Promise<import('./api.js').AnimeSheet|null>} Ficha confirmada ou `null` na ausência.
 */
async function findSheet(media, mediaType) {
  const seen = new Set();
  for (const query of searchQueries(media)) {
    const key = normalizeText(query) || query;
    if (seen.has(key)) continue;
    seen.add(key);
    const sheet = await searchQuery(query, media, mediaType);
    if (sheet !== null) return sheet;
  }
  return null;
}

/**
 * Variantes de busca, na ordem do TMDB.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Título PT-BR, original e alternativos brasileiros.
 */
function searchQueries(media) {
  return [media.title, media.originalTitle].concat(media.alternativeTitles)
    .filter((query) => typeof query === 'string' && query.trim() !== '');
}

/**
 * Consulta uma variante e devolve a primeira ficha confirmada, percorrendo as páginas.
 * @param {string} query - Variante de título.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @returns {Promise<import('./api.js').AnimeSheet|null>} Ficha confirmada ou `null`.
 */
async function searchQuery(query, media, mediaType) {
  const rejected = new Set();
  const candidates = [];
  let page = 1;
  let lastPage;

  do {
    const result = await searchAnime(query, page);
    lastPage = result.lastPage;
    for (const item of result.items) {
      for (const title of item.titles) {
        candidates.push({ id: item.id, title, year: item.year });
      }
    }

    let match = findBestMatch(filterRejected(candidates, rejected), media);
    while (match !== null) {
      const sheet = await fetchAnime(match.candidate.id);
      if (sheet.format === mediaType) return sheet;
      rejected.add(match.candidate.id);
      match = findBestMatch(filterRejected(candidates, rejected), media);
    }
    page += 1;
  } while (page <= lastPage);

  return null;
}

/**
 * Remove candidatos de itens já rejeitados pelo tipo.
 * @param {Array<{ id: string }>} candidates - Candidatos acumulados.
 * @param {Set<string>} rejected - IDs rejeitados.
 * @returns {Array<{ id: string }>} Candidatos restantes.
 */
function filterRejected(candidates, rejected) {
  return candidates.filter((candidate) => !rejected.has(candidate.id));
}

/**
 * Escolhe o episódio pelo par declarado na ficha.
 * @param {AnimeEpisode[]} episodes - Episódios da ficha.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Temporada e episódio pedidos.
 * @returns {AnimeEpisode|null} Entrada escolhida ou `null` na ausência reconhecida.
 * @throws {Error} Se a ficha de filme tiver mais de uma entrada.
 */
function selectEpisode(episodes, mediaType, coordinates) {
  if (mediaType === 'movie') {
    if (episodes.length === 0) return null;
    if (episodes.length > 1) {
      throw new Error(`Ficha de filme com ${episodes.length} entradas de episódio; esperada uma`);
    }
    return episodes[0];
  }
  return episodes.find((episode) => episode.season === coordinates.season && episode.number === coordinates.episode) || null;
}

/**
 * Resolve cada opção de áudio em isolamento e monta os streams.
 * @param {EpisodeOption[]} options - Opções publicadas pelo episódio.
 * @param {{ media: MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {Promise<Stream[]>} Streams válidos; vazio quando todas as opções estão offline.
 * @throws {Error} Se nenhuma opção produzir stream e alguma tiver falhado.
 */
async function resolveStreams(options, context) {
  const available = options.filter((option) => !option.isOffline);
  if (available.length === 0) return [];

  const results = await Promise.all(available.map(async (option) => {
    try {
      return { ok: true, stream: buildOptionStream(option, context) };
    } catch (error) {
      return { ok: false, audio: option.audio, error };
    }
  }));

  const streams = [];
  const failures = [];
  for (const result of results) {
    if (result.ok) {
      streams.push(result.stream);
      continue;
    }
    const reason = sanitizeMessage(result.error.message);
    failures.push(`${result.audio}: ${reason}`);
    console.warn(`[${context.providerName}] Opção ${result.audio} descartada: ${reason}`);
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Monta o stream de uma opção de áudio.
 * @param {EpisodeOption} option - Opção aceita na triagem.
 * @param {{ media: MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {Stream} Stream validado pelo contrato.
 * @throws {Error} Se a URL estiver ausente ou o contrato recusar algum campo.
 */
function buildOptionStream(option, context) {
  if (option.url === null) {
    throw new Error(`URL ausente na opção ${option.audio}`);
  }

  const fields = {
    url: option.url,
    format: formatDetails(context),
    headers: playbackHeaders(SITE_URL),
    provider: context.providerName,
    type: STREAM_TYPE,
  };

  const quality = bestQuality(option.qualities);
  if (quality !== undefined) fields.quality = quality;

  const language = languageFromAudio(option.audio);
  if (language !== undefined) fields.language = language;
  else fields.languageHints = [option.audio];

  return buildStream(fields);
}

/**
 * Detalhes de apresentação do stream para o formatador.
 * @param {{ media: MediaInfo, coordinates: Coordinates, providerName: string }} context - Dados da montagem.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(context) {
  const { media, coordinates, providerName } = context;
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    message: PLAYBACK_MESSAGE,
  };
  if (media.year !== null) format.year = media.year;
  if (coordinates.season !== null) {
    format.season = coordinates.season;
    format.episode = coordinates.episode;
  }
  return format;
}

/**
 * Classifica o áudio publicado pela fonte.
 * @param {string} audio - Texto do áudio na opção.
 * @returns {string|undefined} Membro do enum `LANGUAGE` ou `undefined` para texto fora do vocabulário.
 */
function languageFromAudio(audio) {
  const normalized = normalizeText(audio);
  if (normalized === 'dublado') return LANGUAGE.DUBBED;
  if (normalized === 'legendado') return LANGUAGE.SUBTITLED;
  return undefined;
}

/**
 * Maior resolução declarada na lista de qualidades.
 * @param {string[]} qualities - Textos publicados pela fonte.
 * @returns {string|undefined} Qualidade normalizada ou `undefined` sem resolução reconhecível.
 */
function bestQuality(qualities) {
  let best;
  let bestRank = -1;
  for (const value of qualities) {
    let normalized;
    try {
      normalized = normalizeQuality(value);
    } catch {
      continue;
    }
    const rank = qualityRank(normalized);
    if (rank > bestRank) {
      best = normalized;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Altura de uma qualidade já normalizada.
 * @param {string} quality - "<n>p", "4K" ou "CAM".
 * @returns {number} Altura em pixels ou -1 quando não reconhecida.
 */
function qualityRank(quality) {
  if (quality === FOUR_K) return UHD_HEIGHT;
  const match = QUALITY_TOKEN.exec(quality);
  return match ? Number(match[1]) : -1;
}

/**
 * Remove URL das mensagens para os logs não carregarem mídia.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, '[url]');
}
