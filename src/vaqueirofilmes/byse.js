/** Byse: playback cifrado, decifragem local e montagem dos streams HLS. */
import CryptoJS from 'crypto-js';
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { fetchJson, playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const BYSE_HOST = 'embedplaybyse.top';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_VERSION = 20;

/**
 * Resolve uma página Byse até os streams HLS.
 * @param {string} videoUrl - URL `https://embedplaybyse.top/e/<código>/<slug>`.
 * @param {object} media - Dados do TMDB.
 * @param {string} providerName - Nome exibido pelo formatador.
 * @returns {Promise<object[]>} Streams HLS; vazio quando todas as fontes são descartadas por tipo.
 * @throws {Error} Se o host, o código, o playback, a decifragem ou as fontes forem inválidos.
 */
export async function resolveByseStreams(videoUrl, media, providerName) {
  const parsed = new URL(videoUrl);
  if (parsed.hostname !== BYSE_HOST) throw new Error(`Host Byse não suportado: ${parsed.hostname}`);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const code = segments[0] === 'e' ? segments[1] : null;
  if (!code || !/^[a-z0-9]+$/i.test(code)) throw new Error('Código Byse ausente na URL');

  const apiUrl = `${parsed.origin}/api/videos/${encodeURIComponent(code)}/`;
  const data = await fetchJson(apiUrl, {
    profile: 'api',
    headers: { Referer: videoUrl, Accept: 'application/json' },
  });
  if (!data || typeof data !== 'object' || !data.playback || typeof data.playback !== 'object') {
    throw new Error('Playback Byse ausente na resposta');
  }

  const playback = decryptPlayback(data.playback);
  if (!Array.isArray(playback.sources) || playback.sources.length === 0) {
    throw new Error('Playback Byse sem fontes');
  }

  const streams = [];
  for (const source of playback.sources) {
    const url = readHttpUrl(source && source.url, 'fonte do playback');
    if (!isHls(source, url)) {
      console.log(`[VaqueiroFilmes] Fonte ${source.label || url} descartada por triagem: não é HLS`);
      continue;
    }
    const fields = {
      url,
      type: 'hls',
      language: LANGUAGE.DUBBED,
      headers: playbackHeaders(videoUrl),
      format: formatDetails(providerName, media),
    };
    if (Number.isInteger(source.height) && source.height > 0) fields.quality = source.height;
    const hints = [source.label, source.quality].filter((hint) => typeof hint === 'string' && hint.trim() !== '');
    if (hints.length) fields.qualityHints = hints;
    const subtitles = readSubtitles(playback.tracks, videoUrl);
    if (subtitles.length) fields.subtitles = subtitles;
    streams.push(buildStream(fields));
  }
  return streams;
}

/**
 * Decifra o `playback` Byse com AES-256-GCM sem verificar a tag, como o player observado.
 * @param {{ version?: string|number, key_parts?: string[], iv?: string, payload?: string }} playback - Bloco cifrado.
 * @returns {object} JSON decifrado.
 * @throws {Error} Se as partes, a chave, o IV, o payload ou o JSON forem inválidos.
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

/**
 * Lê as legendas válidas do playback.
 * @param {*} tracks - Lista de faixas do Byse.
 * @param {string} videoUrl - Página do Byse usada como Referer.
 * @returns {Array<{ url: string, language: string, name?: string, headers: object }>} Legendas válidas.
 * @throws {Error} Se `tracks` existir e não for lista.
 */
function readSubtitles(tracks, videoUrl) {
  if (tracks === undefined || tracks === null) return [];
  if (!Array.isArray(tracks)) throw new Error('tracks do playback inválido');
  const subtitles = [];
  for (const track of tracks) {
    if (!track || typeof track !== 'object') {
      console.warn('[VaqueiroFilmes] Legenda descartada: faixa inválida');
      continue;
    }
    if (typeof track.language !== 'string' || track.language.trim() === '') {
      console.warn('[VaqueiroFilmes] Legenda descartada: idioma ausente');
      continue;
    }
    let url;
    try {
      url = readHttpUrl(track.url, 'legenda');
    } catch (error) {
      console.warn(`[VaqueiroFilmes] Legenda descartada: ${error.message}`);
      continue;
    }
    const subtitle = {
      url,
      language: normalizeTrackLanguage(track.language),
      headers: playbackHeaders(videoUrl),
    };
    if (typeof track.title === 'string' && track.title.trim() !== '') subtitle.name = track.title.trim();
    subtitles.push(subtitle);
  }
  return subtitles;
}

/**
 * Normaliza códigos comuns de idioma de legenda sem inventar região.
 * @param {string} value - Idioma declarado pela faixa.
 * @returns {string}
 */
function normalizeTrackLanguage(value) {
  const raw = value.trim();
  const key = raw.toLowerCase().replace(/_/g, '-');
  if (key === 'pt-br' || key === 'ptbr') return 'Português (BR)';
  if (key === 'pt' || key === 'por' || key === 'portuguese') return 'Português';
  if (key === 'en' || key === 'eng' || key === 'english' || key === 'en-us') return 'English';
  if (key === 'es' || key === 'spa' || key === 'spanish' || key === 'es-la') return 'Español';
  return raw;
}

/**
 * Indica se a fonte é HLS.
 * @param {object} source - Fonte do playback.
 * @param {string} url - URL já validada.
 * @returns {boolean}
 */
function isHls(source, url) {
  const mime = typeof source.mime_type === 'string' ? source.mime_type.toLowerCase() : '';
  if (mime.includes('mpegurl')) return true;
  return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
}

/**
 * Lê uma URL HTTP(S) obrigatória.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o valor faltar ou não usar HTTP(S).
 */
function readHttpUrl(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} sem URL`);
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${label} não é HTTP(S)`);
  return url.href;
}

/**
 * Detalhes de apresentação do stream.
 * @param {string} providerName - Nome exibido.
 * @param {object} media - Dados do TMDB.
 * @returns {object} Valor de `format` para `buildStream`.
 */
function formatDetails(providerName, media) {
  const format = { template: FORMATTER.AUTO, addon: providerName, title: media.title };
  if (media.year !== null) format.year = media.year;
  return format;
}
