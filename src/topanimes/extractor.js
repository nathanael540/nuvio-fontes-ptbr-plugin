/**
 * Extração do TopAnimes: confirma o título no TMDB, escolhe o candidato na busca HTML, abre a
 * ficha/episódio e resolve as opções DooPlay em streams.
 *
 * O catálogo publica filmes em `/filmes/` e séries em `/animes/`. A busca é `GET /?s=<termo>` e a
 * lista de episódios usa `.numerando` (`temporada - episódio`) ou `.epnumber` (numeração absoluta).
 * As opções ficam em `li.dooplay_player_option` com o iframe em `#source-player-<nume>`.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  audioFromText,
  buildSearchTerms,
  confirmDetail,
  matchCandidate,
  parseSearchResults,
  readDetail,
  readOptions,
  searchUrl,
  selectEpisode,
} from './catalog.js';
import { resolveOption } from './players.js';

const MAX_CANDIDATES = 5;
// Legendas que comprovam português no áudio original; o rótulo da fonte é preservado no stream.
const PORTUGUESE_SUBTITLE = /portugu[eê]s|portuguese|pt[-_ ]?br|^pt$/i;

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada, ignorada em filmes.
 * @property {number|null} episode - Episódio, ignorado em filmes.
 */

/**
 * @typedef {object} Episode
 * @property {number} season - Temporada a partir de 1.
 * @property {number} episode - Episódio a partir de 1.
 */

/**
 * @typedef {object} Resolution
 * @property {Stream[]} streams - Streams produzidos pelo candidato.
 * @property {string[]} failures - Causas das opções que falharam.
 */

/**
 * Localiza o título e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio quando a fonte não tem o título.
 * @throws {Error} Em falha de rede, estrutura inesperada ou quando todas as opções falham.
 */
export async function extractStreams(request, providerName) {
  const episode = readEpisode(request);
  const media = await getMediaInfo(request);
  const season = episode === null ? null : episode.season;
  const candidates = await collectCandidates(media, season);

  const streams = [];
  const failures = [];
  const seen = new Map();

  for (const candidate of candidates) {
    const resolution = await resolveCandidate(candidate, media, episode, providerName);
    for (const stream of resolution.streams) mergeStream(streams, seen, stream);
    failures.push(...resolution.failures);
    if (streams.length > 0 && hasBothLanguages(streams)) break;
  }

  if (streams.length === 0 && failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  }
  return streams;
}

/**
 * Executa todos os termos de busca e devolve os candidatos confirmados, do mais provável ao menos.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number|null} season - Temporada pedida em série.
 * @returns {Promise<import('./catalog.js').Candidate[]>} Candidatos limitados e ordenados.
 * @throws {Error} Em falha de rede ou busca sem estrutura.
 */
async function collectCandidates(media, season) {
  const found = [];
  const seen = new Set();
  for (const term of buildSearchTerms(media, season)) {
    const html = await fetchText(searchUrl(term), { profile: 'page' });
    const results = parseSearchResults(html);
    for (const result of results) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      const match = matchCandidate(result, media, season);
      if (match !== null) found.push(match);
    }
  }

  found.sort((a, b) => b.seasonScore - a.seasonScore || b.score - a.score);
  return found.slice(0, MAX_CANDIDATES);
}

/**
 * Abre a ficha/episódio de um candidato e resolve as opções.
 * @param {import('./catalog.js').Candidate} candidate - Candidato confirmado na busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Episode|null} episode - Temporada e episódio; null em filme.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @returns {Promise<Resolution>} Streams e falhas do candidato.
 * @throws {Error} Em falha fatal de ficha, episódio ou montagem.
 */
async function resolveCandidate(candidate, media, episode, providerName) {
  const page = await fetchPageOrSkip(candidate.result.url);
  if (page === null) return { streams: [], failures: [] };

  const detail = readDetail(page.text);
  if (!confirmDetail(detail, candidate, media, episode === null ? null : episode.season)) {
    return { streams: [], failures: [] };
  }

  const audio = audioFromText(detail.title) || audioFromText(candidate.result.title);
  let optionsPage = page;
  if (episode !== null) {
    const episodeUrl = selectEpisode(page.text, media, episode.season, episode.episode, detail.title);
    if (episodeUrl === null) return { streams: [], failures: [] };
    const loaded = await fetchPageOrSkip(episodeUrl);
    if (loaded === null) return { streams: [], failures: [] };
    optionsPage = loaded;
  }

  const options = readOptions(optionsPage.text, optionsPage.url);
  const streams = [];
  const failures = [];

  for (const option of options) {
    const label = option.label || `Opção ${option.number}`;
    try {
      const medias = await resolveOption(option, optionsPage.url);
      for (const item of medias) {
        const fields = streamFields(item, media, episode, providerName, audio);
        streams.push(buildStream(fields));
      }
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
    }
  }

  return { streams, failures };
}

/**
 * Une um stream à lista, mantendo um único item por URL e qualidade. Quando o duplicado traz
 * idioma confirmado ou mais legendas, ele substitui o primeiro.
 * @param {Stream[]} streams - Lista final, alterada no lugar.
 * @param {Map<string, number>} seen - Chave para índice na lista.
 * @param {Stream} stream - Stream recém-montado.
 * @returns {void}
 */
function mergeStream(streams, seen, stream) {
  const key = `${stream.url}\n${stream.quality}`;
  if (!seen.has(key)) {
    seen.set(key, streams.length);
    streams.push(stream);
    return;
  }

  const index = seen.get(key);
  if (isBetterStream(stream, streams[index])) streams[index] = stream;
}

/**
 * Indica se um stream duplicado traz mais informação de idioma ou legendas que o atual.
 * @param {Stream} next - Stream novo.
 * @param {Stream} current - Stream já na lista.
 * @returns {boolean}
 */
function isBetterStream(next, current) {
  const nextKnown = next.language !== LANGUAGE.UNKNOWN;
  const currentKnown = current.language !== LANGUAGE.UNKNOWN;
  if (nextKnown && !currentKnown) return true;
  if (!nextKnown && currentKnown) return false;
  return (next.subtitles === undefined ? 0 : next.subtitles.length)
    > (current.subtitles === undefined ? 0 : current.subtitles.length);
}

/**
 * Monta os campos de `buildStream` para uma mídia resolvida.
 * @param {import('./players.js').Media} item - Mídia do player.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Episode|null} episode - Temporada e episódio; null em filme.
 * @param {string} providerName - Nome do provedor exibido pelo formatador.
 * @param {string|null} audio - Áudio declarado pela página.
 * @returns {object} Campos aceitos por `buildStream`.
 */
function streamFields(item, media, episode, providerName, audio) {
  const fields = {
    url: item.url,
    format: formatDetails(providerName, media, episode),
    provider: item.provider,
  };
  if (item.type !== undefined) fields.type = item.type;
  if (item.quality !== undefined) fields.quality = item.quality;
  if (item.headers !== undefined) fields.headers = item.headers;
  if (item.subtitles !== undefined && item.subtitles.length > 0) fields.subtitles = item.subtitles;

  const language = streamLanguage(audio, item.subtitles);
  if (language !== null) fields.language = language;
  return fields;
}

/**
 * Define o idioma do stream: dublado pelo título, legendado por legenda PT em página não dublada.
 * @param {string|null} audio - Áudio declarado pela página.
 * @param {Array<{ language: string }>|undefined} subtitles - Legendas da mídia.
 * @returns {string|null} Membro do enum `LANGUAGE` ou null para descoberta local.
 */
function streamLanguage(audio, subtitles) {
  if (audio === 'Dublado') return LANGUAGE.DUBBED;
  if (audio === 'Legendado') return LANGUAGE.SUBTITLED;
  if (Array.isArray(subtitles) && subtitles.some((item) => PORTUGUESE_SUBTITLE.test(item.language))) {
    return LANGUAGE.SUBTITLED;
  }
  return null;
}

/**
 * Indica se a lista já tem streams dublados e legendados.
 * @param {Stream[]} streams - Streams resolvidos.
 * @returns {boolean}
 */
function hasBothLanguages(streams) {
  let dublado = false;
  let legendado = false;
  for (const stream of streams) {
    if (stream.language === LANGUAGE.DUBBED) dublado = true;
    if (stream.language === LANGUAGE.SUBTITLED) legendado = true;
  }
  return dublado && legendado;
}

/**
 * Busca uma página e trata 404 como candidato removido.
 * @param {string} url - Endereço da ficha ou do episódio.
 * @returns {Promise<{ url: string, text: string }|null>} Página carregada ou null em 404.
 * @throws {Error} Em outros status ou erro de rede.
 */
async function fetchPageOrSkip(url) {
  try {
    return await fetchPage(url, { profile: 'page' });
  } catch (error) {
    if (/^HTTP 404\b/.test(error.message)) return null;
    throw error;
  }
}

/**
 * Detalhes do formatador: template automático, nome do provedor, título, ano e coordenadas.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Episode|null} episode - Temporada e episódio; null em filme.
 * @returns {object} Valor do campo `format`.
 */
function formatDetails(providerName, media, episode) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (episode !== null) {
    format.season = episode.season;
    format.episode = episode.episode;
  }
  return format;
}

/**
 * Lê temporada e episódio do pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @returns {Episode|null} Coordenadas em série; null em filme.
 * @throws {Error} Se uma série vier sem temporada/episódio inteiros a partir de 1.
 */
function readEpisode(request) {
  if (request.mediaType !== 'tv') return null;
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}
