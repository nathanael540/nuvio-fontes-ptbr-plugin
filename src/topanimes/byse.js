/**
 * Decifragem do `playback` do Filemoon/Byse para o TopAnimes.
 *
 * O endpoint `api/videos/<código>` devolve o objeto `playback` em AES-256-GCM. A decifragem usa o
 * keystream AES-CTR do próprio GCM com `crypto-js`, sem verificar a tag, como o player observado.
 * Mesmo algoritmo clean-room já usado em `src/vaqueirofilmes/byse.js`, mantido local para o
 * provedor não depender do módulo de outro provedor.
 */

import CryptoJS from 'crypto-js';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_VERSION = 20;

/**
 * Decifra o `playback` Byse com AES-256-GCM sem verificar a tag.
 * @param {{ version?: string|number, key_parts?: string[], iv?: string, payload?: string }} playback - Bloco cifrado.
 * @returns {object} JSON decifrado.
 * @throws {Error} Se as partes, a chave, o IV, o payload ou o JSON forem inválidos.
 * @example
 * const playback = decryptPlayback({ version: '1', key_parts: [...], iv: '...', payload: '...' });
 * playback.sources // [{ url: 'https://cdn/master.m3u8', type: 'hls', ... }]
 */
export function decryptPlayback(playback) {
  if (!playback || typeof playback !== 'object') throw new Error('Playback ausente');
  const parts = selectKeyParts(playback);
  const key = concatBytes(parts.map((part, index) => decodeBase64Url(part, `key_parts[${index}]`)), 'chave');
  if (key.length !== KEY_BYTES) throw new Error(`Chave do playback com ${key.length} bytes (esperados ${KEY_BYTES})`);
  const iv = decodeBase64Url(playback.iv, 'iv');
  if (iv.length !== IV_BYTES) throw new Error(`IV do playback com ${iv.length} bytes (esperados ${IV_BYTES})`);
  const payload = decodeBase64Url(playback.payload, 'payload');
  if (payload.length <= GCM_TAG_BYTES) throw new Error('Payload do playback menor que a tag GCM');

  const plain = decryptGcm(key, iv, payload.subarray(0, payload.length - GCM_TAG_BYTES));
  let json;
  try {
    json = CryptoJS.enc.Utf8.stringify(toWordArray(plain));
  } catch (error) {
    throw new Error('Playback decifrado não é UTF-8 válido', { cause: error });
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error('Playback decifrado não é JSON válido', { cause: error });
  }
}

/**
 * Seleciona as partes da chave pela regra `[version, 31 - version]`, com fallback para todas.
 * @param {{ version?: string|number, key_parts?: string[] }} playback - Bloco cifrado.
 * @returns {string[]} Partes selecionadas.
 * @throws {Error} Se `key_parts` não for uma lista não vazia de textos.
 */
function selectKeyParts(playback) {
  const parts = playback.key_parts;
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('key_parts ausente no playback');
  if (!parts.every((part) => typeof part === 'string' && part.trim() !== '')) {
    throw new Error('key_parts contém parte vazia ou inválida');
  }
  const version = readVersion(playback.version);
  if (version === null) return parts;
  const first = version - 1;
  const second = 30 - version;
  if (first < 0 || first >= parts.length || second < 0 || second >= parts.length) return parts;
  return [parts[first], parts[second]];
}

/**
 * Lê a versão do playback como inteiro de 1 a 20.
 * @param {*} value - Valor de `version`.
 * @returns {number|null}
 */
function readVersion(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const version = Number(text);
  return version >= 1 && version <= MAX_VERSION ? version : null;
}

/**
 * Decifra AES-256-GCM usando o keystream AES-CTR do próprio GCM.
 * @param {Uint8Array} key - Chave de 32 bytes.
 * @param {Uint8Array} iv - IV de 12 bytes.
 * @param {Uint8Array} ciphertext - Ciphertext sem a tag GCM.
 * @returns {Uint8Array} Texto claro em bytes.
 * @throws {Error} Se o bloco de contador não produzir 16 bytes.
 */
function decryptGcm(key, iv, ciphertext) {
  const keyWords = toWordArray(key);
  const counter = new Uint8Array(16);
  counter.set(iv, 0);
  counter[15] = 2;
  const plain = new Uint8Array(ciphertext.length);
  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const block = aesBlock(counter, keyWords);
    const length = Math.min(16, ciphertext.length - offset);
    for (let index = 0; index < length; index += 1) {
      plain[offset + index] = ciphertext[offset + index] ^ block[index];
    }
    incrementCounter(counter);
  }
  return plain;
}

/**
 * Cifra um bloco de contador com AES-ECB sem padding.
 * @param {Uint8Array} block - Bloco de 16 bytes.
 * @param {*} keyWords - Chave no formato WordArray.
 * @returns {Uint8Array} Bloco cifrado de 16 bytes.
 * @throws {Error} Se o resultado não tiver 16 bytes.
 */
function aesBlock(block, keyWords) {
  const encrypted = CryptoJS.AES.encrypt(toWordArray(block), keyWords, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.NoPadding,
  });
  const bytes = fromWordArray(encrypted.ciphertext);
  if (bytes.length !== 16) throw new Error('Bloco de contador do playback com tamanho inválido');
  return bytes;
}

/**
 * Incrementa o contador GCM nos 32 bits finais.
 * @param {Uint8Array} counter - Bloco de contador, alterado no lugar.
 * @returns {void}
 */
function incrementCounter(counter) {
  for (let index = 15; index >= 12; index -= 1) {
    counter[index] = (counter[index] + 1) & 0xff;
    if (counter[index] !== 0) break;
  }
}

/**
 * Decodifica base64url em bytes.
 * @param {*} value - Texto base64url.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {Uint8Array} Bytes decodificados.
 * @throws {Error} Se o valor faltar ou não for base64url válido.
 */
function decodeBase64Url(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} ausente no playback`);
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch (error) {
    throw new Error(`${label} não é base64url válido`, { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Concatena partes de bytes.
 * @param {Uint8Array[]} parts - Partes a unir.
 * @param {string} label - Nome do resultado nas mensagens de erro.
 * @returns {Uint8Array} Bytes concatenados.
 */
function concatBytes(parts, label) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  if (length === 0) throw new Error(`${label} vazia no playback`);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Converte bytes em WordArray do crypto-js.
 * @param {Uint8Array} bytes - Bytes recebidos.
 * @returns {*} WordArray.
 */
function toWordArray(bytes) {
  const words = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const position = index >>> 2;
    words[position] = (words[position] || 0) | (bytes[index] << (24 - (index % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

/**
 * Converte um WordArray do crypto-js em bytes.
 * @param {*} wordArray - WordArray recebido.
 * @returns {Uint8Array}
 */
function fromWordArray(wordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes[index] = (wordArray.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
  }
  return bytes;
}
