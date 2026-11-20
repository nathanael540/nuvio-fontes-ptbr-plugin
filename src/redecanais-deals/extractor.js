/**
 * Extração do RedeCanais Deals: TMDB, busca, confirmação, episódio e player.
 *
 * Cada ficha confirmada vira uma opção independente e cada player é resolvido em isolamento.
 * Etapas anteriores às opções (entrada, TMDB, busca, ficha e lista de episódios) continuam
 * fatais. A identidade forte é o `vid` do player, que carrega o TMDB e, em série, o par pedido.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { UNKNOWN_QUALITY, discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findEpisodeLinks, parseEpisodeHeading } from './episodes.js';
import { findPlayerFrame, matchesRequest, resolvePlayerMedia } from './player.js';
import { confirmCandidate, filterCards, searchCards, searchTerms } from './search.js';

const NOT_FOUND = /HTTP 404\b/;

/**
 * @typedef {object} StreamRequest
 * @property {string} tmdbId - ID do TMDB recebido do app.
 * @property {'movie'|'tv'} mediaType - Tipo de mídia.
 * @property {number|null} season - Temporada (1-based); null para filmes.
 * @property {number|null} episode - Episódio (1-based); null para filmes.
 */

/**
 * @typedef {object} Option
 * @property {import('./search.js').ConfirmedCandidate} candidate - Ficha confirmada.
 * @property {{ url: string, text: string }} page - Página que contém o player (ficha ou episódio).
 * @property {string} label - Rótulo da opção nas mensagens de aviso.
 */

/**
 * Localiza e monta os streams do título pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor usado no formatador e nos avisos.
 * @returns {Promise<object[]>} Streams sem ordenação; vazio quando não há resultado ou identidade compatível.
 * @throws {Error} Em falha de entrada, TMDB, busca, estrutura ou quando todas as opções falham.
 */
export async function extractStreams(request, providerName) {
  const coords = readEpisode(request);
  const media = await getMediaInfo(request);
  const options = await findOptions(media, request, coords);

  const streams = [];
  const seen = new Set();
  const failures = [];

  for (const option of options) {
    try {
      const resolved = await resolveOption(option, media, request, providerName);
      if (resolved === null) continue;
      if (seen.has(resolved.key)) continue;
      seen.add(resolved.key);
      streams.push(resolved.stream);
    } catch (error) {
      failures.push({ label: option.label, error });
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    const causes = failures.map((failure) => `Opção ${failure.label}: ${failure.error.message}`).join('; ');
    throw new Error(`Nenhuma opção produziu stream: ${causes}`);
  }
  for (const failure of failures) {
    console.warn(`[${providerName}] Opção ${failure.label} descartada: ${failure.error.message}`);
  }
  return streams;
}

/**
 * Lê temporada e episódio do pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
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
 * Percorre os termos de busca e devolve as opções do primeiro termo com ficha confirmada.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido original.
 * @param {{ season: number, episode: number }|null} coords - Coordenadas em série.
 * @returns {Promise<Option[]>} Opções prontas para o player.
 */
async function findOptions(media, request, coords) {
  for (const term of searchTerms(media)) {
    const cards = await searchCards(term);
    if (cards.length === 0) continue;

    const confirmed = [];
    for (const card of filterCards(cards, media, request)) {
      try {
        const candidate = await confirmCandidate(card, media, request);
        if (candidate !== null) confirmed.push(candidate);
      } catch (error) {
        if (NOT_FOUND.test(error.message)) continue;
        throw error;
      }
    }
    if (confirmed.length === 0) continue;

    const options = await buildOptions(confirmed, request, coords);
    if (options.length > 0) return options;
  }
  return [];
}

/**
 * Transforma fichas confirmadas em opções de player.
 * @param {import('./search.js').ConfirmedCandidate[]} confirmed - Fichas confirmadas.
 * @param {StreamRequest} request - Pedido original.
 * @param {{ season: number, episode: number }|null} coords - Coordenadas em série.
 * @returns {Promise<Option[]>} Opções prontas para o player.
 * @throws {Error} Se a série não publicar a lista de episódios ou o episódio não publicar o `h1`.
 */
async function buildOptions(confirmed, request, coords) {
  const options = [];
  for (const candidate of confirmed) {
    const label = optionLabel(candidate);
    if (request.mediaType === 'movie') {
      options.push({ candidate, page: candidate.page, label });
      continue;
    }

    const links = findEpisodeLinks(candidate.page.text, candidate.page.url, coords);
    for (const link of links) {
      let episodePage;
      try {
        episodePage = await fetchPage(link.url, { profile: 'page' });
      } catch (error) {
        if (NOT_FOUND.test(error.message)) continue;
        throw error;
      }
      const heading = parseEpisodeHeading(episodePage.text, episodePage.url);
      if (heading.season !== coords.season || heading.episode !== coords.episode) continue;
      options.push({ candidate, page: episodePage, label });
    }
  }
  return options;
}

/**
 * Resolve o player de uma opção e monta o stream.
 * @param {Option} option - Opção confirmada.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido original.
 * @param {string} providerName - Nome do provedor.
 * @returns {Promise<{ stream: object, key: string }|null>} Stream e chave de deduplicação; null quando o `vid` diverge.
 * @throws {Error} Se a página não tiver player ou o player não publicar mídia utilizável.
 */
async function resolveOption(option, media, request, providerName) {
  const frame = findPlayerFrame(option.page.text, option.page.url);
  if (!matchesRequest(frame, request)) return null;

  const playerMedia = await resolvePlayerMedia(frame);
  const coords = request.mediaType === 'tv' ? { season: request.season, episode: request.episode } : null;
  const fields = {
    url: playerMedia.url,
    language: playerMedia.language,
    format: formatDetails(providerName, media, coords),
    type: 'mp4',
  };

  const quality = optionQuality(option.candidate);
  if (quality !== null) fields.quality = quality;
  if (frame.server !== null) fields.provider = frame.server;

  return {
    stream: buildStream(fields),
    key: `${frame.vid}\u0000${playerMedia.language}`,
  };
}

/**
 * Detalhes do stream para o formatador.
 * @param {string} providerName - Nome do provedor exibido.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ season: number, episode: number }|null} coords - Coordenadas em série.
 * @returns {object} Valor do campo `format` de `buildStream`.
 */
function formatDetails(providerName, media, coords) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  if (coords !== null) {
    format.season = coords.season;
    format.episode = coords.episode;
  }
  return format;
}

/**
 * Qualidade declarada pela ficha ou pelo cartão, normalizada.
 * @param {import('./search.js').ConfirmedCandidate} candidate - Ficha confirmada.
 * @returns {string|null} Qualidade normalizada ou null quando não há rótulo reconhecível.
 */
function optionQuality(candidate) {
  for (const value of [candidate.pageLabel.quality, candidate.card.quality]) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    const quality = discoverQuality([value]);
    if (quality !== UNKNOWN_QUALITY) return quality;
  }
  return null;
}

/**
 * Rótulo da opção nas mensagens, com a qualidade quando conhecida.
 * @param {import('./search.js').ConfirmedCandidate} candidate - Ficha confirmada.
 * @returns {string}
 */
function optionLabel(candidate) {
  const quality = optionQuality(candidate);
  return quality === null ? candidate.pageLabel.title : `${candidate.pageLabel.title} ${quality}`;
}
