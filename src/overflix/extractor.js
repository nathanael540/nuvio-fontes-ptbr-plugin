/**
 * Descoberta do domínio, seleção do conteúdo e resolução isolada das opções do OverFlix.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { extractDataAttribute } from '../_blocks/script-extract/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { discoverDomain } from './domain.js';
import { resolveHostOption } from './hosts.js';
import {
  fetchEpisodesList,
  fetchPlayerOptions,
  findConfirmedContent,
  readSeriesInfo,
} from './site.js';

/**
 * Valida os parâmetros recebidos do app antes de qualquer requisição externa.
 * @param {object} input - Pedido do app.
 * @returns {object} Pedido validado e normalizado.
 * @throws {Error} Se qualquer parâmetro for inválido.
 */
function validateInput(input) {
  const { tmdbId, mediaType, season, episode } = input;
  if (typeof tmdbId !== 'string' && typeof tmdbId !== 'number') {
    throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  }
  const idStr = String(tmdbId).trim();
  if (!/^[1-9]\d*$/.test(idStr)) throw new Error(`ID do TMDB inválido: ${tmdbId}`);
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`Tipo de mídia inválido: "${mediaType}" (esperado "movie" ou "tv")`);
  }
  if (mediaType === 'tv' && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    throw new Error('Temporada e episódio devem ser inteiros positivos');
  }
  return { tmdbId: idStr, mediaType, season: mediaType === 'tv' ? season : null, episode: mediaType === 'tv' ? episode : null };
}

/**
 * Redige segredos, chaves e parâmetros de consulta de URLs de mensagens de log.
 * @param {string} raw - Mensagem original.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(raw) {
  let msg = String(raw || '');
  const key = globalThis.TMDB_API_KEY;
  if (typeof key === 'string' && key.trim()) {
    for (const secret of [key, key.trim(), encodeURIComponent(key.trim())]) {
      msg = msg.split(secret).join('[redigido]');
    }
  }
  msg = msg.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1');
  return msg.replace(/(md5|expiry|expires|key|token|signature|sig)=[^&\s"']+/gi, '$1=[redigido]');
}

/**
 * Localiza o conteúdo, seleciona o episódio e resolve as opções independentes de mídia.
 * @param {{tmdbId: string|number, mediaType: 'movie'|'tv', season: number|null, episode: number|null}} input - Pedido do app.
 * @param {string} providerName - Nome do provedor no formatador e nos logs.
 * @returns {Promise<Array<object>>} Streams sem duplicatas; vazio em ausência válida.
 * @throws {Error} Se a entrada, o TMDB, a fonte ou todas as opções falharem.
 */
export async function extractStreams(input, providerName) {
  const request = validateInput(input);
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('TMDB_API_KEY indisponível');
  const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: request.mediaType });

  const content = await findConfirmedContent(await discoverDomain(), media, request.mediaType);
  if (content === null) return [];
  if (content.ambiguous) {
    console.log(`[${providerName}] Mais de uma ficha confirma o TMDB ${request.tmdbId}`);
    return [];
  }

  let contentOrigin = content.origin;
  let videoId;
  let referer = content.pageUrl;

  if (request.mediaType === 'tv') {
    const series = readSeriesInfo(content.pageHtml, content.pageUrl);
    if (series.seasons.length > 0 && !series.seasons.includes(request.season)) {
      return [];
    }
    const episode = await fetchEpisodesList(
      contentOrigin,
      series.videoId,
      request.season,
      request.episode,
      series.audio,
      content.pageUrl,
    );
    if (episode === null) return [];
    videoId = episode.videoId;
    referer = episode.episodeUrl;
    contentOrigin = new URL(episode.episodeUrl).origin;
  } else {
    videoId = extractDataAttribute(content.pageHtml, 'video-id') || /-([0-9]+)\/?$/.exec(content.pageUrl)?.[1];
    if (!videoId) throw new Error(`ID do filme não encontrado na página ${content.pageUrl}`);
  }

  const options = await fetchPlayerOptions(contentOrigin, videoId, referer);
  if (options.length === 0) return [];
  return resolveOptions(options, media, request, providerName, referer);
}

/**
 * Resolve cada hospedagem isoladamente, preservando os streams que funcionam.
 * @param {Array<object>} options - Opções anunciadas pelo `playerData`.
 * @param {object} media - Metadados do TMDB.
 * @param {object} request - Pedido validado.
 * @param {string} providerName - Nome do provedor nos logs e no formatador.
 * @param {string} referer - URL da ficha do filme ou do episódio.
 * @returns {Promise<Array<object>>} Streams únicos por URL e idioma.
 * @throws {Error} Se nenhuma opção produzir stream e alguma tiver falhado.
 */
async function resolveOptions(options, media, request, providerName, referer) {
  const streams = [];
  const failures = [];
  const seen = new Set();

  for (const option of options) {
    try {
      const mediaStream = await resolveHostOption(option, referer);
      if (!mediaStream) continue;
      const stream = buildStream({
        url: mediaStream.url,
        // O selo genérico HD não comprova 720p. Deixe a descoberta local do buildStream agir.
        language: option.language,
        provider: option.hostName,
        type: 'mp4',
        headers: mediaStream.headers,
        format: {
          template: FORMATTER.AUTO,
          addon: providerName,
          title: media.title,
          ...(media.year !== null ? { year: media.year } : {}),
          ...(request.mediaType === 'tv' ? { season: request.season, episode: request.episode } : {}),
        },
      });
      const itemKey = `${stream.url}|${stream.language || ''}`;
      if (!seen.has(itemKey)) {
        seen.add(itemKey);
        streams.push(stream);
      }
    } catch (error) {
      const cause = sanitizeMessage(error.message);
      failures.push(`Host ${option.hostName} (${option.language}): ${cause}`);
      console.warn(`[${providerName}] Opção ${option.hostName} (${option.language}) descartada: ${cause}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    throw new Error(`Todas as opções falharam: ${failures.join('; ')}`);
  }
  return streams;
}
