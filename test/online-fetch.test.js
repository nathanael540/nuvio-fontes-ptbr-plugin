const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let fetchModule;
let classifyModule;

test.before(async () => {
  fetchModule = await import('./online/lib/fetch.mjs');
  classifyModule = await import('./online/lib/classify.mjs');
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('fetch real preserva redirecionamento e resposta binária', async (t) => {
  const bytes = Buffer.from([0, 1, 2, 3, 254, 255]);
  const server = http.createServer((req, res) => {
    if (req.url === '/inicio') {
      res.writeHead(302, { Location: '/bytes' }).end();
      return;
    }
    if (req.url === '/bytes') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(bytes);
      return;
    }
    res.writeHead(404).end();
  });
  const base = await listen(server);
  t.after(() => close(server));

  const fetchReal = fetchModule.createRealFetch();
  const response = await fetchReal(`${base}/inicio`);
  assert.equal(response.status, 200);
  assert.equal(response.redirected, true);
  assert.equal(new URL(response.url).pathname, '/bytes');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('adaptador devolve a mesma resposta, sem fallback ou leitura do corpo', async () => {
  const original = new Response('corpo', { status: 201 });
  let calls = 0;
  const fetchReal = fetchModule.createRealFetch({
    fetchImpl: async () => {
      calls += 1;
      return original;
    },
  });
  const response = await fetchReal('https://example.com/x');
  assert.equal(response, original);
  assert.equal(calls, 1);
});

test('chave TMDB só entra nas globais quando existe no ambiente local', () => {
  assert.equal(fetchModule.readTmdbApiKey({}), null);
  assert.equal(fetchModule.readTmdbApiKey({ TMDB_API_KEY: '   ' }), null);
  assert.equal(fetchModule.readTmdbApiKey({ TMDB_API_KEY: '  chave-local  ' }), 'chave-local');

  const withoutKey = fetchModule.createCaseGlobals({ providerId: 'sem-tmdb', tmdbApiKey: null });
  assert.equal('TMDB_API_KEY' in withoutKey, false);
  const withKey = fetchModule.createCaseGlobals({ providerId: 'com-tmdb', tmdbApiKey: 'abc' });
  assert.equal(withKey.TMDB_API_KEY, 'abc');
});

test('chave ausente é configuração local e erro da fonte é falha', () => {
  const missing = classifyModule.classifyCase({
    streams: [],
    consoleMessages: { error: ['[Fonte] chave TMDB ausente para consultar o catálogo'] },
  });
  assert.equal(missing.outcome, 'Inconclusivo');

  const source = classifyModule.classifyCase({
    streams: [],
    consoleMessages: { error: ['[Fonte] TMDB respondeu HTTP 401 para movie 603'] },
  });
  assert.equal(source.outcome, 'Falha');
});
