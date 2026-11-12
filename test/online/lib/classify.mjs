/**
 * Classificação dos casos online e agregação por tipo e provedor.
 *
 * O funcionamento exige ao menos um título resolvido por tipo suportado. A proporção de títulos da
 * amostra é apenas um indicativo de acervo: a quantidade de streams não altera o status.
 */

import { LANGUAGE_MODES } from '../../../src/_blocks/language-discovery/index.mjs';
import { sanitizeMessages, sanitizeText } from './sanitize.mjs';

export const OUTCOMES = Object.freeze({
  RESOLVED: 'Resolvido',
  EMPTY: 'Sem resultado',
  FAILED: 'Falha',
  INCONCLUSIVE: 'Inconclusivo',
});

export const STATUSES = Object.freeze({
  STABLE: 'Estável',
  PARTIAL: 'Parcial',
  UNSTABLE: 'Instável',
  UNVERIFIED: 'Não verificado',
  DISABLED: 'Desativado',
});

export const DEFAULT_SAMPLE_SIZE = 5;

const TMDB_KEY_ERROR = /TMDB_API_KEY|não forneceu a chave do TMDB|chave (?:do )?TMDB (?:ausente|indisponível)/i;

/**
 * Valida o contrato mínimo de um stream retornado pelo provedor.
 *
 * @param {unknown} stream - Item da lista de `getStreams`.
 * @returns {string|null} Motivo da recusa ou null quando o stream é aproveitável.
 * @example
 * streamContractIssue({ url: 'https://cdn/x.m3u8', quality: '1080p', language: 'Dublado', name: 'X', title: 'X' });
 * // null
 */
export function streamContractIssue(stream) {
  if (!stream || typeof stream !== 'object' || Array.isArray(stream)) return 'stream não é objeto';
  const url = stream.url;
  if (typeof url !== 'string' || url.trim() === '') return 'stream sem url';
  if (!isContractUrl(url)) return `url fora do contrato: ${url.slice(0, 80)}`;
  if (typeof stream.quality !== 'string' || stream.quality.trim() === '') return 'stream sem quality';
  if (typeof stream.name !== 'string' || stream.name.trim() === '') return 'stream sem name';
  if (typeof stream.title !== 'string' || stream.title.trim() === '') return 'stream sem title';
  if (!LANGUAGE_MODES.includes(stream.language)) return 'stream com language fora do enum';
  return null;
}

/**
 * Classifica um caso a partir da execução do pacote.
 *
 * @param {{ streams?: unknown, consoleMessages?: { error?: string[], warn?: string[] }, thrownError?: Error|string|null, timedOut?: boolean, timeoutMs?: number, preparationError?: Error|string|null }} result - Resultado bruto do caso.
 * @returns {{ outcome: string, streamsReturned: number, usableStreams: number, reason: string|null, warnings: string[] }} Classificação.
 * @example
 * classifyCase({ streams: [], consoleMessages: { error: [] } });
 * // { outcome: 'Sem resultado', streamsReturned: 0, usableStreams: 0, ... }
 */
export function classifyCase(result) {
  const messages = result.consoleMessages || {};
  const errors = sanitizeMessages(messages.error || []);
  const warnings = sanitizeMessages(messages.warn || []);
  const streams = result.streams;

  if (result.preparationError) {
    return inconclusive(streams, 'Preparação local: ' + sanitizeText(result.preparationError));
  }
  if (result.timedOut) {
    return inconclusive(streams, `Execução excedeu o limite externo de ${result.timeoutMs} ms`);
  }
  if (result.thrownError) {
    const reason = sanitizeText(result.thrownError.message || result.thrownError);
    if (TMDB_KEY_ERROR.test(reason)) return inconclusive(streams, `Configuração local: ${reason}`);
    return failure(streams, errors, `Erro não capturado: ${reason}`, warnings);
  }

  if (!Array.isArray(streams)) {
    return failure(streams, errors, 'Saída inválida: getStreams não devolveu uma lista', warnings);
  }

  const issues = streams.map((stream) => streamContractIssue(stream));
  const usableStreams = issues.filter((issue) => issue === null).length;
  if (usableStreams > 0) {
    return {
      outcome: OUTCOMES.RESOLVED,
      streamsReturned: streams.length,
      usableStreams,
      reason: null,
      warnings,
    };
  }

  if (errors.length > 0) {
    const keyError = errors.find((message) => TMDB_KEY_ERROR.test(message));
    if (keyError) return inconclusive(streams, `Configuração local: ${keyError}`);
    return {
      outcome: OUTCOMES.FAILED,
      streamsReturned: streams.length,
      usableStreams: 0,
      reason: sanitizeText(errors[0]),
      warnings,
    };
  }

  if (streams.length > 0) {
    const firstIssue = issues.find((issue) => issue !== null);
    return {
      outcome: OUTCOMES.FAILED,
      streamsReturned: streams.length,
      usableStreams: 0,
      reason: `Nenhum stream compatível com o contrato (${firstIssue})`,
      warnings,
    };
  }

  return {
    outcome: OUTCOMES.EMPTY,
    streamsReturned: 0,
    usableStreams: 0,
    reason: null,
    warnings,
  };
}

/**
 * Agrega os casos por tipo e calcula o status público do provedor.
 *
 * @param {{ provider: object, cases: object[], sampleSize?: number }} options - Provedor do manifest e casos classificados.
 * @returns {{ status: string, indicators: string[], types: object, totalCases: number, exitCode: number }} Resumo.
 * @throws {Error} Se o provedor não declarar tipos suportados.
 * @example
 * aggregateProvider({ provider, cases: [movieCase, tvCase] });
 * // { status: 'Estável', indicators: ['movie 1/5', 'tv 1/5'], ... }
 */
export function aggregateProvider({ provider, cases, sampleSize = DEFAULT_SAMPLE_SIZE }) {
  if (!provider || !Array.isArray(provider.supportedTypes) || provider.supportedTypes.length === 0) {
    throw new Error('provedor sem supportedTypes para agregar');
  }
  const types = {};
  for (const mediaType of provider.supportedTypes) {
    const list = cases.filter((item) => item.mediaType === mediaType);
    const resolved = list.filter((item) => item.outcome === OUTCOMES.RESOLVED).length;
    const empty = list.filter((item) => item.outcome === OUTCOMES.EMPTY).length;
    const failure = list.filter((item) => item.outcome === OUTCOMES.FAILED).length;
    const inconclusive = list.filter((item) => item.outcome === OUTCOMES.INCONCLUSIVE).length
      + Math.max(0, sampleSize - list.length);
    let state;
    if (resolved > 0) state = 'resolved';
    else if (inconclusive === 0) state = 'empty';
    else state = 'indeterminate';
    types[mediaType] = {
      sampled: sampleSize,
      resolved,
      empty,
      failure,
      inconclusive,
      state,
    };
  }

  const states = Object.values(types).map((type) => type.state);
  let status;
  if (provider.enabled === false) status = STATUSES.DISABLED;
  else if (states.every((state) => state === 'resolved')) status = STATUSES.STABLE;
  else if (states.includes('resolved') && states.every((state) => state === 'resolved' || state === 'empty')) {
    status = STATUSES.PARTIAL;
  } else if (states.every((state) => state === 'empty')) status = STATUSES.UNSTABLE;
  else status = STATUSES.UNVERIFIED;

  let exitCode = 0;
  if (states.includes('indeterminate')) exitCode = 2;
  else if (states.includes('empty')) exitCode = 1;

  return {
    status,
    indicators: provider.supportedTypes.map((mediaType) => `${mediaType} ${types[mediaType].resolved}/${sampleSize}`),
    types,
    totalCases: cases.length,
    exitCode,
  };
}

/**
 * Confere se a URL segue o contrato de stream.
 * @param {string} value - URL do stream.
 * @returns {boolean} True para HTTP(S), magnet btih hexadecimal ou torrent:// com índice.
 */
function isContractUrl(value) {
  if (/^magnet:/i.test(value)) {
    return /[?&]xt=urn:btih:[a-f0-9]{40}(?:&|$)/i.test(value);
  }
  if (/^torrent:\/\//i.test(value)) {
    return /^torrent:\/\/[a-f0-9]{40}\/\d+$/i.test(value);
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Monta um caso inconclusivo.
 * @param {unknown} streams - Saída bruta, se houver.
 * @param {string} reason - Motivo saneado.
 * @returns {object} Caso classificado.
 */
function inconclusive(streams, reason) {
  return {
    outcome: OUTCOMES.INCONCLUSIVE,
    streamsReturned: Array.isArray(streams) ? streams.length : 0,
    usableStreams: 0,
    reason: sanitizeText(reason),
    warnings: [],
  };
}

/**
 * Monta um caso de falha.
 * @param {unknown} streams - Saída bruta, se houver.
 * @param {string[]} errors - Erros já saneados.
 * @param {string} reason - Motivo principal.
 * @param {string[]} warnings - Avisos já saneados.
 * @returns {object} Caso classificado.
 */
function failure(streams, errors, reason, warnings) {
  return {
    outcome: OUTCOMES.FAILED,
    streamsReturned: Array.isArray(streams) ? streams.length : 0,
    usableStreams: 0,
    reason: sanitizeText(errors.length > 0 ? errors[0] : reason),
    warnings,
  };
}
