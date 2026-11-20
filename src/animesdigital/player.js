/**
 * Resolução do player Anivideo do AnimesDigital.
 *
 * A página `/video/a/<id>` publica iframes do player Anivideo em duas formas. A rota legada
 * `api.anivideo.net/videohls.php?d=<manifesto>` entrega a URL HLS no parâmetro `d`. A rota atual
 * `api.anivideo.net/cdn/<token>` só responde 2xx com `Sec-Fetch-Dest: iframe` e publica o manifesto
 * nas `sources` do jwplayer; o provedor abre essa página e lê o campo `file`. A rota interna
 * `aHR0...` publica um `bg.mp4` de fundo e fica fora do contrato.
 *
 * Cada iframe Anivideo é uma opção independente: a falha de um é descartada com aviso e as demais
 * são preservadas; se todas falharem, o erro agregado sobe.
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchPage } from '../_blocks/http/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';
import { loadHtml } from './html.js';

const ANIVIDEO_HOST = 'api.anivideo.net';
const ANIVIDEO_LEGACY_PATH = '/videohls.php';
const ANIVIDEO_CDN_PATH = '/cdn/';
const HLS_PATH = /\.m3u8$/i;
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
 * @property {'legacy'|'cdn'} kind - Forma do iframe: parâmetro `d` ou página `/cdn/`.
 * @property {string} src - `src` absoluto publicado no iframe.
 */

/**
 * @typedef {object} MediaOption
 * @property {string} url - URL do manifesto HLS.
 * @property {Record<string, string>} [headers] - Cabeçalhos de reprodução, quando a mídia exige.
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
 * Opção com `d` ausente, vazio ou fora de http(s), ou página `/cdn/` sem fonte HLS, falha
 * isoladamente: gera aviso e é descartada. Se nenhuma opção produzir stream e alguma tiver falhado,
 * sobe um erro agregado com todas as causas. Sem iframe Anivideo, devolve lista vazia (ausência
 * reconhecida). URLs repetidas são unidas.
 *
 * @param {string} html - HTML da página `/video/a/<id>`.
 * @param {StreamContext} context - Dados da montagem.
 * @returns {Promise<Stream[]>} Streams HLS montados e validados.
 * @throws {Error} Se o HTML não for texto, se o contrato recusar um stream ou se todas as opções
 *   falharem com pelo menos uma causa.
 * @example
 * const streams = await extractStreams(html, context);
 * // streams[0].provider === 'Anivideo'
 */
export async function extractStreams(html, context) {
  const options = readAnivideoOptions(html, context.pageUrl);
  const streams = [];
  const failures = [];
  const seen = new Set();

  for (const option of options) {
    try {
      const medias = await resolveOption(option, context.pageUrl);
      for (const media of medias) {
        if (seen.has(media.url)) continue;
        seen.add(media.url);
        streams.push(buildAnivideoStream(media.url, context, media.headers));
      }
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
 * Coleta os iframes do player Anivideo nas duas formas publicadas.
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
    if (url.hostname !== ANIVIDEO_HOST) continue;

    if (url.pathname === ANIVIDEO_LEGACY_PATH) {
      options.push({ label: `iframe ${index + 1}`, kind: 'legacy', src: url.href });
      continue;
    }
    if (url.pathname.startsWith(ANIVIDEO_CDN_PATH)) {
      options.push({ label: `iframe ${index + 1}`, kind: 'cdn', src: url.href });
    }
  }
  return options;
}

/**
 * Resolve uma opção do Anivideo até as URLs de manifesto.
 * @param {PlayerOption} option - Iframe coletado.
 * @param {string} pageUrl - Página do episódio ou do filme, para o `Referer`.
 * @returns {Promise<MediaOption[]>} Manifestos com os cabeçalhos exigidos por cada forma.
 * @throws {Error} Se o iframe legado não tiver `d` válido ou se a página `/cdn/` não publicar fonte HLS.
 */
async function resolveOption(option, pageUrl) {
  if (option.kind === 'legacy') {
    return [{ url: readMediaUrl(option.src) }];
  }

  const urls = await readCdnMediaUrls(option.src, pageUrl);
  return urls.map((url) => ({ url, headers: { Referer: siteReferer(pageUrl) } }));
}

/**
 * Abre a página `/cdn/` do Anivideo e lê as `sources` do jwplayer.
 *
 * A rota atual só responde 2xx com `Sec-Fetch-Dest: iframe`, o mesmo contexto em que o site a
 * embute. O manifesto é o campo `file` de cada fonte; a fonte que não for HLS `.m3u8` é ignorada.
 *
 * @param {string} src - URL absoluta do iframe `/cdn/`.
 * @param {string} pageUrl - Página do episódio ou do filme, usada como `Referer`.
 * @returns {Promise<string[]>} Manifestos HLS distintos, na ordem do player.
 * @throws {Error} Se o player responder fora de 2xx, não tiver `sources` ou não publicar fonte HLS.
 */
async function readCdnMediaUrls(src, pageUrl) {
  const page = await fetchPage(src, {
    headers: { Referer: siteReferer(pageUrl), 'Sec-Fetch-Dest': 'iframe' },
  });
  const block = readSourcesBlock(page.text);
  if (block === null) throw new Error('Player Anivideo sem sources');

  const urls = [];
  const seen = new Set();
  for (const match of block.matchAll(/(?:^|[,{]\s*)file\s*:\s*["']([^"']+)["']/g)) {
    const value = match[1].replace(/\\\//g, '/');
    const url = httpMediaUrl(value);
    if (url === null || seen.has(url)) continue;
    if (!HLS_PATH.test(new URL(url).pathname)) continue;
    seen.add(url);
    urls.push(url);
  }
  if (urls.length === 0) throw new Error('Player Anivideo sem fonte HLS');
  return urls;
}

/**
 * Lê o conteúdo do array `sources` de um setup do jwplayer, respeitando strings e escapes.
 * @param {string} html - HTML do player.
 * @returns {string|null} Texto interno do array, ou `null` quando `sources` não existe.
 * @throws {Error} Se o array abrir e não fechar.
 */
function readSourcesBlock(html) {
  const match = /(?:^|[^\w$])sources\s*:\s*\[/.exec(html);
  if (match === null) return null;

  const start = match.index + match[0].length;
  let depth = 1;
  let quote = null;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '[') {
      depth += 1;
      continue;
    }
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index);
    }
  }
  throw new Error('Player Anivideo com sources sem fechamento');
}

/**
 * Converte um valor em URL http(s), ou `null` quando não for URL usável.
 * @param {string} value - Valor publicado no player.
 * @returns {string|null} URL normalizada ou `null`.
 */
function httpMediaUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return MEDIA_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
}

/**
 * Raiz do site, usada como `Referer` do player e do manifesto.
 * @param {string} pageUrl - Página do episódio ou do filme.
 * @returns {string} Origem com barra final.
 */
function siteReferer(pageUrl) {
  return `${new URL(pageUrl).origin}/`;
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
  if (iframe.hostname !== ANIVIDEO_HOST || iframe.pathname !== ANIVIDEO_LEGACY_PATH) {
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
 * @param {Record<string, string>} [headers] - Cabeçalhos de reprodução, quando exigidos.
 * @returns {Stream} Stream validado pelo contrato.
 * @throws {Error} Se `buildStream` recusar algum campo.
 */
function buildAnivideoStream(url, context, headers) {
  const fields = {
    url,
    format: formatDetails(context),
    type: 'hls',
    provider: 'Anivideo',
  };
  if (context.language !== null) fields.language = context.language;
  if (headers !== undefined) fields.headers = headers;
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
 * Remove URL das mensagens para os logs não carregarem mídia ou token.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
function sanitizeMessage(message) {
  return String(message).replace(/https?:\/\/\S+/gi, '[url]');
}
