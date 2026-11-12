/**
 * Configuração específica do FirePlayer usado pelo FSHD.
 */

import { unpackPacker } from '../_blocks/fireplayer/index.mjs';

/**
 * Extrai a URL HLS e as legendas do player sem executar o script remoto.
 *
 * O config do FirePlayer é um objeto JSON passado como segundo argumento de `FirePlayer(vhash,
 * {...}, false)` no script desempacotado. O recorte do objeto ignora chaves dentro de strings e o
 * `JSON.parse` desfaz escapes como `\/`. As faixas `tracks` do config são de miniaturas e não são
 * lidas: as legendas vêm dos `<track>` do HTML.
 *
 * @param {string} html - Conteúdo HTML da página do reprodutor.
 * @param {string} playerUrl - URL real da página, usada para resolver caminhos relativos.
 * @returns {{ videoUrl: string, tracks: Array<{url: string, language?: string, name?: string}> }} Configuração.
 * @throws {Error} Se o HTML, o script empacotado, o config ou a videoUrl estiverem ausentes ou inválidos.
 * @example
 * const config = extractFirePlayerConfig(html, 'https://player.example.com/index.php?data=abc');
 * // config.videoUrl === 'https://player.example.com/hls/abc/master.txt'
 */
export function extractFirePlayerConfig(html, playerUrl) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('HTML do FirePlayer ausente ou vazio');
  }

  const unpacked = unpackPacker(html);
  if (!unpacked) {
    throw new Error(`Player não suportado (${new URL(playerUrl).host})`);
  }

  const configSource = firePlayerConfigSource(unpacked);
  if (!configSource) {
    throw new Error('Configuração FirePlayer ausente no script desempacotado');
  }

  let config;
  try {
    config = JSON.parse(configSource);
  } catch (cause) {
    throw new Error(`Configuração FirePlayer não é JSON válido: ${cause.message}`, { cause });
  }

  if (!config || typeof config.videoUrl !== 'string' || !config.videoUrl.trim()) {
    throw new Error('Configuração FirePlayer sem videoUrl');
  }
  const videoUrl = new URL(config.videoUrl.trim(), playerUrl).href;

  const tracks = [];
  const trackRegex = /<track[^>]+>/gi;
  let match;
  while ((match = trackRegex.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = /src\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    if (!srcMatch) continue;
    const langMatch = /srclang\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    const labelMatch = /label\s*=\s*['"]([^'"]+)['"]/i.exec(tag);
    const language = langMatch?.[1] || labelMatch?.[1];
    tracks.push({
      url: new URL(srcMatch[1], playerUrl).href,
      ...(language ? { language } : {}),
      ...(labelMatch ? { name: labelMatch[1] } : {}),
    });
  }

  return { videoUrl, tracks };
}

/**
 * Recorta o objeto passado como segundo argumento de uma chamada `FirePlayer(...)`.
 * @param {string} source - Script já desempacotado.
 * @returns {string|null} Texto do objeto, incluindo as chaves, ou `null` quando não há objeto.
 */
function firePlayerConfigSource(source) {
  const calls = /FirePlayer\s*\(/g;
  let match;
  while ((match = calls.exec(source)) !== null) {
    const start = secondArgumentObjectStart(source, match.index + match[0].length);
    if (start < 0) continue;
    const end = closingBraceIndex(source, start);
    if (end < 0) return null;
    return source.slice(start, end + 1);
  }
  return null;
}

/**
 * Índice do `{` que abre o segundo argumento, se ele for um objeto.
 * @param {string} source - Script desempacotado.
 * @param {number} index - Posição logo após o `(` da chamada.
 * @returns {number} Índice do `{` ou -1 quando o segundo argumento não é objeto.
 */
function secondArgumentObjectStart(source, index) {
  let depth = 0;
  let quote = null;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === '\\') cursor += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
      continue;
    }
    if (char === ')' || char === ']' || char === '}') {
      if (depth === 0) return -1;
      depth -= 1;
      continue;
    }
    if (char === ',' && depth === 0) {
      let start = cursor + 1;
      while (start < source.length && /\s/.test(source[start])) start += 1;
      return source[start] === '{' ? start : -1;
    }
  }
  return -1;
}

/**
 * Índice da chave que fecha o objeto aberto em `start`, ignorando chaves dentro de strings.
 * @param {string} source - Script desempacotado.
 * @param {number} start - Índice do `{` de abertura.
 * @returns {number} Índice do `}` correspondente ou -1 se não houver fechamento.
 */
function closingBraceIndex(source, start) {
  let depth = 0;
  let quote = null;
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === '\\') cursor += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}
