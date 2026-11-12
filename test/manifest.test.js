const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));

const SEMVER = /^\d+\.\d+\.\d+$/;
const MEDIA_TYPES = ['movie', 'tv'];

test('manifest possui metadados do repositório', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.match(manifest.version, SEMVER);
  assert.ok(Array.isArray(manifest.scrapers), 'scrapers deve ser uma lista');
});

test('ids dos provedores são únicos', () => {
  const ids = manifest.scrapers.map((scraper) => scraper.id);
  assert.equal(new Set(ids).size, ids.length);
});

for (const scraper of manifest.scrapers) {
  test(`provedor "${scraper.id}" é válido e carregável`, () => {
    assert.match(scraper.id, /^[a-z0-9-]+$/);
    for (const field of ['name', 'description', 'author', 'logo']) {
      assert.equal(typeof scraper[field], 'string', `${field} deve ser texto`);
    }
    assert.match(scraper.version, SEMVER);
    assert.equal(typeof scraper.enabled, 'boolean');
    assert.ok(scraper.supportedTypes.length > 0);
    assert.ok(scraper.supportedTypes.every((type) => MEDIA_TYPES.includes(type)));
    assert.ok(scraper.formats.length > 0, 'formats não pode ser vazio');
    assert.ok(scraper.contentLanguage.includes('pt'), 'contentLanguage deve conter "pt"');
    assert.equal(new URL(scraper.logo).protocol, 'https:', 'logo deve ser uma URL https');
    assert.equal(scraper.filename, `providers/${scraper.id}.js`);

    const { getStreams } = require(path.join(ROOT, scraper.filename));
    assert.equal(typeof getStreams, 'function');
  });
}

test('manifests de formato estão em sincronia com o manifest.json', async () => {
  const { formatManifest, loadFormats } = require('../build.js');
  const formats = await loadFormats();
  // O NuvioMobile só aceita URL terminada em /manifest.json: cada formato é uma pasta na raiz.
  const folders = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, entry.name, 'manifest.json')))
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(folders, [...formats].sort(), 'sobra ou falta <formato>/manifest.json: rode node build.js');
  assert.deepEqual(
    fs.readdirSync(ROOT).filter((name) => /^manifest\..+\.json$/.test(name)),
    [],
    'manifest de formato na raiz não funciona no NuvioMobile',
  );

  for (const formatter of formats) {
    const current = JSON.parse(fs.readFileSync(path.join(ROOT, formatter, 'manifest.json'), 'utf-8'));
    assert.deepEqual(current, formatManifest(manifest, formatter), `${formatter}/manifest.json desatualizado: rode node build.js`);
    const providers = fs.readdirSync(path.join(ROOT, formatter, 'providers')).sort();
    assert.deepEqual(providers, manifest.scrapers.map((scraper) => `${scraper.id}.js`).sort(), `${formatter}/providers/ fora de sincronia`);
    for (const scraper of current.scrapers) {
      const file = path.join(ROOT, formatter, scraper.filename);
      const { getStreams } = require(file);
      assert.equal(typeof getStreams, 'function', `${formatter}/${scraper.filename} deve exportar getStreams`);
    }
  }
});
