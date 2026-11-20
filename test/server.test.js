const test = require('node:test');
const assert = require('node:assert/strict');
const { manifestVariants } = require('../build.js');
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
  const server = createServer(['', '/prism', '/gdrive'], await manifestVariants());
  const base = await listen(server);
  t.after(() => close(server));

  const manifest = await fetch(`${base}/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers.get('access-control-allow-origin'), '*');
  assert.match(manifest.headers.get('content-type'), /application\/json/);

  assert.equal((await fetch(`${base}/prism/manifest.json`)).status, 200);
  assert.equal((await fetch(`${base}/providers/betor.js`)).status, 200);
  assert.equal((await fetch(`${base}/prism/providers/betor.js`)).status, 200);

  const variant = await fetch(`${base}/prism/P2P/720p/pt-br/manifest.json`);
  assert.equal(variant.status, 200);
  const entry = (await variant.json()).scrapers.find((scraper) => scraper.id === 'betor--p2p-720p-pt-br');
  assert.equal(entry.filename, `${base}/prism/providers/betor.js`);
  assert.equal((await fetch(entry.filename)).status, 200);

  for (const forbidden of ['/package.json', '/src/manifest.json', '/manifest.prism.json', '/providers/../package.json', '/prism/P2P/721p/pt-br/manifest.json', '/prism/providers/%2fbetor.js']) {
    assert.equal((await fetch(`${base}${forbidden}`)).status, 404, forbidden);
  }
});
