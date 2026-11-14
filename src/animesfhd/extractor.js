/**
 * Extrator do provedor AnimesFHD.
 *
 * A fonte publica o catálogo em HTML, versões sazonais por áudio e o HLS na API de episódio. O
 * extrator calcula o episódio global do TMDB, escolhe a versão sazonal e resolve cada áudio em
 * isolamento.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { normalizeLanguage } from '../_blocks/language-discovery/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { titleSimilarity } from '../_blocks/title-match/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import {
  audioOrder,
  fetchCatalogPage,
  fetchEpisodeData,
  fetchHomeCandidates,
  fetchSeriesPage,
} from './api.js';
import { MAX_CANDIDATES, MAX_CATALOG_PAGES, MIN_TITLE_SCORE, PROVIDER_LABEL, SITE } from './site.js';

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./api.js').Candidate} Candidate
 * @typedef {import('./api.js').SeriesPage} SeriesPage
 * @typedef {import('./api.js').Version} Version
 * @typedef {import('./api.js').Source} Source
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
 * @property {number} season - Temporada pedida.
 * @property {number} episode - Episódio pedido.
 */

/**
 * Localiza a série, mapeia o episódio global e resolve os áudios publicados.
 *
 * @param {StreamRequest} request - Valores que o app passou para `getStreams`.
 * @param {string} providerName - Nome do provedor, exibido pelo formatador em cada stream.
 * @returns {Promise<Stream[]>} Streams encontrados; vazio em ausência reconhecida.
 * @throws {Error} Em falha de rede, HTML/JSON inválido ou quando todas as opções falham.
 * @example
 * const streams = await extractStreams({ tmdbId: '85937', mediaType: 'tv', season: 1, episode: 1 }, 'AnimesFHD');
 */
export async function extractStreams(request, providerName) {
  if (request.mediaType !== 'tv') return [];
  const coordinates = readCoordinates(request);
  const media = await getMediaInfo(request);
  const series = await findSeries(media);
  if (series === null) return [];

  const versionsData = await fetchEpisodeData(series.episodes[0].episodeId);
  if (versionsData.versions.length === 0) {
    throw new Error('Episódio inicial sem versões sazonais');
  }
  const globalRequested = globalEpisode(media.seasons, coordinates.season, coordinates.episode);

  const streams = [];
  const failures = [];
  for (const audio of audioOrder()) {
    const selected = selectVersion(versionsData.versions, audio, globalRequested);
    if (selected === null) continue;
    try {
      streams.push(...await resolveVersion(selected, audio, media, coordinates));
    } catch (error) {
      failures.push(`${audio}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${audio} descartada: ${sanitizeMessage(error.message)}`);
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
 * @param {StreamRequest} request - Valores do app.
 * @returns {Coordinates} Coordenadas validadas.
 * @throws {Error} Se temporada ou episódio não forem inteiros positivos.
 */
function readCoordinates(request) {
  const { season, episode } = request;
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode}`);
  }
  return { season, episode };
}

/**
 * Procura e confirma a ficha da série nos carrosséis e no catálogo.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {Promise<SeriesPage|null>} Ficha confirmada ou `null`.
 */
async function findSeries(media) {
  const tried = new Set();
  const home = await fetchHomeCandidates();
  const confirmed = await tryCandidates(home, media, tried);
  if (confirmed !== null) return confirmed;

  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    const candidates = await fetchCatalogPage(page);
    const found = await tryCandidates(candidates, media, tried);
    if (found !== null) return found;
    if (candidates.length === 0) break;
  }
  return null;
}

/**
 * Tenta até quatro fichas candidatas compatíveis.
 * @param {Candidate[]} candidates - Candidatos da home ou de uma página.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Set<string>} tried - IDs já abertos.
 * @returns {Promise<SeriesPage|null>} Ficha confirmada ou `null`.
 */
async function tryCandidates(candidates, media, tried) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: candidateScore(candidate, media) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score);

  for (const { candidate } of ranked) {
    if (tried.size >= MAX_CANDIDATES) break;
    if (tried.has(candidate.seriesId)) continue;
    tried.add(candidate.seriesId);
    const page = await fetchSeriesPage(candidate.seriesId);
    if (page !== null && seriesTitleMatches(page.title, media)) return page;
  }
  return null;
}

/**
 * Mede a similaridade de um candidato com os títulos do TMDB.
 * @param {Candidate} candidate - Candidato do catálogo.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {number|null} Score ou `null` abaixo do limiar.
 */
function candidateScore(candidate, media) {
  const titles = mediaTitles(media);
  let best = 0;
  for (const mediaTitle of titles) {
    best = Math.max(best, titleSimilarity(candidate.title, mediaTitle));
  }
  if (best < MIN_TITLE_SCORE) return null;
  return candidate.year !== null && media.year !== null && candidate.year === media.year ? best + 0.05 : best;
}

/**
 * Confirma o título da ficha sazonal.
 * @param {string} title - `h1` publicado.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {boolean}
 */
function seriesTitleMatches(title, media) {
  const clean = cleanSeriesTitle(title);
  if (clean === '') return false;
  return mediaTitles(media).some((mediaTitle) => {
    if (normalizeText(clean) === normalizeText(mediaTitle)) return true;
    return titleSimilarity(clean, mediaTitle) >= MIN_TITLE_SCORE;
  });
}

/**
 * Remove o sufixo de temporada do título da ficha.
 * @param {string} title - Título recebido.
 * @returns {string} Título base.
 */
function cleanSeriesTitle(title) {
  return title
    .replace(/\s*[-–—]\s*\d+\s*[ªa]\s*temporada.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Monta os títulos comparáveis do TMDB.
 * @param {MediaInfo} media - Dados do TMDB.
 * @returns {string[]} Títulos não vazios.
 */
function mediaTitles(media) {
  return [
    media.title,
    media.originalTitle,
    ...(media.alternativeTitles || []),
    ...(media.romajiTitles || []).map((entry) => entry.title),
  ].filter((title) => typeof title === 'string' && title.trim() !== '');
}

/**
 * Calcula o episódio global do TMDB, ignorando a temporada 0.
 * @param {import('../_blocks/tmdb-info/index.mjs').SeasonInfo[]} seasons - Temporadas do TMDB.
 * @param {number} season - Temporada pedida.
 * @param {number} episode - Episódio pedido.
 * @returns {number} Episódio global.
 */
function globalEpisode(seasons, season, episode) {
  let total = 0;
  for (const entry of seasons || []) {
    if (entry.number > 0 && entry.number < season) total += entry.episodeCount;
  }
  return total + episode;
}

/**
 * Seleciona a versão da fonte cuja faixa global contém o episódio.
 * @param {Version[]} versions - Versões publicadas.
 * @param {string} audio - Áudio pedido.
 * @param {number} globalRequested - Episódio global.
 * @returns {{ version: Version, local: number }|null} Versão e episódio local.
 */
function selectVersion(versions, audio, globalRequested) {
  const matching = versions
    .filter((version) => version.audio === audio)
    .sort((a, b) => a.season - b.season || a.seriesId.localeCompare(b.seriesId));
  let start = 1;
  for (const version of matching) {
    const end = start + version.episodeCount - 1;
    if (globalRequested >= start && globalRequested <= end) {
      return { version, local: globalRequested - start + 1 };
    }
    start = end + 1;
  }
  return null;
}

/**
 * Resolve uma versão sazonal até os streams do episódio.
 * @param {{ version: Version, local: number }} selected - Versão e episódio local.
 * @param {string} audio - Áudio pedido.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas pedidas.
 * @returns {Promise<Stream[]>} Streams da versão; vazio em ausência.
 * @throws {Error} Se a ficha da versão ou o episódio estiverem fora do esquema.
 */
async function resolveVersion(selected, audio, media, coordinates) {
  const page = await fetchSeriesPage(selected.version.seriesId);
  if (page === null) return [];
  const card = page.episodes.find((episode) => episode.number === selected.local);
  if (card === undefined) return [];

  const data = await fetchEpisodeData(card.episodeId);
  const streams = [];
  const failures = [];
  for (const source of data.sources) {
    try {
      streams.push(buildSourceStream(source, media, coordinates, selected.local, audio));
    } catch (error) {
      failures.push(`${source.label}: ${error.message}`);
      console.warn(`[${PROVIDER_LABEL}] Fonte ${source.label} descartada: ${sanitizeMessage(error.message)}`);
    }
  }
  if (streams.length > 0) return streams;
  if (failures.length > 0) throw new Error(`Nenhuma fonte produziu stream: ${failures.join('; ')}`);
  return [];
}

/**
 * Monta um stream HLS de uma fonte.
 * @param {Source} source - Fonte publicada.
 * @param {MediaInfo} media - Dados do TMDB.
 * @param {Coordinates} coordinates - Coordenadas pedidas.
 * @param {number} local - Episódio local usado na resolução.
 * @param {string} audio - Áudio da versão.
 * @returns {Stream} Stream montado.
 * @throws {Error} Se a URL não for HTTP(S).
 */
function buildSourceStream(source, media, coordinates, local, audio) {
  const url = new URL(source.url, SITE).href;
  if (!/^https?:\/\//i.test(url)) throw new Error('Fonte com URL fora de HTTP(S)');
  const format = {
    template: FORMATTER.AUTO,
    addon: PROVIDER_LABEL,
    title: media.title,
    season: coordinates.season,
    episode: coordinates.episode,
  };
  if (media.year !== null) format.year = media.year;
  const language = normalizeLanguage(source.audio || audio);
  const fields = {
    url,
    format,
    type: 'hls',
    provider: source.label,
    languageHints: [source.audio, audio, source.label],
  };
  if (language !== null) fields.language = language;
  return buildStream(fields);
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
