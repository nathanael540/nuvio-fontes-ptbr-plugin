/**
 * Bloco http: requisições HTTP dos provedores com perfis de cabeçalho prontos e falhas observáveis.
 *
 * Toda resposta fora de 2xx vira erro com o status e a URL; erros de rede do `fetch` sobem sem captura.
 * Também monta os cabeçalhos de reprodução (User-Agent, Referer, Origin) que as hospedagens exigem.
 */

/**
 * User-Agent de Chrome desktop recente, usado em todos os perfis e nos cabeçalhos de reprodução.
 * @type {string}
 */
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';
// Cabeçalhos comuns a todos os perfis.
const BASE_HEADERS = Object.freeze({ 'User-Agent': DEFAULT_USER_AGENT, 'Accept-Language': ACCEPT_LANGUAGE });
const JSON_CONTENT_TYPE = 'application/json';
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded; charset=UTF-8';
const METHODS = ['GET', 'POST'];

/**
 * Perfis de cabeçalho imutáveis, todos com `User-Agent` e `Accept-Language` em pt-BR:
 * 1. `page`: páginas HTML (padrão).
 * 2. `api`: endpoints JSON/AJAX, com `X-Requested-With: XMLHttpRequest`.
 * 3. `player`: players e recursos de mídia (`Accept: *\/*`).
 * @type {Readonly<{ page: Readonly<Record<string, string>>, api: Readonly<Record<string, string>>, player: Readonly<Record<string, string>> }>}
 */
export const HEADER_PROFILES = Object.freeze({
  page: Object.freeze({ ...BASE_HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }),
  api: Object.freeze({ ...BASE_HEADERS, Accept: 'application/json, text/plain, */*', 'X-Requested-With': 'XMLHttpRequest' }),
  player: Object.freeze({ ...BASE_HEADERS, Accept: '*/*' }),
});

/**
 * @typedef {object} RequestOptions
 * @property {'GET'|'POST'} [method] - Método HTTP; padrão `'GET'`.
 * @property {'page'|'api'|'player'} [profile] - Perfil de cabeçalhos; padrão `'page'`.
 * @property {Record<string, string>} [headers] - Cabeçalhos mesclados por cima do perfil.
 * @property {*} [json] - Corpo serializado como JSON (só com POST).
 * @property {Record<string, string>} [form] - Corpo serializado como formulário (só com POST).
 */

/**
 * Busca `url` e retorna o corpo como texto.
 *
 * @param {string} url - Endereço requisitado.
 * @param {object} [options] - Opções da requisição.
 * @param {'GET'|'POST'} [options.method] - Método HTTP; padrão `'GET'`.
 * @param {'page'|'api'|'player'} [options.profile] - Perfil de cabeçalhos; padrão `'page'`.
 * @param {Record<string, string>} [options.headers] - Cabeçalhos mesclados por cima do perfil.
 * @param {*} [options.json] - Corpo enviado como JSON (`Content-Type: application/json`); exige POST.
 * @param {Record<string, string>} [options.form] - Corpo enviado como formulário urlencoded; exige POST.
 * @returns {Promise<string>} Corpo da resposta.
 * @throws {Error} Se as opções forem inválidas ou se a resposta não for 2xx; erros de rede sobem sem captura.
 * @example
 * const html = await fetchText('https://exemplo.com/filme/duna', { headers: { Referer: 'https://exemplo.com/' } });
 */
export async function fetchText(url, options) {
  const response = await request(url, options);
  return response.text();
}

/**
 * Busca `url` e retorna o corpo interpretado como JSON.
 *
 * @param {string} url - Endereço requisitado.
 * @param {object} [options] - Opções da requisição.
 * @param {'GET'|'POST'} [options.method] - Método HTTP; padrão `'GET'`.
 * @param {'page'|'api'|'player'} [options.profile] - Perfil de cabeçalhos; padrão `'page'`.
 * @param {Record<string, string>} [options.headers] - Cabeçalhos mesclados por cima do perfil.
 * @param {*} [options.json] - Corpo enviado como JSON (`Content-Type: application/json`); exige POST.
 * @param {Record<string, string>} [options.form] - Corpo enviado como formulário urlencoded; exige POST.
 * @returns {Promise<*>} Corpo da resposta já interpretado.
 * @throws {Error} Se as opções forem inválidas, se a resposta não for 2xx ou se o corpo não for JSON válido
 *   (a mensagem cita a URL); erros de rede sobem sem captura.
 * @example
 * const data = await fetchJson('https://exemplo.com/api/player', {
 *   method: 'POST',
 *   profile: 'api',
 *   form: { action: 'doo_player_ajax', post: '123' },
 * });
 */
export async function fetchJson(url, options) {
  const response = await request(url, options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Resposta não é JSON válido em ${url}: ${error.message}`, { cause: error });
  }
}

/**
 * Busca `url` e retorna a URL final após redirecionamentos junto com o corpo.
 *
 * @param {string} url - Endereço requisitado.
 * @param {object} [options] - Opções da requisição.
 * @param {'GET'|'POST'} [options.method] - Método HTTP; padrão `'GET'`.
 * @param {'page'|'api'|'player'} [options.profile] - Perfil de cabeçalhos; padrão `'page'`.
 * @param {Record<string, string>} [options.headers] - Cabeçalhos mesclados por cima do perfil.
 * @param {*} [options.json] - Corpo enviado como JSON (`Content-Type: application/json`); exige POST.
 * @param {Record<string, string>} [options.form] - Corpo enviado como formulário urlencoded; exige POST.
 * @returns {Promise<{ url: string, text: string }>} `url` final (`response.url`) e corpo como texto.
 * @throws {Error} Se as opções forem inválidas, se a resposta não for 2xx ou se o runtime não informar
 *   a URL final (`response.url` ausente ou vazio); erros de rede sobem sem captura.
 * @example
 * const page = await fetchPage('https://exemplo.com/?p=123');
 * // page.url === 'https://exemplo.com/filme/duna/', page.text === '<html>...'
 */
export async function fetchPage(url, options) {
  const response = await request(url, options);
  if (typeof response.url !== 'string' || response.url === '') {
    throw new Error(`Resposta sem URL final (response.url) em ${url}`);
  }
  return { url: response.url, text: await response.text() };
}

/**
 * Monta os cabeçalhos de reprodução que a hospedagem exige para tocar o vídeo (campo `headers` do stream).
 *
 * @param {string} pageUrl - URL da página ou do player onde o vídeo foi encontrado; vira `Referer` e define `Origin`.
 * @param {object} [options] - Opções.
 * @param {string} [options.userAgent] - User-Agent a enviar; padrão `DEFAULT_USER_AGENT`.
 * @returns {{ 'User-Agent': string, Referer: string, Origin: string }} Cabeçalhos para o stream.
 * @throws {Error} Se `pageUrl` não for uma URL http(s) válida ou se `options.userAgent` for informado vazio
 *   ou fora de texto.
 * @example
 * const headers = playbackHeaders('https://player.exemplo.com/e/abc123');
 * // { 'User-Agent': DEFAULT_USER_AGENT, Referer: 'https://player.exemplo.com/e/abc123', Origin: 'https://player.exemplo.com' }
 */
export function playbackHeaders(pageUrl, options = {}) {
  const userAgent = options.userAgent === undefined ? DEFAULT_USER_AGENT : options.userAgent;
  if (typeof userAgent !== 'string' || userAgent.trim() === '') {
    throw new Error(`userAgent inválido: "${options.userAgent}" (esperado texto não vazio)`);
  }
  return { 'User-Agent': userAgent, Referer: pageUrl, Origin: httpOrigin(pageUrl) };
}

/**
 * Origem de uma URL http(s).
 * @param {string} pageUrl
 * @returns {string}
 * @throws {Error} Se a URL for inválida ou não usar http(s).
 */
function httpOrigin(pageUrl) {
  const invalid = new Error(`pageUrl inválida: "${pageUrl}" (esperada URL http ou https)`);
  if (typeof pageUrl !== 'string') throw invalid;
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch {
    throw invalid;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw invalid;
  return parsed.origin;
}

/**
 * Valida as opções, faz a requisição e exige resposta 2xx.
 * @param {string} url
 * @param {RequestOptions} [options]
 * @returns {Promise<Response>}
 * @throws {Error} Se as opções forem inválidas ou a resposta não for 2xx.
 */
async function request(url, options = {}) {
  const method = options.method === undefined ? 'GET' : options.method;
  const profile = options.profile === undefined ? 'page' : options.profile;
  const hasJson = options.json !== undefined;
  const hasForm = options.form !== undefined;

  if (!METHODS.includes(method)) {
    throw new Error(`method inválido: "${method}" (esperado "GET" ou "POST")`);
  }
  if (!Object.prototype.hasOwnProperty.call(HEADER_PROFILES, profile)) {
    throw new Error(`profile inválido: "${profile}" (esperado "page", "api" ou "player")`);
  }
  if (hasJson && hasForm) {
    throw new Error('Use json ou form, não os dois na mesma requisição');
  }
  if ((hasJson || hasForm) && method === 'GET') {
    throw new Error('json e form exigem method "POST"');
  }

  const headers = { ...HEADER_PROFILES[profile], ...options.headers };
  const init = { method, headers };
  if (hasJson) {
    init.body = JSON.stringify(options.json);
    setDefaultContentType(headers, JSON_CONTENT_TYPE);
  }
  if (hasForm) {
    init.body = new URLSearchParams(options.form).toString();
    setDefaultContentType(headers, FORM_CONTENT_TYPE);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${url}`);
  }
  return response;
}

/**
 * Define Content-Type só se o usuário não definiu (comparação sem diferenciar maiúsculas).
 * @param {Record<string, string>} headers
 * @param {string} contentType
 * @returns {void}
 */
function setDefaultContentType(headers, contentType) {
  const defined = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
  if (!defined) headers['Content-Type'] = contentType;
}
