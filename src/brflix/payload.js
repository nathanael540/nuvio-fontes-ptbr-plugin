/** Envelope cifrado e decifragem local da resolução do BRFlix. */
import CryptoJS from 'crypto-js';

// Chave simétrica pública do player do BRFlix, publicada em texto claro em
// https://brflix.lat/app.js (consultado em 12/11/2026). Não é credencial de usuário:
// não identifica conta, não libera recurso além da leitura da resposta pública e não é
// enviada a nenhum serviço. Se o site trocar a chave, a decifragem falha de forma explícita.
const STREAM_ENC_KEY_HEX = '4f9c2d1e8a7b6c5d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d';
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
// GCM usa J0+1 = IV || 00 00 00 02 para o primeiro bloco de keystream. O modo CTR do
// crypto-js incrementa os 32 bits finais a cada bloco, reproduzindo o contador do GCM.
const GCM_COUNTER_SUFFIX = '00000002';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * @typedef {object} ResolutionCandidate
 * @property {string} [provider] - Servidor de origem do candidato.
 * @property {string} [url] - URL absoluta ou relativa ao BRFlix.
 * @property {'hls'|'mp4'|'iframe'|string} [type] - Tipo do candidato.
 * @property {boolean} [dubbed] - `true` para dublado, `false` para legendado.
 * @property {number} [quality] - Resolução informada pela fonte, quando confiável.
 */

/**
 * @typedef {object} Resolution
 * @property {boolean} ok - `false` é ausência reconhecida; `true` traz candidatos.
 * @property {string} [url] - URL de nível superior, usada quando não há `candidates`.
 * @property {'hls'|'mp4'|'iframe'|string} [type] - Tipo da URL de nível superior.
 * @property {string} [provider] - Servidor da URL de nível superior.
 * @property {boolean} [dubbed] - Idioma da URL de nível superior.
 * @property {number} [quality] - Resolução da URL de nível superior.
 * @property {ResolutionCandidate[]} [candidates] - Candidatos encontrados pelo agregado.
 */

/**
 * Lê a resposta da API do BRFlix e devolve a resolução em texto claro.
 *
 * Com `enc: true`, o campo `payload` é decifrado no aparelho com a chave pública do player.
 * Com `enc: false` (ou sem o campo), o próprio objeto é a resolução. A tag GCM não é
 * verificada, porque o `crypto-js` não expõe GHASH; o JSON decifrado é validado
 * estruturalmente antes de seguir para a triagem.
 *
 * @param {*} body - Corpo JSON devolvido por `/best-stream-resolve`.
 * @returns {Resolution} Resolução com `ok` booleano e candidatos quando houver.
 * @throws {Error} Se o envelope, o payload, o Base64, a decifragem ou a estrutura forem inválidos.
 * @example
 * const resolution = readResolution({ enc: false, ok: true, url: '/dynamic-proxy/a.mp4', type: 'mp4' });
 * // { ok: true, url: '/dynamic-proxy/a.mp4', type: 'mp4' }
 */
export function readResolution(body) {
  if (!isPlainObject(body)) throw new Error('Resposta do BRFlix inválida');
  if (body.enc !== undefined && typeof body.enc !== 'boolean') {
    throw new Error('Campo enc do BRFlix inválido');
  }
  const resolution = body.enc === true ? decryptEnvelope(body) : body;
  validateResolution(resolution);
  return resolution;
}

/**
 * Decifra o envelope `iv:tag:ciphertext` e interpreta o JSON resultante.
 * @param {object} envelope - Objeto com `enc: true` e `payload` em Base64.
 * @returns {*} JSON decifrado, ainda sem validação estrutural.
 * @throws {Error} Se o payload estiver ausente, mal formado ou não for JSON válido.
 */
function decryptEnvelope(envelope) {
  if (typeof envelope.payload !== 'string' || envelope.payload.trim() === '') {
    throw new Error('Payload cifrado ausente na resposta do BRFlix');
  }
  const parts = envelope.payload.split(':');
  if (parts.length !== 3) throw new Error('Payload do BRFlix fora do formato iv:tag:ciphertext');
  const iv = decodeBase64(parts[0], 'IV');
  if (iv.sigBytes !== GCM_IV_BYTES) {
    throw new Error(`IV do BRFlix com ${iv.sigBytes} bytes (esperados ${GCM_IV_BYTES})`);
  }
  const tag = decodeBase64(parts[1], 'tag');
  if (tag.sigBytes !== GCM_TAG_BYTES) {
    throw new Error(`Tag do BRFlix com ${tag.sigBytes} bytes (esperados ${GCM_TAG_BYTES})`);
  }
  const ciphertext = decodeBase64(parts[2], 'ciphertext');
  if (ciphertext.sigBytes === 0) throw new Error('Ciphertext do BRFlix vazio');

  const counter = CryptoJS.enc.Hex.parse(`${iv.toString(CryptoJS.enc.Hex)}${GCM_COUNTER_SUFFIX}`);
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext }),
    CryptoJS.enc.Hex.parse(STREAM_ENC_KEY_HEX),
    { iv: counter, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding },
  );

  let text;
  try {
    text = CryptoJS.enc.Utf8.stringify(decrypted);
  } catch (error) {
    throw new Error('Falha ao decifrar o payload do BRFlix', { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Payload decifrado do BRFlix não é JSON válido', { cause: error });
  }
}

/**
 * Decodifica um campo Base64 estrito.
 * @param {string} value - Texto Base64 sem espaços.
 * @param {string} label - Nome do campo para a mensagem de erro.
 * @returns {object} WordArray do crypto-js.
 * @throws {Error} Se o texto não for Base64 válido ou estiver vazio.
 */
function decodeBase64(value, label) {
  if (typeof value !== 'string' || value.length % 4 === 1 || !BASE64.test(value)) {
    throw new Error(`Base64 inválido em ${label} do BRFlix`);
  }
  const words = CryptoJS.enc.Base64.parse(value);
  if (words.sigBytes <= 0) throw new Error(`Base64 vazio em ${label} do BRFlix`);
  return words;
}

/**
 * Valida o mínimo estrutural da resolução: `ok` booleano e, com `ok: true`, candidatos
 * em lista ou uma URL de nível superior. A ausência reconhecida (`ok: false`) não é erro.
 * @param {*} value - Resolução decifrada ou recebida em texto claro.
 * @returns {void}
 * @throws {Error} Se `ok` faltar, `candidates` não for lista ou não houver mídia.
 */
function validateResolution(value) {
  if (!isPlainObject(value)) throw new Error('Resolução do BRFlix inválida');
  if (typeof value.ok !== 'boolean') throw new Error('Resolução do BRFlix sem campo ok');
  if (!value.ok) return;
  if (value.candidates !== undefined && !Array.isArray(value.candidates)) {
    throw new Error('Candidatos do BRFlix inválidos');
  }
  const hasCandidates = Array.isArray(value.candidates) && value.candidates.length > 0;
  const hasUrl = typeof value.url === 'string' && value.url.trim() !== '';
  if (!hasCandidates && !hasUrl) throw new Error('Resolução do BRFlix sem candidatos nem URL');
}

/**
 * @param {*} value - Valor a testar.
 * @returns {boolean} `true` para objeto simples (não nulo, não lista).
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
