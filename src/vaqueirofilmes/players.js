/** Players da VaqueiroFilmes: botões da página, EmbedPlay e seleção das opções dubladas. */
import { fetchJson, fetchPage } from '../_blocks/http/index.mjs';
import { normalizeText } from '../_blocks/slugify/index.mjs';
import { resolveByseStreams } from './byse.js';

const EMBEDPLAY_HOST = 'embedplayapi.top';
const BYSE_HOST = 'embedplaybyse.top';
const PLAYER_LABEL = /embedplay/i;

/**
 * Resolve as opções de player de um filme confirmado.
 * @param {object} media - Dados do TMDB.
 * @param {string} movieUrl - Página confirmada do filme.
 * @param {string} providerName - Nome exibido pelo formatador.
 * @returns {Promise<{ streams: object[], failures: string[] }>} Streams e falhas isoladas por opção.
 * @throws {Error} Em página sem botões, iframe de host inesperado ou ausência do grupo Dublado.
 */
export async function resolveStreams(media, movieUrl, providerName) {
  const listUrl = `${stripQuery(movieUrl)}?video=0`;
  const listPage = await fetchPage(listUrl, { headers: { Referer: movieUrl } });
  const sources = readSourceButtons(listPage.text, listPage.url);
  if (!sources.length) throw new Error('Página do filme sem botões de player');

  const embed = sources.find((source) => PLAYER_LABEL.test(source.label));
  if (!embed) {
    for (const source of sources) {
      console.log(`[VaqueiroFilmes] Opção ${source.label} descartada por triagem: EmbedPlay ausente`);
    }
    return { streams: [], failures: [] };
  }
  for (const source of sources) {
    if (source !== embed) console.log(`[VaqueiroFilmes] Opção ${source.label} descartada por triagem: host não suportado`);
  }

  const variant = await fetchPage(embed.url, { headers: { Referer: listPage.url } });
  const embedUrl = readEmbedIframe(variant.text, variant.url);
  const chain = await openEmbedPlay(embedUrl, variant.url);
  return playOptions(chain, media, providerName);
}

/**
 * Lê os botões `.vp-source-btn` da variante `?video=0`.
 * @param {string} html - HTML da página.
 * @param {string} pageUrl - URL da página.
 * @returns {Array<{ label: string, url: string }>} Botões na ordem da página.
 * @throws {Error} Se um botão não tiver rótulo ou endereço.
 */
function readSourceButtons(html, pageUrl) {
  const $ = loadHtml(html);
  const buttons = $('.vp-source-btn');
  const sources = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const button = buttons.eq(index);
    const label = button.text().trim();
    const href = button.attr('href');
    if (!label) throw new Error(`Botão de player ${index + 1} sem rótulo`);
    if (!href) throw new Error(`Botão ${label} sem endereço`);
    sources.push({ label, url: httpUrl(href, pageUrl) });
  }
  return sources;
}

/**
 * Lê o iframe ativo da variante EmbedPlay e exige o host `embedplayapi.top`.
 * @param {string} html - HTML da variante.
 * @param {string} pageUrl - URL da variante.
 * @returns {string} URL do iframe.
 * @throws {Error} Se não houver iframe ou se o host não for o esperado.
 */
function readEmbedIframe(html, pageUrl) {
  const $ = loadHtml(html);
  const frames = $('iframe');
  let firstHost = null;
  for (let index = 0; index < frames.length; index += 1) {
    const src = frames.eq(index).attr('src');
    if (!src) continue;
    const url = httpUrl(src, pageUrl);
    const host = new URL(url).hostname;
    if (host === EMBEDPLAY_HOST) return url;
    if (firstHost === null) firstHost = host;
  }
  if (firstHost === null) throw new Error('Iframe do EmbedPlay ausente');
  throw new Error(`Iframe de host não suportado: ${firstHost}`);
}

/**
 * Abre o embed da EmbedPlay e obtém o link da página de opções de áudio.
 * @param {string} embedUrl - Iframe `embedplayapi.top/embed/<tmdb>`.
 * @param {string} referer - URL da variante que contém o iframe.
 * @returns {Promise<{ pageUrl: string, html: string }>} Página de opções.
 * @throws {Error} Se faltar identificador, servidor ou link válido na resposta.
 */
async function openEmbedPlay(embedUrl, referer) {
  const embedPage = await fetchPage(embedUrl, { headers: { Referer: referer } });
  const $ = loadHtml(embedPage.text);
  const movieId = $('#embed-player').attr('data-movie-id');
  if (!movieId) throw new Error('Identificador do filme ausente no embed da EmbedPlay');
  const server = $('.server[data-id]').eq(0);
  const serverId = server.attr('data-id');
  if (!serverId) throw new Error('Servidor ausente no embed da EmbedPlay');

  const query = new URLSearchParams({
    id: serverId,
    movie: movieId,
    is_init: 'false',
    captcha: '',
    ref: '',
  });
  const linkUrl = `${new URL(embedPage.url).origin}/ajax/get_stream_link?${query}`;
  const data = await fetchJson(linkUrl, {
    profile: 'api',
    headers: { Referer: embedPage.url },
  });
  if (!data || data.success !== true) throw new Error('EmbedPlay recusou a consulta do link');
  const link = httpUrl(data.data && data.data.link, embedPage.url);
  const optionsPage = await fetchPage(link, { headers: { Referer: embedPage.url } });
  return { pageUrl: optionsPage.url, html: optionsPage.text };
}

/**
 * Lê o grupo Dublado, resolve cada opção e preserva as demais quando uma falha.
 * @param {{ pageUrl: string, html: string }} chain - Página de opções.
 * @param {object} media - Dados do TMDB.
 * @param {string} providerName - Nome exibido pelo formatador.
 * @returns {Promise<{ streams: object[], failures: string[] }>} Streams e falhas por opção.
 * @throws {Error} Se o grupo Dublado ou suas opções não existirem.
 */
async function playOptions(chain, media, providerName) {
  const $ = loadHtml(chain.html);
  const target = readDubbedTarget($);
  const items = readDubbedItems($, target);
  triageOtherGroups($, target);

  const streams = [];
  const failures = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const label = item.find('.player_select_name').text().trim() || `Opção ${index + 1}`;
    try {
      const videoUrl = await readPlayerUrl(chain.pageUrl, item.attr('data-id'));
      const host = new URL(videoUrl).hostname;
      if (host !== BYSE_HOST) {
        console.log(`[VaqueiroFilmes] ${optionDescription(label)} descartada por triagem: host ${host} não suportado`);
        continue;
      }
      const found = await resolveByseStreams(videoUrl, media, providerName);
      streams.push(...found);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.warn(`[VaqueiroFilmes] ${optionDescription(label)} descartada: ${error.message}`);
    }
  }
  return { streams, failures };
}

/**
 * Lê o `data-target` do seletor de áudio cujo texto identifica Dublado.
 * @param {*} $ - Instância do cheerio.
 * @returns {string} Valor de `data-target` do grupo Dublado.
 * @throws {Error} Se o seletor ou o grupo não existir.
 */
function readDubbedTarget($) {
  const tabs = $('.select_language');
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs.eq(index);
    if (normalizeText(tab.text()).includes('dublado')) {
      const target = tab.attr('data-target');
      if (!target) throw new Error('Seletor Dublado sem data-target');
      return target;
    }
  }
  throw new Error('Grupo Dublado ausente na página de opções');
}

/**
 * Lê as opções do grupo Dublado.
 * @param {*} $ - Instância do cheerio.
 * @param {string} target - Valor de `data-target` do grupo.
 * @returns {*} Coleção de `.player_select_item`.
 * @throws {Error} Se o grupo ou suas opções não existirem.
 */
function readDubbedItems($, target) {
  const groups = $('.players_select_items');
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups.eq(index);
    if (group.attr('data-target') !== target) continue;
    const items = group.find('.player_select_item');
    if (!items.length) throw new Error('Grupo Dublado sem opções');
    return items;
  }
  throw new Error('Opções do grupo Dublado ausentes');
}

/**
 * Registra a triagem dos grupos que não são Dublado.
 * @param {*} $ - Instância do cheerio.
 * @param {string} target - Valor de `data-target` do grupo Dublado.
 * @returns {void}
 */
function triageOtherGroups($, target) {
  const groups = $('.players_select_items');
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups.eq(index);
    if (group.attr('data-target') === target) continue;
    console.log(`[VaqueiroFilmes] Grupo ${group.attr('data-target') || 'desconhecido'} descartado por triagem`);
  }
}

/**
 * Descrição de uma opção para os logs, sem repetir a palavra "Opção" quando o rótulo já a traz.
 * @param {string} label - Rótulo da opção.
 * @returns {string}
 */
function optionDescription(label) {
  return /^op[cç][aã]o\b/i.test(label) ? label : `Opção ${label}`;
}

/**
 * Consulta `getPlayer` de uma opção dublada.
 * @param {string} pageUrl - Página de opções.
 * @param {string|undefined} videoId - `data-id` da opção.
 * @returns {Promise<string>} URL do player da opção.
 * @throws {Error} Se a opção não tiver ID, a API recusar ou a URL for inválida.
 */
async function readPlayerUrl(pageUrl, videoId) {
  if (typeof videoId !== 'string' || videoId.trim() === '') throw new Error('data-id ausente');
  const apiUrl = `${new URL(pageUrl).origin}/api`;
  const data = await fetchJson(apiUrl, {
    method: 'POST',
    profile: 'api',
    headers: { Referer: pageUrl },
    form: { action: 'getPlayer', video_id: videoId.trim() },
  });
  if (!data || String(data.errors) !== '0') throw new Error('getPlayer recusou a opção');
  return httpUrl(data.data && data.data.video_url, pageUrl);
}

/**
 * Carrega o cheerio durante o pedido, como exige o runtime do app.
 * @param {string} html - HTML a interpretar.
 * @returns {*} Função `$` do cheerio.
 * @throws {Error} Se o módulo não estiver disponível.
 */
function loadHtml(html) {
  const { load } = require('cheerio-without-node-native');
  return load(html);
}

/**
 * Converte um endereço em URL HTTP(S) absoluta.
 * @param {*} value - Endereço absoluto ou relativo.
 * @param {string} base - Base para endereços relativos.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o endereço faltar ou não usar HTTP(S).
 */
function httpUrl(value, base) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Endereço obrigatório ausente');
  const url = new URL(value, base);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Endereço não é HTTP(S)');
  return url.href;
}

/**
 * Remove query e fragmento de uma URL.
 * @param {string} url - URL recebida.
 * @returns {string} Origem e caminho, sem query.
 */
function stripQuery(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}
