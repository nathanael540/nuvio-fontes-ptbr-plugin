/**
 * Ponto de entrada do provedor AnimesDigital.
 *
 * O catálogo brasileiro publica animes, filmes e séries em páginas próprias e entrega HLS pelo
 * player Anivideo. A busca é textual e a ficha confirma título, ano e tipo; este arquivo concentra o
 * contrato do app, a captura única de erros e a ordenação por qualidade.
 */

import { fetchText } from '../_blocks/http/index.mjs';
import { LANGUAGE, languageFromTexts } from '../_blocks/language-discovery/index.mjs';
import { sortByQuality } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { findCandidate, selectMedia, SITE_HEADERS } from './catalog.js';
import { extractStreams } from './player.js';

const PROVIDER_NAME = 'AnimesDigital';

/**
 * Função chamada pelo Nuvio.
 * @param {string} tmdbId - ID do TMDB (ex.: "85937").
 * @param {'movie'|'tv'} mediaType - Tipo de mídia.
 * @param {number|null} season - Temporada (1-based); null para filmes.
 * @param {number|null} episode - Episódio (1-based); null para filmes.
 * @returns {Promise<Array<object>>} Streams da maior para a menor qualidade; vazia quando a fonte não tem o título ou em falha.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const coordinates = readCoordinates(mediaType, season, episode);
    const media = await getMediaInfo({ tmdbId, mediaType });
    const candidate = await findCandidate(media, coordinates);
    if (candidate === null) return [];

    const selected = selectMedia(candidate.detail, coordinates, media.mediaType);
    if (selected === null) return [];

    const page = await fetchText(selected.url, { headers: SITE_HEADERS });
    const streams = extractStreams(page, {
      providerName: PROVIDER_NAME,
      media,
      coordinates,
      language: declaredLanguage(candidate, selected),
      pageUrl: selected.url,
    });
    return sortByQuality(streams);
  } catch (error) {
    // Fronteira com o app: único ponto de captura. A falha vai para o log e o contrato exige lista vazia.
    console.error(`[${PROVIDER_NAME}] Falha em ${mediaType} ${tmdbId}: ${error.message}`);
    return [];
  }
}

/**
 * Lê temporada e episódio do pedido.
 * @param {'movie'|'tv'} mediaType - Tipo recebido do app.
 * @param {number|null} season - Temporada recebida.
 * @param {number|null} episode - Episódio recebido.
 * @returns {{ season: number|null, episode: number|null }} Coordenadas; null em filme.
 * @throws {Error} Se uma série vier sem temporada ou episódio inteiros a partir de 1.
 */
function readCoordinates(mediaType, season, episode) {
  if (mediaType !== 'tv') return { season: null, episode: null };
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    throw new Error(`Série sem temporada/episódio válidos: season=${season} episode=${episode} (esperados inteiros a partir de 1)`);
  }
  return { season, episode };
}

/**
 * Confirma o idioma somente quando o cartão, a ficha ou o episódio declaram dublado/legendado.
 * @param {{ card: object, detail: object }} candidate - Candidato confirmado.
 * @param {{ label: string }} selected - Episódio ou filme escolhido.
 * @returns {string|null} Membro do enum `LANGUAGE` ou null para a descoberta local.
 */
function declaredLanguage(candidate, selected) {
  const found = languageFromTexts([candidate.card.title, candidate.detail.title, selected.label]);
  if (found === LANGUAGE.DUBBED || found === LANGUAGE.SUBTITLED) return found;
  return null;
}

module.exports = { getStreams };
