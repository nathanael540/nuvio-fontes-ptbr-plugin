/**
 * Player do AniZero: leitura das opções, decode local dos scripts e configuração do embed FirePlayer.
 *
 * O site publica um script empacotado por opção de áudio. O decode é feito em duas camadas, apenas
 * com substituição de strings e conversão de base; nenhum trecho remoto é executado. O embed publica
 * `FirePlayer(vhash,{...})` com o caminho HLS relativo ao próprio host.
 */

import { fetchPage } from '../_blocks/http/index.mjs';
import { decodeEntities, readAttribute } from './support.js';

const PACKER_MARKER = 'function(p,a,c,k,e,d)';
const STANDARD_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
const NOT_READY = /O v[ií]deo n[aã]o est[aá] pronto/i;

/**
 * @typedef {object} PlayerOption
 * @property {number} index - Índice do botão/script.
 * @property {string} label - Rótulo de áudio publicado.
 * @property {string} script - Script empacotado da opção.
 */

/**
 * @typedef {object} EmbedSource
 * @property {string} url - URL HLS absoluta.
 * @property {string|null} label - Rótulo de qualidade publicado.
 */

/**
 * @typedef {object} EmbedResult
 * @property {string} url - URL final do embed.
 * @property {EmbedSource[]} sources - Fontes HLS aceitas.
 * @property {Array<{ url: string, language: string, name?: string }>} subtitles - Legendas externas.
 * @property {boolean} [notReady] - Página de aviso da fonte.
 */

/**
 * Abre a página do player e lê as opções publicadas.
 * @param {string} playerUrl - URL do iframe `/player`.
 * @param {string} referer - Página do vídeo, usada como Referer.
 * @returns {Promise<{ url: string, options: PlayerOption[] }>} URL final e opções.
 * @throws {Error} Em falha de rede ou página sem `playerScripts`.
 * @example
 * const player = await resolvePlayerPage('https://anizero.org/player?id=495&season=1&num=1', videoUrl);
 */
export async function resolvePlayerPage(playerUrl, referer) {
  const page = await fetchPage(playerUrl, {
    profile: 'page',
    headers: { Referer: referer },
  });
  return { url: page.url, options: readPlayerOptions(page.text) };
}

/**
 * Lê os botões `data-index`/`data-label` e o array `playerScripts`.
 * @param {string} html - HTML da página do player.
 * @returns {PlayerOption[]} Opções na ordem dos scripts.
 * @throws {Error} Se `playerScripts` estiver ausente ou fora do esquema.
 * @example
 * readPlayerOptions(html);
 * // [{ index: 0, label: 'Dublado', script: 'eval(...)' }]
 */
export function readPlayerOptions(html) {
  const scripts = readScripts(html);
  const labels = new Map();
  const buttons = html.match(/<button\b[^>]*>/gi) || [];
  for (const tag of buttons) {
    const index = readAttribute(tag, 'data-index');
    if (index === null || !/^\d+$/.test(index)) continue;
    const label = readAttribute(tag, 'data-label');
    labels.set(Number(index), label === null ? '' : decodeEntities(label).trim());
  }

  return scripts.map((script, index) => ({
    index,
    label: labels.get(index) || `Opção ${index + 1}`,
    script,
  }));
}

/**
 * Decodifica um script de opção e devolve a URL do embed.
 *
 * A primeira camada é o packer `p,a,c,k,e,d`; a segunda é o decodificador de base própria que
 * termina em `document...src="https://..."`. O texto final é validado como URL HTTP(S).
 *
 * @param {string} script - Script publicado em `playerScripts`.
 * @returns {string} URL do embed.
 * @throws {Error} Se o script não seguir o formato observado ou não tiver URL válida.
 * @example
 * decodePlayerUrl('eval(function(p,a,c,k,e,d){...})'); // 'https://host/player/index.php?data=...'
 */
export function decodePlayerUrl(script) {
  if (typeof script !== 'string' || script.trim() === '') {
    throw new Error('Script do player vazio');
  }

  const unpacked = unpackPacker(script);
  if (unpacked === null) {
    const direct = extractUrl(script);
    if (direct !== null) return direct;
    throw new Error('Script do player fora do esquema');
  }

  const decoded = decodeCustomPayload(unpacked);
  if (decoded === null) {
    const direct = extractUrl(unpacked);
    if (direct !== null) return direct;
    throw new Error('Script do player sem URL do embed');
  }

  const url = extractUrl(decoded);
  if (url === null) throw new Error('Script do player sem URL do embed');
  return url;
}

/**
 * Abre o embed e lê a configuração `FirePlayer`.
 * @param {string} embedUrl - URL do embed decodificado.
 * @param {string} referer - Página do player, usada como Referer.
 * @returns {Promise<EmbedResult>} Fontes HLS, legendas ou aviso de vídeo não pronto.
 * @throws {Error} Em falha de rede, configuração ausente ou fora do esquema.
 * @example
 * const embed = await resolveEmbed('https://host/player/index.php?data=abc', playerUrl);
 */
export async function resolveEmbed(embedUrl, referer) {
  const page = await fetchPage(embedUrl, {
    profile: 'player',
    headers: { Referer: referer },
  });
  if (NOT_READY.test(page.text)) return { url: page.url, sources: [], subtitles: [], notReady: true };

  const config = extractFirePlayerConfig(page.text);
  if (config === null) throw new Error(`Embed sem configuração FirePlayer em ${page.url}`);
  return {
    url: page.url,
    sources: readSources(config, page.url),
    subtitles: readSubtitles(config, page.url),
  };
}

/**
 * Lê o array JSON de `playerScripts`.
 * @param {string} html - HTML da página.
 * @returns {string[]} Scripts.
 * @throws {Error} Se o array estiver ausente, malformado ou não for de strings.
 */
function readScripts(html) {
  const anchor = html.indexOf('var playerScripts = ');
  if (anchor < 0) throw new Error('Página do player sem playerScripts');
  const start = html.indexOf('[', anchor);
  if (start < 0) throw new Error('playerScripts sem array');
  const end = scanArrayEnd(html, start);
  let scripts;
  try {
    scripts = JSON.parse(html.slice(start, end));
  } catch (error) {
    throw new Error(`playerScripts não é JSON válido: ${error.message}`, { cause: error });
  }
  if (!Array.isArray(scripts) || !scripts.every((item) => typeof item === 'string')) {
    throw new Error('playerScripts fora do esquema');
  }
  return scripts;
}

/**
 * Encontra o fechamento do array respeitando strings e escapes.
 * @param {string} text - Texto completo.
 * @param {number} start - Índice do `[`.
 * @returns {number} Índice depois do `]`.
 */
function scanArrayEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw new Error('playerScripts sem fechamento');
}

/**
 * Desempacota o formato `eval(function(p,a,c,k,e,d){...}('...',a,c,'...'.split('|'),0,{}))`.
 * @param {string} source - Script bruto.
 * @returns {string|null} Código desempacotado ou null quando não é packer.
 * @throws {Error} Se o packer estiver incompleto ou com parâmetros inválidos.
 */
function unpackPacker(source) {
  const marker = source.indexOf(PACKER_MARKER);
  if (marker < 0) return null;

  const callIndex = source.indexOf("}('", marker);
  if (callIndex < 0) throw new Error('Packer sem chamada de argumentos');
  const pRead = readQuoted(source, callIndex + 2, "'");
  let cursor = pRead.end;

  if (source[cursor] !== ',') throw new Error('Packer sem separador após p');
  cursor += 1;
  const aMatch = /^(\d+)/.exec(source.slice(cursor));
  if (aMatch === null) throw new Error('Packer sem base a');
  const base = Number(aMatch[1]);
  cursor += aMatch[0].length;

  if (source[cursor] !== ',') throw new Error('Packer sem separador após a');
  cursor += 1;
  const cMatch = /^(\d+)/.exec(source.slice(cursor));
  if (cMatch === null) throw new Error('Packer sem contagem c');
  const count = Number(cMatch[1]);
  cursor += cMatch[0].length;

  if (source[cursor] !== ',') throw new Error('Packer sem separador após c');
  cursor += 1;
  const kRead = readQuoted(source, cursor, "'");
  cursor = kRead.end;
  if (!source.slice(cursor).startsWith(".split('|'),0,{}))")) {
    throw new Error('Packer com cauda fora do esquema');
  }

  if (!Number.isInteger(base) || base < 2 || base > 62) throw new Error(`Packer com base inválida: ${base}`);
  if (!Number.isInteger(count) || count < 0) throw new Error(`Packer com contagem inválida: ${count}`);

  const keywords = kRead.value.split('|');
  const dictionary = {};
  for (let index = 0; index < count; index += 1) {
    const key = encodeBase(index, base);
    dictionary[key] = keywords[index] || key;
  }
  return pRead.value.replace(/\b\w+\b/g, (token) => (dictionary[token] === undefined ? token : dictionary[token]));
}

/**
 * Codifica um número na base do packer (dígitos 0-9a-z e A-Z acima de 35).
 * @param {number} value - Número.
 * @param {number} base - Base.
 * @returns {string} Representação.
 */
function encodeBase(value, base) {
  const digit = value % base;
  const prefix = value < base ? '' : encodeBase(Math.floor(value / base), base);
  return prefix + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
}

/**
 * Decodifica a segunda camada do script (payload + alfabeto + base + deslocamento).
 * @param {string} unpacked - Código desempacotado.
 * @returns {string|null} Texto decodificado ou null quando não há a chamada esperada.
 * @throws {Error} Se o formato for reconhecido mas o conteúdo for inválido.
 */
function decodeCustomPayload(unpacked) {
  const match = unpacked.match(/eval\(function\(h,u,n,t,e,r\)\{[\s\S]*?\}\("([^"]*)",(\d+),"([^"]*)",(\d+),(\d+),(\d+)\)\)/);
  if (match === null) return null;

  const payload = match[1];
  const alphabet = match[3];
  const offset = Number(match[4]);
  const base = Number(match[5]);
  if (!Number.isInteger(base) || base < 2 || base > STANDARD_ALPHABET.length) {
    throw new Error(`Decodificador do player com base inválida: ${base}`);
  }
  const separator = alphabet[base];
  if (separator === undefined || separator === '') throw new Error('Decodificador do player sem separador');

  const digitChars = STANDARD_ALPHABET.slice(0, base);
  let bytes = '';
  let index = 0;
  while (index < payload.length) {
    let segment = '';
    while (index < payload.length && payload[index] !== separator) {
      segment += payload[index];
      index += 1;
    }
    if (payload[index] === separator) index += 1;
    if (segment === '') continue;

    let mapped = '';
    for (const char of segment) {
      const digit = alphabet.indexOf(char);
      if (digit < 0) throw new Error(`Símbolo fora do alfabeto do player: ${char}`);
      mapped += String(digit);
    }

    let value = 0;
    for (const char of mapped) {
      const digit = digitChars.indexOf(char);
      if (digit >= 0) value = value * base + digit;
    }
    const code = value - offset;
    if (!(code >= 0 && code <= 255)) throw new Error('Byte fora da faixa no script do player');
    bytes += String.fromCharCode(code);
  }

  return decodeUtf8(bytes);
}

/**
 * Decodifica uma sequência de bytes em UTF-8 sem `TextDecoder`.
 * @param {string} bytes - String com códigos de 0 a 255.
 * @returns {string} Texto UTF-8.
 * @throws {Error} Se a sequência for inválida.
 */
function decodeUtf8(bytes) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes.charCodeAt(index);
    if (first < 0x80) {
      result += String.fromCharCode(first);
      continue;
    }

    let needed;
    let code;
    if (first >= 0xc2 && first <= 0xdf) {
      needed = 1;
      code = first & 0x1f;
    } else if (first >= 0xe0 && first <= 0xef) {
      needed = 2;
      code = first & 0x0f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      needed = 3;
      code = first & 0x07;
    } else {
      throw new Error('UTF-8 inválido no script do player');
    }

    for (let extra = 0; extra < needed; extra += 1) {
      index += 1;
      if (index >= bytes.length) throw new Error('UTF-8 truncado no script do player');
      const next = bytes.charCodeAt(index);
      if ((next & 0xc0) !== 0x80) throw new Error('UTF-8 inválido no script do player');
      code = (code << 6) | (next & 0x3f);
    }
    if (code > 0x10ffff) throw new Error('Code point inválido no script do player');
    result += String.fromCodePoint(code);
  }
  return result;
}

/**
 * Extrai a primeira URL HTTP(S) de um texto.
 * @param {string} text - Texto decodificado.
 * @returns {string|null} URL normalizada ou null.
 */
function extractUrl(text) {
  const match = String(text).match(/https?:\/\/[^\s"'<>\\]+/);
  if (match === null) return null;
  const value = match[0].replace(/[),.;]+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href;
}

/**
 * Lê a configuração `FirePlayer(vhash,{...})` do HTML do embed.
 * @param {string} html - HTML do embed.
 * @returns {object|null} Configuração ou null quando não há chamada.
 * @throws {Error} Se a configuração existir mas não for JSON válido.
 */
function extractFirePlayerConfig(html) {
  const direct = parseFirePlayerCall(html);
  if (direct !== null) return direct;

  if (html.includes(PACKER_MARKER)) {
    const unpacked = unpackPacker(html);
    if (unpacked !== null) return parseFirePlayerCall(unpacked);
  }
  return null;
}

/**
 * Procura e lê a chamada `FirePlayer(vhash,{...})` em um texto.
 * @param {string} text - HTML ou código desempacotado.
 * @returns {object|null} Configuração ou null.
 * @throws {Error} Se a configuração existir mas não for JSON válido.
 */
function parseFirePlayerCall(text) {
  let searchIndex = 0;
  while (searchIndex < text.length) {
    const call = text.indexOf('FirePlayer(', searchIndex);
    if (call < 0) return null;
    const before = text.slice(Math.max(0, call - 20), call);
    if (/function\s*$/.test(before)) {
      searchIndex = call + 1;
      continue;
    }

    const objectStart = findObjectStart(text, call + 'FirePlayer('.length);
    if (objectStart < 0) {
      searchIndex = call + 1;
      continue;
    }
    const objectText = readBalancedObject(text, objectStart);
    try {
      return JSON.parse(objectText);
    } catch (error) {
      throw new Error(`Configuração do FirePlayer inválida: ${error.message}`, { cause: error });
    }
  }
  return null;
}

/**
 * Encontra o primeiro `{` fora de string a partir de uma posição.
 * @param {string} text - Texto.
 * @param {number} start - Posição inicial.
 * @returns {number} Índice do `{` ou -1.
 */
function findObjectStart(text, start) {
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') return index;
  }
  return -1;
}

/**
 * Lê um objeto balanceado, respeitando strings e escapes.
 * @param {string} text - Texto.
 * @param {number} start - Índice do `{`.
 * @returns {string} Objeto bruto.
 */
function readBalancedObject(text, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error('Objeto do FirePlayer sem fechamento');
}

/**
 * Lê as fontes HLS da configuração do embed.
 * @param {object} config - Configuração do FirePlayer.
 * @param {string} embedUrl - URL final do embed.
 * @returns {EmbedSource[]} Fontes HLS resolvidas.
 * @throws {Error} Se não houver fonte de vídeo.
 */
function readSources(config, embedUrl) {
  const videoData = isPlainObject(config.videoData) ? config.videoData : {};
  const entries = [];
  let unsupported = 0;

  if (Array.isArray(videoData.videoSources)) {
    for (const source of videoData.videoSources) {
      if (!isPlainObject(source) || typeof source.file !== 'string' || source.file.trim() === '') continue;
      const type = typeof source.type === 'string' ? source.type.toLowerCase() : '';
      if (!isHls(source.file, type)) {
        unsupported += 1;
        continue;
      }
      entries.push({ file: source.file, label: typeof source.label === 'string' ? source.label.trim() : null });
    }
  }
  if (videoData.hls === true && typeof videoData.videoSource === 'string' && videoData.videoSource.trim() !== '') {
    entries.push({ file: videoData.videoSource, label: null });
  }
  if (entries.length === 0 && typeof config.videoUrl === 'string' && config.videoUrl.trim() !== '') {
    entries.push({ file: config.videoUrl, label: null });
  }

  const resolved = [];
  const seen = new Set();
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry.file, embedUrl);
    } catch {
      unsupported += 1;
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      unsupported += 1;
      continue;
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    resolved.push({ url: url.href, label: entry.label === '' ? null : entry.label });
  }

  if (resolved.length === 0) {
    if (unsupported > 0) return [];
    throw new Error('Configuração do FirePlayer sem fonte de vídeo');
  }
  return resolved;
}

/**
 * Lê as legendas de `tracks` (ignora miniaturas).
 * @param {object} config - Configuração do FirePlayer.
 * @param {string} embedUrl - URL final do embed.
 * @returns {Array<{ url: string, language: string, name?: string }>} Legendas resolvidas.
 */
function readSubtitles(config, embedUrl) {
  const tracks = Array.isArray(config.tracks) ? config.tracks : [];
  const result = [];
  const seen = new Set();
  for (const track of tracks) {
    if (!isPlainObject(track) || typeof track.file !== 'string' || track.file.trim() === '') continue;
    const kind = typeof track.kind === 'string' ? track.kind.toLowerCase() : '';
    if (kind !== 'captions' && kind !== 'subtitles') continue;
    let url;
    try {
      url = new URL(track.file, embedUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const label = typeof track.label === 'string' ? track.label.trim() : '';
    const subtitle = { url: url.href, language: label || 'Desconhecido' };
    if (label !== '') subtitle.name = label;
    result.push(subtitle);
  }
  return result;
}

/**
 * Identifica uma fonte HLS pelo tipo ou pelo caminho.
 * @param {string} file - Caminho publicado.
 * @param {string} type - Tipo em minúsculas.
 * @returns {boolean} True para HLS.
 */
function isHls(file, type) {
  if (type === 'hls' || type === 'm3u8') return true;
  if (type === 'mp4' || type === 'mkv' || type === 'webm') return false;
  return /\.(m3u8|txt)(?:[?#]|$)/i.test(file) || /\/hls\//i.test(file);
}

/**
 * Verifica se um valor é objeto simples.
 * @param {*} value - Valor.
 * @returns {boolean} True para objeto não nulo e não array.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Lê uma string JS delimitada, resolvendo escapes básicos.
 * @param {string} source - Texto.
 * @param {number} start - Índice da aspa inicial.
 * @param {string} quote - Aspa usada.
 * @returns {{ value: string, end: number }} Conteúdo e posição depois da aspa final.
 */
function readQuoted(source, start, quote) {
  if (source[start] !== quote) throw new Error('String do player sem aspas');
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) throw new Error('Escape incompleto no player');
      if (next === 'u') {
        const hex = source.slice(index + 2, index + 6);
        if (!/^[0-9a-f]{4}$/i.test(hex)) throw new Error('Escape unicode inválido no player');
        value += String.fromCharCode(parseInt(hex, 16));
        index += 5;
        continue;
      }
      if (next === 'x') {
        const hex = source.slice(index + 2, index + 4);
        if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error('Escape hexadecimal inválido no player');
        value += String.fromCharCode(parseInt(hex, 16));
        index += 3;
        continue;
      }
      value += next;
      index += 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
  }
  throw new Error('String do player sem fechamento');
}
