/**
 * Bloco blogger-video: extrai os MP4 progressivos publicados no HTML do player do Blogger.
 *
 * A extração é somente textual e local: recebe o HTML bruto do player, decodifica as entidades
 * HTML usadas pela página e lê `streamingData.formats` nas duas formas observadas (string
 * JavaScript escapada e objeto JSON embutido). Formatos adaptativos e `serverAbrStreamingUrl`
 * ficam fora do contrato. Não faz requisição, não usa cheerio, não lê configuração e não registra
 * log.
 */

const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * Extrai os MP4 progressivos de `streamingData.formats` do HTML do Blogger.
 *
 * O JSON vem como uma string JavaScript escapada dentro do HTML ou como objeto JSON embutido; as
 * entidades HTML e os escapes são decodificados antes das duas leituras de JSON. Cada item
 * devolvido tem a URL aparada e o `qualityLabel` aparado, ou `null` quando o campo está ausente,
 * não é texto ou está vazio. URL fora de HTTP(S) é ignorada e não há deduplicação.
 *
 * @param {string} html - HTML do player do Blogger.
 * @returns {{ url: string, qualityLabel: string|null }[]} Formatos progressivos, na ordem publicada.
 * @throws {Error} Se `streamingData` não existir, se o JSON não for válido ou se nenhum formato
 *   progressivo com URL HTTP(S) restar.
 * @example
 * extractBloggerFormats('<script>var p = "{\\"streamingData\\":{\\"formats\\":[{\\"url\\":\\"https://cdn.example.test/360.mp4\\",\\"qualityLabel\\":\\"360p\\"}]}}";</script>');
 * // [{ url: 'https://cdn.example.test/360.mp4', qualityLabel: '360p' }]
 */
export function extractBloggerFormats(html) {
  const data = readStreamingData(decodeHtmlEntities(html));
  if (!data || !Array.isArray(data.formats)) throw new Error('Player do Blogger sem streamingData.formats');

  const formats = [];
  for (const item of data.formats) {
    if (!item || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!isHttpUrl(url)) continue;
    const qualityLabel = typeof item.qualityLabel === 'string' ? item.qualityLabel.trim() : '';
    formats.push({ url, qualityLabel: qualityLabel === '' ? null : qualityLabel });
  }
  if (formats.length === 0) throw new Error('Player do Blogger sem MP4 progressivo');
  return formats;
}

/**
 * Lê o objeto que contém `streamingData` no HTML decodificado.
 * @param {string} text - HTML com entidades já decodificadas.
 * @returns {object} Objeto com `formats`.
 * @throws {Error} Se o objeto não for encontrado ou não for JSON válido.
 */
function readStreamingData(text) {
  const marker = '"{\\"streamingData\\"';
  const start = text.indexOf(marker);
  if (start !== -1) {
    const end = findStringEnd(text, start);
    try {
      const parsed = JSON.parse(JSON.parse(text.slice(start, end + 1)));
      return parsed.streamingData;
    } catch (error) {
      throw new Error(`Player do Blogger com streamingData inválido: ${error.message}`, { cause: error });
    }
  }

  const index = text.indexOf('"streamingData"');
  if (index === -1) throw new Error('Player do Blogger sem streamingData');
  const open = text.lastIndexOf('{', index);
  const end = findObjectEnd(text, open);
  try {
    const parsed = JSON.parse(text.slice(open, end + 1));
    return parsed.streamingData;
  } catch (error) {
    throw new Error(`Player do Blogger com streamingData inválido: ${error.message}`, { cause: error });
  }
}

/**
 * Encontra o fim da string JavaScript que começa na aspa indicada.
 * @param {string} text - Texto.
 * @param {number} start - Índice da aspa de abertura.
 * @returns {number} Índice da aspa de fechamento.
 * @throws {Error} Se a string não terminar.
 */
function findStringEnd(text, start) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === '"') return index;
  }
  throw new Error('String de streamingData sem fechamento');
}

/**
 * Encontra o fim do objeto JSON que começa na chave indicada.
 * @param {string} text - Texto.
 * @param {number} start - Índice da chave de abertura.
 * @returns {number} Índice da chave de fechamento.
 * @throws {Error} Se o objeto não terminar.
 */
function findObjectEnd(text, start) {
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
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Objeto de streamingData sem fechamento');
}

/**
 * Decodifica as entidades HTML usadas na página do Blogger.
 * @param {string} text - HTML bruto.
 * @returns {string} Texto decodificado.
 */
function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Indica se o valor é uma URL HTTP(S).
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isHttpUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    return HTTP_PROTOCOLS.includes(new URL(value.trim()).protocol);
  } catch {
    return false;
  }
}
