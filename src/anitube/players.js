/**
 * Resolução dos dois players do AniTube.
 *
 * O player FHD entrega HLS direto pelo parâmetro `d` do iframe. O Player 1 é um caminho de token
 * no domínio do site que redireciona para `api.anivideo.net/file/...`; essa página publica um iframe
 * do Blogger, cujo HTML traz `streamingData.formats` com MP4 progressivos. Cada player é resolvido
 * em isolamento: a falha de um descarta só aquela opção.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { fetchPage, fetchText } from '../_blocks/http/index.mjs';
import { loadHtml } from './html.js';

const FHD_HOST = 'api.anivideo.net';
const FHD_PATH = 'videohls.php';
const ANITUBE_HOSTS = new Set(['anitube.zip', 'www.anitube.zip']);
const BLOGGER_HOSTS = new Set(['blogger.com', 'www.blogger.com']);
const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * @typedef {object} PlayerOption
 * @property {'fhd'|'player1'|'unsupported'} kind - Tipo do iframe.
 * @property {string} url - URL absoluta do iframe.
 * @property {string} label - Rótulo exibido nos avisos.
 */

/**
 * @typedef {object} PlayerStream
 * @property {string} url - URL da mídia.
 * @property {string|null} quality - Rótulo de qualidade do player, quando houver.
 * @property {string} provider - `Player FHD` ou `Player 1`.
 * @property {'hls'|'mp4'} type - Tipo do stream.
 */

/**
 * Coleta os iframes de player da ficha, na ordem em que aparecem.
 * @param {string} html - HTML da ficha.
 * @param {string} pageUrl - URL da ficha, para resolver `src` relativos.
 * @returns {PlayerOption[]} Opções reconhecidas e hosts não suportados.
 * @example
 * collectPlayers(html, 'https://www.anitube.zip/video/970539b');
 * // [{ kind: 'fhd', url: 'https://api.anivideo.net/videohls.php?d=...', label: 'Player FHD' }, ...]
 */
export function collectPlayers(html, pageUrl) {
  const $ = loadHtml(html);
  const iframes = $('iframe');
  const players = [];
  for (let index = 0; index < iframes.length; index += 1) {
    const src = iframes.eq(index).attr('src');
    if (!src) continue;
    const url = new URL(src, pageUrl).href;
    const parsed = new URL(url);
    if (parsed.hostname === FHD_HOST && parsed.pathname.includes(FHD_PATH)) {
      players.push({ kind: 'fhd', url, label: 'Player FHD' });
    } else if (ANITUBE_HOSTS.has(parsed.hostname)) {
      players.push({ kind: 'player1', url, label: 'Player 1' });
    } else {
      players.push({ kind: 'unsupported', url, label: parsed.hostname });
    }
  }
  return players;
}

/**
 * Resolve todos os players da ficha em isolamento.
 *
 * A falha de uma opção gera aviso `[<provedor>] Opção <rótulo> descartada: <causa>` e preserva as
 * demais. Se nenhuma opção produzir stream, lança erro com as causas.
 *
 * @param {string} html - HTML da ficha.
 * @param {string} pageUrl - URL da ficha.
 * @param {string} providerName - Nome do provedor para os avisos.
 * @returns {Promise<PlayerStream[]>} Streams das opções que resolveram.
 * @throws {Error} Se a ficha não tiver iframe de player ou se todas as opções falharem.
 * @example
 * await resolvePlayers(html, 'https://www.anitube.zip/video/970539b', 'AniTube');
 * // [{ url: 'https://cdn.example/master.m3u8', quality: '720p HD', provider: 'Player FHD', type: 'hls' }]
 */
export async function resolvePlayers(html, pageUrl, providerName) {
  const players = collectPlayers(html, pageUrl);
  if (players.length === 0) throw new Error('Ficha sem player');

  const results = await Promise.all(players.map((player) => resolveOption(player, pageUrl)));
  const streams = [];
  const failures = [];
  for (const result of results) {
    if (result.ok) {
      streams.push(...result.streams);
      continue;
    }
    failures.push(result.error.message);
    console.warn(`[${providerName}] Opção ${result.label} descartada: ${sanitizeMessage(result.error.message)}`);
  }

  if (streams.length > 0) return streams;
  throw new Error(`Nenhuma opção produziu stream: ${failures.map(sanitizeMessage).join('; ')}`);
}

/**
 * Resolve uma opção sem deixar a falha escapar.
 * @param {PlayerOption} player - Opção coletada.
 * @param {string} pageUrl - URL da ficha.
 * @returns {Promise<{ ok: true, label: string, streams: PlayerStream[] }|{ ok: false, label: string, error: Error }>} Resultado.
 */
async function resolveOption(player, pageUrl) {
  try {
    if (player.kind === 'fhd') return { ok: true, label: player.label, streams: await resolveFhd(player, pageUrl) };
    if (player.kind === 'player1') return { ok: true, label: player.label, streams: await resolvePlayer1(player, pageUrl) };
    return { ok: false, label: player.label, error: new Error(`Host não suportado: ${player.label}`) };
  } catch (error) {
    return { ok: false, label: player.label, error };
  }
}

/**
 * Resolve o player FHD como HLS.
 * @param {PlayerOption} player - Iframe do player FHD.
 * @param {string} pageUrl - URL da ficha, usada como `Referer`.
 * @returns {Promise<PlayerStream[]>} Um stream HLS.
 * @throws {Error} Se o iframe não tiver o parâmetro `d`.
 */
async function resolveFhd(player, pageUrl) {
  const mediaUrl = readFhdUrl(player.url);
  let quality = null;
  let url = mediaUrl;

  try {
    const page = await fetchPage(player.url, { profile: 'player', headers: { Referer: pageUrl } });
    const source = readFhdSource(page.text);
    if (source.file !== null) url = new URL(source.file, page.url).href;
    if (source.label !== null) quality = source.label;
  } catch {
    // A mídia já está no parâmetro `d`; a página do player só melhora o rótulo.
  }

  return [{ url, quality, provider: 'Player FHD', type: 'hls' }];
}

/**
 * Resolve o Player 1 até os MP4 progressivos do Blogger.
 * @param {PlayerOption} player - Iframe do Player 1.
 * @param {string} pageUrl - URL da ficha, usada como `Referer`.
 * @returns {Promise<PlayerStream[]>} Um stream por formato progressivo.
 * @throws {Error} Se a cadeia não chegar ao iframe do Blogger ou não tiver MP4.
 */
async function resolvePlayer1(player, pageUrl) {
  const page = await fetchPage(player.url, { profile: 'player', headers: { Referer: pageUrl } });
  const bloggerUrl = readBloggerIframe(page.text, page.url);
  const blogger = await fetchText(bloggerUrl, { profile: 'player', headers: { Referer: page.url } });
  return extractBloggerFormats(blogger).map((format) => ({
    url: format.url,
    quality: format.qualityLabel,
    provider: 'Player 1',
    type: 'mp4',
  }));
}

/**
 * Lê o parâmetro `d` do iframe do player FHD.
 * @param {string} url - URL do iframe.
 * @returns {string} URL do HLS.
 * @throws {Error} Se o parâmetro não existir ou não for http(s).
 */
function readFhdUrl(url) {
  const mediaUrl = new URL(url).searchParams.get('d');
  if (typeof mediaUrl !== 'string' || mediaUrl.trim() === '') {
    throw new Error('Player FHD sem parâmetro d');
  }
  if (!isHttpUrl(mediaUrl)) throw new Error('Player FHD com parâmetro d fora de http(s)');
  return mediaUrl;
}

/**
 * Lê `sources.file` e `sources.label` da página do player FHD.
 * @param {string} html - HTML do player.
 * @returns {{ file: string|null, label: string|null }} Dados encontrados.
 * @throws {Error} Se a página não tiver o bloco `sources`.
 */
function readFhdSource(html) {
  const block = /sources\s*:\s*\[([\s\S]*?)\]/i.exec(html);
  if (block === null) throw new Error('Player FHD sem bloco sources');
  const file = /file\s*:\s*['"]([^'"]+)['"]/i.exec(block[1]);
  const label = /label\s*:\s*['"]([^'"]+)['"]/i.exec(block[1]);
  return { file: file === null ? null : file[1], label: label === null ? null : label[1] };
}

/**
 * Lê o iframe do Blogger na página final do Player 1.
 * @param {string} html - HTML da página.
 * @param {string} pageUrl - URL da página, para resolver `src` relativos.
 * @returns {string} URL do iframe do Blogger.
 * @throws {Error} Se o iframe não existir.
 */
function readBloggerIframe(html, pageUrl) {
  const $ = loadHtml(html);
  const iframes = $('iframe');
  for (let index = 0; index < iframes.length; index += 1) {
    const src = iframes.eq(index).attr('src');
    if (!src) continue;
    const url = new URL(src, pageUrl).href;
    const hostname = new URL(url).hostname.toLowerCase();
    if (BLOGGER_HOSTS.has(hostname) || hostname.endsWith('.blogger.com')) return url;
  }
  throw new Error('Página do Player 1 sem iframe do Blogger');
}

/**
 * Remove URL e hash longos das mensagens de log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}

/**
 * Indica se o valor é uma URL HTTP(S).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return HTTP_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}
