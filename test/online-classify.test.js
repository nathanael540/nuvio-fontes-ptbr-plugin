const test = require('node:test');
const assert = require('node:assert/strict');

let classifyModule;

test.before(async () => {
  classifyModule = await import('./online/lib/classify.mjs');
});

function stream(overrides = {}) {
  return {
    url: 'https://cdn.example/video.m3u8',
    quality: '1080p',
    language: 'Dublado',
    name: 'Provedor 1080p\n🗣️ Dublado',
    title: '🗣️ Dublado',
    ...overrides,
  };
}

function movieCase(outcome, id = '1') {
  return { mediaType: 'movie', tmdbId: id, outcome };
}

function tvCase(outcome, id = '2') {
  return { mediaType: 'tv', tmdbId: id, outcome };
}

test('lista vazia sem erro é Sem resultado', () => {
  const result = classifyModule.classifyCase({ streams: [], consoleMessages: { error: [] } });
  assert.equal(result.outcome, 'Sem resultado');
  assert.equal(result.streamsReturned, 0);
});

test('erro capturado com lista vazia é Falha, não ausência', () => {
  const result = classifyModule.classifyCase({
    streams: [],
    consoleMessages: { error: ['[Fonte] falha ao consultar a página'] },
  });
  assert.equal(result.outcome, 'Falha');
  assert.match(result.reason, /falha ao consultar/);
});

test('saída inválida é Falha', () => {
  const result = classifyModule.classifyCase({ streams: { length: 0 } });
  assert.equal(result.outcome, 'Falha');
  assert.match(result.reason, /Saída inválida/);
});

test('stream incompatível não conta como resolução e falha sem opção aproveitável', () => {
  const result = classifyModule.classifyCase({ streams: [stream({ title: '' })] });
  assert.equal(result.outcome, 'Falha');
  assert.equal(result.usableStreams, 0);
  assert.match(result.reason, /Nenhum stream compatível/);
});

test('aviso de uma opção com outro stream válido mantém Resolvido', () => {
  const result = classifyModule.classifyCase({
    streams: [stream(), stream({ url: 'magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd' })],
    consoleMessages: { warn: ['[Fonte] Opção Player descartada: HTTP 404 em https://x.test/a?token=segredo'] },
  });
  assert.equal(result.outcome, 'Resolvido');
  assert.equal(result.usableStreams, 2);
  assert.deepEqual(result.warnings, ['[Fonte] Opção Player descartada: HTTP 404 em <url>']);
});

test('falha de chave TMDB é Inconclusivo, não Falha da fonte', () => {
  const result = classifyModule.classifyCase({
    streams: [],
    consoleMessages: { error: ['[Fonte] TMDB_API_KEY indisponível: o app não forneceu a chave do TMDB ao plugin'] },
  });
  assert.equal(result.outcome, 'Inconclusivo');
  assert.match(result.reason, /Configuração local/);
});

test('timeout e falha de preparação são Inconclusivos', () => {
  assert.equal(classifyModule.classifyCase({ timedOut: true, timeoutMs: 120000 }).outcome, 'Inconclusivo');
  assert.equal(classifyModule.classifyCase({ preparationError: 'catálogo inválido' }).outcome, 'Inconclusivo');
});

test('trinta streams de um filme contam um título e não compensam zero no outro tipo', () => {
  const cases = [
    movieCase('Resolvido', '603'),
    ...Array.from({ length: 4 }, (_, index) => movieCase('Sem resultado', String(700 + index))),
    ...Array.from({ length: 5 }, (_, index) => tvCase('Sem resultado', String(800 + index))),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['movie', 'tv'] },
    cases,
  });
  assert.equal(summary.status, 'Parcial');
  assert.equal(summary.types.movie.resolved, 1);
  assert.deepEqual(summary.indicators, ['movie 1/5', 'tv 0/5']);
  assert.equal(summary.exitCode, 1);
});

test('um sucesso por tipo é Estável, independentemente do indicativo baixo', () => {
  const cases = [
    movieCase('Resolvido'),
    ...Array.from({ length: 4 }, (_, index) => movieCase('Falha', String(700 + index))),
    tvCase('Resolvido'),
    ...Array.from({ length: 4 }, (_, index) => tvCase('Sem resultado', String(800 + index))),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['movie', 'tv'] },
    cases,
  });
  assert.equal(summary.status, 'Estável');
  assert.deepEqual(summary.indicators, ['movie 1/5', 'tv 1/5']);
  assert.equal(summary.exitCode, 0);
});

test('um tipo comprovado e outro concluído sem resolução é Parcial', () => {
  const cases = [
    movieCase('Resolvido'),
    ...Array.from({ length: 4 }, () => movieCase('Sem resultado')),
    ...Array.from({ length: 5 }, () => tvCase('Falha')),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['movie', 'tv'] },
    cases,
  });
  assert.equal(summary.status, 'Parcial');
  assert.equal(summary.types.tv.state, 'empty');
});

test('todos os tipos concluídos sem resolução é Instável', () => {
  const cases = [
    ...Array.from({ length: 5 }, () => movieCase('Falha')),
    ...Array.from({ length: 5 }, () => tvCase('Sem resultado')),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['movie', 'tv'] },
    cases,
  });
  assert.equal(summary.status, 'Instável');
  assert.equal(summary.exitCode, 1);
});

test('inconclusivo sem evidência não vira Instável e mantém denominador cinco', () => {
  const cases = [
    movieCase('Resolvido'),
    ...Array.from({ length: 4 }, () => movieCase('Sem resultado')),
    tvCase('Inconclusivo'),
    ...Array.from({ length: 4 }, () => tvCase('Sem resultado')),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['movie', 'tv'] },
    cases,
  });
  assert.equal(summary.status, 'Não verificado');
  assert.equal(summary.types.tv.inconclusive, 1);
  assert.deepEqual(summary.indicators, ['movie 1/5', 'tv 0/5']);
  assert.equal(summary.exitCode, 2);
});

test('provedor de um único tipo comprova funcionamento sem exigir o outro', () => {
  const cases = [
    tvCase('Resolvido'),
    ...Array.from({ length: 4 }, () => tvCase('Sem resultado')),
  ];
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: true, supportedTypes: ['tv'] },
    cases,
  });
  assert.equal(summary.status, 'Estável');
  assert.deepEqual(summary.indicators, ['tv 1/5']);
});

test('enabled: false tem prioridade e resulta em Desativado', () => {
  const summary = classifyModule.aggregateProvider({
    provider: { enabled: false, supportedTypes: ['movie'] },
    cases: [movieCase('Resolvido')],
  });
  assert.equal(summary.status, 'Desativado');
});
