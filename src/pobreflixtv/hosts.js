/**
 * Extratores de hospedagens do Pobreflix HD (MixDrop, Streamtape e DoodStream).
 *
 * Resolve as páginas de embed para as URLs finais de MP4 sem executar JavaScript remoto.
 */

import { unpackPacker } from '../_blocks/fireplayer/index.mjs';
import { DEFAULT_USER_AGENT, fetchPage, fetchText } from '../_blocks/http/index.mjs';

const DOOD_TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function makeDoodToken() {
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += DOOD_TOKEN_ALPHABET.charAt(Math.floor(Math.random() * DOOD_TOKEN_ALPHABET.length));
  }
  return out;
}

/**
 * Resolve embed do MixDrop para URL direta de vídeo e cabeçalhos.
 *
 * @param {string} embedUrl - URL da página de embed do MixDrop.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>}
 * @throws {Error} Se o arquivo foi removido ou o script não contém a URL do vídeo.
 */
export async function resolveMixDrop(embedUrl, referer) {
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
 *
 * @param {string} embedUrl - URL da página de embed do Streamtape.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>}
 * @throws {Error} Se o arquivo foi removido ou o link robotlink não for encontrado.
 */
export async function resolveStreamtape(embedUrl, referer) {
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
 * Resolve embed do DoodStream (playmogo.com) via pass_md5 para URL direta de MP4 e cabeçalhos.
 *
 * @param {string} embedUrl - URL da página de embed do DoodStream.
 * @param {string} [referer] - URL da página de origem no site.
 * @returns {Promise<{ url: string, headers: Record<string, string> }>}
 * @throws {Error} Se o arquivo foi removido, o pass_md5 não for encontrado ou a base for inválida.
 */
export async function resolveDoodStream(embedUrl, referer) {
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
 * Resolve a opção de mídia para stream conforme o servidor configurado.
 *
 * @param {{ hostKey: string, hostName: string, embedUrl: string, language: string }} option
 * @param {string} [referer]
 * @returns {Promise<{ url: string, headers: Record<string, string> }|null>}
 */
export async function resolveHostOption(option, referer) {
  if (option.hostKey === 'mixdrop') {
    return resolveMixDrop(option.embedUrl, referer);
  }
  if (option.hostKey === 'streamtape') {
    return resolveStreamtape(option.embedUrl, referer);
  }
  if (option.hostKey === 'doodstream') {
    return resolveDoodStream(option.embedUrl, referer);
  }
  // Servidores sem suporte (Byse, desconhecidos) são ignorados sem erro.
  return null;
}
