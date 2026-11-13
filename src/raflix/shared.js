/** Utilitários internos do provedor Raflix, sem dependência de blocos do repositório. */

const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {*} value - Valor recebido.
 * @returns {boolean} `true` para objeto simples.
 */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Lê um texto obrigatório e não vazio.
 * @param {*} value - Valor recebido.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} Texto sem espaços nas pontas.
 * @throws {Error} Se o valor não for texto não vazio.
 */
export function readText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} deve ser texto não vazio (recebido: ${String(value)})`);
  }
  return value.trim();
}

/**
 * Lê um texto opcional.
 * @param {*} value - Valor recebido.
 * @returns {string|null} Texto sem espaços nas pontas ou null quando ausente/vazio.
 */
export function optionalText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

/**
 * Resolve e valida uma URL HTTP(S).
 * @param {*} value - URL absoluta ou relativa.
 * @param {string} base - Base para URLs relativas.
 * @param {string} label - Nome do campo nas mensagens de erro.
 * @returns {string} URL absoluta.
 * @throws {Error} Se o valor não for texto não vazio ou não resultar em URL http(s).
 */
export function readHttpUrl(value, base, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} deve ser texto não vazio (recebido: ${String(value)})`);
  }
  let url;
  try {
    url = new URL(value.trim(), base);
  } catch (cause) {
    throw new Error(`${label} não é URL válida: ${value}`, { cause });
  }
  if (!HTTP_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`${label} deve ser URL http(s) (recebido: ${value})`);
  }
  return url.href;
}

/**
 * Remove query strings e tokens JWT de mensagens destinadas ao log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]');
}

/**
 * Nome exibido de um player a partir do identificador da fonte.
 * @param {string} value - Identificador, ex.: "vela".
 * @returns {string} Nome com a primeira letra maiúscula, ex.: "Vela".
 */
export function displayProvider(value) {
  const text = String(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Lê um ano de quatro dígitos em texto ou número.
 * @param {*} value - Valor recebido.
 * @returns {number|null} Ano ou null quando ausente ou fora do formato.
 */
export function readYear(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== 'string') return null;
  const match = /\b(\d{4})\b/.exec(value);
  return match === null ? null : Number(match[1]);
}
