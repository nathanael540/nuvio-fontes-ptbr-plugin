/**
 * Opções DooPlay e players do Doramas Online.
 *
 * Cada `li.dooplay_player_option` é uma opção independente: o trailer é triagem e a falha de uma
 * opção gera aviso, preservando as demais. Os players observados são Booonceivu (JSON com
 * `midias`/`legendas`), IncVideo (`csst.online` → `incvideo1.online` com `Playerjs` e
 * redirecionamento para MP4) e o player interno `/do/`, que deve responder o mesmo JSON.
 */

import { HEADER_PROFILES } from '../_blocks/http/index.mjs';
import { extractScriptString } from '../_blocks/script-extract/index.mjs';
import { BOOONCEIVU_QUALITIES, buildOptionStreams } from './streams.js';

const SITE_HOST = 'doramasonline.net';
const BOOONCEIVU_HOST = /booonceivu/i;
const INCVIDEO_HOST = /(?:^|\.)(?:csst\.online|incvideo1\.online)$/i;
const JSON_TYPE = /application\/json/i;
const MP4_TYPE = /video\/mp4/i;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {import('../_blocks/tmdb-info/index.mjs').MediaInfo} MediaInfo
 * @typedef {import('../_blocks/stream-build/index.mjs').Stream} Stream
 * @typedef {import('./streams.js').PlayerSource} PlayerSource
 * @typedef {import('./streams.js').PlayerSubtitle} PlayerSubtitle
 */

/**
 * @typedef {object} PlayerOption
 * @property {string} nume - Valor de `data-nume`.
 * @property {string} post - Valor de `data-post`.
 * @property {string} type - Valor de `data-type`.
 * @property {string} label - Rótulo de `.title`.
 * @property {string} iframeUrl - URL absoluta do iframe da opção.
 * @property {string} [error] - Falha de estrutura da opção, preservada para o isolamento.
 */

/**
 * @typedef {object} PlayerContext
 * @property {string} pageUrl - URL final da página do episódio ou do filme.
 * @property {MediaInfo} media - Dados do TMDB.
 * @property {{ season: number, episode: number }|null} episode - Coordenada em séries; null em filmes.
 * @property {string} providerName - Nome do provedor nos logs e no formatador.
 */

/**
 * Resolve todas as opções de player da página em isolamento.
 * @param {string} html - HTML da página que publica os players.
 * @param {PlayerContext} context - Dados do pedido e da página.
 * @returns {Promise<Stream[]>} Streams das opções que resolveram; vazio quando todas são triagem ou ausência.
 * @throws {Error} Se todas as opções falharem e nenhuma produzir stream.
 * @example
 * const streams = await resolveOptions(pageHtml, { pageUrl, media, episode, providerName: 'Doramas Online' });
 */
export async function resolveOptions(html, context) {
  const options = readOptions(html, context.pageUrl);
  const streams = [];
  const failures = [];

  for (const option of options) {
    try {
      if (option.error !== undefined) throw new Error(option.error);
      const resolved = await resolveOption(option, context);
      if (resolved !== null) streams.push(...resolved);
    } catch (error) {
      failures.push({ label: option.label, error });
      console.warn(`[${context.providerName}] Opção ${option.label} descartada: ${error.message}`);
    }
  }

  if (streams.length === 0 && failures.length > 0) {
    const causes = failures.map(({ label, error }) => `${label}=${error.message}`).join('; ');
    throw new Error(`Nenhuma opção de player produziu stream: ${causes}`);
  }
  return streams;
}

/**
 * Lê as opções DooPlay e associa cada uma ao contêiner `#source-player-<nume>`.
 * @param {string} html - HTML da página.
 * @param {string} pageUrl - URL final da página, usada para resolver `iframe` relativo.
 * @returns {PlayerOption[]} Opções reais, sem trailer.
 * @throws {Error} Se a página não tiver a lista de opções ou uma opção não tiver rótulo, contêiner ou iframe.
 * @example
 * readOptions(html, 'https://doramasonline.net/br/episodio/.../');
 * // [{ nume: '1', post: '974', type: 'tv', label: 'DUBLADO', iframeUrl: 'https://sk-...booonceivu.shop/?id=...' }]
 */
export function readOptions(html, pageUrl) {
  if (typeof html !== 'string') throw new Error('Página do Doramas Online: HTML inválido');
  const $ = loadHtml(html);
  if ($('#playeroptionsul').length === 0) {
    throw new Error('Página do Doramas Online sem #playeroptionsul');
  }

  const options = [];
  const items = $('li.dooplay_player_option');
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const nume = item.attr('data-nume');
    const post = item.attr('data-post');
    const type = item.attr('data-type');
    const label = item.find('.title').eq(0).text().trim();
    if (nume === undefined || post === undefined || type === undefined) {
      throw new Error(`Opção ${index + 1} do Doramas Online sem data-nume, data-post ou data-type`);
    }
    if (isTrailer(nume, label)) continue;
    if (label === '') throw new Error(`Opção ${nume} do Doramas Online sem rótulo em .title`);

    const container = $(`#source-player-${nume}`);
    if (container.length === 0) {
      options.push({ nume, post, type, label, iframeUrl: pageUrl, error: `Opção ${label} do Doramas Online sem contêiner #source-player-${nume}` });
      continue;
    }
    const iframe = container.find('iframe').eq(0);
    const src = iframe.attr('src') || iframe.attr('data-src');
    if (!src) {
      options.push({ nume, post, type, label, iframeUrl: pageUrl, error: `Opção ${label} do Doramas Online sem iframe` });
      continue;
    }

    options.push({ nume, post, type, label, iframeUrl: new URL(src, pageUrl).href });
  }
  return options;
}

/**
 * Resolve uma opção pelo host do iframe.
 * @param {PlayerOption} option - Opção lida.
 * @param {PlayerContext} context - Dados do pedido.
 * @returns {Promise<Stream[]|null>} Streams ou `null` para triagem/ausência.
 * @throws {Error} Em falha do player da opção.
 */
async function resolveOption(option, context) {
  const target = new URL(option.iframeUrl);
  const host = target.hostname.toLowerCase();

  if (BOOONCEIVU_HOST.test(host)) {
    return resolveJsonPlayer(option, context, { provider: 'Booonceivu', useMode: true, requireHls: true, qualityMap: BOOONCEIVU_QUALITIES });
  }
  if (INCVIDEO_HOST.test(host)) return resolveIncVideo(option, context, option.iframeUrl);
  if (isSiteHost(host) && isAvisoPath(target.pathname)) return resolveAviso(option, context);
  if (isSiteHost(host) && target.pathname.startsWith('/do/')) {
    return resolveJsonPlayer(option, context, { provider: 'Doramas Online', useMode: false, requireHls: false, qualityMap: {} });
  }
  return null;
}

/**
 * Resolve o player que publica JSON com `status`, `midias` e `legendas`.
 * @param {PlayerOption} option - Opção lida.
 * @param {PlayerContext} context - Dados do pedido.
 * @param {{ provider: string, useMode: boolean, requireHls: boolean, qualityMap: Object<string, string> }} settings - Comportamento do player.
 * @returns {Promise<Stream[]|null>} Streams ou `null` quando o player reconhece ausência.
 * @throws {Error} Em HTTP fora de 2xx, resposta que não é JSON, JSON inválido ou mídia inválida.
 */
async function resolveJsonPlayer(option, context, settings) {
  const requestUrl = settings.useMode
    ? withQuery(option.iframeUrl, 'mode', 'to-salvando-seu-ip')
    : option.iframeUrl;
  const response = await fetch(requestUrl, {
    headers: { ...HEADER_PROFILES.player, Referer: context.pageUrl },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} do player ${settings.provider}`);

  const contentType = response.headers.get('content-type') || '';
  if (!JSON_TYPE.test(contentType)) {
    throw new Error(`Player ${settings.provider} respondeu ${contentType || 'sem Content-Type'} em vez de JSON`);
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON inválido do player ${settings.provider}: ${error.message}`, { cause: error });
  }

  if (typeof data !== 'object' || data === null || data.status !== 'success') return null;
  if (data.midias === undefined || data.midias === null) return null;
  if (!Array.isArray(data.midias)) throw new Error(`Player ${settings.provider} com midias fora de lista`);
  if (data.midias.length === 0) return null;

  const sources = data.midias.map((midia, index) => readJsonSource(midia, settings, index));
  const subtitles = readJsonSubtitles(data.legendas, settings.provider);
  return buildOptionStreams(
    {
      media: context.media,
      episode: context.episode,
      providerName: context.providerName,
      label: option.label,
      embedTitle: null,
      provider: settings.provider,
      type: 'hls',
      qualityMap: settings.qualityMap,
    },
    sources,
    subtitles,
  );
}

/**
 * Lê uma mídia do JSON do player.
 * @param {*} midia - Item de `midias`.
 * @param {{ provider: string, requireHls: boolean }} settings - Comportamento do player.
 * @param {number} index - Posição para a mensagem de erro.
 * @returns {PlayerSource} Mídia validada.
 * @throws {Error} Se a mídia não for objeto, faltar URL, a URL não for http(s) ou não for HLS quando exigido.
 */
function readJsonSource(midia, settings, index) {
  if (typeof midia !== 'object' || midia === null) {
    throw new Error(`Mídia ${index + 1} do player ${settings.provider} deve ser objeto`);
  }
  const url = midia.url;
  assertHttpUrl(url, `Mídia ${index + 1} do player ${settings.provider}`);
  if (settings.requireHls && !new URL(url).pathname.toLowerCase().endsWith('.m3u8')) {
    throw new Error(`Mídia ${index + 1} do player ${settings.provider} sem caminho .m3u8`);
  }
  const quality = typeof midia.qualidade === 'string' ? midia.qualidade : null;
  return { url, quality };
}

/**
 * Lê as legendas do JSON do player.
 * @param {*} raw - Valor de `legendas`.
 * @param {string} provider - Nome do player nas mensagens.
 * @returns {PlayerSubtitle[]} Legendas publicadas; vazio quando o campo não existe.
 * @throws {Error} Se `legendas` não for lista ou um item não tiver URL e rótulo.
 */
function readJsonSubtitles(raw, provider) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error(`Player ${provider} com legendas fora de lista`);
  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Legenda ${index + 1} do player ${provider} deve ser objeto`);
    }
    assertHttpUrl(item.url, `Legenda ${index + 1} do player ${provider}`);
    if (typeof item.label !== 'string' || item.label.trim() === '') {
      throw new Error(`Legenda ${index + 1} do player ${provider} sem label`);
    }
    return { url: item.url, label: item.label.trim() };
  });
}

/**
 * Resolve o invólucro `/aviso/` e classifica o host de destino.
 * @param {PlayerOption} option - Opção lida.
 * @param {PlayerContext} context - Dados do pedido.
 * @returns {Promise<Stream[]|null>} Streams do IncVideo ou `null` para host não suportado.
 * @throws {Error} Se o aviso não tiver `url` ou a URL decodificada for inválida.
 */
async function resolveAviso(option, context) {
  const raw = new URL(option.iframeUrl).searchParams.get('url');
  if (!raw) throw new Error('Aviso do Doramas Online sem parâmetro url');
  const target = decodeAvisoTarget(raw);
  if (!INCVIDEO_HOST.test(target.hostname.toLowerCase())) return null;
  return resolveIncVideo(option, context, target.href);
}

/**
 * Decodifica o destino do aviso até duas vezes.
 * @param {string} raw - Valor do parâmetro `url`.
 * @returns {URL} URL de destino.
 * @throws {Error} Se o valor não puder ser decodificado como URL.
 */
function decodeAvisoTarget(raw) {
  let value = raw;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  try {
    return new URL(value);
  } catch {
    throw new Error('Aviso do Doramas Online com URL de destino inválida');
  }
}

/**
 * Resolve um embed IncVideo até o MP4 de cada fonte publicada.
 * @param {PlayerOption} option - Opção lida.
 * @param {PlayerContext} context - Dados do pedido.
 * @param {string} embedUrl - URL do embed (`csst.online` ou `incvideo1.online`).
 * @returns {Promise<Stream[]|null>} Streams ou `null` quando o embed termina em host não suportado.
 * @throws {Error} Se o embed falhar, não publicar `Playerjs`/`file` ou nenhuma fonte produzir MP4.
 */
async function resolveIncVideo(option, context, embedUrl) {
  const embed = await openEmbed(embedUrl, context.pageUrl);
  if (embed === null) return null;

  const file = extractScriptString(embed.html, 'file');
  if (file === null) throw new Error('Embed IncVideo sem Playerjs/file');
  const sources = parsePlayerjsSources(file);
  if (sources.length === 0) throw new Error('Embed IncVideo sem URLs /get_file/');

  const streams = [];
  const failures = [];
  for (const source of sources) {
    try {
      const resolved = await resolveIncVideoSource(source, embed);
      if (resolved !== null) {
        streams.push(...buildOptionStreams(
          {
            media: context.media,
            episode: context.episode,
            providerName: context.providerName,
            label: option.label,
            embedTitle: embed.title,
            provider: 'IncVideo',
            type: 'mp4',
            qualityMap: {},
          },
          [resolved],
          [],
        ));
      }
    } catch (error) {
      failures.push(error);
    }
  }

  if (streams.length > 0) return streams;
  if (failures.length > 0) {
    const causes = failures.map((error) => error.message).join('; ');
    throw new Error(`Nenhuma fonte do IncVideo produziu MP4: ${causes}`);
  }
  return null;
}

/**
 * Abre o embed IncVideo e captura o `Set-Cookie` publicado.
 * @param {string} embedUrl - URL do embed.
 * @param {string} pageUrl - URL da página do episódio/filme, usada como `Referer`.
 * @returns {Promise<{ url: string, html: string, title: string|null, cookie: string }|null>} Embed aberto ou `null` para host não suportado.
 * @throws {Error} Em HTTP fora de 2xx ou resposta sem URL final.
 */
async function openEmbed(embedUrl, pageUrl) {
  const response = await fetch(embedUrl, {
    redirect: 'follow',
    headers: { ...HEADER_PROFILES.page, Referer: pageUrl },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} no embed IncVideo`);
  if (typeof response.url !== 'string' || response.url === '') {
    throw new Error('Embed IncVideo sem URL final');
  }

  const finalUrl = new URL(response.url);
  if (!INCVIDEO_HOST.test(finalUrl.hostname.toLowerCase())) return null;

  const html = await response.text();
  const title = /<title>([^<]*)<\/title>/i.exec(html);
  return {
    url: response.url,
    html,
    title: title ? title[1].trim() : null,
    cookie: readCookie(response),
  };
}

/**
 * Lê o `Set-Cookie` da resposta sem registrar o valor.
 * @param {Response} response - Resposta do embed.
 * @returns {string} Cabeçalho `Cookie` com os pares capturados; vazio quando não há cookie.
 */
function readCookie(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
      .map((cookie) => cookie.split(';')[0].trim())
      .filter((cookie) => cookie !== '')
      .join('; ');
  }
  const raw = headers.get('set-cookie');
  return typeof raw === 'string' && raw !== '' ? raw.split(';')[0].trim() : '';
}

/**
 * Extrai as URLs `get_file` e a qualidade de cada uma do campo `file` do Playerjs.
 * @param {string} file - Valor desescapado do campo `file`.
 * @returns {PlayerSource[]} Fontes na ordem publicada.
 * @example
 * parsePlayerjsSources('[360p]https://incvideo/get_file/a.mp4/,[720p]https://incvideo/get_file/b.mp4/');
 * // [{ url: 'https://incvideo/get_file/a.mp4/', quality: '360p' }, ...]
 */
export function parsePlayerjsSources(file) {
  if (typeof file !== 'string') throw new Error('Campo file do Playerjs inválido');
  const sources = [];
  const seen = new Set();
  const pattern = /(?:\[([^\]]+)\])?\s*(https?:\/\/[^,\s"']+)/g;
  let match;
  while ((match = pattern.exec(file)) !== null) {
    const url = match[2];
    if (!url.includes('/get_file/') || seen.has(url)) continue;
    seen.add(url);
    sources.push({ url, quality: match[1] === undefined ? null : match[1].trim() });
  }
  return sources;
}

/**
 * Segue uma fonte `get_file` até o MP4 final.
 * @param {PlayerSource} source - Fonte publicada.
 * @param {{ url: string, cookie: string }} embed - Embed aberto.
 * @returns {Promise<PlayerSource|null>} Fonte final ou `null` quando não há redirecionamento.
 * @throws {Error} Se a fonte não redirecionar, o destino não for MP4 ou responder fora de 200/206.
 */
async function resolveIncVideoSource(source, embed) {
  const headers = { ...HEADER_PROFILES.player, Referer: embed.url };
  if (embed.cookie !== '') headers.Cookie = embed.cookie;

  const response = await fetch(source.url, { redirect: 'manual', headers });
  if (!REDIRECT_STATUSES.includes(response.status)) {
    throw new Error(`Fonte ${source.quality || 'sem rótulo'} do IncVideo respondeu HTTP ${response.status} sem redirecionamento`);
  }
  const location = response.headers.get('location');
  if (!location) throw new Error(`Fonte ${source.quality || 'sem rótulo'} do IncVideo sem Location`);

  const finalUrl = new URL(location, source.url).href;
  const media = await fetch(finalUrl, {
    redirect: 'follow',
    headers: { ...HEADER_PROFILES.player, Range: 'bytes=0-0' },
  });
  if (media.status !== 200 && media.status !== 206) {
    throw new Error(`MP4 da fonte ${source.quality || 'sem rótulo'} respondeu HTTP ${media.status}`);
  }
  if (typeof media.url !== 'string' || media.url === '') {
    throw new Error(`MP4 da fonte ${source.quality || 'sem rótulo'} sem URL final`);
  }
  const contentType = media.headers.get('content-type') || '';
  const isMp4Path = new URL(media.url).pathname.toLowerCase().endsWith('.mp4');
  if (!MP4_TYPE.test(contentType) && !isMp4Path) {
    throw new Error(`Destino da fonte ${source.quality || 'sem rótulo'} não é MP4 (${contentType || 'sem Content-Type'})`);
  }
  return { url: media.url, quality: source.quality };
}

/**
 * Indica se a opção é o trailer do YouTube.
 * @param {string} nume - Valor de `data-nume`.
 * @param {string} label - Rótulo da opção.
 * @returns {boolean}
 */
function isTrailer(nume, label) {
  return /trailer/i.test(nume) || /trailer/i.test(label);
}

/**
 * Indica se o host pertence ao site da fonte.
 * @param {string} host - Host em minúsculas.
 * @returns {boolean}
 */
function isSiteHost(host) {
  return host === SITE_HOST || host.endsWith(`.${SITE_HOST}`);
}

/**
 * Indica se o caminho é o invólucro `/aviso/`.
 * @param {string} pathname - Caminho da URL.
 * @returns {boolean}
 */
function isAvisoPath(pathname) {
  return pathname.replace(/\/+$/, '') === '/aviso';
}

/**
 * Monta uma URL com um parâmetro substituído, sem depender da atualização de `URL.href`.
 * @param {string} url - URL original.
 * @param {string} name - Nome do parâmetro.
 * @param {string} value - Valor do parâmetro.
 * @returns {string} URL com a query final.
 */
function withQuery(url, name, value) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  params.set(name, value);
  return `${parsed.origin}${parsed.pathname}?${params.toString()}`;
}

/**
 * Exige uma URL http(s).
 * @param {*} url - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens.
 * @returns {void}
 * @throws {Error} Se a URL for inválida ou não usar http(s).
 */
function assertHttpUrl(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} com URL inválida`);
  }
  if (!HTTP_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(`${label} deve usar http ou https`);
  }
}

/**
 * Carrega o HTML com o cheerio fornecido pelo app.
 * @param {string} html - Documento HTML.
 * @returns {*} Instância do cheerio.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}
