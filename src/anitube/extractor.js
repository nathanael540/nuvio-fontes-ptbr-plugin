/**
 * Extrator do provedor AniTube.
 *
 * O fluxo é: TMDB -> variantes de busca -> confirmação de título, tipo, temporada e ano -> seleção
 * de episódio ou entrada de filme -> resolução isolada dos players -> streams formatados.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { cleanCardTitle } from './search.js';
import { buildQueries, confirmCandidate, parseSearchResults } from './search.js';
import { isMoviePage, isSeriesPage, readMovieEntries, readPageInfo, selectEpisode } from './pages.js';
import { resolvePlayers, sanitizeMessage } from './players.js';

const SOURCE_URL = 'https://www.anitube.zip';

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} ConfirmedEntry
 * @property {string} pageUrl - Página da ficha que contém a entrada.
 * @property {string} entryUrl - Página do episódio ou da entrada de filme.
 * @property {string|null} audio - `Dublado`, `Legendado` ou `null`.
 * @property {string} html - HTML da página da entrada, quando já obtido.
 * @property {{ year: number|null }} pageInfo - Dados da ficha da entrada.
 */

/**
 * Localiza o título no AniTube e monta os streams.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<object[]>} Streams encontrados; vazio quando a fonte não tem o título ou o episódio.
 * @throws {Error} Em falha de rede, parsing ou estrutura de página inesperada.
 * @example
 * const streams = await extractStreams({ tmdbId: '95479', mediaType: 'tv', season: 2, episode: 1 }, 'AniTube');
 */
export async function extractStreams(request, providerName) {
  readEpisode(request);
  const media = await getMediaInfo(request);
  const entries = await findEntries(media, request);
  if (entries.length === 0) return [];
  return resolveEntries(entries, media, request, providerName);
}

/**
 * Lê temporada e episódio do pedido.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {{ season: number, episode: number }|null} Coordenadas em série; null em filme.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readEpisode(request) {
  if (request.mediaType !== 'tv') return null;
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Busca as fichas confirmadas do título, cobrindo cada rótulo de áudio disponível.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {Promise<ConfirmedEntry[]>} Entradas confirmadas.
 * @throws {Error} Em falha de rede, parsing ou estrutura de página inesperada.
 */
async function findEntries(media, request) {
  const entries = [];
  const targetAudios = new Set();
  const confirmedAudios = new Set();
  const visited = new Set();

  for (const query of buildQueries(media, request)) {
    const searchUrl = `${SOURCE_URL}/?${new URLSearchParams({ s: query.query })}`;
    const search = await fetchPage(searchUrl, { profile: 'page' });
    const candidates = parseSearchResults(search.text, search.url);

    for (const candidate of candidates) {
      if (visited.has(candidate.url)) continue;
      const triage = confirmCandidate(candidate, triagePage(candidate), media, request, query);
      if (triage === null) continue;
      visited.add(candidate.url);
      if (request.mediaType === 'tv') {
        targetAudios.add(triage.audio);
        if (confirmedAudios.has(triage.audio)) continue;
      }

      const page = await fetchPage(candidate.url, { profile: 'page', headers: { Referer: search.url } });
      const info = readPageInfo(page.text);
      const confirmed = confirmCandidate(candidate, info, media, request, query);
      if (confirmed === null) continue;

      if (request.mediaType === 'tv') {
        if (!isSeriesPage(page.text)) continue;
        const episode = selectEpisode(page.text, page.url, request);
        if (episode === null) continue;
        entries.push({
          pageUrl: page.url,
          entryUrl: episode.url,
          audio: confirmed.audio,
          html: '',
          pageInfo: info,
        });
        confirmedAudios.add(confirmed.audio);
        continue;
      }

      if (!isMoviePage(page.text)) continue;
      const movie = readMovieEntries(page.text, page.url);
      if (movie.kind === 'none') continue;
      for (const movieEntry of movie.entries) {
        const entry = await confirmMovieEntry(candidate, movieEntry, movie.page, page.url, page.text, media, request, query);
        if (entry === null) continue;
        entries.push(entry);
        targetAudios.add(entry.audio);
        confirmedAudios.add(entry.audio);
      }
    }

    if (targetAudios.size > 0 && coversTargets(targetAudios, confirmedAudios)) break;
  }

  return entries;
}

/**
 * Confirma uma entrada de filme, buscando a página quando a entrada não é a própria ficha.
 * @param {object} candidate - Cartão de busca já triado.
 * @param {{ url: string, title: string, audio: string|null }} movieEntry - Entrada de filme.
 * @param {{ year: number|null, audio: string|null }} parentInfo - Dados da página agregadora.
 * @param {string} parentUrl - URL da página que publicou a entrada.
 * @param {string} parentHtml - HTML da página que publicou a entrada.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {object} query - Variante de busca.
 * @returns {Promise<ConfirmedEntry|null>} Entrada confirmada ou null.
 * @throws {Error} Em falha de rede ou estrutura inesperada.
 */
async function confirmMovieEntry(candidate, movieEntry, parentInfo, parentUrl, parentHtml, media, request, query) {
  const audio = movieEntry.audio === null ? parentInfo.audio : movieEntry.audio;
  if (movieEntry.url === parentUrl) {
    const confirmed = confirmCandidate(
      { ...candidate, audio, type: 'movie' },
      { ...parentInfo, audio },
      media,
      request,
      query,
    );
    if (confirmed === null) return null;
    return {
      pageUrl: parentUrl,
      entryUrl: parentUrl,
      audio: confirmed.audio,
      html: parentHtml,
      pageInfo: parentInfo,
    };
  }

  const page = await fetchPage(movieEntry.url, { profile: 'page', headers: { Referer: parentUrl } });
  if (!isMoviePage(page.text)) return null;
  const info = readPageInfo(page.text);
  const entryCandidate = {
    ...candidate,
    ...cleanCardTitle(movieEntry.title),
    type: 'movie',
    audio,
    url: page.url,
  };
  const entryInfo = { ...info, year: info.year === null ? parentInfo.year : info.year, audio };
  const confirmed = confirmCandidate(entryCandidate, entryInfo, media, request, query);
  if (confirmed === null) return null;
  return {
    pageUrl: parentUrl,
    entryUrl: page.url,
    audio: confirmed.audio,
    html: page.text,
    pageInfo: entryInfo,
  };
}

/**
 * Página sintética usada para triar o cartão antes de buscar a ficha.
 * @param {object} candidate - Cartão de busca.
 * @returns {{ h1: string, type: string, year: null, audio: string|null }} Dados mínimos.
 */
function triagePage(candidate) {
  return { h1: candidate.title, type: '', year: null, audio: candidate.audio };
}

/**
 * Indica se todas as faixas de áudio vistas foram confirmadas.
 * @param {Set<string|null>} targetAudios - Faixas vistas nos cartões.
 * @param {Set<string|null>} confirmedAudios - Faixas com entrada confirmada.
 * @returns {boolean}
 */
function coversTargets(targetAudios, confirmedAudios) {
  for (const audio of targetAudios) {
    if (!confirmedAudios.has(audio)) return false;
  }
  return true;
}

/**
 * Resolve os players de cada entrada em isolamento e monta os streams.
 * @param {ConfirmedEntry[]} entries - Entradas confirmadas.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<object[]>} Streams montados.
 * @throws {Error} Se todas as entradas falharem e nenhuma produzir stream.
 */
async function resolveEntries(entries, media, request, providerName) {
  const results = await Promise.all(entries.map((entry) => resolveEntry(entry, media, request, providerName)));
  const streams = [];
  const seenUrls = new Set();
  const failures = [];

  for (const result of results) {
    if (!result.ok) {
      failures.push(result.error.message);
      console.warn(`[${providerName}] Ficha ${result.audio === null ? 'sem áudio' : result.audio} descartada: ${sanitizeMessage(result.error.message)}`);
      continue;
    }
    for (const stream of result.streams) {
      if (seenUrls.has(stream.url)) continue;
      seenUrls.add(stream.url);
      streams.push(stream);
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma ficha produziu stream: ${failures.map(sanitizeMessage).join('; ')}`);
  return [];
}

/**
 * Resolve uma entrada sem deixar a falha escapar.
 * @param {ConfirmedEntry} entry - Entrada confirmada.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<{ ok: true, audio: string|null, streams: object[] }|{ ok: false, audio: string|null, error: Error }>} Resultado.
 */
async function resolveEntry(entry, media, request, providerName) {
  try {
    const page = entry.html === '' ? await fetchPage(entry.entryUrl, { profile: 'page', headers: { Referer: entry.pageUrl } }) : null;
    const html = page === null ? entry.html : page.text;
    const pageUrl = page === null ? entry.entryUrl : page.url;
    const players = await resolvePlayers(html, pageUrl, providerName);
    const streams = players.map((player) => buildPlayerStream(player, entry.audio, media, request, providerName));
    return { ok: true, audio: entry.audio, streams };
  } catch (error) {
    return { ok: false, audio: entry.audio, error };
  }
}

/**
 * Monta o stream de um player com `buildStream` e o campo `format`.
 * @param {{ url: string, quality: string|null, provider: string, type: 'hls'|'mp4' }} player - Stream do player.
 * @param {string|null} audio - Áudio confirmado da ficha.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {string} providerName - Nome do provedor.
 * @returns {object} Stream validado.
 */
function buildPlayerStream(player, audio, media, request, providerName) {
  const fields = {
    url: player.url,
    format: formatDetails(providerName, media, request),
    provider: player.provider,
    type: player.type,
  };
  if (player.quality !== null) fields.qualityHints = [player.quality];
  const language = languageFromAudio(audio);
  if (language !== null) fields.language = language;
  return buildStream(fields);
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {object} Valor do campo `format`.
 */
function formatDetails(providerName, media, request) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  return format;
}

/**
 * Converte o rótulo de áudio da fonte em membro do enum LANGUAGE.
 * @param {string|null} audio - `Dublado`, `Legendado` ou null.
 * @returns {string|null} Membro do enum ou null quando a fonte não comprova.
 */
function languageFromAudio(audio) {
  if (audio === 'Dublado') return LANGUAGE.DUBBED;
  if (audio === 'Legendado') return LANGUAGE.SUBTITLED;
  return null;
}
