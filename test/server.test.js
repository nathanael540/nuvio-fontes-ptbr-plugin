const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./server.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
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
