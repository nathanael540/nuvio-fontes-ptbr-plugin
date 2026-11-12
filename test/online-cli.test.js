const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let runner;

const VALID_STREAM = {
  url: 'https://cdn.example/video.m3u8',
  quality: '1080p',
  language: 'Dublado',
  name: 'Fonte 1080p',
  title: 'Fonte 1080p',
};

test.before(async () => {
  runner = await import('./online/run.mjs');
});

function tempArtifacts(t) {
  const dir = createTempDir('online-cli-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function firstPerType() {
  const seen = {};
  return async ({ request }) => {
    const count = seen[request.mediaType] || 0;
    seen[request.mediaType] = count + 1;
    return {
      streams: count === 0 ? [VALID_STREAM] : [],
      consoleMessages: { error: [], warn: [] },
    };
  };
}

test('parseArgs aceita provedor, semente, timeout e registro', () => {
  assert.deepEqual(runner.parseArgs(['--provider', 'betor', '--seed', 'x', '--timeout', '500', '--record']), {
    help: false,
    provider: 'betor',
    seed: 'x',
    record: true,
    timeoutMs: 500,
  });
  assert.throws(() => runner.parseArgs([]), /informe --provider/);
  assert.throws(() => runner.parseArgs(['--provider']), /faltou valor para --provider/);
  assert.throws(() => runner.parseArgs(['--provider', 'x', '--timeout', '0']), /--timeout inválido/);
  assert.throws(() => runner.parseArgs(['--desconhecido']), /argumento desconhecido/);
});

test('ajuda não exige provedor nem usa segredo', async () => {
  let output = '';
  const code = await runner.runCli({ argv: ['--help'], log: (text) => { output += text; } });
  assert.equal(code, 0);
  assert.match(output, /--provider <id>/);
  assert.match(output, /TMDB_API_KEY/);
  assert.doesNotMatch(output, /api_key=[A-Za-z0-9]/);
});

test('sucesso com um título por tipo apesar de falhas nos outros retorna 0', async (t) => {
  const artifactsDir = tempArtifacts(t);
  let output = '';
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'teste-cli'],
    artifactsDir,
    now: () => new Date('2026-11-12T15:00:00Z'),
    runCaseImpl: firstPerType(),
    log: (text) => { output += text; },
  });
  assert.equal(code, 0);
  assert.match(output, /Status: Estável/);
  assert.match(output, /movie 1\/5/);
  assert.match(output, /tv 1\/5/);
  const runs = fs.readdirSync(artifactsDir);
  assert.equal(runs.length, 1);
  assert.ok(fs.existsSync(path.join(artifactsDir, runs[0], 'result.json')));
});

test('nenhuma resolução retorna 1 e registra Instável', async (t) => {
  const artifactsDir = tempArtifacts(t);
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'sem-resultado'],
    artifactsDir,
    runCaseImpl: async () => ({ streams: [], consoleMessages: { error: [], warn: [] } }),
    log: () => {},
  });
  assert.equal(code, 1);
});

test('inconclusão sem evidência retorna 2 e mantém denominador cinco', async (t) => {
  const artifactsDir = tempArtifacts(t);
  let output = '';
  const seen = {};
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'inconclusivo'],
    artifactsDir,
    runCaseImpl: async ({ request }) => {
      const count = seen[request.mediaType] || 0;
      seen[request.mediaType] = count + 1;
      if (request.mediaType === 'movie' && count === 0) {
        return { streams: [VALID_STREAM], consoleMessages: { error: [], warn: [] } };
      }
      if (request.mediaType === 'tv' && count === 0) return { timedOut: true, timeoutMs: 100 };
      return { streams: [], consoleMessages: { error: [], warn: [] } };
    },
    log: (text) => { output += text; },
  });
  assert.equal(code, 2);
  assert.match(output, /Status: Não verificado/);
  assert.match(output, /tv 0\/5/);
});

test('argumentos inválidos retornam 3 sem executar rede', async () => {
  const messages = [];
  const code = await runner.runCli({
    argv: ['--provider'],
    logError: (message) => messages.push(message),
  });
  assert.equal(code, 3);
  assert.match(messages[0], /faltou valor para --provider/);
});

test('provedor ausente do manifest retorna 3', async () => {
  const messages = [];
  const code = await runner.runCli({
    argv: ['--provider', 'nao-existe'],
    logError: (message) => messages.push(message),
  });
  assert.equal(code, 3);
  assert.match(messages[0], /não está no manifest/);
});

test('sem --record o histórico não é alterado', async (t) => {
  const artifactsDir = tempArtifacts(t);
  let called = false;
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'sem-registro'],
    artifactsDir,
    runCaseImpl: firstPerType(),
    recordImpl: async () => {
      called = true;
    },
    log: () => {},
  });
  assert.equal(code, 0);
  assert.equal(called, false);
});

test('falha ao gravar o relatório é erro explícito e retorna 3', async () => {
  const messages = [];
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'sem-relatorio'],
    runCaseImpl: firstPerType(),
    writeReportImpl: () => {
      throw new Error('disco cheio');
    },
    log: () => {},
    logError: (message) => messages.push(message),
  });
  assert.equal(code, 3);
  assert.match(messages[0], /falha ao gravar o relatório: disco cheio/);
});

test('falha ao persistir registro solicitado é erro explícito, nunca sucesso', async (t) => {
  const artifactsDir = tempArtifacts(t);
  const messages = [];
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'registro', '--record'],
    artifactsDir,
    runCaseImpl: firstPerType(),
    recordImpl: async () => {
      throw new Error('disco cheio');
    },
    log: () => {},
    logError: (message) => messages.push(message),
  });
  assert.equal(code, 3);
  assert.match(messages[0], /falha ao registrar a rodada: disco cheio/);
});

test('registro recebe o relatório da mesma rodada', async (t) => {
  const artifactsDir = tempArtifacts(t);
  let received;
  const code = await runner.runCli({
    argv: ['--provider', 'betor', '--seed', 'registro-ok', '--record'],
    artifactsDir,
    runCaseImpl: firstPerType(),
    recordImpl: async ({ report }) => {
      received = report;
    },
    log: () => {},
  });
  assert.equal(code, 0);
  assert.equal(received.provider.id, 'betor');
  assert.equal(received.summary.status, 'Estável');
});
