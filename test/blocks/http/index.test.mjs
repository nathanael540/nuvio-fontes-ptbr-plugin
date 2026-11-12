import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_USER_AGENT, HEADER_PROFILES, fetchJson, fetchPage, fetchText, playbackHeaders } from '../../../src/_blocks/http/index.mjs';

const URL_PAGE = 'https://exemplo.com/filme/duna';
const ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';

/**
 * Substitui fetch durante um teste e restaura ao final.
 * @returns {{ requests: { url: string, init: object }[] }} Requisições feitas.
 */
function mockFetch(t, options) {
  const { body = '', status = 200 } = options;
  // `finalUrl: undefined` simula o runtime sem response.url; por isso não usamos valor padrão na desestruturação.
  const finalUrl = 'finalUrl' in options ? options.finalUrl : URL_PAGE;
  const original = globalThis.fetch;
  const calls = { requests: [] };
  globalThis.fetch = async (url, init) => {
    calls.requests.push({ url, init });
    return { ok: status >= 200 && status < 300, status, url: finalUrl, text: async () => body };
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

test('perfis: congelados, com User-Agent e Accept-Language em todos', () => {
  assert.ok(Object.isFrozen(HEADER_PROFILES));
  for (const name of ['page', 'api', 'player']) {
    assert.ok(Object.isFrozen(HEADER_PROFILES[name]), name);
    assert.equal(HEADER_PROFILES[name]['User-Agent'], DEFAULT_USER_AGENT);
    assert.equal(HEADER_PROFILES[name]['Accept-Language'], ACCEPT_LANGUAGE);
  }
  assert.equal(HEADER_PROFILES.page.Accept, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  assert.equal(HEADER_PROFILES.api.Accept, 'application/json, text/plain, */*');
  assert.equal(HEADER_PROFILES.api['X-Requested-With'], 'XMLHttpRequest');
  assert.equal(HEADER_PROFILES.player.Accept, '*/*');
  assert.match(DEFAULT_USER_AGENT, /Chrome\/\d+/);
});

test('GET padrão: perfil page, sem corpo, retorna o texto', async (t) => {
  const calls = mockFetch(t, { body: '<html>ok</html>' });

  assert.equal(await fetchText(URL_PAGE), '<html>ok</html>');
  assert.equal(calls.requests.length, 1);
  assert.equal(calls.requests[0].url, URL_PAGE);
  assert.deepEqual(calls.requests[0].init, { method: 'GET', headers: { ...HEADER_PROFILES.page } });
});

test('headers do usuário vencem o perfil escolhido', async (t) => {
  const calls = mockFetch(t, { body: '' });

  await fetchText(URL_PAGE, { profile: 'api', headers: { Accept: 'text/plain', Referer: 'https://exemplo.com/' } });

  assert.deepEqual(calls.requests[0].init.headers, {
    ...HEADER_PROFILES.api,
    Accept: 'text/plain',
    Referer: 'https://exemplo.com/',
  });
});

test('POST com json: corpo serializado e Content-Type application/json', async (t) => {
  const calls = mockFetch(t, { body: '{"ok":true}' });

  const data = await fetchJson(URL_PAGE, { method: 'POST', profile: 'api', json: { id: 1, nome: 'Duna' } });

  assert.deepEqual(data, { ok: true });
  const { init } = calls.requests[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.body, '{"id":1,"nome":"Duna"}');
  assert.equal(init.headers['Content-Type'], 'application/json');
});

test('POST com form: corpo urlencoded e Content-Type de formulário', async (t) => {
  const calls = mockFetch(t, { body: 'ok' });

  await fetchText(URL_PAGE, { method: 'POST', form: { action: 'doo_player_ajax', q: 'a b&c' } });

  const { init } = calls.requests[0];
  assert.equal(init.body, 'action=doo_player_ajax&q=a+b%26c');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=UTF-8');
});

test('Content-Type definido pelo usuário é preservado, em qualquer caixa', async (t) => {
  const calls = mockFetch(t, { body: 'ok' });

  await fetchText(URL_PAGE, { method: 'POST', json: [1], headers: { 'content-type': 'text/plain' } });
  await fetchText(URL_PAGE, { method: 'POST', form: { a: '1' }, headers: { 'Content-Type': 'application/x-custom' } });

  assert.deepEqual(
    Object.keys(calls.requests[0].init.headers).filter((name) => name.toLowerCase() === 'content-type'),
    ['content-type'],
  );
  assert.equal(calls.requests[0].init.headers['content-type'], 'text/plain');
  assert.equal(calls.requests[1].init.headers['Content-Type'], 'application/x-custom');
});

const INVALID_OPTION_CASES = [
  { label: 'method fora de GET/POST', options: { method: 'PUT' }, error: /method inválido: "PUT"/ },
  { label: 'method em minúsculas', options: { method: 'post' }, error: /method inválido: "post"/ },
  { label: 'perfil inexistente', options: { profile: 'mobile' }, error: /profile inválido: "mobile"/ },
  { label: 'json e form juntos', options: { method: 'POST', json: {}, form: {} }, error: /json ou form, não os dois/ },
  { label: 'json com GET', options: { json: {} }, error: /exigem method "POST"/ },
  { label: 'form com GET explícito', options: { method: 'GET', form: { a: '1' } }, error: /exigem method "POST"/ },
];

for (const { label, options, error } of INVALID_OPTION_CASES) {
  test(`lança erro sem requisitar: ${label}`, async (t) => {
    const calls = mockFetch(t, { body: '' });
    await assert.rejects(fetchText(URL_PAGE, options), error);
    assert.equal(calls.requests.length, 0);
  });
}

test('resposta não-2xx lança HTTP <status> em <url> nas três funções', async (t) => {
  mockFetch(t, { body: 'erro', status: 403 });

  for (const fn of [fetchText, fetchJson, fetchPage]) {
    await assert.rejects(fn(URL_PAGE), { message: `HTTP 403 em ${URL_PAGE}` });
  }
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

  await assert.rejects(fetchText(URL_PAGE), (error) => error === networkError);
});

test('fetchJson: corpo que não é JSON lança erro citando a URL', async (t) => {
  mockFetch(t, { body: '<html>bloqueado</html>' });

  await assert.rejects(fetchJson(URL_PAGE), (error) => {
    assert.match(error.message, /^Resposta não é JSON válido em https:\/\/exemplo\.com\/filme\/duna/);
    return true;
  });
});

test('fetchPage: retorna a URL final após redirecionamentos e o corpo', async (t) => {
  mockFetch(t, { body: '<html>final</html>', finalUrl: 'https://espelho.exemplo.com/filme/duna/' });

  assert.deepEqual(await fetchPage('https://exemplo.com/?p=123'), {
    url: 'https://espelho.exemplo.com/filme/duna/',
    text: '<html>final</html>',
  });
});

for (const finalUrl of [undefined, '']) {
  test(`fetchPage: lança erro quando response.url é ${JSON.stringify(finalUrl)}`, async (t) => {
    mockFetch(t, { body: 'ok', finalUrl });
    await assert.rejects(fetchPage(URL_PAGE), /Resposta sem URL final \(response\.url\) em https:\/\/exemplo\.com/);
  });
}

test('playbackHeaders: Referer é a página e Origin é derivado dela', () => {
  assert.deepEqual(playbackHeaders('https://player.exemplo.com:8443/e/abc123?x=1'), {
    'User-Agent': DEFAULT_USER_AGENT,
    Referer: 'https://player.exemplo.com:8443/e/abc123?x=1',
    Origin: 'https://player.exemplo.com:8443',
  });
});

test('playbackHeaders: aceita User-Agent customizado', () => {
  const headers = playbackHeaders('http://exemplo.com/', { userAgent: 'MeuAgente/1.0' });
  assert.equal(headers['User-Agent'], 'MeuAgente/1.0');
  assert.equal(headers.Origin, 'http://exemplo.com');
});

for (const pageUrl of ['nao-e-url', 'ftp://exemplo.com/arquivo', '', undefined]) {
  test(`playbackHeaders: lança erro para pageUrl ${JSON.stringify(pageUrl)}`, () => {
    assert.throws(() => playbackHeaders(pageUrl), /pageUrl inválida/);
  });
}

test('playbackHeaders: lança erro para userAgent vazio', () => {
  assert.throws(() => playbackHeaders(URL_PAGE, { userAgent: '' }), /userAgent inválido/);
});
