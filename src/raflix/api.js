/** Catálogo Raflix por TMDB e orquestração da resolução no VidRift. */
import { fetchJson } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { loadBoot, readPtSubtitle, selectDubladoTrack, selectOriginalTrack } from './boot.js';
import { buildOrionStream, resolveContingency } from './streams.js';
import { isPlainObject, readText, readYear, sanitizeMessage } from './shared.js';

const CATALOG_BASE = 'https://raflix.web.id';
const TMDB_ID = /^[1-9]\d*$/;
const SOURCE_ID = 'vidrift';
const EMBED_PATH = /^\/embed\/((?:movie\/[1-9]\d*)|(?:tv\/[1-9]\d*\/[1-9]\d*\/[1-9]\d*))\/?$/;

/**
 * Valida e normaliza o pedido recebido do app antes de qualquer requisição.
 * @param {object} request - Pedido com `tmdbId`, `mediaType`, `season` e `episode`.
 * @returns {object} O mesmo objeto, com ID em texto e coordenadas normalizadas.
 * @throws {Error} Se o ID, o tipo de mídia ou as coordenadas de série forem inválidos.
 * @example
 * validateRequest({ tmdbId: 550, mediaType: 'movie', season: null, episode: null });
 */
export function validateRequest(request) {
  const rawId = request.tmdbId === undefined || request.tmdbId === null ? '' : request.tmdbId;
  const tmdbId = String(rawId).trim();
  if (!TMDB_ID.test(tmdbId)) throw new Error(`ID do TMDB inválido: ${request.tmdbId}`);
  if (request.mediaType !== 'movie' && request.mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: "${request.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request.mediaType === 'tv' &&
      (!Number.isInteger(request.season) || request.season < 1 ||
       !Number.isInteger(request.episode) || request.episode < 1)) {
    throw new Error(`Série sem temporada/episódio válidos: temporada=${request.season}, episódio=${request.episode}`);
  }
  request.tmdbId = tmdbId;
  request.season = request.mediaType === 'tv' ? request.season : null;
  request.episode = request.mediaType === 'tv' ? request.episode : null;
  return request;
}

/**
 * Resolve o pedido no catálogo Raflix e devolve os streams ainda não ordenados.
 *
 * Metadados 404 e lista de fontes sem `vidrift` são ausência reconhecida. Título não lançado,
 * em cartaz ou com episódio por estrear também encerra sem erro. Sem áudio PT-BR nem legenda PT,
 * a saída é vazia. A falha de um provedor de contingência é isolada; se nenhuma opção produzir
 * stream e ao menos uma falhar, o erro agregado sobe para `getStreams`.
 *
 * @param {object} request - Pedido do app; `stage` é atualizado para o log da fronteira.
 * @returns {Promise<object[]>} Streams montados, sem repetição de URL.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou estrutura inesperada.
 * @example
 * const streams = await extractStreams({ tmdbId: '550', mediaType: 'movie', season: null, episode: null });
 */
export async function extractStreams(request) {
  validateRequest(request);
  request.stage = 'Metadados';
  const media = await fetchMedia(request);
  if (media === null) return [];

  request.stage = 'Fontes';
  const sourceUrl = await fetchSourceUrl(request);
  if (sourceUrl === null) return [];
  const { origin, path } = readEmbed(sourceUrl, request);

  request.stage = 'Boot';
  const boot = await loadBoot(origin, path);
  if (boot.absent) return [];

  request.stage = 'Faixas';
  const dubladoTrack = selectDubladoTrack(boot.tracks);
  const originalTrack = selectOriginalTrack(boot.tracks);

  request.stage = 'Legenda';
  const subtitleResult = await readPtSubtitle({ track: originalTrack, origin, path });
  for (const failure of subtitleResult.failures) {
    console.warn(`[Raflix] Legenda PT descartada: ${sanitizeMessage(failure)}`);
  }
  const subtitle = subtitleResult.subtitle;
  if (dubladoTrack === null && subtitle === null && subtitleResult.failures.length > 0) {
    throw new Error(`Nenhuma legenda PT disponível: [${subtitleResult.failures.join('; ')}]`);
  }

  request.stage = 'Mídia';
  const streams = [];
  if (dubladoTrack !== null) {
    streams.push(buildOrionStream({
      track: dubladoTrack,
      language: LANGUAGE.DUBBED,
      subtitle: null,
      media,
      request,
      origin,
    }));
  }

  const contingency = subtitle === null
    ? { streams: [], failures: [] }
    : await resolveContingency({
      origin,
      path,
      token: boot.playbackToken,
      subtitle,
      media,
      request,
    });
  streams.push(...contingency.streams);

  if (dubladoTrack === null && contingency.streams.length === 0) {
    if (subtitle !== null && originalTrack !== null && originalTrack.type === 'hls') {
      streams.push(buildOrionStream({
        track: originalTrack,
        language: LANGUAGE.SUBTITLED,
        subtitle,
        media,
        request,
        origin,
      }));
    } else if (subtitle !== null && contingency.failures.length > 0) {
      throw new Error(`Nenhuma opção de contingência produziu stream: [${contingency.failures.join('; ')}]`);
    }
  }
  return dedupe(streams);
}

/**
 * Busca título e ano no catálogo Raflix.
 * @param {object} request - Pedido validado.
 * @returns {Promise<{ title: string, year?: number }|null>} Metadados ou null em HTTP 404.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou resposta sem `media.title`.
 */
async function fetchMedia(request) {
  const url = `${CATALOG_BASE}/api/media/${request.mediaType}/${request.tmdbId}`;
  let body;
  try {
    body = await fetchJson(url, { profile: 'api' });
  } catch (error) {
    if (error.message.startsWith('HTTP 404')) return null;
    throw error;
  }
  if (!isPlainObject(body) || !isPlainObject(body.media)) {
    throw new Error(`Metadados do Raflix sem "media" em ${url}`);
  }
  const title = readText(body.media.title, 'media.title');
  const year = readYear(body.media.year);
  return { title, ...(year === null ? {} : { year }) };
}

/**
 * Busca a lista pública de fontes e localiza a entrada `vidrift`.
 * @param {object} request - Pedido validado.
 * @returns {Promise<string|null>} URL publicada do VidRift ou null quando a entrada não existe.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou lista sem `sources`.
 */
async function fetchSourceUrl(request) {
  const params = { type: request.mediaType, tmdbId: request.tmdbId };
  if (request.mediaType === 'tv') {
    params.season = String(request.season);
    params.episode = String(request.episode);
  }
  const url = `${CATALOG_BASE}/api/media/sources?${new URLSearchParams(params).toString()}`;
  const body = await fetchJson(url, { profile: 'api' });
  if (!isPlainObject(body) || !Array.isArray(body.sources)) {
    throw new Error(`Lista de fontes do Raflix sem "sources" em ${url}`);
  }
  if (body.ok === false) throw new Error('Lista de fontes do Raflix respondeu ok=false');
  const source = body.sources.find((item) => isPlainObject(item) && item.id === SOURCE_ID);
  if (source === undefined) return null;
  return readText(source.url, `sources[${SOURCE_ID}].url`);
}

/**
 * Valida a URL do VidRift e deriva a origem e o caminho usado pelo boot.
 * @param {string} sourceUrl - URL publicada pelo Raflix.
 * @param {object} request - Pedido validado.
 * @returns {{ origin: string, path: string }} Origem e caminho do embed.
 * @throws {Error} Se a URL não for http(s), estiver fora de `/embed/...` ou não corresponder ao pedido.
 */
function readEmbed(sourceUrl, request) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch (cause) {
    throw new Error(`URL da fonte VidRift inválida: ${sourceUrl}`, { cause });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`URL da fonte VidRift deve ser http(s): ${sourceUrl}`);
  }
  const match = EMBED_PATH.exec(url.pathname);
  if (match === null) {
    throw new Error(`URL da fonte VidRift fora do formato esperado: ${sourceUrl}`);
  }
  const path = match[1];
  const expected = request.mediaType === 'tv'
    ? `tv/${request.tmdbId}/${request.season}/${request.episode}`
    : `movie/${request.tmdbId}`;
  if (path !== expected) {
    throw new Error(`URL da fonte VidRift não corresponde ao pedido: ${path} (esperado ${expected})`);
  }
  return { origin: url.origin, path };
}

/**
 * Remove streams repetidos pela URL final, preservando a primeira ocorrência.
 * @param {object[]} streams - Streams na ordem de prioridade.
 * @returns {object[]} Streams únicos.
 */
function dedupe(streams) {
  const seen = new Set();
  const unique = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
    unique.push(stream);
  }
  return unique;
}
