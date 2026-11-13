/** Triagem dos candidatos do BRFlix e montagem dos streams. */
import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { playbackHeaders } from '../_blocks/http/index.mjs';
import { LANGUAGE } from '../_blocks/language-discovery/index.mjs';
import { buildStream } from '../_blocks/stream-build/index.mjs';

const SOURCE_URL = 'https://brflix.lat/';
const PLAYABLE_TYPES = new Set(['hls', 'mp4']);
const MIN_QUALITY = 100;
const MAX_QUALITY = 9999;

/**
 * @typedef {import('./payload.js').Resolution} Resolution
 * @typedef {import('./payload.js').ResolutionCandidate} ResolutionCandidate
 */

/**
 * Seleciona os candidatos jogáveis e monta os streams do BRFlix.
 *
 * `candidates` tem precedência; sem candidatos, a URL de nível superior vira o único
 * candidato. `iframe` e tipos desconhecidos são descartados por triagem, sem aviso.
 * Candidato HLS ou MP4 com URL inválida é opção com falha: recebe `console.warn` e não
 * interrompe os demais. Se nada for produzido e alguma opção tiver falhado, o erro agregado
 * sobe para o ponto de entrada.
 *
 * @param {Resolution} resolution - Resolução validada por `readResolution`.
 * @param {string} providerName - Nome exibido pelo formatador, ex.: `BRFlix`.
 * @returns {object[]} Streams ainda não ordenados; vazio em ausência ou triagem total.
 * @throws {Error} Se todas as opções falharem ou se `buildStream` rejeitar os campos.
 * @example
 * buildStreams({ ok: true, url: '/dynamic-proxy/a.mp4', type: 'mp4', dubbed: true }, 'BRFlix');
 * // [ { url: 'https://brflix.lat/dynamic-proxy/a.mp4', language: 'Dublado', ... } ]
 */
export function buildStreams(resolution, providerName) {
  if (resolution.ok === false) return [];
  const candidates = readCandidates(resolution);
  const streams = [];
  const failures = [];
  const seen = new Set();

  candidates.forEach((candidate, index) => {
    const label = candidateLabel(candidate, index);
    try {
      const stream = buildCandidate(candidate, providerName);
      if (stream === null || seen.has(stream.url)) return;
      seen.add(stream.url);
      streams.push(stream);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
      console.warn(`[${providerName}] Opção ${label} descartada: ${error.message}`);
    }
  });

  if (!streams.length && failures.length) {
    throw new Error(`Todas as opções falharam: [${failures.join('; ')}]`);
  }
  return streams;
}

/**
 * Lê `candidates` com fallback para a URL de nível superior.
 * @param {Resolution} resolution - Resolução validada.
 * @returns {ResolutionCandidate[]} Candidatos na ordem da fonte.
 */
function readCandidates(resolution) {
  if (Array.isArray(resolution.candidates) && resolution.candidates.length > 0) {
    return resolution.candidates;
  }
  if (typeof resolution.url === 'string' && resolution.url.trim() !== '') return [resolution];
  return [];
}

/**
 * Monta um stream de um candidato; `null` é descarte de triagem.
 * @param {ResolutionCandidate} candidate - Candidato da fonte.
 * @param {string} providerName - Nome exibido pelo formatador.
 * @returns {object|null} Stream montado ou `null` para `iframe`/tipo desconhecido.
 * @throws {Error} Se o candidato ou a URL forem inválidos, ou se `buildStream` rejeitar os campos.
 */
function buildCandidate(candidate, providerName) {
  if (!isPlainObject(candidate)) throw new Error('Candidato inválido');
  const type = readType(candidate.type);
  if (type === null) return null;
  const fields = {
    url: httpUrl(candidate.url),
    type,
    headers: playbackHeaders(SOURCE_URL),
    format: { template: FORMATTER.AUTO, addon: providerName },
  };
  const provider = text(candidate.provider);
  if (provider) fields.provider = provider;
  const language = readLanguage(candidate.dubbed);
  if (language !== null) fields.language = language;
  const quality = readQuality(candidate.quality);
  if (quality !== null) fields.quality = quality;
  return buildStream(fields);
}

/**
 * @param {*} value - Tipo anunciado pelo candidato.
 * @returns {'hls'|'mp4'|null} Tipo jogável normalizado; `null` para iframe ou desconhecido.
 */
function readType(value) {
  if (typeof value !== 'string') return null;
  const type = value.trim().toLowerCase();
  return PLAYABLE_TYPES.has(type) ? type : null;
}

/**
 * Resolve a URL do candidato contra o BRFlix e exige HTTP(S).
 * @param {*} value - URL absoluta ou relativa.
 * @returns {string} URL absoluta.
 * @throws {Error} Se a URL estiver ausente, for malformada ou não usar HTTP(S).
 */
function httpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Endereço de mídia ausente');
  let url;
  try {
    url = new URL(value, SOURCE_URL);
  } catch {
    throw new Error('Endereço de mídia inválido');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endereço de mídia não é HTTP(S)');
  }
  return url.href;
}

/**
 * @param {*} value - Campo `dubbed` do candidato.
 * @returns {string|null} Membro do enum LANGUAGE ou `null` quando a fonte não informa.
 */
function readLanguage(value) {
  if (value === true) return LANGUAGE.DUBBED;
  if (value === false) return LANGUAGE.SUBTITLED;
  return null;
}

/**
 * Aceita só uma resolução inteira plausível; valores fracionários do HLS são ignorados.
 * @param {*} value - Campo `quality` do candidato.
 * @returns {number|null} Altura em pixels ou `null` quando não é resolução confiável.
 */
function readQuality(value) {
  if (!Number.isInteger(value) || value < MIN_QUALITY || value > MAX_QUALITY) return null;
  return value;
}

/**
 * Rótulo da opção para o aviso de descarte.
 * @param {*} candidate - Candidato da fonte.
 * @param {number} index - Posição na lista.
 * @returns {string} Nome do provedor ou `Servidor <n>`.
 */
function candidateLabel(candidate, index) {
  const provider = isPlainObject(candidate) ? text(candidate.provider) : '';
  return provider || `Servidor ${index + 1}`;
}

/**
 * @param {*} value - Valor a testar.
 * @returns {boolean} `true` para objeto simples (não nulo, não lista).
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {*} value - Valor a testar.
 * @returns {string} Texto sem espaços nas pontas ou string vazia.
 */
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}
