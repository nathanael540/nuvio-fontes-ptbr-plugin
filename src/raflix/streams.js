/** Montagem dos streams HLS do Raflix e contingência H.264 do VidRift. */
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson, playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { displayProvider, isPlainObject, optionalText, readHttpUrl, sanitizeMessage } from './shared.js';

const ADDON = 'Raflix';
const PARENT = 'raflix.web.id';
const PROVIDERS = ['vela', 'titan', 'atlas'];
const QUALITY_P = /(\d{3,4})p/i;
const QUALITY_SEGMENT = /(?:^|\/)(\d{3,4})(?=\/|$)/;
const KNOWN_HEIGHTS = [144, 240, 360, 480, 540, 576, 720, 1080, 1440, 2160, 4320];

/**
 * Monta um stream da Orion, dublado ou legendado, com a qualidade máxima de `rungs`.
 * @param {object} options - Dados da montagem.
 * @param {object} options.track - Faixa normalizada do boot.
 * @param {string} options.language - Membro do enum LANGUAGE.
 * @param {object|null} options.subtitle - Legenda PT anexada quando houver.
 * @param {{ title: string, year?: number }} options.media - Metadados do Raflix.
 * @param {object} options.request - Pedido validado.
 * @param {string} options.origin - Origem do VidRift.
 * @returns {object} Stream montado por `buildStream`.
 * @throws {Error} Se a faixa ou os dados do formatador forem inválidos.
 * @example
 * buildOrionStream({ track, language: 'Dublado', subtitle: null, media, request, origin });
 */
export function buildOrionStream({ track, language, subtitle, media, request, origin }) {
  const fields = {
    url: track.url,
    format: formatDetails(media, request),
    provider: track.provider,
    type: 'hls',
    language,
    headers: playbackHeaders(`${origin}/`),
  };
  if (subtitle !== null) fields.subtitles = [subtitle];
  const quality = maxRung(track.rungs);
  if (quality !== null) fields.quality = `${quality}p`;
  return buildStream(fields);
}

/**
 * Tenta `/api/source` nos provedores `vela`, `titan` e `atlas`, nessa ordem, até um devolver streams.
 *
 * A falha de um provedor é isolada com aviso `[Raflix] Opção <provedor> descartada: <causa>`;
 * resposta com sucesso e lista vazia apenas passa para o próximo. Todos os streams montados são
 * `Legendado` com a legenda PT recebida.
 *
 * @param {object} options - Dados da contingência.
 * @param {string} options.origin - Origem do VidRift.
 * @param {string} options.path - Caminho do embed.
 * @param {string} options.token - `meta.playbackToken` do boot.
 * @param {object} options.subtitle - Legenda PT já confirmada.
 * @param {{ title: string, year?: number }} options.media - Metadados do Raflix.
 * @param {object} options.request - Pedido validado.
 * @returns {Promise<{ streams: object[], failures: string[] }>} Streams e causas saneadas das falhas.
 * @example
 * const contingency = await resolveContingency({ origin, path, token, subtitle, media, request });
 */
export async function resolveContingency({ origin, path, token, subtitle, media, request }) {
  const failures = [];
  for (const provider of PROVIDERS) {
    try {
      const streams = await fetchSourceStreams({ origin, path, token, provider, subtitle, media, request });
      if (streams.length > 0) return { streams, failures };
    } catch (error) {
      const cause = sanitizeMessage(error.message);
      failures.push(`${provider}: ${cause}`);
      console.warn(`[${ADDON}] Opção ${displayProvider(provider)} descartada: ${cause}`);
    }
  }
  return { streams: [], failures };
}

/**
 * Consulta um provedor de `/api/source` e monta seus streams HLS.
 * @param {object} options - Dados da consulta.
 * @param {string} options.origin - Origem do VidRift.
 * @param {string} options.path - Caminho do embed.
 * @param {string} options.token - `meta.playbackToken` do boot.
 * @param {string} options.provider - Identificador do provedor de contingência.
 * @param {object} options.subtitle - Legenda PT já confirmada.
 * @param {{ title: string, year?: number }} options.media - Metadados do Raflix.
 * @param {object} options.request - Pedido validado.
 * @returns {Promise<object[]>} Streams do provedor; vazio quando ele responde sem mídia.
 * @throws {Error} Em falha de rede, HTTP fora de 2xx, JSON inválido ou contrato inesperado.
 */
async function fetchSourceStreams({ origin, path, token, provider, subtitle, media, request }) {
  const params = { token, provider, parent: PARENT, hevc: '0' };
  const url = `${origin}/api/source/${path}?${new URLSearchParams(params).toString()}`;
  const body = await fetchJson(url, { profile: 'api', headers: { Referer: `${origin}/` } });
  if (!isPlainObject(body)) throw new Error('Resposta de /api/source não é objeto');
  if (body.success !== true) throw new Error(`Resposta de /api/source com success=${String(body.success)}`);
  if (!Array.isArray(body.streams)) throw new Error('Resposta de /api/source sem "streams"');

  const maxRes = Number.isInteger(body.maxRes) ? body.maxRes : null;
  const streams = [];
  for (const item of body.streams) {
    if (!isPlainObject(item)) throw new Error('Item de stream do /api/source inválido');
    const type = optionalText(item.type)?.toLowerCase();
    if (type !== 'hls') continue;
    const chosen = optionalText(item.url) || optionalText(item.proxyUrl);
    if (chosen === null) throw new Error('Stream do /api/source sem url nem proxyUrl');
    const finalUrl = readHttpUrl(chosen, `${origin}/`, 'stream do /api/source');
    const direct = item.direct === true;
    const quality = qualityFromUrl(finalUrl) || (body.streams.length === 1 ? maxResQuality(maxRes) : null);
    const headers = direct && !sameOrigin(finalUrl, origin) ? undefined : playbackHeaders(`${origin}/`);
    const fields = {
      url: finalUrl,
      format: formatDetails(media, request),
      provider: optionalText(item.provider) || displayProvider(provider),
      type: 'hls',
      language: LANGUAGE.SUBTITLED,
      subtitles: [subtitle],
    };
    if (quality !== null) fields.quality = quality;
    if (headers !== undefined) fields.headers = headers;
    streams.push(buildStream(fields));
  }
  return streams;
}

/**
 * Monta o campo `format` do formatador com título, ano e coordenadas do episódio.
 * @param {{ title: string, year?: number }} media - Metadados do Raflix.
 * @param {object} request - Pedido validado.
 * @returns {object} Detalhes aceitos por `buildStream`.
 */
function formatDetails(media, request) {
  const format = { template: FORMATTER.AUTO, addon: ADDON, title: media.title };
  if (media.year !== undefined) format.year = media.year;
  if (request.mediaType === 'tv') {
    format.season = request.season;
    format.episode = request.episode;
  }
  return format;
}

/**
 * Maior altura anunciada em `rungs`.
 * @param {number[]} rungs - Alturas em pixels.
 * @returns {number|null} Maior altura ou null quando não há valor válido.
 */
function maxRung(rungs) {
  if (!Array.isArray(rungs) || rungs.length === 0) return null;
  let max = 0;
  for (const height of rungs) {
    if (Number.isInteger(height) && height > max) max = height;
  }
  return max > 0 ? max : null;
}

/**
 * Extrai qualidade de um caminho conhecido da fonte.
 *
 * Aceita resolução colada (`index-s1080p`) e segmento de altura (`/720/`). Um número que não
 * seja altura conhecida, como o ano em `/2024/`, não vira qualidade.
 *
 * @param {string} url - URL do stream.
 * @returns {string|null} Qualidade "<n>p" ou null.
 */
function qualityFromUrl(url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // Caminho com percentual inválido: usa a forma bruta.
  }
  const compact = QUALITY_P.exec(path);
  if (compact) return `${compact[1]}p`;
  const segment = QUALITY_SEGMENT.exec(path);
  if (segment && KNOWN_HEIGHTS.includes(Number(segment[1]))) return `${segment[1]}p`;
  return null;
}

/**
 * Qualidade a partir de `maxRes`, aceita somente quando a fonte devolve um único stream.
 * @param {number|null} maxRes - Altura informada pela fonte.
 * @returns {string|null} Qualidade "<n>p" ou null.
 */
function maxResQuality(maxRes) {
  if (!Number.isInteger(maxRes) || maxRes < 360 || maxRes > 2160) return null;
  return `${maxRes}p`;
}

/**
 * Compara a origem de uma URL com a origem do player.
 * @param {string} url - URL do stream.
 * @param {string} origin - Origem do VidRift.
 * @returns {boolean} `true` quando os hosts coincidem.
 */
function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
