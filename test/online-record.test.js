const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let recordModule;
let identityModule;

const CATALOGS = {
  movie: {
    mediaType: 'movie',
    revision: '2026-11-12.1',
    curatedAt: '2026-11-12',
    titles: [{ tmdbId: '603', title: 'Matrix', year: 1999, tags: [] }],
  },
  tv: {
    mediaType: 'tv',
    revision: '2026-11-12.1',
    curatedAt: '2026-11-12',
    titles: [{ tmdbId: '1396', title: 'Breaking Bad', year: 2008, tags: [], season: 1, episode: 1 }],
  },
};

const DOC = `# Provedores

| Provedor | ID | Tipos | Formato | Status | Última verificação |
| --- | --- | --- | --- | --- | --- |
| [BeTor](#betor) | \`betor\` | filme, série | magnet, torrent:// | 🟠 Não verificado | — |
| [DooPlay PT-BR](#dooplay-pt-br) | \`dooplay\` | filme, série | HLS | 🟠 Não verificado | — |

## BeTor

**Status: 🟠 Não verificado.**

## DooPlay PT-BR

**Status: 🟠 Não verificado.**
`;

test.before(async () => {
  recordModule = await import('./online/lib/record.mjs');
  identityModule = await import('./online/lib/identity.mjs');
});

function setup(t) {
  const dir = createTempDir('online-record-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'providers.md');
  fs.writeFileSync(file, DOC, 'utf8');
  return {
    dir,
    file,
    read: () => fs.readFileSync(file, 'utf8'),
  };
}

function identityFor({ packageHash = 'b'.repeat(64), supportedTypes = ['movie', 'tv'], profile = { exclusiveTag: null }, catalogs = CATALOGS } = {}) {
  return identityModule.evaluationIdentity({ packageHash, supportedTypes, profile, catalogs });
}

function caseOf(overrides = {}) {
  return {
    mediaType: 'movie',
    tmdbId: '603',
    title: 'Matrix',
    year: 1999,
    tags: [],
    outcome: 'Resolvido',
    streamsReturned: 12,
    usableStreams: 12,
    reason: null,
    warnings: [],
    ...overrides,
  };
}

function tvCaseOf(overrides = {}) {
  return {
    mediaType: 'tv',
    tmdbId: '1396',
    title: 'Breaking Bad',
    year: 2008,
    tags: [],
    season: 1,
    episode: 1,
    outcome: 'Resolvido',
    streamsReturned: 10,
    usableStreams: 10,
    reason: null,
    warnings: [],
    ...overrides,
  };
}

function reportOf({
  runId,
  generatedAt,
  status = 'Estável',
  identity = identityFor(),
  cases = [caseOf(), tvCaseOf()],
  enabled = true,
  preparationFailure = null,
}) {
  return {
    schemaVersion: 1,
    runId,
    generatedAt,
    provider: {
      id: 'betor',
      name: 'BeTor',
      version: '1.0.0',
      enabled,
      supportedTypes: identity.supportedTypes,
      packageHash: identity.packageHash,
    },
    identity,
    selection: {
      seed: 'semente-fixa',
      algorithm: 'sha256-fisher-yates-v1',
      exclusiveTag: identity.profile.exclusiveTag,
      types: {},
    },
    summary: {
      status,
      indicators: identity.supportedTypes.map((type) => `${type} 1/5`),
      types: {},
      totalCases: cases.length,
      exitCode: status === 'Estável' ? 0 : 1,
    },
    cases,
    preparationFailure,
  };
}

test('registra a última rodada, usa emoji e data curta e não exibe hash', (t) => {
  const env = setup(t);
  const dooPlayBefore = env.read().slice(env.read().indexOf('## DooPlay PT-BR'));
  const report = reportOf({ runId: 'run-1', generatedAt: '2026-11-12T10:00:00.000Z' });
  const result = recordModule.recordRun({ rootDir: env.dir, report });
  const doc = env.read();

  assert.equal(result.changed, true);
  assert.equal(result.status, 'Estável');
  assert.equal(result.date, '2026-11-12');
  assert.match(doc, /<!-- online-verification:start -->/);
  assert.match(doc, /<!-- online-verification:end -->/);
  assert.match(doc, /1\. \*\*2026-11-12T10:00:00\.000Z\*\* · ID `run-1` · \*\*Estável\*\* · pacote 1.0.0 · perfil `generalista`/);
  assert.doesNotMatch(doc, /[a-f0-9]{64}/i);
  assert.match(doc, /`movie` `603` · Matrix \(1999\) · \*\*Resolvido\*\*/);
  assert.match(doc, /`tv` `1396` · Breaking Bad \(2008\) · S01E01 · \*\*Resolvido\*\*/);
  assert.match(doc, /\| \[BeTor\]\(#betor\) \| `betor` \| filme, série \| magnet, torrent:\/\/ \| 🟢 Estável \| 2026-11-12 \|/);
  assert.match(doc, /## BeTor\n\n\*\*Status: 🟢 Estável\.\*\*/);
  assert.equal(doc.slice(doc.indexOf('## DooPlay PT-BR')), dooPlayBefore);
  assert.deepEqual(fs.readdirSync(env.dir), ['providers.md']);
});

test('segunda rodada substitui a primeira e repetir o mesmo ID não duplica', (t) => {
  const env = setup(t);
  const first = reportOf({ runId: 'run-1', generatedAt: '2026-11-12T10:00:00.000Z' });
  recordModule.recordRun({ rootDir: env.dir, report: first });

  const second = reportOf({
    runId: 'run-2',
    generatedAt: '2026-11-12T11:00:00.000Z',
    status: 'Parcial',
    cases: [caseOf(), tvCaseOf({ outcome: 'Sem resultado', streamsReturned: 0, usableStreams: 0 })],
  });
  recordModule.recordRun({ rootDir: env.dir, report: second });
  const doc = env.read();
  assert.doesNotMatch(doc, /ID `run-1`/);
  assert.match(doc, /ID `run-2`/);
  assert.equal((doc.match(/^1\. \*\*/gm) || []).length, 1);
  assert.match(doc, /`movie` `603` · Matrix \(1999\) · \*\*Resolvido\*\*/);
  assert.match(doc, /`tv` `1396` · Breaking Bad \(2008\) · S01E01 · \*\*Sem resultado\*\*/);
  assert.match(doc, /\| \[BeTor\]\(#betor\) \| `betor` \| filme, série \| magnet, torrent:\/\/ \| 🔵 Parcial \| 2026-11-12 \|/);

  const before = env.read();
  const repeated = recordModule.recordRun({ rootDir: env.dir, report: second });
  assert.equal(repeated.changed, false);
  assert.equal(env.read(), before);
  assert.equal((before.match(/ID `run-2`/g) || []).length, 1);
});

test('ID repetido com conteúdo divergente é rejeitado', (t) => {
  const env = setup(t);
  recordModule.recordRun({
    rootDir: env.dir,
    report: reportOf({ runId: 'run-1', generatedAt: '2026-11-12T10:00:00.000Z' }),
  });
  const before = env.read();
  assert.throws(
    () => recordModule.recordRun({
      rootDir: env.dir,
      report: reportOf({ runId: 'run-1', generatedAt: '2026-11-12T10:00:01.000Z' }),
    }),
    /já existe com conteúdo divergente/,
  );
  assert.equal(env.read(), before);
});

test('resultados negativos são registrados sem exigir aprovação', (t) => {
  const env = setup(t);
  const report = reportOf({
    runId: 'run-falha',
    generatedAt: '2026-11-12T12:00:00.000Z',
    status: 'Instável',
    cases: [
      caseOf({ outcome: 'Falha', reason: 'HTTP 500 em https://fonte.test/x?token=segredo', streamsReturned: 0, usableStreams: 0 }),
      tvCaseOf({ outcome: 'Sem resultado', streamsReturned: 0, usableStreams: 0 }),
    ],
  });
  recordModule.recordRun({ rootDir: env.dir, report });
  const doc = env.read();
  assert.match(doc, /\*\*Falha\*\*/);
  assert.match(doc, /Motivo: HTTP 500 em <url>/);
  assert.doesNotMatch(doc, /segredo/);
  assert.match(doc, /## BeTor\n\n\*\*Status: 🔴 Instável\.\*\*/);
});

test('tentativa inconclusiva substitui a rodada anterior e zera o status', (t) => {
  const env = setup(t);
  const evidence = reportOf({
    runId: 'run-bom',
    generatedAt: '2026-11-12T10:00:00.000Z',
  });
  recordModule.recordRun({ rootDir: env.dir, report: evidence });

  const inconclusive = reportOf({
    runId: 'run-tentativa',
    generatedAt: '2026-11-12T11:00:00.000Z',
    status: 'Não verificado',
    cases: [caseOf({ outcome: 'Inconclusivo', reason: 'limite externo', streamsReturned: 0, usableStreams: 0 })],
  });
  recordModule.recordRun({ rootDir: env.dir, report: inconclusive });
  const doc = env.read();
  assert.match(doc, /\| \[BeTor\]\(#betor\) \| `betor` \|[^|]*\|[^|]*\| 🟠 Não verificado \| 2026-11-12 \|/);
  assert.match(doc, /## BeTor\n\n\*\*Status: 🟠 Não verificado\.\*\*/);
  assert.match(doc, /ID `run-tentativa`/);
  assert.doesNotMatch(doc, /ID `run-bom`/);
});

test('rodada de versão diferente substitui a anterior e não herda aprovação', (t) => {
  const env = setup(t);
  recordModule.recordRun({
    rootDir: env.dir,
    report: reportOf({ runId: 'run-a', generatedAt: '2026-11-12T10:00:00.000Z', identity: identityFor({ packageHash: 'b'.repeat(64) }) }),
  });
  recordModule.recordRun({
    rootDir: env.dir,
    report: reportOf({
      runId: 'run-b',
      generatedAt: '2026-11-12T11:00:00.000Z',
      identity: identityFor({ packageHash: 'e'.repeat(64) }),
      status: 'Não verificado',
      cases: [caseOf({ outcome: 'Inconclusivo', reason: 'sem chave', streamsReturned: 0, usableStreams: 0 })],
    }),
  });
  const doc = env.read();
  const row = doc.split('\n').find((line) => line.includes('`betor`'));
  assert.match(row, /Não verificado/);
  assert.doesNotMatch(row, /run-a/);
  assert.match(doc, /## BeTor\n\n\*\*Status: 🟠 Não verificado\.\*\*/);
  assert.doesNotMatch(doc, /ID `run-a`/);
  assert.match(doc, /ID `run-b`/);
});

test('troca de pacote, tipos, perfil ou catálogo muda a identidade', () => {
  const base = identityFor();
  const variants = [
    identityFor({ packageHash: 'e'.repeat(64) }),
    identityFor({ supportedTypes: ['tv'] }),
    identityFor({ profile: { exclusiveTag: 'anime' } }),
    identityFor({ catalogs: { ...CATALOGS, movie: { ...CATALOGS.movie, revision: '2026-11-13.1' } } }),
  ];
  for (const variant of variants) {
    assert.notEqual(variant.hash, base.hash);
  }
});

test('parseHistory lê a única rodada e o resumo não guarda hashes', (t) => {
  const env = setup(t);
  recordModule.recordRun({
    rootDir: env.dir,
    report: reportOf({ runId: 'run-1', generatedAt: '2026-11-12T10:00:00.000Z' }),
  });
  const history = recordModule.parseHistory(env.read());
  const rounds = history.get('betor');
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].cases.length, 2);
  assert.equal(rounds[0].packageVersion, '1.0.0');
  assert.equal(rounds[0].packageHash, undefined);
  assert.equal(rounds[0].identityHash, undefined);
  assert.equal(recordModule.renderStatus('Estável'), '🟢 Estável');
  assert.equal(recordModule.renderStatus('Parcial'), '🔵 Parcial');
  assert.equal(recordModule.renderStatus('Instável'), '🔴 Instável');
  assert.equal(recordModule.renderStatus('Não verificado'), '🟠 Não verificado');
  assert.equal(recordModule.renderStatus('Desativado'), '⚫ Desativado');
  assert.equal(recordModule.parseStatus('🔴 Instável'), 'Instável');
  assert.equal(recordModule.parseStatus('🔵 Parcial'), 'Parcial');
});
