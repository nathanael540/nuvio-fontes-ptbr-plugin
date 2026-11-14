/**
 * Resolução do player Anivideo do AnimesDigital.
 *
 * A página `/video/a/<id>` publica um ou mais iframes do player Anivideo
 * (`api.anivideo.net/videohls.php`). O parâmetro `d` já é a URL do manifesto HLS: o provedor devolve
 * essa URL sem sondar a mídia, abrir a playlist ou ler o rótulo do player. O iframe da rota interna
 * `aHR0...` publica um `bg.mp4` de fundo e fica fora do contrato.
 *
 * Cada iframe Anivideo é uma opção independente: a falha de um é descartada com aviso e as demais
 * são preservadas; se todas falharem, o erro agregado sobe.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { loadHtml } from './html.js';

const ANIVIDEO_HOST = 'api.anivideo.net';
const ANIVIDEO_PATH = '/videohls.php';
const MEDIA_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 */

/**
 * @typedef {object} Coordinates
 * @property {number|null} season - Temporada pedida; null em filme.
 * @property {number|null} episode - Episódio pedido; null em filme.
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} label - Rótulo da opção nos avisos, ex.: `iframe 1`.
 * @property {string} src - `src` publicado no iframe.
 */

/**
 * @typedef {object} StreamContext
 * @property {string} providerName - Nome do provedor exibido pelo formatador.
 * @property {MediaInfo} media - Dados do TMDB.
 * @property {Coordinates} coordinates - Temporada e episódio pedidos.
 * @property {string|null} language - Idioma declarado pela fonte, ou null para a descoberta local.
 * @property {string} pageUrl - Página do episódio ou do filme, usada para resolver relativos.
 */

/**
 * Lê os iframes Anivideo e monta um stream por mídia válida.
 *
 * Opção com `d` ausente, vazio ou fora de http(s) falha isoladamente: gera aviso e é descartada. Se
 * nenhuma opção produzir stream e alguma tiver falhado, sobe um erro agregado com todas as causas.
 * Sem iframe Anivideo, devolve lista vazia (ausência reconhecida). URLs repetidas são unidas.
 *
 * @param {string} html - HTML da página `/video/a/<id>`.
 * @param {StreamContext} context - Dados da montagem.
 * @returns {Stream[]} Streams HLS montados e validados.
 * @throws {Error} Se o HTML não for texto, se o contrato recusar um stream ou se todas as opções
 *   falharem com pelo menos uma causa.
 * @example
 * const streams = extractStreams(html, context);
 * // streams[0].provider === 'Anivideo'
 */
export function extractStreams(html, context) {
  const options = readAnivideoOptions(html, context.pageUrl);
  const streams = [];
  const failures = [];
  const seen = new Set();

  for (const option of options) {
    try {
      const url = readMediaUrl(option.src);
      if (seen.has(url)) continue;
      seen.add(url);
      streams.push(buildAnivideoStream(url, context));
    } catch (error) {
      const reason = sanitizeMessage(error.message);
      failures.push(`${option.label}: ${reason}`);
      console.warn(`[${context.providerName}] Opção ${option.label} descartada: ${reason}`);
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) {
    throw new Error(`Nenhuma opção produziu stream: ${failures.join('; ')}`);
  }
  return [];
}

/**
 * Coleta os iframes do player Anivideo.
 * @param {string} html - HTML da página.
 * @param {string} pageUrl - Página de origem, para resolver `src` relativos.
 * @returns {PlayerOption[]} Iframes do Anivideo na ordem da página.
 * @throws {Error} Se o HTML não for texto.
 */
function readAnivideoOptions(html, pageUrl) {
  const $ = loadHtml(html);
  const options = [];
  const iframes = $('iframe');

  for (let index = 0; index < iframes.length; index += 1) {
    const src = iframes.eq(index).attr('src');
    if (typeof src !== 'string' || src.trim() === '') continue;
    let url;
    try {
      url = new URL(src, pageUrl);
    } catch {
      continue;
    }
    if (url.hostname !== ANIVIDEO_HOST || url.pathname !== ANIVIDEO_PATH) continue;
    options.push({ label: `iframe ${index + 1}`, src });
  }
  return options;
}

/**
 * Lê e valida o parâmetro `d` de um iframe do Anivideo.
 * @param {string} src - `src` do iframe.
 * @returns {string} URL do manifesto, como publicada.
 * @throws {Error} Se o endereço não for do Anivideo, se `d` faltar, vier vazio, não formar URL ou
 *   não usar http(s).
 */
function readMediaUrl(src) {
  const iframe = new URL(src);
  if (iframe.hostname !== ANIVIDEO_HOST || iframe.pathname !== ANIVIDEO_PATH) {
    throw new Error('iframe fora do player Anivideo');
  }
  const value = iframe.searchParams.get('d');
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('parâmetro d ausente no iframe do Anivideo');
  }
  const media = value.trim();
  let parsed;
  try {
    parsed = new URL(media);
  } catch (error) {
    throw new Error('parâmetro d não é URL válida', { cause: error });
  }
  if (!MEDIA_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error('parâmetro d fora de http(s)');
  }
  return media;
}

/**
 * Monta o stream HLS de uma opção do Anivideo.
 * @param {string} url - URL do manifesto.
 * @param {StreamContext} context - Dados da montagem.
 * @returns {Stream} Stream validado pelo contrato.
 * @throws {Error} Se `buildStream` recusar algum campo.
 */
function buildAnivideoStream(url, context) {
  const fields = {
    url,
    format: formatDetails(context),
    type: 'hls',
    provider: 'Anivideo',
  };
  if (context.language !== null) fields.language = context.language;
  return buildStream(fields);
}

/**
 * Detalhes de apresentação do stream para o formatador.
 * @param {StreamContext} context - Dados da montagem.
 * @returns {import('../_blocks/custom-formatter/index.mjs').FormatDetails} Valor do campo `format`.
 */
function formatDetails(context) {
  const format = {
    template: FORMATTER.AUTO,
    addon: context.providerName,
    title: context.media.title,
  };
  if (context.media.year !== null) format.year = context.media.year;
  if (context.coordinates.season !== null) {
    format.season = context.coordinates.season;
    format.episode = context.coordinates.episode;
  }
  return format;
}

/**
 * Remove URL das mensagens para os logs não carregarem mídia.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, '[url]');
}
