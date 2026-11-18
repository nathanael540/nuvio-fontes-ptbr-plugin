/**
 * Classificação de hosts e resolução das opções do AnimesOnlineCC.
 *
 * A classificação usa hostname e caminho exatos, nunca substring solta. Cada opção é resolvida sem
 * executar JavaScript remoto: o Blogger é lido pelo bloco `blogger-video`, a mídia direta é aceita
 * como publicada e MixDrop, Streamtape, Dood e Byse têm adaptadores locais.
 *
 * Origem: codeberg.org/prismastream/install, prisma_hosts.py (GPL-3.0).
 * Os adaptadores de MixDrop, Streamtape e DoodStream foram aproveitados de `src/pobreflixtv/hosts.js`
 * (mesmo repositório, GPL-3.0): desempacotamento de `MDCore.wurl`, recomposição do `robotlink` e fluxo
 * `pass_md5`. O Byse segue o desempacotamento e a busca de `.m3u8` do Prisma, sem a cadeia cifrada de
 * `src/vaqueirofilmes/byse.js`, que é específica de outro player.
 */

import { extractBloggerFormats } from '../_blocks/blogger-video/index.mjs';
import { unpackPacker } from '../_blocks/fireplayer/index.mjs';
import { DEFAULT_USER_AGENT, fetchPage, fetchText } from '../_blocks/http/index.mjs';

const HTTP_PROTOCOLS = ['http:', 'https:'];
const BLOGGER_HOSTS = new Set(['blogger.com']);
const BLOGGER_PATH = '/video.g';
const MIXDROP_HOSTS = new Set([
  'mixdrop.co',
  'mixdrop.to',
  'mixdrop.sx',
  'mixdrop.bz',
  'mixdrop.ch',
  'mixdrop.ag',
  'mixdrop.ps',
  'mixdrop.si',
  'mixdrop.vc',
  'mixdrop.xyz',
  'mixdrop.club',
  'mixdrop.ink',
  'mixdrop.one',
]);
const STREAMTAPE_HOSTS = new Set([
  'streamtape.com',
  'streamtape.to',
  'streamtape.net',
  'streamtape.xyz',
  'streamtape.site',
  'streamtape.art',
  'streamtape.cc',
]);
const DOOD_HOSTS = new Set([
  'dood.to',
  'dood.so',
  'dood.la',
  'dood.ws',
  'dood.watch',
  'dood.cx',
  'dood.sh',
  'dood.yt',
  'doodstream.com',
  'doodstream.co',
  'playmogo.com',
]);
const BYSE_HOSTS = new Set([
  'byse.sx',
  'byse.ink',
  'byse.co',
  'byse.fun',
  'byse.si',
  'byse.xyz',
  'byse.art',
  'byse.space',
  'byse.ws',
  'bysebuho.com',
]);
const DOOD_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HLS_URL = /https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/i;

/**
 * @typedef {object} HostStream
 * @property {string} url - URL direta da mídia.
 * @property {'mp4'|'hls'} type - Tipo do stream.
 * @property {string} provider - Hospedagem de origem.
 * @property {Record<string, string>} [headers] - Cabeçalhos exigidos pela hospedagem.
 * @property {string|null} [qualityLabel] - Rótulo de qualidade publicado pelo player.
 */

/**
 * @typedef {{ kind: 'streams', entries: HostStream[] }|{ kind: 'triage', reason: string }} HostResolution
 */

/**
 * Classifica a URL de uma opção pelo hostname e caminho.
 * @param {string} rawUrl - URL publicada no embed.
 * @returns {{ kind: 'blogger'|'direct'|'mixdrop'|'streamtape'|'dood'|'byse', url: string }|{ kind: 'triage', reason: string }} Classificação.
 * @example
 * classifyHost('https://www.blogger.com/video.g?token=EXAMPLE');
 * // { kind: 'blogger', url: 'https://www.blogger.com/video.g?token=EXAMPLE' }
 * classifyHost('https://player.example.test/e/1');
 * // { kind: 'triage', reason: 'host player.example.test não suportado' }
 */
export function classifyHost(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'triage', reason: 'embed com URL inválida' };
  }
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    return { kind: 'triage', reason: 'embed fora de HTTP(S)' };
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (BLOGGER_HOSTS.has(hostname) && url.pathname === BLOGGER_PATH) {
    return { kind: 'blogger', url: url.href };
  }
  if (MIXDROP_HOSTS.has(hostname)) return { kind: 'mixdrop', url: url.href };
  if (STREAMTAPE_HOSTS.has(hostname)) return { kind: 'streamtape', url: url.href };
  if (DOOD_HOSTS.has(hostname)) return { kind: 'dood', url: url.href };
  if (BYSE_HOSTS.has(hostname)) return { kind: 'byse', url: url.href };
  if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.m3u8')) return { kind: 'direct', url: url.href };
  return { kind: 'triage', reason: `host ${url.hostname} não suportado` };
}

/**
 * Resolve uma opção para as mídias que o host publica.
 *
 * Host desconhecido devolve triagem, sem falha. Host conhecido que não resolve lança erro, que o
 * chamador isola por opção.
 *
 * @param {string} optionUrl - URL do embed da opção.
 * @param {string} referer - URL da página do episódio, enviada como `Referer`.
 * @returns {Promise<HostResolution>} Mídias resolvidas ou motivo da triagem.
 * @throws {Error} Se um host conhecido não devolver mídia ou a página falhar.
 * @example
 * const resolution = await resolveHostOption('https://mixdrop.co/e/abc', 'https://animesonlinecc.to/episodio/x/');
 * // { kind: 'streams', entries: [{ url: 'https://cdn.example.test/mixdrop/720.mp4', type: 'mp4', ... }] }
 */
export async function resolveHostOption(optionUrl, referer) {
  const target = classifyHost(optionUrl);
  if (target.kind === 'triage') return target;

  if (target.kind === 'blogger') return resolveBlogger(target.url);
  if (target.kind === 'direct') {
    const type = new URL(target.url).pathname.endsWith('.m3u8') ? 'hls' : 'mp4';
    return { kind: 'streams', entries: [{ url: target.url, type, provider: 'AnimesOnlineCC' }] };
  }
  if (target.kind === 'mixdrop') {
    const media = await resolveMixDrop(target.url, referer);
    return { kind: 'streams', entries: [{ ...media, type: 'mp4', provider: 'MixDrop' }] };
  }
  if (target.kind === 'streamtape') {
    const media = await resolveStreamtape(target.url, referer);
    return { kind: 'streams', entries: [{ ...media, type: 'mp4', provider: 'Streamtape' }] };
  }
  if (target.kind === 'dood') {
    const media = await resolveDoodStream(target.url, referer);
    return { kind: 'streams', entries: [{ ...media, type: 'mp4', provider: 'DoodStream' }] };
  }
  const url = await resolveByse(target.url, referer);
  return { kind: 'streams', entries: [{ url, type: 'hls', provider: 'Byse' }] };
}

/**
 * Lê os MP4 progressivos do player do Blogger.
 * @param {string} playerUrl - URL de `blogger.com/video.g?token=...`.
 * @returns {Promise<HostResolution>} Um stream por formato publicado.
 * @throws {Error} Se a página não responder 2xx ou não publicar MP4 progressivo.
 */
async function resolveBlogger(playerUrl) {
  const html = await fetchText(playerUrl, { profile: 'player' });
  const formats = extractBloggerFormats(html);
  return {
    kind: 'streams',
    entries: formats.map((format) => ({
      url: format.url,
      type: 'mp4',
      provider: 'Blogger',
      qualityLabel: format.qualityLabel,
    })),
  };
}

/**
 * Resolve embed do MixDrop para URL direta de vídeo e cabeçalhos.
 * @param {string} embedUrl - URL da página de embed do MixDrop.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>} Mídia e cabeçalhos.
 * @throws {Error} Se o arquivo foi removido ou o script não contém a URL do vídeo.
 */
async function resolveMixDrop(embedUrl, referer) {
  const reqHeaders = { 'User-Agent': DEFAULT_USER_AGENT };
  if (referer) reqHeaders.Referer = referer;

  const page = await fetchPage(embedUrl, { profile: 'page', headers: reqHeaders });
  const html = page.text;

  if (html.includes('File not found') || html.includes('deleted') || html.includes('has been deleted')) {
    throw new Error('MixDrop: arquivo removido');
  }

  const unpacked = unpackPacker(html);
  if (!unpacked) {
    throw new Error('MixDrop: script empacotado não encontrado');
  }

  const wurlMatch = /(?:MDCore\.)?wurl\s*=\s*(["'])((?:\\[\s\S]|(?!\1)[^\\])*)\1/.exec(unpacked);
  if (!wurlMatch) {
    throw new Error('MixDrop: wurl não encontrado no script desempacotado');
  }

  let streamUrl = wurlMatch[2].replace(/\\/g, '');
  if (streamUrl.startsWith('//')) {
    streamUrl = `https:${streamUrl}`;
  }

  return {
    url: streamUrl,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: page.url,
    },
  };
}

/**
 * Resolve embed do Streamtape para link get_video e cabeçalhos.
 * @param {string} embedUrl - URL da página de embed do Streamtape.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>} Mídia e cabeçalhos.
 * @throws {Error} Se o arquivo foi removido ou o link robotlink não for encontrado.
 */
async function resolveStreamtape(embedUrl, referer) {
  const reqHeaders = { 'User-Agent': DEFAULT_USER_AGENT };
  if (referer) reqHeaders.Referer = referer;

  const html = await fetchText(embedUrl, { profile: 'page', headers: reqHeaders });

  if (html.includes('Video not found') || html.includes('File not found') || html.includes('404 Not Found')) {
    throw new Error('Streamtape: arquivo removido');
  }

  const match = /document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*(['"][^'"]*['"])\s*\+\s*(.+?);/.exec(html);
  if (!match) {
    throw new Error('Streamtape: robotlink não encontrado');
  }

  const prefix = match[1].slice(1, -1);
  const restExpr = match[2].trim();
  const strMatch = /^\(?['"]([^'"]*)['"]\)?/.exec(restExpr);
  if (!strMatch) {
    throw new Error('Streamtape: expressão robotlink inválida');
  }

  let token = strMatch[1];
  for (const sub of restExpr.matchAll(/\.substring\((\d+)(?:,\s*(\d+))?\)/g)) {
    const start = parseInt(sub[1], 10);
    const end = sub[2] !== undefined ? parseInt(sub[2], 10) : undefined;
    token = token.substring(start, end);
  }

  let streamUrl = prefix + token;
  if (streamUrl.startsWith('//')) {
    streamUrl = `https:${streamUrl}`;
  }

  return {
    url: streamUrl,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: embedUrl,
    },
  };
}

/**
 * Resolve embed do DoodStream via `pass_md5` para URL direta de MP4 e cabeçalhos.
 * @param {string} embedUrl - URL da página de embed do DoodStream.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>} Mídia e cabeçalhos.
 * @throws {Error} Se o arquivo foi removido, o `pass_md5` não for encontrado ou a base for inválida.
 */
async function resolveDoodStream(embedUrl, referer) {
  const reqHeaders = { 'User-Agent': DEFAULT_USER_AGENT };
  if (referer) reqHeaders.Referer = referer;

  const page = await fetchPage(embedUrl, { profile: 'page', headers: reqHeaders });
  const html = page.text;

  if (html.includes('File you are looking for is not found') || html.includes('Video not found')) {
    throw new Error('DoodStream: arquivo removido');
  }

  const passMatch = /\/pass_md5\/([^'"\s<>]+)/.exec(html);
  if (!passMatch) {
    throw new Error('DoodStream: pass_md5 não encontrado');
  }

  const finalEmbedUrl = page.url || embedUrl;
  const origin = new URL(finalEmbedUrl).origin;
  const passPath = passMatch[0];
  const token = passMatch[1].split('/').pop();
  if (!token) {
    throw new Error('DoodStream: token do pass_md5 inválido');
  }

  const baseText = await fetchText(`${origin}${passPath}`, {
    profile: 'page',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: finalEmbedUrl,
    },
  });
  const base = baseText.trim();
  if (!base || base === 'RELOAD' || !/^https?:\/\//i.test(base)) {
    throw new Error(`DoodStream: resposta inválida de pass_md5 (${base || 'vazia'})`);
  }

  const streamUrl = `${base}${makeDoodToken()}?token=${token}&expiry=${Date.now()}`;
  return {
    url: streamUrl,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: `${origin}/`,
    },
  };
}

/**
 * Resolve embed do Byse pelo HTML desempacotado (ou bruto) e devolve o HLS publicado.
 * @param {string} embedUrl - URL da página de embed do Byse.
 * @param {string} referer - URL da página do episódio, enviada como `Referer`.
 * @returns {Promise<string>} URL do master HLS.
 * @throws {Error} Se a página não responder 2xx ou não publicar `.m3u8`.
 */
async function resolveByse(embedUrl, referer) {
  const page = await fetchPage(embedUrl, {
    profile: 'page',
    headers: { 'User-Agent': DEFAULT_USER_AGENT, Referer: referer },
  });
  const unpacked = unpackPacker(page.text);
  const match = (unpacked === null ? null : HLS_URL.exec(unpacked)) || HLS_URL.exec(page.text);
  if (match === null) throw new Error('Byse: HLS não encontrado');
  return match[0];
}

/**
 * Gera o token de dez caracteres que o DoodStream espera depois da base do `pass_md5`.
 * @returns {string} Token aleatório.
 */
function makeDoodToken() {
  let out = '';
  for (let index = 0; index < 10; index += 1) {
    out += DOOD_TOKEN_ALPHABET.charAt(Math.floor(Math.random() * DOOD_TOKEN_ALPHABET.length));
  }
  return out;
}
