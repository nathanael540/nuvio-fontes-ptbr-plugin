/**
 * Descoberta com fallback de domínio e resolução isolada das opções do Pobreflix HD.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { extractDataAttribute } from '../_blocks/script-extract/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { getMediaInfo } from '../_blocks/tmdb-info/index.mjs';
import { resolveHostOption } from './hosts.js';
import { DOMAINS, fetchPlayerOptions, findConfirmedContent, resolveSeriesEpisode } from './site.js';

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
  return msg.replace(/(md5|expires|key|token|signature|sig)=[^&\s"']+/gi, '$1=[redigido]');
}

/**
 * Localiza o conteúdo e resolve as opções independentes de mídia.
 * @param {{tmdbId: string|number, mediaType: 'movie'|'tv', season: number|null, episode: number|null}} input - Pedido do app.
 * @param {string} providerName - Nome do provedor no formatador e nos logs.
 * @returns {Promise<Array<object>>} Streams sem duplicatas; vazio em ausência válida.
 * @throws {Error} Se a entrada, o TMDB, todos os domínios ou todas as opções falharem.
 */
export async function extractStreams(input, providerName) {
  const request = validateInput(input);
  const key = globalThis.TMDB_API_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('TMDB_API_KEY indisponível');
  const media = await getMediaInfo({ tmdbId: request.tmdbId, mediaType: request.mediaType });
  const failures = [];

  for (const domain of DOMAINS) {
    let discovery;
    try {
      discovery = await discoverOptions(domain, media, request);
    } catch (error) {
      failures.push({ domain, error });
      continue;
    }
    for (const prev of failures) {
      console.warn(`[${providerName}] Falha prévia no domínio ${prev.domain}: ${sanitizeMessage(prev.error.message)}`);
    }
    if (failures.length > 0) {
      console.log(`[${providerName}] Sucesso no alias ${domain} após falha do principal`);
    }
    if (discovery === null) return [];
    if (discovery.ambiguous) {
      console.log(`[${providerName}] Mais de uma página confirma o TMDB ${request.tmdbId} em ${domain}`);
      return [];
    }
    // Falha de hospedagem não reinicia a descoberta nos aliases do mesmo catálogo.
    return resolveOptions(discovery, media, request, providerName, domain);
  }

  throw new Error(`Todos os domínios falharam:\n${failures.map((failure) =>
    `[${providerName}] Domínio ${failure.domain}: ${sanitizeMessage(failure.error.message)}`
  ).join('\n')}`);
}

/**
 * Descobre as opções de um conteúdo num domínio, sem resolver as hospedagens.
 * @param {string} domain - Domínio tentado.
 * @param {object} media - Identidade e metadados do TMDB.
 * @param {object} request - Pedido validado.
 * @returns {Promise<{options: Array<object>, contentPageUrl: string}|{ambiguous: true}|null>} Opções, ambiguidade ou ausência válida.
 * @throws {Error} Se a descoberta falhar por rede, HTTP ou estrutura inesperada.
 */
async function discoverOptions(domain, media, request) {
  const content = await findConfirmedContent(domain, media, request.mediaType);
  if (!content || content.ambiguous) return content;

  const contentOrigin = new URL(content.pageUrl).origin;
  let videoId;
  let contentPageUrl = content.pageUrl;
  if (request.mediaType === 'tv') {
    const episode = await resolveSeriesEpisode(contentOrigin, content, request.season, request.episode, media);
    if (!episode) return null;
    videoId = episode.videoId;
    contentPageUrl = episode.pageUrl;
  } else {
    videoId = extractDataAttribute(content.pageHtml, 'video-id') || /-([0-9]+)\/?$/.exec(content.pageUrl)?.[1];
    if (!videoId) throw new Error(`ID do filme não encontrado na página ${content.pageUrl}`);
  }
  return { options: await fetchPlayerOptions(new URL(contentPageUrl).origin, videoId), contentPageUrl };
}

/**
 * Resolve cada hospedagem isoladamente, preservando os streams que funcionam.
 * @param {{options: Array<object>, contentPageUrl: string}} discovery - Opções descobertas.
 * @param {object} media - Metadados do TMDB.
 * @param {object} request - Pedido validado.
 * @param {string} providerName - Nome do provedor nos logs e no formatador.
 * @param {string} domain - Domínio tentado, para diagnóstico.
 * @returns {Promise<Array<object>>} Streams únicos por URL e idioma.
 * @throws {Error} Se nenhuma opção produzir stream e alguma tiver falhado.
 */
async function resolveOptions(discovery, media, request, providerName, domain) {
  const streams = [];
  const failures = [];
  const seen = new Set();
  for (const option of discovery.options) {
    try {
      const mediaStream = await resolveHostOption(option, discovery.contentPageUrl);
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
      const failure = `Host ${option.hostName} (${option.language}) em ${domain}: ${sanitizeMessage(error.message)}`;
      failures.push(failure);
      console.warn(`[${providerName}] Opção ${option.hostName} (${option.language}) em ${domain} descartada: ${sanitizeMessage(error.message)}`);
    }
  }
  if (streams.length === 0 && failures.length > 0) {
    throw new Error(`Todas as opções falharam: ${failures.join('; ')}`);
  }
  return streams;
}
