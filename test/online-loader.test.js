const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
let loader;

test.before(async () => {
  loader = await import('./online/lib/loader.mjs');
});

test('pacote é lido pelo manifest com SHA-256 dos mesmos bytes executados', () => {
  const pkg = loader.resolveProviderPackage({ rootDir: ROOT, manifest, providerId: 'betor' });
  const bytes = fs.readFileSync(path.join(ROOT, 'providers', 'betor.js'));
  assert.equal(pkg.packageHash, createHash('sha256').update(bytes).digest('hex'));
  const loaded = loader.loadProviderModule({
    code: pkg.code,
    filename: pkg.file,
    expectedHash: pkg.packageHash,
    globals: { fetch: async () => { throw new Error('sem rede'); } },
  });
  assert.equal(typeof loaded.getStreams, 'function');
  assert.equal(loaded.packageHash, pkg.packageHash);
});

test('hash divergente identifica que os bytes executados não são os esperados', () => {
  assert.throws(
    () => loader.loadProviderModule({ code: 'module.exports = { getStreams() {} };', expectedHash: '0'.repeat(64) }),
    /hash do pacote diverge/,
  );
});

test('módulo não permitido falha explicitamente no caminho online', () => {
  assert.throws(
    () => loader.loadProviderModule({ code: "require('fs'); module.exports = { getStreams() {} };" }),
    /módulo externo não permitido no caminho online: "fs"/,
  );
  assert.throws(
    () => loader.loadProviderModule({ code: "require('./basic-html'); module.exports = { getStreams() {} };" }),
    /módulo externo não permitido no caminho online: ".\/basic-html"/,
  );
});

test('alias de cheerio carrega o módulo real e não o substituto de teste', () => {
  const code = `
    const cheerio = require('cheerio');
    module.exports = { getStreams: async () => [{ texto: cheerio.load('<div class="a">real</div>')('.a').text() }] };
  `;
  const loaded = loader.loadProviderModule({ code, globals: { fetch: async () => null } });
  return loaded.getStreams().then((streams) => {
    assert.equal(streams[0].texto, 'real');
  });
});

test('pacote ausente falha com instrução de build', (t) => {
  const dir = createTempDir('online-loader-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tempManifest = { scrapers: [{ id: 'fantasma', filename: 'providers/fantasma.js' }] };
  assert.throws(
    () => loader.resolveProviderPackage({ rootDir: dir, manifest: tempManifest, providerId: 'fantasma' }),
    /pacote ausente: .*providers[\\/]fantasma\.js \(rode node build\.js fantasma\)/,
  );
});

test('provedor fora do manifest é rejeitado', () => {
  assert.throws(
    () => loader.resolveProviderPackage({ rootDir: ROOT, manifest, providerId: 'nao-existe' }),
    /provedor "nao-existe" não está no manifest/,
  );
});
