const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'rivo');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const servers = readJson('servers.json');
const sourceMovie = readJson('source-movie.json');
const sourceTv = readJson('source-tv.json');
const sourceEmpty = readJson('source-empty.json');
const sourceDash = readJson('source-dash.json');
const sourceMalformed = readJson('source-malformed.json');
const sourceDuplicates = readJson('source-duplicates.json');
const metaMovie = readJson('meta-movie.json');
const metaTv = readJson('meta-tv.json');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const MOVIE_ID = '693134';
const TV_ID = '250307';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const movieByServer = {
  1: sourceMovie,
  2: sourceEmpty,
  3: sourceDash,
  5: sourceDuplicates,
};
const tvByServer = {
  1: sourceTv,
  2: sourceEmpty,
  3: sourceDash,
  5: sourceEmpty,
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('rivo-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('rivo', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('rivo', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.gdrive) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    TMDB_API_KEY: 'chave-ficticia',
    require: (name) => {
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new AppURL(url), init || {});
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      return {
        ok: result.status === undefined || result.status < 400,
        status: result.status || 200,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function makeRoute(options = {}) {
  return async (url) => {
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay(url)));
    if (url.hostname !== 'f.rivo.st') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/api/servers') {
      return asResponse(options.servers === undefined ? servers : options.servers);
    }
    if (url.pathname === `/api/meta/movie/${MOVIE_ID}`) {
      return asResponse(options.meta === undefined ? metaMovie : options.meta);
    }
    if (url.pathname === `/api/meta/tv/${TV_ID}`) {
      return asResponse(options.meta === undefined ? metaTv : options.meta);
    }
    if (url.pathname === `/api/source/movie/${MOVIE_ID}`) {
      const server = url.searchParams.get('server');
      if (options.source) return asResponse(options.source('movie', server, url));
      return asResponse(movieByServer[server]);
    }
    if (url.pathname === `/api/source/tv/${TV_ID}`) {
      const server = url.searchParams.get('server');
      if (options.source) return asResponse(options.source('tv', server, url));
      return asResponse(tvByServer[server]);
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function sourceCalls(calls, mediaType) {
  const id = mediaType === 'movie' ? MOVIE_ID : TV_ID;
  return calls.filter((call) => new URL(call.url).pathname === `/api/source/${mediaType}/${id}`);
}

function assertReferer(calls) {
  for (const call of calls) {
    assert.equal(call.init.headers.Referer, 'https://f.rivo.st/', call.url);
  }
}

function sourceWithQuality(quality) {
  return {
    provider: 'rivo',
    server: '1',
    sources: [{
      url: 'https://media.example.test/movie/language/master.m3u8',
      kind: 'hls',
      quality,
      subProvider: 'Server 1',
      provider: 'rivo',
    }],
    subtitles: [],
  };
}

test('1.1 e 5.3 carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
});

test('1.2 e 4.3 valida entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    ['693134', 'anime', null, null],
    ['250307', 'tv', null, 1],
    ['250307', 'tv', 1, 0],
    ['250307', 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    const streams = await runtime.exports.getStreams(...args);
    assert.deepEqual(Array.from(streams), []);
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  for (const message of runtime.errors) {
    assert.match(message, /^\[RIVO\] Falha em .*: Entrada: /);
  }
});

test('2.1, 2.2, 2.3, 3.1, 3.2, 3.4, 3.5 e 4.1 resolve filme por ID com servidores isolados', async () => {
  const runtime = makeRuntime(makeRoute({
    delay: (url) => (url.pathname.startsWith(`/api/source/movie/`) && url.searchParams.get('server') === '1' ? 20 : 0),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '1080p', '720p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    'https://media.example.test/movie/duna-1080/master.m3u8',
    'https://media.example.test/movie/duna-alt/master.m3u8',
    'https://mp4.example.test/movie/duna-720.mp4',
  ]);

  const [first, alt, mp4] = streams;
  assert.equal(first.language, 'Dublado');
  assert.equal(first.type, 'hls');
  assert.equal(first.provider, 'Server 1');
  assert.match(first.name, /^RIVO 1080p\n/);
  assert.match(first.title, /🗣️ Dublado/);
  assert.match(first.title, /🌐 HTTP/);
  assert.match(first.title, /🔍 Server 1/);
  assert.equal(first.format, undefined);
  assert.equal(first.size, undefined);
  assert.equal(first.headers, undefined);
  assert.equal(first.seeders, undefined);
  assert.equal(first.peers, undefined);
  assert.equal(first.infoHash, undefined);
  assert.deepEqual(Array.from(first.subtitles, (subtitle) => subtitle.language), ['Portuguese (BR)', 'English']);
  assert.equal(first.subtitles[0].url, 'https://subs.example.test/duna-ptbr.vtt');
  assert.equal(
    first.subtitles[1].url,
    `https://f.rivo.st/api/subtitle?url=${encodeURIComponent('https://subs.example.test/duna-en.vtt')}`,
  );

  assert.equal(alt.language, 'Gringo');
  assert.equal(alt.provider, 'Server 5');
  assert.deepEqual(Array.from(alt.subtitles, (subtitle) => subtitle.language), ['French']);

  assert.equal(mp4.language, 'Legendado');
  assert.equal(mp4.type, 'mp4');
  assert.equal(mp4.provider, 'Server 1');

  const serversCall = runtime.calls.find((call) => new URL(call.url).pathname === '/api/servers');
  assert.equal(new URL(serversCall.url).search, '?v=7');
  const movieCalls = sourceCalls(runtime.calls, 'movie');
  assert.deepEqual(movieCalls.map((call) => new URL(call.url).searchParams.get('server')).sort(), ['1', '2', '3', '5']);
  assert.ok(!movieCalls.some((call) => new URL(call.url).searchParams.get('server') === '4'));
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname === `/api/meta/movie/${MOVIE_ID}`).length, 1);
  assertReferer(runtime.calls);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.warnings.length, 2);
  for (const warning of runtime.warnings) assert.match(warning, /Legenda do servidor Server 1 descartada/);
  assert.doesNotMatch(runtime.warnings.join('\n'), /m3u8|Policy=|Signature=|Key-Pair-Id=|\b[a-f0-9]{32,}\b/i);
});

test('4.1 e 3.5 formata filme e série no template Prism com metadados e coordenadas', async () => {
  const movieRuntime = makeRuntime(makeRoute(), codes.prism);
  const movieStreams = await movieRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.match(movieStreams[0].name, /^🚀 FHD 1080p\n/);
  assert.match(movieStreams[0].title, /🎬 Duna: Parte Dois \(2024\)/);

  const tvRuntime = makeRuntime(makeRoute(), codes.prism);
  const tvStreams = await tvRuntime.exports.getStreams(TV_ID, 'tv', 2, 3);
  assert.equal(tvStreams.length, 2);
  assert.equal(tvStreams[0].quality, '1080p');
  assert.equal(tvStreams[0].language, 'Dublado (Não PT-BR?)');
  assert.match(tvStreams[0].title, /🎬 The Pitt \(2025\) T02E03/);
  assert.deepEqual(Array.from(tvStreams[0].subtitles, (subtitle) => subtitle.language), ['Portuguese (BR)']);
  assert.equal(tvStreams[1].quality, 'Desconhecida');
  assert.equal(tvStreams[1].language, 'Idioma Desconhecido');
  assert.deepEqual(Array.from(tvStreams[1].subtitles, (subtitle) => subtitle.language), ['Portuguese (BR)']);

  const tvCalls = sourceCalls(tvRuntime.calls, 'tv');
  assert.equal(tvCalls.length, 4);
  for (const call of tvCalls) {
    const url = new URL(call.url);
    assert.equal(url.pathname, `/api/source/tv/${TV_ID}`);
    assert.equal(url.searchParams.get('s'), '2');
    assert.equal(url.searchParams.get('e'), '3');
  }
  assertReferer(tvRuntime.calls);
  assert.deepEqual(tvRuntime.errors, []);
  assert.deepEqual(tvRuntime.warnings, []);
});

test('3.3 idioma e qualidade saem do rótulo da fonte', async () => {
  const cases = [
    ['1080p (Brazilian Portuguese)', '1080p', 'Dublado'],
    ['1080p (Portuguese)', '1080p', 'Dublado (Não PT-BR?)'],
    ['1080p (Portuguese sub)', '1080p', 'Legendado (Não PT-BR?)'],
    ['1080p (Brazilian Portuguese sub)', '1080p', 'Legendado'],
    ['1080p (English)', '1080p', 'Gringo'],
    ['1080p (English sub)', '1080p', 'Gringo'],
    ['1080p (Ukr)', '1080p', 'Gringo'],
    ['1080p Portuguese (BR)', '1080p', 'Dublado'],
    ['Auto', 'Desconhecida', 'Idioma Desconhecido'],
    ['1080p Pure Studio Master (5.0 Mbps AAC)', '1080p', 'Idioma Desconhecido'],
  ];

  for (const [label, quality, language] of cases) {
    const runtime = makeRuntime(makeRoute({
      source: (mediaType, server) => (server === '1' ? sourceWithQuality(label) : sourceEmpty),
    }));
    const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
    assert.equal(streams.length, 1, label);
    assert.equal(streams[0].quality, quality, label);
    assert.equal(streams[0].language, language, label);
    assert.ok(LANGUAGE_VALUES.includes(streams[0].language), label);
    assert.deepEqual(runtime.errors, [], label);
  }
});

test('4.2 ausência reconhecida devolve lista vazia sem erro', async () => {
  const empty = makeRuntime(makeRoute({ source: () => sourceEmpty }));
  const emptyStreams = await empty.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(emptyStreams), []);
  assert.deepEqual(empty.errors, []);
  assert.deepEqual(empty.warnings, []);
  assert.equal(sourceCalls(empty.calls, 'movie').length, 4);

  const dash = makeRuntime(makeRoute({ source: () => sourceDash }));
  const dashStreams = await dash.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(dashStreams), []);
  assert.deepEqual(dash.errors, []);
  assert.deepEqual(dash.warnings, []);
});

test('2.4 falha isolada de servidor preserva as fontes dos demais', async () => {
  const runtime = makeRuntime(makeRoute({
    source: (mediaType, server) => (server === '1' ? { status: 500, body: 'erro' } : movieByServer[server] || sourceEmpty),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.provider), ['Server 5', 'Server 5']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Gringo']);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[RIVO\] Servidor Server 1 descartado: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 todas as opções falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 4);
  for (const warning of runtime.warnings) {
    assert.match(warning, /\[RIVO\] Servidor Server \d descartado: HTTP 500/);
  }
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /\[RIVO\] Falha em movie 693134: Nenhuma fonte produziu stream \(Server 1=falha \(HTTP 500/);
  assert.match(runtime.errors[0], /Server 5=falha/);
});

test('2.1 HTTP fora de 2xx e contrato inválido da lista de servidores são erro', async () => {
  const httpRuntime = makeRuntime(makeRoute({ servers: { status: 500, body: 'erro' } }));
  const httpStreams = await httpRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(httpStreams), []);
  assert.match(httpRuntime.errors[0], /\[RIVO\] Falha em movie 693134: HTTP 500/);

  const contractRuntime = makeRuntime(makeRoute({ servers: {} }));
  const contractStreams = await contractRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(contractStreams), []);
  assert.match(contractRuntime.errors[0], /Contrato de servidores inválido/);
  assert.equal(sourceCalls(contractRuntime.calls, 'movie').length, 0);

  const itemRuntime = makeRuntime(makeRoute({ servers: { servers: [{ id: '1' }] } }));
  const itemStreams = await itemRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(itemStreams), []);
  assert.match(itemRuntime.errors[0], /item 0 sem "label"/);
});

test('2.4 resposta de fontes sem sources é falha da opção, não ausência', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => ({ provider: 'rivo' }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 4);
  assert.match(runtime.warnings[0], /Contrato de fontes inválido: "sources" ausente ou fora de array/);
  assert.match(runtime.errors[0], /Nenhuma fonte produziu stream/);
});

test('3.1 fonte suportada malformada é descartada com aviso e erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({
    source: (mediaType, server) => (server === '1' ? sourceMalformed : sourceEmpty),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 3);
  assert.match(runtime.warnings[0], /\[RIVO\] Fonte Server 1 descartada: URL da fonte inválida/);
  assert.match(runtime.warnings[1], /\[RIVO\] Fonte Server 1 descartada: URL da fonte inválida/);
  assert.match(runtime.warnings[2], /\[RIVO\] Fonte Server 1 descartada: item de fonte não é objeto/);
  assert.match(runtime.errors[0], /Nenhuma fonte produziu stream/);
  assert.match(runtime.errors[0], /fontes inválidas/);
  assert.doesNotMatch(
    [...runtime.warnings, ...runtime.errors].join('\n'),
    /m3u8|\.mp4|Policy=|Signature=|Key-Pair-Id=|\b[a-f0-9]{32,}\b/i,
  );
});

test('4.1 metadados indisponíveis preservam os streams e registram aviso', async () => {
  const runtime = makeRuntime(makeRoute({ meta: { status: 500, body: 'erro' } }), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.equal(runtime.warnings.filter((warning) => /Metadados indisponíveis/.test(warning)).length, 1);
  assert.doesNotMatch(streams[0].title, /🎬/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.deepEqual(runtime.errors, []);
});

test('5.1 fixtures sanitizadas e manifest do RIVO', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'rivo');
  assert.ok(entry);
  assert.equal(entry.name, 'RIVO');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8', 'mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/rivo.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes e séries/i);
  assert.match(entry.description, /dublados?|legendas?/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /Policy=|Signature=|Key-Pair-Id=|token=|\b[a-f0-9]{64}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.match(match[1], /(^|\.)example\.test$/, `${name}: ${match[1]}`);
    }
  }
});
