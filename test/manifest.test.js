const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { formatManifest, loadFormats, manifestVariants, PUBLIC_ORIGIN, readManifestSource, writeFormatManifests } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');
const manifest = readManifestSource(ROOT);

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
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'))), manifest);
  const formats = await loadFormats();
  // O NuvioMobile só aceita URL terminada em /manifest.json: cada formato é uma pasta na raiz.
  const folders = fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'src' && fs.existsSync(path.join(ROOT, entry.name, 'manifest.json')))
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


test('matriz completa preserva metadados e compartilha os mesmos arquivos por formato', async () => {
  const variants = await manifestVariants();
  assert.equal(new Set(variants).size, 168);
  for (const combination of variants) {
    const [formatter, type, quality, language] = combination.split('/');
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, combination, 'manifest.json'), 'utf8'));
    assert.equal(data.version, manifest.version);
    const label = `${type}/${quality}/${language}` === 'all/all/all' ? 'lista completa' : `${type}/${quality}/${language}`;
    assert.equal(data.name, `${manifest.name} (${formatter} · ${label})`);
    assert.equal(data.scrapers.length, manifest.scrapers.length);
    for (const [index, source] of manifest.scrapers.entries()) {
      const { id, filename, ...metadata } = data.scrapers[index];
      const { id: baseId, filename: baseFile, ...baseMetadata } = source;
      assert.deepEqual(metadata, baseMetadata);
      assert.equal(id, `${baseId}--${type.toLowerCase()}-${quality}-${language}`);
      assert.equal(filename, `${PUBLIC_ORIGIN}/${formatter}/${baseFile}`);
      assert.ok(fs.existsSync(path.join(ROOT, filename.slice(PUBLIC_ORIGIN.length + 1))));
    }
  }
});

test('geração de manifests exige todos os pacotes, inclusive após um build direcionado', async (t) => {
  const root = createTempDir('manifest-build-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = { ...manifest, scrapers: manifest.scrapers.slice(0, 1) };
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'manifest.json'), JSON.stringify(source));
  await assert.rejects(writeFormatManifests(root), /pacotes ausentes.*npm run build/);
  assert.ok(!fs.existsSync(path.join(root, 'manifest.json')));
  for (const formatter of ['', ...await loadFormats()]) {
    const file = path.join(root, formatter, source.scrapers[0].filename);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(path.join(ROOT, formatter, source.scrapers[0].filename), file);
  }
  assert.equal((await writeFormatManifests(root)).length, 171);
});

test('adaptador mantém as exportações adicionais do provedor', () => {
  const base = require('../providers/redeflix.js');
  const variant = require('../prism/providers/redeflix.js');
  assert.deepEqual(Object.keys(variant), Object.keys(base));
  assert.deepEqual(variant.ALIASES, base.ALIASES);
  assert.equal(variant.PROVIDER_NAME, base.PROVIDER_NAME);
});
