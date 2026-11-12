/**
 * Bloco jina-reader: lê uma página pelo Jina Reader (https://r.jina.ai), que a busca do lado do servidor,
 * com navegador headless quando preciso, e devolve o HTML renderizado, Markdown ou texto.
 *
 * Útil quando o `fetch` direto do app não chega ao conteúdo: página montada por JavaScript ou bloqueio
 * de bot que o navegador do Jina atravessa. Usa o `fetch` global direto, e não o bloco `http`, para levar
 * à mensagem de erro o motivo informado pelo Jina (cota, domínio bloqueado, falha de navegação).
 *
 * Limites: o Jina aplica cota por IP e pode bloquear o acesso anônimo a alguns domínios.
 * Provedores chamam sem chave. Não há configuração no plugin para informá-la, e ela não entra no repositório.
 */

const JINA_READER_URL = 'https://r.jina.ai/';
// Campo do `data` da resposta JSON que traz o conteúdo em cada formato.
const CONTENT_FIELDS = Object.freeze({ html: 'html', markdown: 'content', text: 'text' });
const ENGINES = ['auto', 'browser', 'curl'];
const MAX_TIMEOUT_SECONDS = 180;

/**
 * @typedef {object} JinaPage
 * @property {string} url - URL final da página, após redirecionamentos.
 * @property {number} status - Status HTTP que a página devolveu ao Jina (sempre 2xx).
 * @property {string} content - Conteúdo no formato pedido.
 */

/**
 * Lê `url` pelo Jina Reader e retorna o conteúdo no formato pedido.
 *
 * A URL vai no corpo de um POST, sem problemas de codificação com `?` e `#`. Uma resposta 2xx do Jina com
 * a página respondendo fora de 2xx (ex.: 404, ou 403 de um bloqueio) também lança erro.
 *
 * @param {string} url - Endereço http(s) da página.
 * @param {object} [options] - Opções da leitura.
 * @param {'html'|'markdown'|'text'} [options.format] - Formato do conteúdo; padrão `'html'` (HTML renderizado,
 *   pronto para o `cheerio` e o `script-extract`).
 * @param {'auto'|'browser'|'curl'} [options.engine] - Motor do Jina: `browser` executa JavaScript, `curl` é mais
 *   rápido e não executa; sem a opção, o Jina escolhe (`auto`).
 * @param {string} [options.targetSelector] - Seletor CSS: retorna só o conteúdo do elemento encontrado.
 * @param {string} [options.waitForSelector] - Seletor CSS: espera o elemento aparecer antes de retornar.
 * @param {number} [options.timeout] - Segundos (inteiro de 1 a 180) que o Jina espera a página carregar.
 * @param {boolean} [options.noCache] - `true` ignora o cache do Jina (válido por 1 hora).
 * @param {string} [options.apiKey] - Chave do Jina (`Authorization: Bearer`). Provedores não enviam este parâmetro. O teste do bloco usa um valor fictício só para garantir que ele não vaze na mensagem de erro.
 * @returns {Promise<JinaPage>} URL final, status da página e conteúdo.
 * @throws {Error} Se `url` ou as opções forem inválidas, se o Jina responder fora de 2xx (a mensagem traz o motivo
 *   dado por ele), se a resposta não for JSON válido, se faltar conteúdo, URL final ou status, ou se a página
 *   responder fora de 2xx; erros de rede sobem sem captura.
 * @example
 * const page = await readWithJina('https://exemplo.com/filme/duna', { engine: 'browser' });
 * const $ = cheerio.load(page.content);
 * // page.url === 'https://exemplo.com/filme/duna/', page.status === 200
 */
export async function readWithJina(url, options = {}) {
  assertHttpUrl(url);
  const format = options.format === undefined ? 'html' : options.format;
  const headers = buildHeaders(format, options);

  const response = await fetch(JINA_READER_URL, { method: 'POST', headers, body: JSON.stringify({ url }) });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Jina Reader respondeu HTTP ${response.status} para ${url}: ${errorDetail(body)}`);
  }

  return toJinaPage(parseJson(body, url), format, url);
}

/**
 * Valida as opções e monta os cabeçalhos da requisição ao Jina.
 * @param {string} format
 * @param {object} options
 * @returns {Record<string, string>}
 * @throws {Error} Se alguma opção for inválida.
 */
function buildHeaders(format, options) {
  if (!Object.prototype.hasOwnProperty.call(CONTENT_FIELDS, format)) {
    throw new Error(`format inválido: "${format}" (esperado "html", "markdown" ou "text")`);
  }
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Respond-With': format };

  if (options.engine !== undefined) {
    if (!ENGINES.includes(options.engine)) {
      throw new Error(`engine inválido: "${options.engine}" (esperado "auto", "browser" ou "curl")`);
    }
    headers['X-Engine'] = options.engine;
  }
  if (options.targetSelector !== undefined) {
    headers['X-Target-Selector'] = requireText(options.targetSelector, 'targetSelector');
  }
  if (options.waitForSelector !== undefined) {
    headers['X-Wait-For-Selector'] = requireText(options.waitForSelector, 'waitForSelector');
  }
  if (options.timeout !== undefined) {
    const { timeout } = options;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_SECONDS) {
      throw new Error(`timeout inválido: "${timeout}" (esperado inteiro de 1 a ${MAX_TIMEOUT_SECONDS} segundos)`);
    }
    headers['X-Timeout'] = String(timeout);
  }
  if (options.noCache !== undefined) {
    if (typeof options.noCache !== 'boolean') {
      throw new Error(`noCache inválido: "${options.noCache}" (esperado true ou false)`);
    }
    if (options.noCache) headers['X-No-Cache'] = 'true';
  }
  if (options.apiKey !== undefined) {
    // A chave não entra na mensagem de erro para não aparecer nos logs.
    if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
      throw new Error('apiKey inválida: esperado texto não vazio');
    }
    headers.Authorization = `Bearer ${options.apiKey.trim()}`;
  }
  return headers;
}

/**
 * Exige texto não vazio numa opção.
 * @param {*} value
 * @param {string} name
 * @returns {string}
 * @throws {Error} Se o valor não for texto não vazio.
 */
function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} inválido: "${value}" (esperado texto não vazio)`);
  }
  return value;
}

/**
 * Exige uma URL http(s) válida.
 * @param {string} url
 * @returns {void}
 * @throws {Error} Se a URL for inválida ou não usar http(s).
 */
function assertHttpUrl(url) {
  const invalid = new Error(`url inválida: "${url}" (esperada URL http ou https)`);
  if (typeof url !== 'string') throw invalid;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw invalid;
}

/**
 * Interpreta o corpo de sucesso do Jina.
 * @param {string} body
 * @param {string} url
 * @returns {*}
 * @throws {Error} Se o corpo não for JSON válido.
 */
function parseJson(body, url) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Jina Reader não retornou JSON válido para ${url}: ${error.message}`, { cause: error });
  }
}

/**
 * Motivo do erro informado pelo Jina (`readableMessage` ou `message`), ou o início do corpo se não for JSON.
 * @param {string} body
 * @returns {string}
 */
function errorDetail(body) {
  const rawDetail = body.trim().slice(0, 200);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return rawDetail;
  }
  const message = parsed && (parsed.readableMessage || parsed.message);
  return typeof message === 'string' ? message.trim() : rawDetail;
}

/**
 * Converte o JSON do Jina em JinaPage.
 * @param {*} json - Resposta `{ code, status, data }` do Jina.
 * @param {'html'|'markdown'|'text'} format
 * @param {string} url
 * @returns {JinaPage}
 * @throws {Error} Se faltar conteúdo, URL final ou status, ou se a página responder fora de 2xx.
 */
function toJinaPage(json, format, url) {
  const data = json && json.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`Jina Reader não retornou data para ${url}`);
  }
  if (typeof data.httpStatus !== 'number') {
    throw new Error(`Jina Reader não informou o status HTTP da página ${url}`);
  }
  if (data.httpStatus < 200 || data.httpStatus >= 300) {
    throw new Error(`HTTP ${data.httpStatus} em ${url} (via Jina Reader)`);
  }
  if (typeof data.finalUrl !== 'string' || data.finalUrl === '') {
    throw new Error(`Jina Reader não informou a URL final de ${url}`);
  }
  const content = data[CONTENT_FIELDS[format]];
  if (typeof content !== 'string') {
    throw new Error(`Jina Reader não retornou conteúdo "${format}" para ${url}`);
  }
  return { url: data.finalUrl, status: data.httpStatus, content };
}
