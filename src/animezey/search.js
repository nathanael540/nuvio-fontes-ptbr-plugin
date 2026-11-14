/**
 * Busca no índice público do AnimeZeY.
 *
 * O worker primário recebe POST JSON em `/1:search` e devolve os arquivos indexados. A busca é
 * fuzzy e não paginada neste provedor; cada consulta é uma chamada curta. `429`, `5xx` e falhas de
 * transporte são erros estruturais, não ausência. O worker secundário não é usado porque o link
 * dele no host dedicado respondeu 500 na investigação.
 */

const WORKER = 'https://1.animezey23112022.workers.dev';
const VIDEO_MIME = new Set([
  'video/x-matroska',
  'video/mp4',
  'video/x-msvideo',
  'video/webm',
]);

/**
 * @typedef {object} IndexFile
 * @property {string} name - Nome do arquivo indexado.
 * @property {string|null} id - ID do arquivo, quando publicado.
 * @property {string} mimeType - MIME informado; vazio quando ausente.
 * @property {string|null} size - Tamanho em bytes, como texto.
 * @property {string|null} link - Link relativo ou absoluto de download.
 */

/**
 * Busca arquivos no índice do AnimeZeY.
 *
 * @param {string} query - Termo de busca não vazio.
 * @returns {Promise<IndexFile[]>} Arquivos devolvidos pelo worker; lista vazia é ausência.
 * @throws {Error} Se o termo for inválido, o worker responder fora de 2xx, o JSON for inválido ou
 *   `data.files` não for lista.
 * @example
 * const files = await searchFiles('A Viagem de Chihiro 2001');
 * // files[0].name === 'A Viagem de Chihiro (2001) [1080p][Dual Áudio].mkv'
 */
export async function searchFiles(query) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`Busca inválida: termo vazio (recebido: ${describe(query)})`);
  }
  const url = `${WORKER}/1:search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: '*/*',
      Referer: url,
    },
    body: JSON.stringify({ q: query.trim(), page_token: null, page_index: 0 }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  const body = parseJson(text, url);
  if (!isPlainObject(body) || !isPlainObject(body.data) || !Array.isArray(body.data.files)) {
    throw new Error(`Busca fora do esquema em ${url}: "data.files" ausente ou fora de lista`);
  }
  return body.data.files.map((file, index) => readFile(file, `data.files[${index}]`, url));
}

/**
 * Lê um arquivo do índice.
 * @param {*} file - Item recebido em `data.files`.
 * @param {string} label - Caminho do item nas mensagens de erro.
 * @param {string} url - URL da busca, usada na mensagem.
 * @returns {IndexFile}
 * @throws {Error} Se o nome estiver ausente ou o item não for objeto.
 */
function readFile(file, label, url) {
  if (!isPlainObject(file)) throw new Error(`Busca fora do esquema em ${url}: ${label} não é objeto`);
  const name = typeof file.name === 'string' ? file.name.trim() : '';
  if (name === '') throw new Error(`Busca fora do esquema em ${url}: ${label} sem "name"`);
  return {
    name,
    id: file.id === undefined || file.id === null ? null : String(file.id),
    mimeType: typeof file.mimeType === 'string' ? file.mimeType.trim() : '',
    size: file.size === undefined || file.size === null ? null : String(file.size),
    link: typeof file.link === 'string' && file.link.trim() !== '' ? file.link : null,
  };
}

/**
 * Indica se o MIME é de vídeo aceito.
 * @param {string} mimeType - MIME recebido.
 * @returns {boolean}
 */
export function isVideoMime(mimeType) {
  return VIDEO_MIME.has(mimeType.toLowerCase());
}

/**
 * Interpreta JSON e lança erro de contrato.
 * @param {string} text - Corpo bruto.
 * @param {string} url - URL usada na mensagem.
 * @returns {*} JSON interpretado.
 * @throws {Error} Se o corpo não for JSON válido.
 */
function parseJson(text, url) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Resposta não é JSON válido em ${url}: ${error.message}`, { cause: error });
  }
}

/**
 * Indica se o valor é objeto simples.
 * @param {*} value - Valor recebido.
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Descreve um valor para mensagens de erro.
 * @param {*} value - Valor recebido.
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  return typeof value === 'string' ? `"${value}"` : String(value);
}
