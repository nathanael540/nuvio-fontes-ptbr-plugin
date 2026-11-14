/**
 * Extrator do provedor AnimeZeY.
 *
 * Consulta o índice por poucos termos derivados do TMDB, valida título, ano e coordenadas no nome
 * do arquivo e monta o link de download no host dedicado. Cada arquivo é uma opção independente:
 * a falha de um gera aviso e não descarta os demais.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { isVideoMime, searchFiles } from './search.js';

const DOWNLOAD_HOST = 'https://animezey16082023.animezey16082023.workers.dev';
const PROVIDER_LABEL = 'AnimeZeY';
const MAX_QUERIES = 6;
const MAX_MOVIE_FILES = 5;
const MAX_EPISODE_FILES = 2;
const MIN_TITLE_SCORE = 0.8;
const VIDEO_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'mov', 'webm']);
const RELEASE_TAGS = /\b(?:bd|bdrip|web[- ]?dl|webrip|bluray|brrip|bdremux|remux|dvdrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|eac3|flac|dts|dual(?:\s+audio)?|dublado|legendado|1080p|720p|480p|2160p|4k|10bit|8bit)\b/gi;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./search.js').IndexFile} IndexFile
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
 * Localiza arquivos validados e monta os streams.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, JSON inválido, estrutura inesperada ou quando todas as opções
 *   aceitas falham sem produzir stream.
 * @example
 * const streams = await extractStreams({ tmdbId: '129', mediaType: 'movie', season: null, episode: null }, 'AnimeZeY');
 * // streams[0].quality === '1080p'
 */
export async function extractStreams(request, providerName) {
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);
  const queries = buildQueries(media, request.mediaType, coordinates);

  const candidates = [];
  const failures = [];
  const seen = new Set();

  for (const query of queries) {
    try {
      const files = await searchFiles(query);
      for (const file of files) {
        if (validateFile(file, media, request.mediaType, coordinates) === null) continue;
        const key = file.id || file.link || file.name;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(file);
      }
    } catch (error) {
      failures.push(`${query}: ${error.message}`);
    }
  }

  if (candidates.length === 0) {
    if (failures.length > 0) throw new Error(`Nenhuma busca produziu resultado: ${failures.map(sanitizeMessage).join('; ')}`);
    return [];
  }

  const ordered = candidates
    .sort((a, b) => readSize(b.size) - readSize(a.size))
    .slice(0, request.mediaType === 'movie' ? MAX_MOVIE_FILES : MAX_EPISODE_FILES);

  const streams = [];
  const fileFailures = [];
  for (const file of ordered) {
    try {
      streams.push(buildFileStream(file, media, request.mediaType, coordinates));
    } catch (error) {
      fileFailures.push(`${file.name}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${file.name} descartada: ${sanitizeMessage(error.message)}`);
    }
  }

  if (streams.length > 0) return dedupeStreams(streams);
  if (fileFailures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${fileFailures.map(sanitizeMessage).join('; ')}`);
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
 * Monta até seis termos de busca, sem repetição.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {string[]} Termos de busca.
 */
function buildQueries(media, mediaType, coordinates) {
  const terms = [];
  if (mediaType === 'movie') {
    if (media.year !== null) terms.push(`${media.title} ${media.year}`);
    terms.push(media.title);
    if (media.originalTitle !== media.title) {
      terms.push(media.year === null ? media.originalTitle : `${media.originalTitle} ${media.year}`);
    }
  } else {
    const season = pad(coordinates.season);
    const episode = pad(coordinates.episode);
    terms.push(`${media.title} S${season}E${episode}`);
    terms.push(`${media.title} ${season}x${episode}`);
    terms.push(`${media.title} - ${episode}`);
    const absolute = absoluteEpisode(media.seasons, coordinates.season, coordinates.episode);
    if (absolute !== coordinates.episode) terms.push(`${media.title} ${absolute}`);
    if (media.originalTitle !== media.title) terms.push(`${media.originalTitle} S${season}E${episode}`);
  }

  const seen = new Set();
  const queries = [];
  for (const term of terms) {
    if (typeof term !== 'string' || term.trim() === '') continue;
    const key = normalizeText(term) || term;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(term.trim());
    if (queries.length === MAX_QUERIES) break;
  }
  return queries;
}

/**
 * Calcula o episódio absoluto pelas temporadas do TMDB.
 * @param {import('../_blocks/tmdb-info/index.mjs').SeasonInfo[]} seasons - Temporadas do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {number} Episódio absoluto, ou o relativo quando não há temporadas.
 */
function absoluteEpisode(seasons, season, episode) {
  if (!Array.isArray(seasons) || seasons.length === 0) return episode;
  let total = 0;
  for (const entry of seasons) {
    if (entry.number > 0 && entry.number < season) total += entry.episodeCount;
  }
  return total + episode;
}

/**
 * Valida um arquivo do índice contra o pedido.
 * @param {IndexFile} file - Arquivo recebido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {object|null} Dados de coordenadas ou `null` quando o arquivo é descartado.
 */
function validateFile(file, media, mediaType, coordinates) {
  if (!isVideoFile(file)) return null;
  if (mediaType === 'movie') return validateMovie(file, media);
  return validateEpisode(file, media, coordinates);
}

/**
 * Valida um arquivo de filme por título e ano.
 * @param {IndexFile} file - Arquivo recebido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {object|null} Coordenadas vazias ou `null`.
 */
function validateMovie(file, media) {
  const year = readYear(file.name);
  if (year !== null && media.year !== null && Math.abs(year - media.year) > 1) return null;
  const title = cleanMovieTitle(file.name);
  return titleMatches(title, media) ? {} : null;
}

/**
 * Valida um arquivo de série por coordenadas e título.
 * @param {IndexFile} file - Arquivo recebido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {object|null} Coordenadas validadas ou `null`.
 */
function validateEpisode(file, media, coordinates) {
  const explicit = explicitCoordinates(file.name);
  if (explicit !== null) {
    if (explicit.season !== coordinates.season || explicit.episode !== coordinates.episode) return null;
    const title = cleanTitle(file.name.slice(0, explicit.index));
    return titleMatches(title, media) ? explicit : null;
  }

  const absolute = absoluteCoordinates(file.name);
  if (absolute === null) return null;
  const expected = absoluteEpisode(media.seasons, coordinates.season, coordinates.episode);
  if (absolute.episode !== expected) return null;
  const title = cleanTitle(file.name.slice(0, absolute.index));
  return titleMatches(title, media) ? absolute : null;
}

/**
 * Extrai coordenadas explícitas do nome.
 * @param {string} name - Nome do arquivo.
 * @returns {{ season: number, episode: number, kind: 'explicit', index: number }|null}
 */
function explicitCoordinates(name) {
  const patterns = [
    /S(\d{1,2})E(\d{1,3})/i,
    /(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?!\d)/i,
    /Season\s*(\d+)\s*Episode\s*(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const season = Number(match[1]);
    const episode = Number(match[2]);
    if (season >= 1 && episode >= 1) {
      return { season, episode, kind: 'explicit', index: match.index };
    }
  }
  return null;
}

/**
 * Extrai um número absoluto no padrão ` - 01`.
 * @param {string} name - Nome do arquivo.
 * @returns {{ season: null, episode: number, kind: 'absolute', index: number }|null}
 */
function absoluteCoordinates(name) {
  const match = /(?:^|[^0-9])-\s*(\d{1,3})(?:\D|$)/.exec(name);
  if (match === null) return null;
  const episode = Number(match[1]);
  if (!Number.isInteger(episode) || episode < 1) return null;
  return { season: null, episode, kind: 'absolute', index: match.index };
}

/**
 * Extrai o ano de quatro dígitos do nome.
 * @param {string} name - Nome do arquivo.
 * @returns {number|null}
 */
function readYear(name) {
  const match = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/.exec(name);
  return match === null ? null : Number(match[1]);
}

/**
 * Limpa o título de um filme.
 * @param {string} name - Nome do arquivo.
 * @returns {string} Título normalizado.
 */
function cleanMovieTitle(name) {
  return cleanTitle(name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\((?:19|20)\d{2}\)/g, ' '));
}

/**
 * Remove grupos, tags e separadores do título.
 * @param {string} value - Trecho do nome.
 * @returns {string} Título limpo.
 */
function cleanTitle(value) {
  return value
    .replace(/^\s*(?:\[[^\]]*\]\s*)+/g, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(RELEASE_TAGS, ' ')
    .replace(/\s+-\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compara o título do arquivo com os títulos do TMDB.
 * @param {string} title - Título limpo.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {boolean}
 */
function titleMatches(title, media) {
  const mediaTitles = [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...(media.romajiTitles || []).map((entry) => entry.title),
  ].filter((entry) => typeof entry === 'string' && entry.trim() !== '');
  if (title.trim() === '' || mediaTitles.length === 0) return false;
  const normalized = normalizeText(title);
  return mediaTitles.some((entry) => {
    if (normalized !== '' && normalized === normalizeText(entry)) return true;
    return titleSimilarity(title, entry) >= MIN_TITLE_SCORE;
  });
}

/**
 * Indica se o arquivo tem MIME ou extensão de vídeo.
 * @param {IndexFile} file - Arquivo recebido.
 * @returns {boolean}
 */
function isVideoFile(file) {
  if (file.mimeType !== '' && isVideoMime(file.mimeType)) return true;
  return extensionOf(file.name) !== null;
}

/**
 * Lê a extensão de vídeo do nome.
 * @param {string} name - Nome do arquivo.
 * @returns {string|null} Extensão em minúsculas.
 */
function extensionOf(name) {
  const match = /\.([a-z0-9]{2,4})$/i.exec(name);
  if (match === null) return null;
  const extension = match[1].toLowerCase();
  return VIDEO_EXTENSIONS.has(extension) ? extension : null;
}

/**
 * Monta o stream de um arquivo validado.
 * @param {IndexFile} file - Arquivo recebido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {'movie'|'tv'} mediaType - Tipo pedido.
 * @param {Coordinates} coordinates - Coordenadas do pedido.
 * @returns {Stream} Stream montado.
 * @throws {Error} Se faltar link, extensão ou dados obrigatórios.
 */
function buildFileStream(file, media, mediaType, coordinates) {
  if (file.link === null) throw new Error('Arquivo sem link de download');
  const url = downloadUrl(file.link);
  const type = extensionOf(file.name);
  const format = {
    template: FORMATTER.AUTO,
    addon: PROVIDER_LABEL,
    title: media.title,
    filename: file.name,
  };
  if (media.year !== null) format.year = media.year;
  if (mediaType === 'tv') {
    format.season = coordinates.season;
    format.episode = coordinates.episode;
  }
  const fields = {
    url,
    format,
    provider: PROVIDER_LABEL,
    languageHints: [file.name],
  };
  if (type !== null) fields.type = type;
  const size = formatSize(file.size);
  if (size !== null) fields.size = size;
  return buildStream(fields);
}

/**
 * Monta o link no host dedicado, preservando caminho e query.
 * @param {string} link - Link publicado pelo índice.
 * @returns {string} URL absoluta.
 */
function downloadUrl(link) {
  if (/^https?:\/\//i.test(link)) return link;
  return link.startsWith('/') ? `${DOWNLOAD_HOST}${link}` : `${DOWNLOAD_HOST}/${link}`;
}

/**
 * Formata bytes em texto legível.
 * @param {string|null} value - Tamanho em bytes como texto.
 * @returns {string|null} Tamanho formatado ou `null` quando inválido.
 */
function formatSize(value) {
  const bytes = readSize(value);
  if (bytes <= 0) return null;
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

/**
 * Lê bytes de um valor textual.
 * @param {string|null} value - Valor recebido.
 * @returns {number} Número finito maior ou igual a zero; zero quando inválido.
 */
function readSize(value) {
  if (typeof value !== 'string' || value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Remove streams repetidos por URL e idioma.
 * @param {Stream[]} streams - Streams acumulados.
 * @returns {Stream[]} Streams sem repetição.
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

/**
 * Formata um número com dois dígitos.
 * @param {number} value - Número recebido.
 * @returns {string}
 */
function pad(value) {
  return String(value).padStart(2, '0');
}
