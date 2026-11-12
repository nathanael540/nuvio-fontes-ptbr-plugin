const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let reportModule;

test.before(async () => {
  reportModule = await import('./online/lib/report.mjs');
});

function fixture() {
  return {
    runId: reportModule.createRunId({
      providerId: 'betor',
      seed: 'abcdef1234567890',
      now: new Date('2026-11-12T15:00:00Z'),
    }),
    generatedAt: '2026-11-12T15:00:00.000Z',
    provider: { id: 'betor', name: 'BeTor', version: '1.1.0', enabled: true, supportedTypes: ['movie', 'tv'] },
    identity: {
      algorithm: 'sha256-json-v1',
      protocolVersion: 1,
      hash: 'a'.repeat(64),
      packageHash: 'b'.repeat(64),
      supportedTypes: ['movie', 'tv'],
      profile: { exclusiveTag: null },
      catalogs: {
        movie: { revision: '2026-11-12.1', hash: 'c'.repeat(64) },
        tv: { revision: '2026-11-12.1', hash: 'd'.repeat(64) },
      },
    },
    selection: {
      seed: 'abcdef1234567890',
      algorithm: 'sha256-fisher-yates-v1',
      exclusiveTag: null,
      types: {
        movie: { candidates: 35, titles: [{ tmdbId: '603', title: 'Matrix', year: 1999, tags: [] }] },
        tv: { candidates: 35, titles: [{ tmdbId: '1396', title: 'Breaking Bad', year: 2008, tags: [], season: 1, episode: 1 }] },
      },
    },
    summary: {
      status: 'Estável',
      indicators: ['movie 1/5', 'tv 1/5'],
      types: {
        movie: { sampled: 5, resolved: 1, empty: 2, failure: 1, inconclusive: 1, state: 'resolved' },
        tv: { sampled: 5, resolved: 1, empty: 4, failure: 0, inconclusive: 0, state: 'resolved' },
      },
      totalCases: 2,
      exitCode: 0,
    },
    cases: [
      {
        mediaType: 'movie',
        tmdbId: '603',
        title: 'Matrix',
        year: 1999,
        tags: [],
        outcome: 'Falha',
        streamsReturned: 2,
        usableStreams: 0,
        reason: 'erro em https://cdn.example/video.m3u8?token=segredo123&expires=999',
        warnings: ['api_key=CHAVE-FICTICIA Bearer abc.def.ghi'],
      },
      {
        mediaType: 'tv',
        tmdbId: '1396',
        title: 'Breaking Bad',
        year: 2008,
        tags: [],
        season: 1,
        episode: 1,
        outcome: 'Resolvido',
        streamsReturned: 1,
        usableStreams: 1,
        reason: null,
        warnings: [],
      },
    ],
  };
}

test('relatório não persiste streams, URLs, credenciais nem respostas brutas', () => {
  const data = fixture();
  const report = reportModule.buildReport(data);
  const text = JSON.stringify(report);
  for (const secret of ['cdn.example', 'segredo123', 'CHAVE-FICTICIA', 'abc.def.ghi', 'expires=999']) {
    assert.equal(text.includes(secret), false, `relatório vazou ${secret}`);
  }
  assert.doesNotMatch(text, /"streams"\s*:/, 'relatório não pode persistir a lista de streams');
  assert.match(report.cases[0].reason, /<url>/);
  assert.match(report.cases[0].warnings[0], /api_key=<redacted>/);
  assert.match(report.cases[0].warnings[0], /Bearer <redacted>/);
  assert.equal(report.provider.packageHash, data.identity.packageHash);
  assert.equal(report.identity.packageHash, data.identity.packageHash);
});

test('relatório é gravado em test/artifacts/online/<run-id>/result.json', (t) => {
  const dir = createTempDir('online-report-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const report = reportModule.buildReport(fixture());
  const file = reportModule.writeReport({ artifactsDir: dir, report });
  assert.equal(path.basename(path.dirname(file)), report.runId);
  assert.equal(path.basename(file), 'result.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).runId, report.runId);
});

test('falha de preparação também gera relatório permitido', (t) => {
  const dir = createTempDir('online-report-prep-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const data = fixture();
  data.cases = [];
  data.summary = {
    status: 'Não verificado',
    indicators: ['movie 0/5', 'tv 0/5'],
    types: {
      movie: { sampled: 5, resolved: 0, empty: 0, failure: 0, inconclusive: 5, state: 'indeterminate' },
      tv: { sampled: 5, resolved: 0, empty: 0, failure: 0, inconclusive: 5, state: 'indeterminate' },
    },
    totalCases: 0,
    exitCode: 2,
  };
  data.preparationFailure = 'catálogo inválido em https://exemplo.test/x?token=ficticio';
  const report = reportModule.buildReport(data);
  assert.match(report.preparationFailure, /<url>/);
  const file = reportModule.writeReport({ artifactsDir: dir, report });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).cases.length, 0);
});

test('resumo terminal mostra indicativos com denominador cinco', () => {
  const report = reportModule.buildReport(fixture());
  const summary = reportModule.formatSummary(report, 'result.json');
  assert.match(summary, /Status: Estável/);
  assert.match(summary, /movie 1\/5: 1 resolvido\(s\), 2 sem resultado, 1 falha\(s\), 1 inconclusivo\(s\)/);
  assert.match(summary, /tv 1\/5/);
});

test('ID da rodada é seguro para pasta e muda com o instante', () => {
  const now = new Date('2026-11-12T15:00:00Z');
  const first = reportModule.createRunId({ providerId: 'betor', seed: 'abcdef', now });
  const second = reportModule.createRunId({ providerId: 'betor', seed: 'abcdef', now });
  assert.match(first, /^2026-11-12T15-00-00-000Z-betor-abcdef-[a-f0-9]{4}$/);
  assert.notEqual(first, second);
});
