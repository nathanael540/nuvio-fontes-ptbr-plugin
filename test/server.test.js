const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { createIsolatedServer, createServer } = require('./server.js');

let sessionModule;

test.before(async () => {
  sessionModule = await import('./maestro/prepare-session.mjs');
});

function uniqueId(label) {
  return `test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('modo estático mantém URLs permitidas, CORS e 404 fora das rotas', async (t) => {
  const server = createServer(['', '/prism']);
  const base = await listen(server);
  t.after(() => close(server));

  const manifest = await fetch(`${base}/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('access-control-allow-origin'), '*');
  assert.match(manifest.headers.get('content-type'), /application\/json/);

  assert.equal((await fetch(`${base}/prism/manifest.json`)).status, 200);
  assert.equal((await fetch(`${base}/providers/betor.js`)).status, 200);
  assert.equal((await fetch(`${base}/prism/providers/betor.js`)).status, 200);

  for (const forbidden of ['/package.json', '/src/manifest.json', '/manifest.prism.json', '/providers/../package.json']) {
    assert.equal((await fetch(`${base}${forbidden}`)).status, 404, forbidden);
  }
});

test('modo isolado serve bytes e hash da sessão ativa, com no-store e sem fallback', async (t) => {
  const first = await sessionModule.prepareProviderSession({ provider: 'betor', sessionId: uniqueId('iso-a') });
  const second = await sessionModule.prepareProviderSession({ provider: 'dooplay', sessionId: uniqueId('iso-b') });
  const server = createIsolatedServer();
  const base = await listen(server);
  t.after(async () => {
    await close(server);
    fs.rmSync(first.sessionDir, { recursive: true, force: true });
    fs.rmSync(second.sessionDir, { recursive: true, force: true });
  });

  assert.equal((await fetch(`${base}/manifest.json`)).status, 404);
  assert.equal((await fetch(`${base}/providers/betor.js`)).status, 404);

  server.activateSession(first);
  const manifestResponse = await fetch(`${base}/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestResponse.headers.get('cache-control'), 'no-store');
  assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*');
  assert.equal(sha256(first.manifestPath), first.manifestHash);
  assert.equal(await manifestResponse.text(), fs.readFileSync(first.manifestPath, 'utf8'));

  const packageResponse = await fetch(`${base}/providers/betor.js`);
  assert.equal(packageResponse.status, 200);
  assert.equal(packageResponse.headers.get('cache-control'), 'no-store');
  const packageBytes = Buffer.from(await packageResponse.arrayBuffer());
  assert.equal(createHash('sha256').update(packageBytes).digest('hex'), first.packageHash);

  assert.equal((await fetch(`${base}/providers/dooplay.js`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/manifest.json`, { method: 'POST' })).status, 404);

  assert.throws(() => server.activateSession(second), /já está ativa/);
  assert.equal(server.getActiveSession().sessionId, first.sessionId);
  assert.equal((await fetch(`${base}/providers/betor.js`)).status, 200);

  server.deactivateSession();
  server.activateSession(second);
  assert.equal((await fetch(`${base}/manifest.json`)).status, 200);
  assert.equal((await fetch(`${base}/providers/dooplay.js`)).status, 200);
  const oldScript = await fetch(`${base}/providers/betor.js`);
  assert.equal(oldScript.status, 404);
  assert.equal(await oldScript.text(), `Fora da sessão ativa ${second.sessionId}: use /manifest.json ou /providers/dooplay.js`);

  server.deactivateSession();
  fs.appendFileSync(second.packagePath, '\n// adulterado\n');
  assert.throws(() => server.activateSession(second), /hash do pacote/);
  assert.equal(server.getActiveSession(), null);
  assert.equal((await fetch(`${base}/manifest.json`)).status, 404);
});
