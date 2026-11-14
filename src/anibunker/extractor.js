/**
 * Extração do AniBunker: localiza a obra no catálogo, escolhe a faixa de áudio e o episódio,
 * resolve os players e monta os streams.
 *
 * Etapas anteriores às opções (entrada, TMDB, busca, página da obra) são fatais. Cada faixa de áudio
 * é uma opção independente: HTTP 404 é ausência; página sem player ou falha dos players é falha
 * daquela faixa, com aviso. Se nenhuma faixa produzir stream e alguma tiver falhado, o erro agregado
 * sobe até `getStreams`.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchText } from '../_blocks/http/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { buildEpisodeOptions, confirmAnimePage, readAnimePage, readEpisodePage } from './pages.js';
import { resolvePlayers, sanitizeMessage } from './players.js';
import { buildQueries, searchCandidates, selectCandidate } from './search.js';
import { isSeasonCandidate } from './titles.js';

const MAX_PAGES = 4;

/**
 * @typedef {object} StreamRequest
 * @property {string|number} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); `null` em filme.
 * @property {number|null} episode - Episódio (1-based); `null` em filme.
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} url - URL da mídia.
 * @property {'mp4'|'hls'} type - Tipo do stream.
 * @property {string} provider - Rótulo do player.
 * @property {string[]} [qualityHints] - Rótulos ou itags de qualidade.
 * @property {Object<string, string>} [headers] - Cabeçalhos de reprodução.
 */

/**
 * Localiza a obra e monta os streams do pedido.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador.
 * @returns {Promise<object[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, parsing, TMDB ou quando todas as faixas/players falham.
 * @example
 * await extractStreams({ tmdbId: '372058', mediaType: 'movie', season: null, episode: null }, 'AniBunker');
 */
export async function extractStreams(request, providerName) {
  readRequest(request);
  const media = await getMediaInfo(request);
  const page = await findAnimePage(media, request);
  if (page === null) return [];

  const tracks = buildEpisodeOptions(page, request.mediaType, request.episode);
  if (tracks.length === 0) return [];

  const streams = [];
  const failures = [];
  for (const track of tracks) {
    try {
      const html = await fetchText(track.url, { profile: 'page' });
      const episode = readEpisodePage(html, track.url);
      const options = await resolvePlayers(episode, track.url, providerName);
      for (const option of options) {
        streams.push(buildStream(streamFields(option, track.language, media, request, providerName)));
      }
    } catch (error) {
      if (isMissingPage(error)) continue;
      failures.push({ label: track.label, message: error.message });
      // A falha de todos os players já foi avisada um a um; a faixa não repete o aviso.
      if (!String(error.message).startsWith('Nenhum player produziu stream')) {
        console.warn(`[${providerName}] Opção ${track.label} descartada: ${sanitizeMessage(error.message)}`);
      }
    }
  }

  if (streams.length === 0) {
    if (failures.length === 0) return [];
    const causes = failures.map((failure) => `${failure.label}: ${sanitizeMessage(failure.message)}`).join('; ');
    throw new Error(`Nenhuma faixa produziu stream: ${causes}`);
  }
  return dedupeByUrl(streams);
}

/**
 * Valida o pedido antes de qualquer requisição.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {void}
 * @throws {Error} Se o tipo for inválido ou a série vier sem temporada/episódio positivos.
 */
function readRequest(request) {
  if (!request || (request.mediaType !== 'movie' && request.mediaType !== 'tv')) {
    throw new Error(`mediaType inválido: "${request && request.mediaType}" (esperado "movie" ou "tv")`);
  }
  if (request.mediaType !== 'tv') return;
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode}`);
  }
}

/**
 * Procura a página da obra nas consultas de título, abrindo no máximo quatro candidatos.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @returns {Promise<import('./pages.js').AnimePage|null>} Página confirmada ou `null`.
 * @throws {Error} Em falha de rede, busca fora do esquema ou página de obra inválida.
 */
async function findAnimePage(media, request) {
  const queries = buildQueries(media, request.mediaType, request.season);
  const seen = new Set();
  let opened = 0;

  for (const query of queries) {
    const candidates = await searchCandidates(query.query);
    let pool = candidates.filter(
      (candidate) => !seen.has(candidate.url) && isSeasonCandidate(candidate.title, media, request.mediaType, request.season),
    );

    while (pool.length > 0 && opened < MAX_PAGES) {
      const candidate = selectCandidate(pool, media);
      if (candidate === null) break;
      pool = pool.filter((item) => item.url !== candidate.url);
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      opened += 1;

      let html;
      try {
        html = await fetchText(candidate.url, { profile: 'page' });
      } catch (error) {
        if (isMissingPage(error)) continue;
        throw error;
      }

      const page = readAnimePage(html, candidate.url);
      if (confirmAnimePage(page, media, request.mediaType, request.season, query.query)) return page;
    }

    if (opened >= MAX_PAGES) break;
  }
  return null;
}

/**
 * Monta os campos aceitos por `buildStream`.
 * @param {PlayerOption} option - Mídia resolvida.
 * @param {string} language - Faixa de áudio.
 * @param {object} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido do app.
 * @param {string} providerName - Nome do provedor.
 * @returns {object} Campos do stream.
 */
function streamFields(option, language, media, request, providerName) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (Number.isInteger(media.year)) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }

  const fields = {
    url: option.url,
    format,
    provider: option.provider,
    type: option.type,
    language,
  };
  if (Array.isArray(option.qualityHints) && option.qualityHints.length > 0) {
    fields.qualityHints = option.qualityHints;
  }
  if (option.headers !== undefined) fields.headers = option.headers;
  return fields;
}

/**
 * Remove streams com a mesma URL, preservando o primeiro.
 * @param {object[]} streams - Streams montados.
 * @returns {object[]} Lista sem URLs repetidas.
 */
function dedupeByUrl(streams) {
  const seen = new Set();
  const result = [];
  for (const stream of streams) {
    if (seen.has(stream.url)) continue;
    seen.add(stream.url);
    result.push(stream);
  }
  return result;
}

/**
 * Indica se o erro é HTTP 404, que o provedor trata como ausência da opção.
 * @param {*} error - Erro recebido.
 * @returns {boolean}
 */
function isMissingPage(error) {
  return /^HTTP 404\b/.test(String(error && error.message));
}
