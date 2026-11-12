const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let workerModule;

const VALID_STREAM = {
  url: 'https://cdn.example/video.m3u8',
  quality: '1080p',
  language: 'Dublado',
  name: 'Fonte 1080p',
  title: 'Fonte 1080p',
};

test.before(async () => {
  workerModule = await import('./online/lib/worker.mjs');
});

function writeBundle(t, body, name = 'bundle') {
  const dir = createTempDir('online-worker-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, `${name}.js`);
  fs.writeFileSync(file, body);
  return { file, hash: createHash('sha256').update(body, 'utf8').digest('hex') };
}

const request = { tmdbId: '603', mediaType: 'movie', season: null, episode: null };

test('worker executa o pacote sem chave TMDB quando o provedor não a consulta', async (t) => {
  const bundle = writeBundle(t, `module.exports = { getStreams: async () => (${JSON.stringify([VALID_STREAM])}) };`);
  const raw = await workerModule.runCase({
    packagePath: bundle.file,
    packageHash: bundle.hash,
    providerId: 'sem-tmdb',
    tmdbApiKey: null,
    request,
    timeoutMs: 5000,
  });
  assert.equal(raw.streams.length, 1);
  assert.equal(raw.streams[0].url, VALID_STREAM.url);
  assert.equal(raw.executedHash, bundle.hash);
});

test('caso preso é encerrado pelo limite externo e vira Inconclusivo', async (t) => {
  const bundle = writeBundle(t, 'module.exports = { getStreams: () => { while (true) {} } };', 'preso');
  const raw = await workerModule.runCase({
    packagePath: bundle.file,
    packageHash: bundle.hash,
    providerId: 'preso',
    tmdbApiKey: null,
    request,
    timeoutMs: 300,
  });
  assert.equal(raw.timedOut, true);
  assert.equal(raw.timeoutMs, 300);
});

test('hash divergente no worker é falha de preparação', async (t) => {
  const bundle = writeBundle(t, 'module.exports = { getStreams: async () => [] };', 'hash');
  const raw = await workerModule.runCase({
    packagePath: bundle.file,
    packageHash: '0'.repeat(64),
    providerId: 'hash',
    tmdbApiKey: null,
    request,
    timeoutMs: 5000,
  });
  assert.match(raw.preparationError, /hash do pacote diverge antes da execução/);
});

test('os cinco títulos de cada tipo são tentados mesmo após o primeiro sucesso', async () => {
  const calls = [];
  const provider = { id: 'amostra', supportedTypes: ['movie', 'tv'] };
  const selection = {
    types: {
      movie: { titles: Array.from({ length: 5 }, (_, index) => ({ tmdbId: String(600 + index), title: `Filme ${index}`, year: 2000, tags: [], season: undefined, episode: undefined })) },
      tv: { titles: Array.from({ length: 5 }, (_, index) => ({ tmdbId: String(700 + index), title: `Série ${index}`, year: 2001, tags: [], season: 1, episode: 1 })) },
    },
  };
  const runCaseImpl = async ({ request: item }) => {
    calls.push(item);
    if (item.tmdbId === '600') return { streams: [VALID_STREAM], consoleMessages: { error: [], warn: [] } };
    return { streams: [], consoleMessages: { error: [], warn: [] } };
  };
  const cases = await workerModule.runProviderSample({
    provider,
    selection,
    packagePath: 'x',
    packageHash: 'y',
    tmdbApiKey: null,
    runCaseImpl,
  });
  assert.equal(calls.length, 10);
  assert.equal(cases.filter((item) => item.mediaType === 'movie').length, 5);
  assert.equal(cases.filter((item) => item.mediaType === 'tv').length, 5);
  assert.equal(cases[0].outcome, 'Resolvido');
  assert.equal(cases[1].outcome, 'Sem resultado');
});

test('falha de um caso não interrompe os demais', async () => {
  const provider = { id: 'amostra', supportedTypes: ['movie'] };
  const selection = {
    types: {
      movie: { titles: Array.from({ length: 5 }, (_, index) => ({ tmdbId: String(index + 1), title: `F${index}`, year: 2000, tags: [] })) },
    },
  };
  let calls = 0;
  const cases = await workerModule.runProviderSample({
    provider,
    selection,
    packagePath: 'x',
    packageHash: 'y',
    tmdbApiKey: null,
    runCaseImpl: async () => {
      calls += 1;
      if (calls === 2) throw new Error('falha simulada do worker');
      return { streams: [], consoleMessages: { error: [], warn: [] } };
    },
  });
  assert.equal(calls, 5);
  assert.equal(cases.length, 5);
  assert.equal(cases[1].outcome, 'Falha');
});
