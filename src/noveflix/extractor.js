/**
 * Extrator do provedor NoveFlix.
 *
 * A busca é textual, a ficha confirma título e ano e a única opção DooPlay leva ao embed novefx,
 * de onde o capítulo percorre o gate até o MP4 publicado em `stream.php`.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { fetchEmbed, fetchShow, search } from './catalog.js';
import {
  buildChapterUrl,
  extractSafelink,
  fetchGate,
  fetchStreamUrl,
  followSafelink,
  parseEmbed,
} from './gate.js';
import {
  MAX_CANDIDATES_PER_TERM,
  MAX_SEARCH_TERMS,
  MIN_TITLE_SCORE,
  PROVIDER_LABEL,
} from './site.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./catalog.js').ShowDetail} ShowDetail
 */

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'tv'} mediaType - Tipo de mídia.
 * @property {number} season - Temporada pedida.
 * @property {number} episode - Episódio/capítulo pedido.
 */

/**
 * Localiza a novela e resolve o capítulo.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido nos avisos.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, estrutura inválida ou gate indisponível.
 */
export async function extractStreams(request, providerName) {
  if (request.season !== 1) return [];
  const media = await getMediaInfo(request);
  const show = await findShow(media);
  if (show === null) return [];

  const embedUrl = await fetchEmbed(show.option, show.url);
  if (embedUrl === null) return [];

  const embedPage = await fetchPage(embedUrl, { headers: { Referer: show.url } });
  const embed = parseEmbed(embedPage.text);
  if (request.episode > embed.totalChapters) return [];

  const redirectUrl = buildChapterUrl(embed, request.episode);
  const gate = await fetchGate(redirectUrl, embedPage.url);
  const safelink = extractSafelink(gate.text, gate.url);
  const videoUrl = await followSafelink(safelink, gate.url);
  const streamUrl = await fetchStreamUrl(videoUrl, safelink);

  return [buildNovelaStream(streamUrl, media, request.episode, providerName)];
}

/**
 * Procura a ficha compatível por título e ano.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<ShowDetail|null>} Ficha confirmada ou `null`.
 */
async function findShow(media) {
  for (const query of searchQueries(media)) {
    const candidates = await search(query);
    const limited = candidates.slice(0, MAX_CANDIDATES_PER_TERM);
    for (const candidate of limited) {
      const show = await fetchShow(candidate.url);
      if (bestSimilarity(show.title, media) < MIN_TITLE_SCORE) continue;
      if (media.year !== null && show.year !== null && show.year !== media.year) continue;
      return show;
    }
  }
  return null;
}

/**
 * Monta os termos de busca.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Até oito termos não repetidos.
 */
function searchQueries(media) {
  const terms = [media.title, media.originalTitle, ...(media.alternativeTitles || [])];
  const seen = new Set();
  const queries = [];
  for (const term of terms) {
    if (typeof term !== 'string' || term.trim() === '') continue;
    const key = normalizeText(term) || term;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(term.trim());
    if (queries.length === MAX_SEARCH_TERMS) break;
  }
  return queries;
}

/**
 * Compara um título da fonte com os títulos do TMDB.
 * @param {string} title - Título da fonte.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number} Maior similaridade encontrada.
 */
function bestSimilarity(title, media) {
  const titles = [media.title, media.originalTitle, ...(media.alternativeTitles || [])].filter(
    (entry) => typeof entry === 'string' && entry.trim() !== '',
  );
  let best = 0;
  for (const entry of titles) best = Math.max(best, titleSimilarity(title, entry));
  return best;
}

/**
 * Monta o stream da novela.
 * @param {string} url - URL de `stream.php`.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {number} episode - Capítulo resolvido.
 * @param {string} providerName - Nome do provedor.
 * @returns {Stream} Stream no contrato do app.
 */
function buildNovelaStream(url, media, episode, providerName) {
  const format = {
    template: FORMATTER.AUTO,
    addon: providerName,
    title: media.title,
    season: 1,
    episode,
  };
  if (media.year !== null) format.year = media.year;
  return buildStream({
    url,
    format,
    type: 'mp4',
    provider: PROVIDER_LABEL,
    quality: 'Desconhecida',
    language: LANGUAGE.UNKNOWN,
  });
}
