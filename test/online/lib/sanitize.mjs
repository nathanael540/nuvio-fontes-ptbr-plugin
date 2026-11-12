/**
 * Saneamento de mensagens antes de qualquer persistência pública.
 *
 * Remove URLs, credenciais, tokens e valores opacos. O relatório e o histórico nunca recebem o
 * objeto de stream, corpos de resposta ou cabeçalhos.
 */

const URL_PATTERN = /\b(?:https?|magnet|torrent):\/\/[^\s"'<>]+/gi;
const ASSIGNMENT_PATTERN = /\b(api[_-]?key|access[_-]?token|token|secret|password|authorization|cookie|signature|sig|expires|key)=([^&\s"'<>]+)/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const LONG_HEX_PATTERN = /\b[A-Fa-f0-9]{32,}\b/g;
const OPAQUE_PATTERN = /\b[A-Za-z0-9+/=_-]{40,}\b/g;

/**
 * Sanea texto livre para relatório e histórico.
 *
 * @param {unknown} value - Valor original.
 * @param {{ maxLength?: number }} [options] - Limite de caracteres do resultado.
 * @returns {string} Texto sem URLs, credenciais ou valores opacos.
 * @example
 * sanitizeText('falha em https://cdn.example/v?token=abc');
 * // 'falha em <url>'
 */
export function sanitizeText(value, { maxLength = 300 } = {}) {
  let text = String(value ?? '');
  text = text.replace(URL_PATTERN, '<url>');
  text = text.replace(ASSIGNMENT_PATTERN, '$1=<redacted>');
  text = text.replace(BEARER_PATTERN, 'Bearer <redacted>');
  text = text.replace(JWT_PATTERN, '<redacted>');
  text = text.replace(LONG_HEX_PATTERN, '<redacted>');
  text = text.replace(OPAQUE_PATTERN, '<redacted>');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) {
    text = `${text.slice(0, Math.max(0, maxLength - 3))}...`;
  }
  return text;
}

/**
 * Sanea uma lista de mensagens, preservando a ordem e limitando a quantidade.
 *
 * @param {unknown[]} messages - Mensagens capturadas do console.
 * @param {{ limit?: number, maxLength?: number }} [options] - Limites de quantidade e tamanho.
 * @returns {string[]} Mensagens saneadas e não vazias.
 * @example
 * sanitizeMessages(['erro em https://x.test/a?token=1']);
 * // ['erro em <url>']
 */
export function sanitizeMessages(messages, { limit = 5, maxLength = 300 } = {}) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(0, limit)
    .map((message) => sanitizeText(message, { maxLength }))
    .filter((message) => message !== '');
}
