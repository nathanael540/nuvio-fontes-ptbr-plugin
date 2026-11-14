/**
 * Travessia do gate novefx até o MP4 do capítulo.
 */

import { HEADER_PROFILES, fetchPage } from '../_blocks/http/index.mjs';
import { loadHtml } from './html.js';

const TOTAL_CHAPTERS = /totalChapters\s*=\s*(\d+)/;
const CHAPTER_TEMPLATE = /originalUrl\s*=\s*`([^`]*\/video\/[A-Za-z0-9]+-)\$\{chapterStr\}/;
const REDIRECT_BASE = /finalUrl\s*=\s*`([^`]*)\$\{encodedUrl\}/;
const MP4_URL = /MP4_URL\s*=\s*["']([^"']*stream\.php\?[^"']*)["']/;
const STREAM_URL = /(https?:\/\/[^"'\s]+\/stream\.php\?[^"'\s]+)/;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

/**
 * @typedef {object} EmbedData
 * @property {number} totalChapters - Total de capítulos publicado.
 * @property {string} chapterTemplate - Prefixo completo da URL do capítulo, até `AVBR-`.
 * @property {string} redirectBase - Base do redirecionador, incluindo o `?`.
 */

/**
 * Lê o total de capítulos, o template do capítulo e a base do redirecionador.
 * @param {string} html - HTML do embed.
 * @returns {EmbedData} Dados do embed.
 * @throws {Error} Se `totalChapters`, o template ou a base estiverem ausentes ou inválidos.
 */
export function parseEmbed(html) {
  if (typeof html !== 'string') throw new Error('Embed inválido: HTML não é texto');
  const total = TOTAL_CHAPTERS.exec(html);
  const template = CHAPTER_TEMPLATE.exec(html);
  const base = REDIRECT_BASE.exec(html);
  if (total === null) throw new Error('Embed fora do esquema: totalChapters ausente');
  if (template === null) throw new Error('Embed fora do esquema: template de originalUrl ausente');
  if (base === null) throw new Error('Embed fora do esquema: base de finalUrl ausente');

  const totalChapters = Number(total[1]);
  if (!Number.isInteger(totalChapters) || totalChapters < 1) {
    throw new Error(`Embed com totalChapters inválido: ${total[1]}`);
  }
  assertHttp(template[1], 'template do capítulo');
  assertHttp(base[1], 'base do redirecionador');
  return { totalChapters, chapterTemplate: template[1], redirectBase: base[1] };
}

/**
 * Monta a URL do redirecionador para o capítulo.
 * @param {EmbedData} embed - Dados do embed.
 * @param {number} episode - Capítulo pedido.
 * @returns {string} URL `redirectnflix` com o capítulo em Base64.
 * @throws {Error} Se o capítulo não for inteiro positivo.
 */
export function buildChapterUrl(embed, episode) {
  if (!Number.isInteger(episode) || episode < 1) {
    throw new Error(`Capítulo inválido: ${episode} (esperado inteiro positivo)`);
  }
  // O template e o número são ASCII; btoa produz o mesmo Base64 do player.
  const source = `${embed.chapterTemplate}${String(episode).padStart(3, '0')}`;
  return `${embed.redirectBase}${btoa(source)}`;
}

/**
 * Segue o redirecionador até o gate.
 * @param {string} redirectUrl - URL do redirecionador com o capítulo.
 * @param {string} referer - URL do embed.
 * @returns {Promise<{ url: string, text: string }>} URL final do gate e HTML.
 * @throws {Error} Em falha de rede ou HTTP fora de 2xx.
 */
export async function fetchGate(redirectUrl, referer) {
  return fetchPage(redirectUrl, { headers: { Referer: referer } });
}

/**
 * Lê a `safelink` do gate.
 * @param {string} html - HTML do gate.
 * @param {string} gateUrl - URL final do gate, usada como base.
 * @returns {string} URL da `safelink` pronta para a requisição manual.
 * @throws {Error} Se o gate não publicar `data-src` com `safelink_redirect`.
 */
export function extractSafelink(html, gateUrl) {
  const $ = loadHtml(html);
  let src = $('#player-iframe').attr('data-src');
  if (typeof src !== 'string' || src.trim() === '') {
    const frames = $('iframe');
    for (let index = 0; index < frames.length; index += 1) {
      const candidate = frames.eq(index).attr('data-src');
      if (typeof candidate === 'string' && candidate.includes('safelink_redirect')) {
        src = candidate;
        break;
      }
    }
  }
  if (typeof src !== 'string' || src.trim() === '') {
    throw new Error(`Gate fora do esquema em ${gateUrl}: iframe com safelink_redirect ausente`);
  }
  const decoded = src.trim().replace(/&amp;/g, '&');
  const url = new URL(decoded, gateUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Gate com safelink fora de HTTP(S): ${decoded}`);
  }
  return url.href;
}

/**
 * Pede a `safelink` sem seguir o redirecionamento automaticamente.
 * @param {string} safelinkUrl - URL da `safelink`.
 * @param {string} referer - URL final do gate.
 * @returns {Promise<string>} URL da página de vídeo.
 * @throws {Error} Se a resposta não for 2xx/3xx ou o 3xx não tiver `Location`.
 */
export async function followSafelink(safelinkUrl, referer) {
  const response = await fetch(safelinkUrl, {
    redirect: 'manual',
    headers: { ...HEADER_PROFILES.page, Referer: referer },
  });
  if (REDIRECT_STATUSES.includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`Safelink respondeu HTTP ${response.status} sem Location`);
    return new URL(location, safelinkUrl).href;
  }
  if (response.status !== 200) {
    throw new Error(`Safelink respondeu HTTP ${response.status}`);
  }
  return typeof response.url === 'string' && response.url !== '' ? response.url : safelinkUrl;
}

/**
 * Abre a página de vídeo e extrai a URL publicada de `stream.php`.
 * @param {string} videoUrl - URL da página de vídeo.
 * @param {string} referer - URL da `safelink`.
 * @returns {Promise<string>} URL de `stream.php` como publicada.
 * @throws {Error} Se a página não publicar `stream.php`.
 */
export async function fetchStreamUrl(videoUrl, referer) {
  const page = await fetchPage(videoUrl, { headers: { Referer: referer } });
  const match = MP4_URL.exec(page.text) || STREAM_URL.exec(page.text);
  if (match === null) {
    throw new Error(`Página de vídeo sem stream.php em ${videoUrl}`);
  }
  const url = new URL(match[1], page.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`stream.php fora de HTTP(S) em ${videoUrl}`);
  }
  return url.href;
}

/**
 * Exige URL HTTP(S).
 * @param {string} value - URL recebida.
 * @param {string} label - Nome do campo, para a mensagem.
 * @returns {void}
 * @throws {Error} Se a URL for inválida ou não usar HTTP(S).
 */
function assertHttp(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Embed com ${label} inválido: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Embed com ${label} fora de HTTP(S): ${value}`);
  }
}
