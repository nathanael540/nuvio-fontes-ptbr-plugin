const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let session;
let build;

test.before(async () => {
  session = await import('./maestro/prepare-session.mjs');
  build = require('../build.js');
});

function uniqueId(label) {
  return `test-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('sessão padrão usa Prism, manifest mínimo e não altera a publicação', async (t) => {
  const id = uniqueId('betor');
  const publishedManifest = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8');
  const publishedPackage = path.join(__dirname, '..', 'providers', 'betor.js');
  const publishedHash = sha256(publishedPackage);

  const prepared = await session.prepareProviderSession({ provider: 'betor', sessionId: id });
  t.after(() => fs.rmSync(prepared.sessionDir, { recursive: true, force: true }));

  assert.equal(prepared.formatter, 'prism');
  assert.ok(prepared.packagePath.startsWith(session.SESSIONS_ROOT));
  assert.ok(fs.existsSync(prepared.packagePath));
  assert.ok(fs.existsSync(prepared.manifestPath));

  const manifest = JSON.parse(fs.readFileSync(prepared.manifestPath, 'utf8'));
  assert.equal(manifest.scrapers.length, 1);
  assert.equal(manifest.scrapers[0].id, 'betor');
  assert.equal(manifest.scrapers[0].filename, 'providers/betor.js');
  assert.equal(manifest.scrapers[0].enabled, true);
  assert.equal(manifest.name, JSON.parse(publishedManifest).name);
  assert.match(prepared.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(prepared.packageHash, /^[a-f0-9]{64}$/);

  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'), publishedManifest);
  assert.equal(sha256(publishedPackage), publishedHash);
});

test('hash da sessão é igual ao de um build equivalente temporário', async (t) => {
  const id = uniqueId('hash');
  const prepared = await session.prepareProviderSession({ provider: 'dooplay', sessionId: id });
  const temp = createTempDir('session-hash-');
  t.after(() => {
    fs.rmSync(prepared.sessionDir, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const equivalent = await build.buildProvider('dooplay', { formatter: 'prism', outDir: temp });
  assert.equal(sha256(prepared.packagePath), sha256(equivalent));
});

test('formato inválido, provedor ausente e sessão repetida falham explicitamente', async () => {
  await assert.rejects(
    session.prepareProviderSession({ provider: 'betor', formatter: 'auto' }),
    /formato desconhecido/,
  );
  await assert.rejects(
    session.prepareProviderSession({ provider: 'nao-existe' }),
    /não está no manifest/,
  );

  const id = uniqueId('repetida');
  const prepared = await session.prepareProviderSession({ provider: 'betor', sessionId: id });
  try {
    await assert.rejects(
      session.prepareProviderSession({ provider: 'betor', sessionId: id }),
      /já existe/,
    );
  } finally {
    fs.rmSync(prepared.sessionDir, { recursive: true, force: true });
  }
});

test('alvo desativado é ativado somente na cópia da sessão', async (t) => {
  const temp = createTempDir('session-manifest-');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const betor = manifest.scrapers.find((item) => item.id === 'betor');
  betor.enabled = false;
  const manifestPath = path.join(temp, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const id = uniqueId('disabled');
  const prepared = await session.prepareProviderSession({ provider: 'betor', sessionId: id, manifestPath });
  t.after(() => {
    fs.rmSync(prepared.sessionDir, { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).scrapers.find((item) => item.id === 'betor').enabled, false);
  assert.equal(JSON.parse(fs.readFileSync(prepared.manifestPath, 'utf8')).scrapers[0].enabled, true);
});

test('provedor no manifest sem fonte falha no build da sessão', async (t) => {
  const temp = createTempDir('session-source-');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  manifest.scrapers.push({ ...manifest.scrapers[0], id: 'fantasma', filename: 'providers/fantasma.js' });
  const manifestPath = path.join(temp, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const id = uniqueId('fantasma');
  t.after(() => {
    fs.rmSync(path.join(session.SESSIONS_ROOT, id), { recursive: true, force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  await assert.rejects(
    session.prepareProviderSession({ provider: 'fantasma', sessionId: id, manifestPath }),
    /src\/fantasma\/index\.js não encontrado/,
  );
});
