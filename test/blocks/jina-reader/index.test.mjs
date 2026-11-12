import test from 'node:test';
import assert from 'node:assert/strict';

import { readWithJina } from '../../../src/_blocks/jina-reader/index.mjs';

const PAGE_URL = 'https://exemplo.com/filme/duna?a=1&b=2#player';
const FINAL_URL = 'https://exemplo.com/filme/duna/?a=1&b=2';
const HTML = '<html><body><iframe src="https://player.exemplo.com/e/abc"></iframe></body></html>';

/**
 * Resposta de sucesso do Jina no formato observado em r.jina.ai (`Accept: application/json`).
 * @param {object} [data] - Campos que substituem os padrões de `data`.
 * @returns {string}
 */
function jinaBody(data = {}) {
  return JSON.stringify({
    code: 200,
    status: 20000,
    data: { title: 'Duna', url: PAGE_URL, finalUrl: FINAL_URL, httpStatus: 200, html: HTML, ...data },
  });
}

/**
 * Substitui fetch durante um teste e restaura ao final.
 * @returns {{ requests: { url: string, init: object }[] }} Requisições feitas.
 */
function mockFetch(t, { body, status = 200 }) {
  const original = globalThis.fetch;
  const calls = { requests: [] };
  globalThis.fetch = async (url, init) => {
    calls.requests.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('padrão: POST ao r.jina.ai com a URL no corpo e retorno do HTML renderizado', async (t) => {
  const calls = mockFetch(t, { body: jinaBody() });

  assert.deepEqual(await readWithJina(PAGE_URL), { url: FINAL_URL, status: 200, content: HTML });
  assert.equal(calls.requests.length, 1);
  const { url, init } = calls.requests[0];
  assert.equal(url, 'https://r.jina.ai/');
  assert.equal(init.method, 'POST');
  assert.equal(init.body, JSON.stringify({ url: PAGE_URL }));
  assert.deepEqual(init.headers, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Respond-With': 'html',
  });
});

test('markdown e text leem o campo certo da resposta', async (t) => {
  mockFetch(t, { body: jinaBody({ content: '# Duna', text: 'Duna' }) });

  assert.equal((await readWithJina(PAGE_URL, { format: 'markdown' })).content, '# Duna');
  assert.equal((await readWithJina(PAGE_URL, { format: 'text' })).content, 'Duna');
});

test('todas as opções viram cabeçalhos do Jina', async (t) => {
  const calls = mockFetch(t, { body: jinaBody() });

  await readWithJina(PAGE_URL, {
    engine: 'browser',
    targetSelector: '#player',
    waitForSelector: 'iframe',
    timeout: 30,
    noCache: true,
    apiKey: ' jina_chave ',
  });

  assert.deepEqual(calls.requests[0].init.headers, {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Respond-With': 'html',
    'X-Engine': 'browser',
    'X-Target-Selector': '#player',
    'X-Wait-For-Selector': 'iframe',
    'X-Timeout': '30',
    'X-No-Cache': 'true',
    Authorization: 'Bearer jina_chave',
  });
});

test('noCache false não envia cabeçalho', async (t) => {
  const calls = mockFetch(t, { body: jinaBody() });
  await readWithJina(PAGE_URL, { noCache: false });
  assert.equal('X-No-Cache' in calls.requests[0].init.headers, false);
});

const INVALID_CASES = [
  { label: 'url sem http(s)', url: 'ftp://exemplo.com/a', options: {}, error: /url inválida: "ftp:/ },
  { label: 'url que não é URL', url: 'nao-e-url', options: {}, error: /url inválida/ },
  { label: 'url ausente', url: undefined, options: {}, error: /url inválida/ },
  { label: 'format inexistente', url: PAGE_URL, options: { format: 'pdf' }, error: /format inválido: "pdf"/ },
  { label: 'engine inexistente', url: PAGE_URL, options: { engine: 'chrome' }, error: /engine inválido: "chrome"/ },
  { label: 'targetSelector vazio', url: PAGE_URL, options: { targetSelector: ' ' }, error: /targetSelector inválido/ },
  { label: 'waitForSelector não texto', url: PAGE_URL, options: { waitForSelector: 1 }, error: /waitForSelector inválido/ },
  { label: 'timeout zero', url: PAGE_URL, options: { timeout: 0 }, error: /timeout inválido: "0"/ },
  { label: 'timeout acima de 180', url: PAGE_URL, options: { timeout: 181 }, error: /timeout inválido: "181"/ },
  { label: 'timeout fracionado', url: PAGE_URL, options: { timeout: 1.5 }, error: /timeout inválido/ },
  { label: 'noCache não booleano', url: PAGE_URL, options: { noCache: 'sim' }, error: /noCache inválido/ },
  { label: 'apiKey vazia', url: PAGE_URL, options: { apiKey: '' }, error: /apiKey inválida/ },
];

for (const { label, url, options, error } of INVALID_CASES) {
  test(`lança erro sem requisitar: ${label}`, async (t) => {
    const calls = mockFetch(t, { body: jinaBody() });
    await assert.rejects(readWithJina(url, options), error);
    assert.equal(calls.requests.length, 0);
  });
}

test('Jina fora de 2xx: mensagem traz o motivo informado por ele', async (t) => {
  const body = JSON.stringify({
    data: null,
    code: 403,
    name: 'AbuseAlleviationError',
    message: 'mensagem curta',
    readableMessage: 'AbuseAlleviationError: Anonymous access to domain exemplo.com blocked',
  });
  mockFetch(t, { body, status: 403 });

  await assert.rejects(readWithJina(PAGE_URL), {
    message: `Jina Reader respondeu HTTP 403 para ${PAGE_URL}: AbuseAlleviationError: Anonymous access to domain exemplo.com blocked`,
  });
});

test('Jina fora de 2xx sem JSON: mensagem traz o início do corpo', async (t) => {
  mockFetch(t, { body: ' Too Many Requests ', status: 429 });
  await assert.rejects(readWithJina(PAGE_URL), { message: `Jina Reader respondeu HTTP 429 para ${PAGE_URL}: Too Many Requests` });
});

test('apiKey não aparece na mensagem de erro', async (t) => {
  mockFetch(t, { body: '{"message":"Invalid API key"}', status: 401 });
  await assert.rejects(readWithJina(PAGE_URL, { apiKey: 'jina_segredo' }), (error) => {
    assert.doesNotMatch(error.message, /jina_segredo/);
    return true;
  });
});

test('página fora de 2xx com Jina 200 lança HTTP <status> em <url>', async (t) => {
  mockFetch(t, { body: jinaBody({ httpStatus: 404, warning: 'Target URL returned error 404: Not Found' }) });
  await assert.rejects(readWithJina(PAGE_URL), { message: `HTTP 404 em ${PAGE_URL} (via Jina Reader)` });
});

test('erro de rede do fetch sobe sem captura', async (t) => {
  const original = globalThis.fetch;
  const networkError = new TypeError('Network request failed');
  globalThis.fetch = async () => {
    throw networkError;
  };
  t.after(() => {
    globalThis.fetch = original;
  });

  await assert.rejects(readWithJina(PAGE_URL), (error) => error === networkError);
});

const MALFORMED_CASES = [
  { label: 'corpo que não é JSON', body: '<html>erro</html>', error: /Jina Reader não retornou JSON válido para https:/ },
  { label: 'sem data', body: JSON.stringify({ code: 200 }), error: /não retornou data/ },
  { label: 'sem httpStatus', body: jinaBody({ httpStatus: undefined }), error: /não informou o status HTTP/ },
  { label: 'sem finalUrl', body: jinaBody({ finalUrl: '' }), error: /não informou a URL final/ },
  { label: 'sem o campo do formato', body: jinaBody({ html: undefined }), error: /não retornou conteúdo "html"/ },
];

for (const { label, body, error } of MALFORMED_CASES) {
  test(`resposta 200 malformada lança erro: ${label}`, async (t) => {
    mockFetch(t, { body });
    await assert.rejects(readWithJina(PAGE_URL), error);
  });
}
