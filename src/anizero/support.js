/**
 * Utilitários de texto do provedor AniZero: entidades HTML, atributos, tags e saneamento de log.
 *
 * Não faz rede e não depende de cheerio; a página da fonte usa marcação simples e previsível.
 */

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

/**
 * Decodifica as entidades HTML usadas pela fonte (`&#8211;`, `&#038;`, `&amp;` etc.).
 * @param {string} text - Texto com entidades.
 * @returns {string} Texto decodificado.
 * @example
 * decodeEntities('Baki &#8211; O Campe&atilde;o'); // 'Baki – O Campe&atilde;o'
 */
export function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, decimal) => String.fromCharCode(Number(decimal)))
    .replace(/&([a-z]+);/gi, (match, name) => {
      const value = NAMED_ENTITIES[name.toLowerCase()];
      return value === undefined ? match : value;
    });
}

/**
 * Remove as tags HTML de um trecho.
 * @param {string} text - Trecho com tags.
 * @returns {string} Texto sem tags.
 * @example
 * stripTags('<span>Baki</span>'); // 'Baki'
 */
export function stripTags(text) {
  return String(text).replace(/<[^>]*>/g, ' ');
}

/**
 * Lê o valor de um atributo em uma tag HTML.
 * @param {string} tag - Tag HTML completa.
 * @param {string} name - Nome do atributo.
 * @returns {string|null} Valor bruto do atributo ou null quando ausente.
 * @example
 * readAttribute('<a href="/anime/x/">', 'href'); // '/anime/x/'
 */
export function readAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = String(tag).match(pattern);
  if (match === null) return null;
  return match[1] === undefined ? match[2] : match[1];
}

/**
 * Remove URL e hash longo de uma mensagem de log.
 * @param {string} message - Mensagem bruta.
 * @returns {string} Mensagem saneada.
 * @example
 * sanitizeMessage('HTTP 404 em https://exemplo.test/a/0123456789abcdef0123456789abcdef');
 * // 'HTTP 404 em [url]'
 */
export function sanitizeMessage(message) {
  return String(message)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[hash]');
}
