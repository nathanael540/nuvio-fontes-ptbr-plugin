/**
 * Cliente da busca pública do Seekee (`h5-api.otv.cc`), com a assinatura calculada no aparelho.
 *
 * Protocolo observado no script público de busca do Seekee (implementação própria, sem código copiado):
 * 1. Uma chave AES de 16 caracteres hexadecimais é sorteada a cada consulta.
 * 2. `aeskey`: a chave cifrada com a chave pública RSA-1024 do cliente (PKCS#1 v1.5), em Base64.
 * 3. `sign`: MD5 (hex) do AES-128-ECB/PKCS#7, em Base64, de `<currentTime><Base64 dos valores da query>`
 *    com `+` trocado por `-` e `/` por `_`; os valores entram na ordem decrescente de `chave=valor`.
 *
 * A aritmética RSA usa multiplicação de Montgomery com limbs de 16 bits em números comuns, sem `BigInt`,
 * para rodar no QuickJS transpilado para `es2016`.
 */

import CryptoJS from 'crypto-js';
import { fetchJson } from '../_blocks/http/index.mjs';

const SEARCH_URL = 'https://h5-api.otv.cc/quan/h5/search/search';
const SUCCESS_CODE = '00000';
const HEX_DIGITS = '0123456789abcdef';
const AES_KEY_LENGTH = 16;
const DEVICE_ID_LENGTH = 32;
// Módulo da chave pública RSA-1024 (SPKI `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTV/esy4...`) do script
// público de busca do Seekee; o expoente é 65537.
const RSA_MODULUS_HEX =
  '9357f7accb8f828305dad172835fe87efaf9658b693eba029367109bfc29bfa4c8548ffad30d962f3166924772a3a22d' +
  '51fc4e6e404781b2538537246e49de185dab87653ed9f40b9a2d6f167784ce732fef329a912fdd6ab1d0ec35b948ccad' +
  'd1d5eab0be6f3e6fb1bf9a3118cf03c5a5c37003d64b552df7f955f612f70fe3';
// Constantes de Montgomery para limbs de 16 bits e R = 2^1024, derivadas do módulo acima:
// R² mod n e n' = -n⁻¹ mod 2^16. O teste confere o `aeskey` contra o RSA do Node.
const RSA_R2_HEX =
  '0d2e8d5c4d695341b3586d076440e29cbd6d10b34a762ce1d152bc38f44925c565939f2202ab528b601a7400ffea1ece' +
  '858282c64edf610e000aca5de496e4cf5e6cd03a7eb7874217eb1996a489ee9c5fbe2f6608855d8a577fa92deb99880b' +
  '05f6c11b623fa135155a8cb8b69809347fbf33237563f1a3815b25dfc4e2815d';
const RSA_N_PRIME = 0x5235;
const RSA_BYTES = 128;
const LIMB_BASE = 0x10000;
const LIMB_COUNT = RSA_BYTES / 2;
const CLIENT_HEADERS = Object.freeze({ lang: 'pt', versionCode: '182', clientType: 'android_buscari' });

/**
 * @typedef {object} SearchResult
 * @property {string} resourceUrl - Página do título no domínio do índice (`/pt/detail/<movie|drama>/<slug>`).
 * @property {string} resourceTitle - Título exibido, com prefixo de idioma (`[Português Dublado]...`).
 * @property {string} typeCode - `movie` ou `drama`.
 * @property {number|null} [endYear] - Ano publicado do filme ou da temporada.
 */

/**
 * Consulta a busca pública do Seekee pelo termo informado.
 * @param {string} keyWord - Termo da busca.
 * @returns {Promise<SearchResult[]>} Resultados na ordem da API (no máximo cinco); lista vazia em ausência.
 * @throws {Error} Se a API responder fora de 2xx, com código diferente de `"00000"` ou sem a lista `data`.
 */
export async function searchSeekee(keyWord) {
  const params = { enterType: 'user', keyWord };
  const currentTime = String(Date.now());
  const aesKey = randomHex(AES_KEY_LENGTH);
  const body = await fetchJson(`${SEARCH_URL}?${new URLSearchParams(params).toString()}`, {
    profile: 'api',
    headers: {
      ...CLIENT_HEADERS,
      deviceId: randomHex(DEVICE_ID_LENGTH),
      currentTime,
      aeskey: encryptAesKey(aesKey),
      sign: signParams(params, currentTime, aesKey),
    },
  });
  if (body === null || typeof body !== 'object' || body.code !== SUCCESS_CODE) {
    const code = body && typeof body === 'object' ? `${body.code} ${body.msg}` : typeof body;
    throw new Error(`Busca do Seekee recusou a consulta "${keyWord}": ${code}`);
  }
  if (!Array.isArray(body.data)) throw new Error(`Busca do Seekee sem lista de resultados para "${keyWord}"`);
  return body.data;
}

/**
 * Calcula o cabeçalho `sign` da consulta.
 * @param {Record<string, string>} params - Parâmetros da query.
 * @param {string} currentTime - Milissegundos enviados em `currentTime`.
 * @param {string} aesKey - Chave AES de 16 caracteres.
 * @returns {string} MD5 hexadecimal minúsculo.
 */
function signParams(params, currentTime, aesKey) {
  const values = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((pair) => pair.slice(pair.indexOf('=') + 1))
    .join('');
  const payload = `${currentTime}${CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(values))}`
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const cipher = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(payload), CryptoJS.enc.Utf8.parse(aesKey), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.MD5(cipher.toString()).toString(CryptoJS.enc.Hex);
}

/**
 * Cifra a chave AES com a chave pública RSA (PKCS#1 v1.5, tipo 2).
 * @param {string} aesKey - Chave ASCII de 16 caracteres.
 * @returns {string} Bloco cifrado de 128 bytes em Base64.
 */
function encryptAesKey(aesKey) {
  const block = [0x00, 0x02];
  const paddingLength = RSA_BYTES - aesKey.length - 3;
  for (let i = 0; i < paddingLength; i += 1) block.push(1 + Math.floor(Math.random() * 255));
  block.push(0x00);
  for (let i = 0; i < aesKey.length; i += 1) block.push(aesKey.charCodeAt(i));

  const modulus = bytesToLimbs(hexToBytes(RSA_MODULUS_HEX));
  const one = new Array(LIMB_COUNT).fill(0);
  one[0] = 1;
  // No domínio de Montgomery: m·R; e = 65537 = 2^16 + 1 são dezesseis quadrados e uma multiplicação.
  const message = montgomeryMultiply(bytesToLimbs(block), bytesToLimbs(hexToBytes(RSA_R2_HEX)), modulus);
  let result = message;
  for (let i = 0; i < 16; i += 1) result = montgomeryMultiply(result, result, modulus);
  result = montgomeryMultiply(montgomeryMultiply(result, message, modulus), one, modulus);

  return btoa(String.fromCharCode.apply(null, limbsToBytes(result)));
}

/**
 * Multiplicação de Montgomery (CIOS) com limbs de 16 bits: `a · b · R⁻¹ mod n`, com R = 2^1024.
 * Os produtos parciais ficam abaixo de 2^34, exatos em `number`.
 * @param {number[]} a - Fator menor que o módulo.
 * @param {number[]} b - Fator menor que o módulo.
 * @param {number[]} modulus - Módulo ímpar.
 * @returns {number[]} Resultado menor que o módulo.
 */
function montgomeryMultiply(a, b, modulus) {
  const t = new Array(LIMB_COUNT + 2).fill(0);
  for (let i = 0; i < LIMB_COUNT; i += 1) {
    let carry = 0;
    for (let j = 0; j < LIMB_COUNT; j += 1) {
      const sum = t[j] + a[j] * b[i] + carry;
      t[j] = sum % LIMB_BASE;
      carry = Math.floor(sum / LIMB_BASE);
    }
    let sum = t[LIMB_COUNT] + carry;
    t[LIMB_COUNT] = sum % LIMB_BASE;
    t[LIMB_COUNT + 1] = Math.floor(sum / LIMB_BASE);

    const factor = (t[0] * RSA_N_PRIME) % LIMB_BASE;
    carry = Math.floor((t[0] + factor * modulus[0]) / LIMB_BASE);
    for (let j = 1; j < LIMB_COUNT; j += 1) {
      sum = t[j] + factor * modulus[j] + carry;
      t[j - 1] = sum % LIMB_BASE;
      carry = Math.floor(sum / LIMB_BASE);
    }
    sum = t[LIMB_COUNT] + carry;
    t[LIMB_COUNT - 1] = sum % LIMB_BASE;
    t[LIMB_COUNT] = t[LIMB_COUNT + 1] + Math.floor(sum / LIMB_BASE);
  }
  const result = t.slice(0, LIMB_COUNT);
  if (t[LIMB_COUNT] > 0 || !isLess(result, modulus)) subtractInPlace(result, modulus);
  return result;
}

/**
 * @param {number[]} a - Número em limbs.
 * @param {number[]} b - Número em limbs.
 * @returns {boolean} Se `a < b`.
 */
function isLess(a, b) {
  for (let i = LIMB_COUNT - 1; i >= 0; i -= 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/**
 * Subtrai `b` de `a` no lugar, descartando o empréstimo final (que cancela o limb excedente).
 * @param {number[]} a - Número em limbs, alterado no lugar.
 * @param {number[]} b - Subtraendo.
 * @returns {void}
 */
function subtractInPlace(a, b) {
  let borrow = 0;
  for (let i = 0; i < LIMB_COUNT; i += 1) {
    const diff = a[i] - b[i] - borrow;
    borrow = diff < 0 ? 1 : 0;
    a[i] = diff < 0 ? diff + LIMB_BASE : diff;
  }
}

/**
 * @param {string} hex - Texto hexadecimal de tamanho par.
 * @returns {number[]} Bytes big-endian.
 */
function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

/**
 * @param {number[]} bytes - 128 bytes big-endian.
 * @returns {number[]} Limbs de 16 bits little-endian.
 */
function bytesToLimbs(bytes) {
  const limbs = new Array(LIMB_COUNT);
  for (let i = 0; i < LIMB_COUNT; i += 1) {
    const low = RSA_BYTES - 1 - 2 * i;
    limbs[i] = bytes[low] | (bytes[low - 1] << 8);
  }
  return limbs;
}

/**
 * @param {number[]} limbs - Limbs de 16 bits little-endian.
 * @returns {number[]} 128 bytes big-endian.
 */
function limbsToBytes(limbs) {
  const bytes = new Array(RSA_BYTES);
  for (let i = 0; i < LIMB_COUNT; i += 1) {
    const low = RSA_BYTES - 1 - 2 * i;
    bytes[low] = limbs[i] & 0xff;
    bytes[low - 1] = limbs[i] >> 8;
  }
  return bytes;
}

/**
 * @param {number} length - Quantidade de caracteres.
 * @returns {string} Texto hexadecimal aleatório.
 */
function randomHex(length) {
  let text = '';
  for (let i = 0; i < length; i += 1) text += HEX_DIGITS[Math.floor(Math.random() * 16)];
  return text;
}
