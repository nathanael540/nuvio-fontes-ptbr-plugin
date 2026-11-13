const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'pomfy');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const clone = (value) => JSON.parse(JSON.stringify(value));

const pageMovie = read('page-movie.html');
const pageSeries = read('page-series.html');
const pageUnavailable = read('page-unavailable.html');
const playTokenDual = readJson('play-token-dual.json');
const playTokenFlyfile = readJson('play-token-flyfile.json');
const playTokenByse = readJson('play-token-byse.json');
const fileReady = readJson('file-ready.json');
const fileReadySeries = readJson('file-ready-series.json');
const fileProcessing = readJson('file-processing.json');
const fileNoQualities = readJson('file-no-qualities.json');
const assignFixture = readJson('assign.json');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const MOVIE_ID = '550';
const TV_ID = '1396';
const MOVIE_TOKEN = 'fixtureMovieToken.0123456789abcdef';
const SERIES_TOKEN = 'fixtureSeriesToken.fedcba9876543210';
const MASTER_URL = 'https://streaming.example.test/hls/fixtureAssignToken01/master.m3u8';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

let codes = {};

test.before(async () => {
  const outDir = createTempDir('pomfy-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('pomfy', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('pomfy', { outDir, formatter: 'prism' }), 'utf8');
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
      if (name === 'cheerio-without-node-native') return { load };
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
  if (value !== null && typeof value === 'object' && (typeof value.status === 'number' || 'body' in value)) return value;
  return { body: value };
}

function pick(value, fallback, ...args) {
  if (value === undefined) return fallback;
  return typeof value === 'function' ? value(...args) : value;
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.pomfy.stream') {
      if (url.pathname === `/filme/${MOVIE_ID}`) return asResponse(pick(options.page, pageMovie, 'movie', url));
      if (url.pathname === `/serie/${TV_ID}/1/1`) return asResponse(pick(options.page, pageSeries, 'tv', url));
      if (url.pathname === '/api/play-token') {
        const token = url.searchParams.get('t');
        if (options.playToken !== undefined) return asResponse(pick(options.playToken, playTokenDual, token, url));
        if (token === MOVIE_TOKEN) return asResponse(playTokenDual);
        if (token === SERIES_TOKEN) return asResponse(playTokenFlyfile);
        throw new Error(`Token inesperado: ${token}`);
      }
    }
    if (url.hostname === 'api.flyfile.app') {
      const fileMatch = /^\/api\/public\/file\/([^/]+)$/.exec(url.pathname);
      if (fileMatch !== null) {
        if (options.file !== undefined) return asResponse(pick(options.file, fileReady, fileMatch[1], url));
        if (fileMatch[1] === 'fixtureMovie01') return asResponse(fileReady);
        if (fileMatch[1] === 'fixtureSeries01') return asResponse(fileReadySeries);
        throw new Error(`Arquivo inesperado: ${fileMatch[1]}`);
      }
      const assignMatch = /^\/api\/streaming\/assign\/([^/]+)$/.exec(url.pathname);
      if (assignMatch !== null) {
        return asResponse(pick(options.assign, assignFixture, assignMatch[1], url));
      }
    }
    throw new Error(`Rota inesperada: ${url.hostname}${url.pathname}`);
  };
}

function callsByPath(runtime, pathname) {
  return runtime.calls.filter((call) => new URL(call.url).pathname === pathname);
}

function callByPath(runtime, pathname) {
  return runtime.calls.find((call) => new URL(call.url).pathname === pathname);
}

function assertEqualLanguages(streams) {
  for (const stream of streams) assert.ok(LANGUAGE_VALUES.includes(stream.language), stream.language);
}

test('1.1 e 1.3 carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|setInterval|TextDecoder|require\(['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|setInterval|TextDecoder|require\(['"]node:/);
});

test('5.3 valida entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    ['1.5', 'movie', null, null],
    ['550', 'anime', null, null],
    ['1396', 'tv', null, 1],
    ['1396', 'tv', 1, 0],
    ['1396', 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    const streams = await runtime.exports.getStreams(...args);
    assert.deepEqual(Array.from(streams), [], args.join(' '));
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  for (const message of runtime.errors) assert.match(message, /^\[Pomfy\] Entrada: /);
});

test('2.1, 2.2, 2.3, 3.1, 3.2, 3.3 e 4.1 resolve o filme com metadados e cabeçalhos de embed', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, MASTER_URL);
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.size, '1.86 GB');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'Flyfile');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.format, undefined);
  assert.equal(stream.headers, undefined);
  assert.equal(stream.infoHash, undefined);
  assert.equal(stream.seeders, undefined);
  assert.equal(stream.peers, undefined);
  assert.match(stream.name, /^Pomfy 1080p\n/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /📦 1\.86 GB/);
  assert.match(stream.title, /\(2\.5 Mbps\)/);
  assert.match(stream.title, /⏱️ 43m:18s/);
  assert.match(stream.title, /📁 Filme\.Exemplo\.2024\.1080p\.mkv/);
  assert.equal(stream.subtitles.length, 2);
  assert.deepEqual(Array.from(stream.subtitles, (subtitle) => subtitle.language), ['Português', 'Inglês']);
  assert.deepEqual(Array.from(stream.subtitles, (subtitle) => subtitle.url), [
    'https://subs.example.test/fixture-pt.vtt',
    'https://subs.example.test/fixture-en.vtt',
  ]);
  assert.equal(stream.subtitles[0].headers, undefined);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);

  const pageCall = callByPath(runtime, `/filme/${MOVIE_ID}`);
  assert.ok(pageCall);
  assert.equal(pageCall.init.method, 'GET');
  assert.equal(pageCall.init.headers.Referer, 'https://api.pomfy.stream/');
  assert.equal(pageCall.init.headers['Sec-Fetch-Dest'], 'iframe');

  const playCall = callByPath(runtime, '/api/play-token');
  assert.ok(playCall);
  assert.equal(new URL(playCall.url).search, `?t=${MOVIE_TOKEN}`);
  assert.equal(playCall.init.headers.Referer, `https://api.pomfy.stream/filme/${MOVIE_ID}`);

  const fileCall = callByPath(runtime, '/api/public/file/fixtureMovie01');
  assert.ok(fileCall);
  assert.equal(fileCall.init.method, 'GET');
  assert.equal(fileCall.init.headers.Referer, 'https://flyfile.app/embed/fixtureMovie01');
  assert.equal(fileCall.init.headers['X-FlyFile-View'], 'embed');
  assert.equal(fileCall.init.headers['X-Embed-Referrer'], 'https://api.pomfy.stream/');

  const assignCall = callByPath(runtime, '/api/streaming/assign/fixtureMovie01');
  assert.ok(assignCall);
  assert.equal(assignCall.init.method, 'GET');
  assert.equal(assignCall.init.headers.Referer, 'https://flyfile.app/embed/fixtureMovie01');
  assert.equal(assignCall.init.headers['X-FlyFile-View'], 'embed');
  assert.equal(assignCall.init.headers['X-Embed-Referrer'], 'https://api.pomfy.stream/');
  assert.equal(assignCall.init.headers['X-Adblock-Detected'], '0');
});

test('2.1, 2.3 e 4.4 resolve episódio pelo fallback de url Flyfile e formata o Prism', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, MASTER_URL);
  assert.equal(stream.quality, '720p');
  assert.equal(stream.language, 'Legendado');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.provider, 'Flyfile');
  assert.match(stream.name, /^💿 HD 720p\n/);
  assert.match(stream.title, /🎬 Série Exemplo \(2023\) T01E01/);
  assert.match(stream.title, /🗣️ Legendado/);
  assert.deepEqual(Array.from(stream.subtitles, (subtitle) => subtitle.language), ['Português']);

  const pageCall = callByPath(runtime, `/serie/${TV_ID}/1/1`);
  assert.ok(pageCall);
  assert.equal(pageCall.init.headers['Sec-Fetch-Dest'], 'iframe');

  const fileCall = callByPath(runtime, '/api/public/file/fixtureSeries01');
  assert.ok(fileCall);
  assert.equal(fileCall.init.headers.Referer, 'https://flyf.lat/embed/fixtureSeries01');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 e 5.1 página sem token e título indisponível são ausência sem erro', async () => {
  const unavailable = makeRuntime(makeRoute({ page: pageUnavailable }));
  const unavailableStreams = await unavailable.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(unavailableStreams), []);
  assert.deepEqual(unavailable.errors, []);
  assert.deepEqual(unavailable.warnings, []);
  assert.equal(callsByPath(unavailable, '/api/play-token').length, 0);

  const noToken = makeRuntime(makeRoute({
    page: '<html><body><h1 class="title">Sem Token</h1></body></html>',
  }));
  const noTokenStreams = await noToken.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(noTokenStreams), []);
  assert.deepEqual(noToken.errors, []);
  assert.equal(callsByPath(noToken, '/api/play-token').length, 0);
});

test('2.1 e 5.2 layout sem h1.title é erro de página', async () => {
  const runtime = makeRuntime(makeRoute({
    page: '<html><body><script>const statusToken="fixtureUserToken.signature";</script></body></html>',
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Pomfy\] Página: layout da página sem h1\.title/);
  assert.equal(callsByPath(runtime, '/api/play-token').length, 0);
});

test('2.3 título só com Byse é ausência sem erro e sem consultar o Flyfile', async () => {
  const runtime = makeRuntime(makeRoute({ playToken: playTokenByse }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).hostname === 'api.flyfile.app').length, 0);
});

test('2.3 resposta de player inválida é erro e o log não carrega o statusToken', async () => {
  const invalidJson = makeRuntime(makeRoute({ playToken: { body: 'nao-json' } }));
  const invalidStreams = await invalidJson.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(invalidStreams), []);
  assert.equal(invalidJson.errors.length, 1);
  assert.match(invalidJson.errors[0], /^\[Pomfy\] Player: Resposta não é JSON válido em \[url\]/);
  assert.doesNotMatch(invalidJson.errors[0], /fixtureMovieToken|master\.m3u8/);

  const noFields = makeRuntime(makeRoute({ playToken: { body: { provider: 'flyfile' } } }));
  const noFieldsStreams = await noFields.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(noFieldsStreams), []);
  assert.match(noFields.errors[0], /^\[Pomfy\] Player: resposta do player sem campos de endereço/);
});

test('3.2 e 5.1 arquivo em processamento, sem qualidade ou sem videoAsset é ausência', async () => {
  const processing = makeRuntime(makeRoute({ file: fileProcessing }));
  const processingStreams = await processing.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(processingStreams), []);
  assert.deepEqual(processing.errors, []);
  assert.equal(callsByPath(processing, '/api/streaming/assign/fixtureMovie01').length, 0);

  const noQualities = makeRuntime(makeRoute({ file: fileNoQualities }));
  const noQualitiesStreams = await noQualities.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(noQualitiesStreams), []);
  assert.deepEqual(noQualities.errors, []);
  assert.equal(callsByPath(noQualities, '/api/streaming/assign/fixtureMovie01').length, 0);

  const noAsset = clone(fileReady);
  delete noAsset.videoAsset;
  const noAssetRuntime = makeRuntime(makeRoute({ file: noAsset }));
  const noAssetStreams = await noAssetRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(noAssetStreams), []);
  assert.deepEqual(noAssetRuntime.errors, []);
});

test('3.2 qualities em string JSON e status em minúsculas são aceitos', async () => {
  const file = clone(fileReady);
  file.status = 'ready';
  file.videoAsset.qualities = JSON.stringify(file.videoAsset.qualities);
  const runtime = makeRuntime(makeRoute({ file }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.deepEqual(runtime.errors, []);
});

test('3.3 e 5.2 assign incompleto ou fora de https é erro', async () => {
  const cases = [
    [{ url: 'https://streaming.example.test' }, /assign sem url ou token/],
    [{ token: 'fixtureAssignToken01' }, /assign sem url ou token/],
    [{ url: 'http://streaming.example.test', token: 'fixtureAssignToken01' }, /assign com url fora de https/],
    [{ url: 'nao-e-url', token: 'fixtureAssignToken01' }, /assign com url inválida/],
  ];
  for (const [assign, expected] of cases) {
    const runtime = makeRuntime(makeRoute({ assign }));
    const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
    assert.deepEqual(Array.from(streams), []);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], new RegExp(`^\\[Pomfy\\] Arquivo: ${expected.source}`));
    assert.doesNotMatch(runtime.errors[0], /fixtureAssignToken01|master\.m3u8/);
  }
});

test('5.2 HTTP fora de 2xx na página, no arquivo e no assign sobe com etapa e URL saneada', async () => {
  const page = makeRuntime(makeRoute({ page: { status: 500, body: 'erro' } }));
  const pageStreams = await page.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(pageStreams), []);
  assert.match(page.errors[0], /^\[Pomfy\] Página: HTTP 500 em \[url\]/);
  assert.equal(callsByPath(page, '/api/play-token').length, 0);

  const file = makeRuntime(makeRoute({ file: { status: 500, body: 'erro' } }));
  const fileStreams = await file.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(fileStreams), []);
  assert.match(file.errors[0], /^\[Pomfy\] Arquivo: HTTP 500 em \[url\]/);
  assert.equal(callsByPath(file, '/api/streaming/assign/fixtureMovie01').length, 0);

  const assign = makeRuntime(makeRoute({ assign: { status: 500, body: 'erro' } }));
  const assignStreams = await assign.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(assignStreams), []);
  assert.match(assign.errors[0], /^\[Pomfy\] Arquivo: HTTP 500 em \[url\]/);
  assert.doesNotMatch(assign.errors[0], /fixtureAssignToken01|master\.m3u8/);
});

test('3.2 arquivo sem JSON válido é erro de arquivo', async () => {
  const runtime = makeRuntime(makeRoute({ file: { body: 'nao-json' } }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /^\[Pomfy\] Arquivo: Resposta não é JSON válido em \[url\]/);
});

test('4.1 escolhe a maior qualidade pronta e omite metadados opcionais ausentes', async () => {
  const file = clone(fileReady);
  file.videoAsset.originalMetadata = 'json invalido';
  file.name = '';
  file.videoAsset.qualities = [
    { quality: '1080p', status: 'READY', sizeBytes: 3000000000 },
    { quality: '4K', status: 'READY', sizeBytes: 4000000000 },
    { quality: '720p', status: 'READY', sizeBytes: 1000000000 },
  ];
  const runtime = makeRuntime(makeRoute({ file }), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '4K');
  assert.equal(streams[0].size, '3.73 GB');
  assert.doesNotMatch(streams[0].title, /📁/);
  assert.doesNotMatch(streams[0].title, /📊/);
  assert.doesNotMatch(streams[0].title, /⏱️/);
  assert.deepEqual(runtime.errors, []);
});

test('4.2 classifica idioma pelo áudio padrão e pelas legendas sem promover português sem região', async () => {
  const subtitle = (lang, label) => ({ lang, label, url: `https://subs.example.test/${lang}-${label.replace(/\W+/g, '')}.vtt` });
  const cases = [
    {
      name: 'áudio português com Brasil',
      audio: [{ lang: 'por', label: 'Portuguese (Brazil)', default: true }],
      subtitles: [],
      expected: 'Dublado',
    },
    {
      name: 'português sem região',
      audio: [{ lang: 'por', label: 'Portuguese', default: true }],
      subtitles: [],
      expected: 'Dublado (Não PT-BR?)',
    },
    {
      name: 'estrangeiro com legenda PT-BR',
      audio: [{ lang: 'eng', label: 'English', default: true }],
      subtitles: [subtitle('por', 'Portuguese (Brazil)')],
      expected: 'Legendado',
    },
    {
      name: 'estrangeiro com legenda PT sem região',
      audio: [{ lang: 'eng', label: 'English', default: true }],
      subtitles: [subtitle('por', 'Portuguese')],
      expected: 'Legendado (Não PT-BR?)',
    },
    {
      name: 'estrangeiro sem legenda PT',
      audio: [{ lang: 'eng', label: 'English', default: true }],
      subtitles: [subtitle('eng', 'English')],
      expected: 'Gringo',
    },
    {
      name: 'sem áudio e sem legenda PT',
      audio: [],
      subtitles: [subtitle('eng', 'English')],
      expected: 'Idioma Desconhecido',
    },
    {
      name: 'sem áudio com legenda PT-BR',
      audio: [],
      subtitles: [subtitle('por', 'Portuguese (Brazil)')],
      expected: 'Legendado',
    },
    {
      name: 'preferência declarada escolhe português sem default explícito',
      audio: [
        { lang: 'eng', label: 'English', default: false },
        { lang: 'por', label: 'Portuguese (Brazil)', default: false },
      ],
      subtitles: [],
      expected: 'Dublado',
    },
    {
      name: 'default explícito estrangeiro vence a preferência',
      audio: [
        { lang: 'eng', label: 'English', default: true },
        { lang: 'por', label: 'Portuguese (Brazil)', default: false },
      ],
      subtitles: [],
      expected: 'Gringo',
    },
  ];

  for (const scenario of cases) {
    const file = clone(fileReady);
    file.videoAsset.audioTracks = scenario.audio;
    file.videoAsset.subtitles = scenario.subtitles;
    file.videoSettings.defaultAudioLanguage = 'pt';
    const runtime = makeRuntime(makeRoute({ file }));
    const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

    assert.equal(streams.length, 1, scenario.name);
    assert.equal(streams[0].language, scenario.expected, scenario.name);
    assertEqualLanguages(Array.from(streams));
    assert.deepEqual(runtime.errors, [], scenario.name);
  }
});

test('4.3 legenda com URL inválida é descartada isoladamente e não recebe headers', async () => {
  const file = clone(fileReady);
  file.videoAsset.subtitles = [
    { lang: 'por', label: 'Portuguese (Brazil)', url: 'javascript:alert(1)' },
    { lang: 'eng', label: 'English', url: 'https://subs.example.test/fixture-en.vtt' },
  ];
  const runtime = makeRuntime(makeRoute({ file }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].subtitles.length, 1);
  assert.equal(streams[0].subtitles[0].language, 'Inglês');
  assert.equal(streams[0].subtitles[0].headers, undefined);
  assert.deepEqual(runtime.errors, []);
});

test('4.4 e 5.4 contrato do stream e ausência de URL de mídia ou token nos logs', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(Object.keys(streams[0]).sort(), [
    'language', 'name', 'provider', 'quality', 'size', 'subtitles', 'title', 'type', 'url',
  ].sort());
  assert.equal(streams[0].format, undefined);
  assert.equal(streams[0].headers, undefined);
  assert.doesNotMatch(streams[0].name, /master\.m3u8|fixtureAssignToken01|fixtureMovieToken/);
  assert.doesNotMatch(streams[0].title, /master\.m3u8|fixtureAssignToken01|fixtureMovieToken/);
  assert.deepEqual(runtime.errors, []);

  const invalid = makeRuntime(makeRoute({ playToken: { body: 'nao-json' } }));
  await invalid.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.doesNotMatch(invalid.errors.join('\n'), /master\.m3u8|fixtureAssignToken01|fixtureMovieToken|fixtureSeriesToken/);
});

test('5.4 fixtures sanitizadas não contêm URL de master, hash longo ou domínio de mídia real', () => {
  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /master\.m3u8|streaming-us|Policy=|Signature=|Key-Pair-Id=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.match(match[1], /^(?:[a-z0-9-]+\.)*(?:example\.test|flyfile\.app|flyf\.lat)$/, `${name}: ${match[1]}`);
    }
  }
});

test('1.2 entrada do Pomfy no manifest', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'pomfy');
  assert.ok(entry);
  assert.equal(entry.name, 'Pomfy');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/pomfy.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /Filme|filmes/i);
  assert.match(entry.description, /Flyfile/);
  assert.match(entry.description, /Byse/);
});
