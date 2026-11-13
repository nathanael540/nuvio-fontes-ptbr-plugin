const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'raflix');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const MOVIE_ID = '299534';
const MOVIE_LEGENDADO_ID = '550';
const UNRELEASED_ID = '1003596';
const TV_ID = '100088';
const TV_LEGENDADO_ID = '1396';
const TV_NULL_ID = '76479';

const mediaMovie = readJson('media-movie.json');
const mediaMovieLegendado = readJson('media-movie-legendado.json');
const mediaMovieUnreleased = readJson('media-movie-unreleased.json');
const mediaTv = readJson('media-tv.json');
const mediaTvOriginalPt = readJson('media-tv-original-pt.json');
const mediaTvNull = readJson('media-tv-null.json');
const media404 = readJson('media-404.json');
const sourcesMovie = readJson('sources-movie.json');
const sourcesMovieLegendado = readJson('sources-movie-legendado.json');
const sourcesMovieUnreleased = readJson('sources-movie-unreleased.json');
const sourcesTv = readJson('sources-tv.json');
const sourcesTvOriginalPt = readJson('sources-tv-original-pt.json');
const sourcesTvNull = readJson('sources-tv-null.json');
const sourcesWithoutVidrift = readJson('sources-without-vidrift.json');
const bootPtbr = readJson('boot-ptbr.json');
const bootOriginalPt = readJson('boot-original-pt.json');
const bootTvPtbr = readJson('boot-tv-ptbr.json');
const bootTvOriginalPt = readJson('boot-tv-original-pt.json');
const bootNull = readJson('boot-null.json');
const bootUnreleased = readJson('boot-unreleased.json');
const subtitlesPt = readJson('subtitles-original-pt.json');
const subtitlesNoPt = readJson('subtitles-original-no-pt.json');
const genericVtt = read('subtitles-generic.vtt');
const sourceVela = readJson('source-vela.json');
const sourceSingle = readJson('source-single.json');
const sourceSingleMaxres = readJson('source-single-maxres.json');
const sourceSingleUnknown = readJson('source-single-unknown.json');
const sourceEmpty = readJson('source-empty.json');
const sourceDuplicate = readJson('source-duplicate.json');
const httpError = read('http-error.txt');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const MEDIA = {
  [`/api/media/movie/${MOVIE_ID}`]: mediaMovie,
  [`/api/media/movie/${MOVIE_LEGENDADO_ID}`]: mediaMovieLegendado,
  [`/api/media/movie/${UNRELEASED_ID}`]: mediaMovieUnreleased,
  [`/api/media/tv/${TV_ID}`]: mediaTv,
  [`/api/media/tv/${TV_LEGENDADO_ID}`]: mediaTvOriginalPt,
  [`/api/media/tv/${TV_NULL_ID}`]: mediaTvNull,
};

const MOVIE_SOURCES = {
  [MOVIE_ID]: sourcesMovie,
  [MOVIE_LEGENDADO_ID]: sourcesMovieLegendado,
  [UNRELEASED_ID]: sourcesMovieUnreleased,
};

const TV_SOURCES = {
  [TV_ID]: sourcesTv,
  [TV_LEGENDADO_ID]: sourcesTvOriginalPt,
  [TV_NULL_ID]: sourcesTvNull,
};

const BOOT = {
  [`/api/boot/movie/${MOVIE_ID}`]: bootPtbr,
  [`/api/boot/movie/${MOVIE_LEGENDADO_ID}`]: bootOriginalPt,
  [`/api/boot/movie/${UNRELEASED_ID}`]: bootUnreleased,
  [`/api/boot/tv/${TV_ID}/1/1`]: bootTvPtbr,
  [`/api/boot/tv/${TV_LEGENDADO_ID}/1/1`]: bootTvOriginalPt,
  [`/api/boot/tv/${TV_NULL_ID}/1/1`]: bootNull,
};

const DEFAULT_SOURCES = {
  vela: sourceVela,
  titan: sourceSingle,
  atlas: sourceEmpty,
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('raflix-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('raflix', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('raflix', { outDir, formatter: 'prism' }), 'utf8');
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
    if (url.hostname === 'raflix.web.id') {
      if (url.pathname === '/api/media/sources') {
        if (options.sources !== undefined) {
          return asResponse(typeof options.sources === 'function' ? options.sources(url) : options.sources);
        }
        if (url.searchParams.get('type') === 'tv') {
          return asResponse(TV_SOURCES[url.searchParams.get('tmdbId')] || sourcesTv);
        }
        return asResponse(MOVIE_SOURCES[url.searchParams.get('tmdbId')] || sourcesMovie);
      }
      if (options.media !== undefined) {
        return asResponse(typeof options.media === 'function' ? options.media(url) : options.media);
      }
      const media = MEDIA[url.pathname];
      if (media !== undefined) return asResponse(media);
    }
    if (url.hostname === 'embed.vidrift.in') {
      if (url.pathname.startsWith('/api/boot/')) {
        if (options.boot !== undefined) {
          return asResponse(typeof options.boot === 'function' ? options.boot(url) : options.boot);
        }
        const boot = BOOT[url.pathname];
        if (boot !== undefined) return asResponse(boot);
      }
      if (url.pathname.startsWith('/api/orion/') && url.pathname.endsWith('/subtitles.json')) {
        return asResponse(options.subtitles === undefined ? subtitlesPt : options.subtitles);
      }
      if (url.pathname.startsWith('/api/subtitles/')) {
        if (options.generic === undefined) return asResponse(genericVtt);
        return asResponse(typeof options.generic === 'function' ? options.generic(url) : options.generic);
      }
      if (url.pathname.startsWith('/api/source/')) {
        const provider = url.searchParams.get('provider');
        if (options.source !== undefined) return asResponse(options.source(provider, url));
        return asResponse(DEFAULT_SOURCES[provider]);
      }
    }
    throw new Error(`Rota inesperada: ${url.hostname}${url.pathname}`);
  };
}

function callsByPath(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname);
}

function sourceCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/api/source/'));
}

function assertReferer(headers, expected = 'https://embed.vidrift.in/') {
  assert.ok(headers, 'headers ausentes');
  assert.equal(headers.Referer, expected);
  assert.match(headers['User-Agent'], /Mozilla\/5\.0/);
}

test('1.1 e 5.1 carrega o pacote sem rede e expõe getStreams', () => {
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

test('2.1 valida entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    [MOVIE_ID, 'anime', null, null],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    const streams = await runtime.exports.getStreams(...args);
    assert.deepEqual(Array.from(streams), []);
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  for (const message of runtime.errors) assert.match(message, /^\[Raflix\] Entrada: /);
});

test('2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4 e 4.5 resolve filme dublado com contingência', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 4);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '1080p', '720p', '480p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado', 'Legendado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.provider), ['Orion', 'Vela', 'Vela', 'Vela']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    'https://embed.vidrift.in/api/orion/ptbr/master.m3u8',
    'https://embed.vidrift.in/api/proxy/hls/filme-1080p/index.m3u8',
    'https://embed.vidrift.in/api/proxy/hls/filme-720p/index.m3u8',
    'https://embed.vidrift.in/api/proxy/hls/filme-480p/index.m3u8',
  ]);

  const [dublado, velo1080, velo720, velo480] = streams;
  assert.equal(dublado.type, 'hls');
  assert.equal(dublado.format, undefined);
  assert.equal(dublado.subtitles, undefined);
  assertReferer(dublado.headers);
  assert.match(dublado.name, /^Raflix 1080p\n/);
  assert.match(dublado.title, /🗣️ Dublado/);
  assert.match(dublado.title, /🌐 HTTP/);
  assert.match(dublado.title, /🔍 Orion/);

  for (const legendado of [velo1080, velo720, velo480]) {
    assert.equal(legendado.type, 'hls');
    assertReferer(legendado.headers);
    assert.equal(legendado.subtitles.length, 1);
    assert.equal(legendado.subtitles[0].url, 'https://embed.vidrift.in/api/orion/original/sub-pt.vtt');
    assert.equal(legendado.subtitles[0].language, 'Português');
    assert.equal(legendado.subtitles[0].name, 'Português · Orion');
    assertReferer(legendado.subtitles[0].headers);
    assert.match(legendado.title, /🗣️ Legendado/);
    assert.match(legendado.title, /🔍 Vela/);
  }

  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);

  const metadataCall = callsByPath(runtime.calls, `/api/media/movie/${MOVIE_ID}`);
  assert.equal(metadataCall.length, 1);
  const sourcesCall = callsByPath(runtime.calls, '/api/media/sources');
  assert.equal(sourcesCall.length, 1);
  const sourcesUrl = new URL(sourcesCall[0].url);
  assert.equal(sourcesUrl.searchParams.get('type'), 'movie');
  assert.equal(sourcesUrl.searchParams.get('tmdbId'), MOVIE_ID);
  assert.equal(sourcesUrl.searchParams.get('season'), null);
  assert.equal(sourcesUrl.searchParams.get('episode'), null);

  assert.equal(callsByPath(runtime.calls, `/api/boot/movie/${MOVIE_ID}`).length, 1);
  assert.equal(callsByPath(runtime.calls, '/api/orion/original/subtitles.json').length, 1);
  assert.equal(callsByPath(runtime.calls, `/api/subtitles/movie/${MOVIE_ID}/Portuguese`).length, 0);

  const sources = sourceCalls(runtime.calls);
  assert.equal(sources.length, 1);
  const sourceUrl = new URL(sources[0].url);
  assert.equal(sourceUrl.pathname, `/api/source/movie/${MOVIE_ID}`);
  assert.equal(sourceUrl.searchParams.get('token'), 'fixture-playback-token');
  assert.equal(sourceUrl.searchParams.get('provider'), 'vela');
  assert.equal(sourceUrl.searchParams.get('parent'), 'raflix.web.id');
  assert.equal(sourceUrl.searchParams.get('hevc'), '0');
});

test('2.3, 3.2, 3.3, 4.1, 4.2 e 4.4 resolve filme legendado pela contingência', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '720p', '480p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Legendado', 'Legendado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.provider), ['Vela', 'Vela', 'Vela']);
  assert.ok(streams.every((stream) => stream.url.startsWith('https://embed.vidrift.in/api/proxy/hls/')));
  assert.ok(streams.every((stream) => stream.subtitles.length === 1));
  assert.ok(streams.every((stream) => stream.subtitles[0].url === 'https://embed.vidrift.in/api/orion/original/sub-pt.vtt'));

  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(sourceCalls(runtime.calls).length, 1);
});

test('3.4 usa a faixa Original quando a contingência responde vazia', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => sourceEmpty }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://embed.vidrift.in/api/orion/original/master.m3u8');
  assert.equal(streams[0].quality, '480p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].provider, 'Orion');
  assert.equal(streams[0].type, 'hls');
  assertReferer(streams[0].headers);
  assert.equal(streams[0].subtitles.length, 1);
  assert.equal(streams[0].subtitles[0].url, 'https://embed.vidrift.in/api/orion/original/sub-pt.vtt');
  assert.equal(sourceCalls(runtime.calls).length, 3);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.1 e 4.1 busca a série com temporada e episódio e monta dublado e legendado', async () => {
  const runtime = makeRuntime(makeRoute({
    source: (provider) => (provider === 'titan' ? sourceSingle : sourceEmpty),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '720p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.provider), ['Orion', 'Titan']);

  const sourcesCall = new URL(callsByPath(runtime.calls, '/api/media/sources')[0].url);
  assert.equal(sourcesCall.searchParams.get('type'), 'tv');
  assert.equal(sourcesCall.searchParams.get('tmdbId'), TV_ID);
  assert.equal(sourcesCall.searchParams.get('season'), '1');
  assert.equal(sourcesCall.searchParams.get('episode'), '1');

  const bootCall = callsByPath(runtime.calls, `/api/boot/tv/${TV_ID}/1/1`);
  assert.equal(bootCall.length, 1);
  const sourceUrl = new URL(sourceCalls(runtime.calls)[0].url);
  assert.equal(sourceUrl.pathname, `/api/source/tv/${TV_ID}/1/1`);
  assert.equal(sourceUrl.searchParams.get('provider'), 'vela');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.3 e 3.3 resolve série legendada pela contingência', async () => {
  const runtime = makeRuntime(makeRoute({
    source: (provider) => (provider === 'titan' ? sourceSingle : sourceEmpty),
  }));
  const streams = await runtime.exports.getStreams(TV_LEGENDADO_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://media.example.test/hls/filme/720/index.m3u8');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].provider, 'Titan');
  assert.equal(streams[0].headers, undefined);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('4.5 formata título, ano e coordenadas no template Prism', async () => {
  const movieRuntime = makeRuntime(makeRoute(), codes.prism);
  const movieStreams = await movieRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.match(movieStreams[0].name, /^🚀 FHD 1080p\n/);
  assert.match(movieStreams[0].title, /🎬 Avengers: Endgame \(2019\)/);
  assert.match(movieStreams[0].title, /🗣️ Dublado/);

  const tvRuntime = makeRuntime(makeRoute(), codes.prism);
  const tvStreams = await tvRuntime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.match(tvStreams[0].title, /🎬 The Last of Us \(2023\) T01E01/);
});

test('3.1 e 4.4 usa a legenda genérica quando o boot não tem faixas', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_NULL_ID, 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Legendado', 'Legendado', 'Legendado']);
  for (const stream of streams) {
    assert.equal(stream.subtitles.length, 1);
    assert.equal(stream.subtitles[0].url, `https://embed.vidrift.in/api/subtitles/tv/${TV_NULL_ID}/1/1/Portuguese`);
    assert.equal(stream.subtitles[0].language, 'Português');
    assert.equal(stream.subtitles[0].headers, undefined);
  }
  assert.equal(callsByPath(runtime.calls, `/api/subtitles/tv/${TV_NULL_ID}/1/1/Portuguese`).length, 1);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.includes('/subtitles.json')).length, 0);
  assert.equal(sourceCalls(runtime.calls).length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 HTTP 404 dos metadados é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ media: { status: 404, body: media404 } }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.length, 1);
});

test('2.2 lista sem VidRift é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ sources: sourcesWithoutVidrift }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.startsWith('/api/boot/')).length, 0);
});

test('3.4 título não lançado é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(UNRELEASED_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.startsWith('/api/subtitles/')).length, 0);
  assert.equal(sourceCalls(runtime.calls).length, 0);
});

test('3.4 sem áudio PT-BR nem legenda PT devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({
    subtitles: subtitlesNoPt,
    generic: { status: 404, body: 'Not Found' },
  }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(sourceCalls(runtime.calls).length, 0);
});

test('4.4 não devolve stream de contingência sem legenda PT', async () => {
  const runtime = makeRuntime(makeRoute({
    subtitles: subtitlesNoPt,
    generic: { status: 404, body: 'Not Found' },
    source: () => sourceVela,
  }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(sourceCalls(runtime.calls).length, 0);
});

test('3.2 faixa francesa não é classificada como PT-BR', async () => {
  const frenchOnly = {
    ...bootOriginalPt,
    meta: {
      ...bootOriginalPt.meta,
      orionStreams: bootOriginalPt.meta.orionStreams.filter((track) => track.name.includes('French')),
    },
  };
  const runtime = makeRuntime(makeRoute({
    boot: frenchOnly,
    subtitles: subtitlesNoPt,
    generic: { status: 404, body: 'Not Found' },
  }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.1 JSON inválido do boot sobe para getStreams', async () => {
  const runtime = makeRuntime(makeRoute({ boot: 'not json' }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Raflix\] Boot: Resposta não é JSON válido/);
});

test('3.1 HTTP 500 nos metadados e no boot sobe para getStreams', async () => {
  const metadataRuntime = makeRuntime(makeRoute({ media: { status: 500, body: httpError } }));
  const metadataStreams = await metadataRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(metadataStreams), []);
  assert.match(metadataRuntime.errors[0], /^\[Raflix\] Metadados: HTTP 500/);

  const bootRuntime = makeRuntime(makeRoute({ boot: { status: 500, body: httpError } }));
  const bootStreams = await bootRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(bootStreams), []);
  assert.match(bootRuntime.errors[0], /^\[Raflix\] Boot: HTTP 500/);
});

test('3.1 boot sem meta é falha de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ boot: { meta: null } }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /^\[Raflix\] Boot: Boot do VidRift sem "meta"/);
});

test('2.3 URL do VidRift fora do formato esperado é falha', async () => {
  const malformed = {
    ...sourcesMovie,
    sources: [{ id: 'vidrift', label: 'VidRift', kind: 'embed', url: 'https://embed.vidrift.in/watch/movie/550' }],
  };
  const runtime = makeRuntime(makeRoute({ sources: malformed }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Raflix\] Fontes: URL da fonte VidRift fora do formato esperado/);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.startsWith('/api/boot/')).length, 0);
});

test('5.2 primeiro provedor falha e o segundo responde', async () => {
  const runtime = makeRuntime(makeRoute({
    source: (provider) => (provider === 'vela' ? { status: 500, body: httpError } : sourceSingle),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'Titan');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Raflix\] Opção Vela descartada: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
  assert.equal(sourceCalls(runtime.calls).length, 2);
});

test('5.1 dublado é preservado quando todos os provedores falham', async () => {
  const runtime = makeRuntime(makeRoute({
    source: () => ({ status: 500, body: httpError }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].provider, 'Orion');
  assert.equal(streams[0].subtitles, undefined);
  assert.equal(runtime.warnings.length, 3);
  assert.match(runtime.warnings[0], /Opção Vela descartada: HTTP 500/);
  assert.match(runtime.warnings[1], /Opção Titan descartada: HTTP 500/);
  assert.match(runtime.warnings[2], /Opção Atlas descartada: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('5.2 todos os provedores falham sem dublado nem Original: erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({
    source: () => ({ status: 500, body: httpError }),
  }));
  const streams = await runtime.exports.getStreams(TV_NULL_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 3);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Raflix\] Mídia: Nenhuma opção de contingência produziu stream/);
  assert.match(runtime.errors[0], /vela: HTTP 500/);
  assert.match(runtime.errors[0], /titan: HTTP 500/);
  assert.match(runtime.errors[0], /atlas: HTTP 500/);
});

test('4.4 URL repetida é deduplicada', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => sourceDuplicate }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Legendado');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('4.2 maxRes define a qualidade quando há um único stream sem resolução na URL', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => sourceSingleMaxres }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].provider, 'Titan');
  assert.equal(streams[0].headers, undefined);
});

test('4.2 qualidade desconhecida é preservada', async () => {
  const runtime = makeRuntime(makeRoute({ source: () => sourceSingleUnknown }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].language, 'Legendado');
  assert.deepEqual(runtime.errors, []);
});

test('3.3 falha da lista de legendas não derruba o dublado', async () => {
  const runtime = makeRuntime(makeRoute({
    subtitles: { status: 500, body: httpError },
    generic: { status: 404, body: 'Not Found' },
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Raflix\] Legenda PT descartada: Orion: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 falha de legenda sem dublado vira erro, não ausência', async () => {
  const runtime = makeRuntime(makeRoute({
    subtitles: { status: 500, body: httpError },
    generic: { status: 404, body: 'Not Found' },
  }));
  const streams = await runtime.exports.getStreams(MOVIE_LEGENDADO_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Raflix\] Legenda: Nenhuma legenda PT disponível/);
});

test('1.2, 1.3 e 5.3 manifest e fixtures sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'raflix');
  assert.ok(entry);
  assert.equal(entry.name, 'Raflix');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/raflix.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes e séries/i);
  assert.match(entry.description, /dublado|legenda/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, name);
    assert.doesNotMatch(content, /Policy=|Signature=|Key-Pair-Id=|token=|Cookie=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.match(
        match[1],
        /^(example\.test|media\.example\.test|raflix\.web\.id|embed\.vidrift\.in)$/,
        `${name}: ${match[1]}`,
      );
    }
    if (content.includes('playbackToken')) {
      const data = JSON.parse(content);
      assert.equal(data.meta.playbackToken, 'fixture-playback-token', name);
    }
  }
});
