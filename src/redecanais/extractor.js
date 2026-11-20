/**
 * Extração do RedeCanais: TMDB, busca, confirmação, episódio e player.
 *
 * A fonte publica filmes e séries no mesmo catálogo; a rota separa os tipos. Cada ficha confirmada
 * vira uma opção independente (áudio/qualidade) e cada player é resolvido em isolamento. Etapas
 * anteriores às opções (entrada, TMDB, busca, ficha e estrutura do episódio) continuam fatais.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { UNKNOWN_QUALITY, discoverQuality } from '../_blocks/quality-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findEpisodeLinks, parseEpisodeHeading } from './episodes.js';
import { findPlayerFrame, resolvePlayerMedia } from './player.js';
import { confirmCandidate, filterCards, searchCards, searchTerms } from './search.js';

const GENERIC_AUDIO = /\bdublado\s*e\s*legendado\b/gi;
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
 * @property {import('./episodes.js').EpisodeLink|null} link - Link do episódio, em série.
 * @property {string} label - Rótulo da opção nas mensagens de aviso.
 */

/**
 * @typedef {object} FoundOptions
 * @property {Option[]} options - Opções prontas para o player.
 * @property {import('./search.js').SearchFailure[]} failures - Opções descartadas antes do player.
 */

/**
 * Localiza e monta os streams do título pedido.
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor usado no formatador e nos avisos.
 * @returns {Promise<object[]>} Streams sem ordenação; vazio quando não há resultado ou opção suportada.
 * @throws {Error} Em falha de entrada, TMDB, busca, estrutura ou quando todas as opções falham.
 */
export async function extractStreams(request, providerName) {
  const coords = readEpisode(request);
  const media = await getMediaInfo(request);
  const found = await findOptions(media, request, coords);

  const streams = [];
  const seen = new Set();
  const failures = found.failures.slice();

  for (const option of found.options) {
    try {
      const stream = await resolveOption(option, media, request, providerName);
      if (stream === null) continue;
      const key = dedupeKey(stream);
      if (seen.has(key)) continue;
      seen.add(key);
      streams.push(stream);
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
 * Percorre os termos de busca e devolve as opções confirmadas do primeiro termo com resultado.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {StreamRequest} request - Pedido original.
 * @param {{ season: number, episode: number }|null} coords - Coordenadas em série.
 * @returns {Promise<FoundOptions>} Opções e falhas de episódio.
 */
async function findOptions(media, request, coords) {
  const failures = [];
  for (const term of searchTerms(media, request)) {
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

    const options = await buildOptions(confirmed, request, coords, failures);
    if (options.length > 0) return { options, failures };
  }
  return { options: [], failures };
}

/**
 * Transforma fichas confirmadas em opções de player.
 * @param {import('./search.js').ConfirmedCandidate[]} confirmed - Fichas confirmadas.
 * @param {StreamRequest} request - Pedido original.
 * @param {{ season: number, episode: number }|null} coords - Coordenadas em série.
 * @param {import('./search.js').SearchFailure[]} failures - Lista de falhas, alterada no lugar.
 * @returns {Promise<Option[]>} Opções prontas para o player.
 * @throws {Error} Se a série não publicar o contêiner de episódios ou o episódio não publicar o `h1`.
 */
async function buildOptions(confirmed, request, coords, failures) {
  const options = [];
  for (const candidate of confirmed) {
    if (request.mediaType === 'movie') {
      options.push({ candidate, page: candidate.page, link: null, label: optionLabel(candidate, null) });
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
      if (heading.season !== coords.season || heading.episode !== coords.episode) {
        failures.push({
          label: optionLabel(candidate, link),
          error: new Error(`h1 do episódio com coordenadas divergentes: ${heading.season}x${heading.episode}`),
        });
        continue;
      }
      options.push({ candidate, page: episodePage, link, label: optionLabel(candidate, link) });
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
 * @returns {Promise<object|null>} Stream montado; null quando o formato declarado está fora do contrato.
 * @throws {Error} Se a ficha não tiver player ou o player não publicar mídia utilizável.
 */
async function resolveOption(option, media, request, providerName) {
  const { candidate, page } = option;
  const frame = findPlayerFrame(page.text, page.url);
  const playerMedia = await resolvePlayerMedia(frame, page.url);
  if (playerMedia === null) return null;

  const coords = request.mediaType === 'tv' ? { season: request.season, episode: request.episode } : null;
  const fields = {
    url: playerMedia.url,
    format: formatDetails(providerName, media, coords),
    type: playerMedia.type,
  };

  const quality = optionQuality(candidate);
  if (quality !== null) fields.quality = quality;
  const language = optionLanguage(candidate, option.link);
  if (language !== null) fields.language = language;
  if (frame.server !== null) fields.provider = frame.server;

  return buildStream(fields);
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
 * Idioma da opção pela evidência mais próxima: episódio, depois rótulo da série/ficha.
 * @param {import('./search.js').ConfirmedCandidate} candidate - Ficha confirmada.
 * @param {import('./episodes.js').EpisodeLink|null} link - Link do episódio, em série.
 * @returns {string|null} Membro do enum `LANGUAGE` ou null quando não há evidência.
 */
function optionLanguage(candidate, link) {
  const texts = [];
  if (link !== null) texts.push(link.label, link.url);
  texts.push(candidate.pageLabel.audio, candidate.card.audio);

  const cleaned = [];
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    const value = text.replace(GENERIC_AUDIO, ' ').replace(/\s+/g, ' ').trim();
    if (value !== '') cleaned.push(value);
  }
  if (cleaned.length === 0) return null;

  const language = languageFromTexts(cleaned);
  if (language === null || language === LANGUAGE.UNKNOWN) return null;
  return language;
}

/**
 * Rótulo da opção nas mensagens, com idioma e qualidade quando conhecidos.
 * @param {import('./search.js').ConfirmedCandidate} candidate - Ficha confirmada.
 * @param {import('./episodes.js').EpisodeLink|null} link - Link do episódio, em série.
 * @returns {string}
 */
function optionLabel(candidate, link) {
  const language = optionLanguage(candidate, link);
  const quality = optionQuality(candidate);
  const base = language === null ? candidate.pageLabel.title : language;
  return quality === null ? base : `${base} ${quality}`;
}

/**
 * Chave de deduplicação: URL sem a query assinada e idioma.
 * @param {object} stream - Stream montado.
 * @returns {string}
 */
function dedupeKey(stream) {
  return `${stream.url.split('?')[0]}\u0000${stream.language}`;
}
