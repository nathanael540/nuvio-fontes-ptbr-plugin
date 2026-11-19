const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'tokyvideo');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchHtml = read('search.html');
const searchGeoHtml = read('search-geo.html');
const searchGta6Html = read('search-gta6.html');
const videoGtaTrailer = read('video-gta-trailer.html');
const videoGrandTheftAutoVi = read('video-grand-theft-auto-vi.html');
const videoGta6Trailer = read('video-gta6-trailer.html');
const videoGeo = read('video-geo.html');
const metaMovie = readJson('meta-movie.json');
const metaGta6 = readJson('meta-gta6.json');
const metaGameOn = readJson('meta-game-on.json');
const metaTv = readJson('meta-tv.json');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const MOVIE_ID = '12345';
const TV_ID = '12346';
const GTA6_ID = '12347';

const GTA_TRAILER_CARD = 'https://www.tokyvideo.example.test/br/video/gta-trailer';
const GTA_TRAILER_CDN = 'https://cdn.tokyvideo.example.test/videos/921/921321/mp4/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0.mp4?secure=fake';
const GTA_AUTO_VI_CARD = 'https://www.tokyvideo.example.test/br/video/grand-theft-auto-vi';
const GTA_AUTO_VI_CDN = 'https://cdn.tokyvideo.example.test/videos/424/424682/mp4/b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2.mp4?secure=fake';
const GTA6_TRAILER_CDN = 'https://cdn.tokyvideo.example.test/videos/720/720010/mp4/c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4.mp4?secure=fake';

const defaultVideoPages = {
  '/br/video/gta-trailer': videoGtaTrailer,
  '/br/video/grand-theft-auto-vi': videoGrandTheftAutoVi,
  '/br/video/game-on-2006-full-documentary': videoGeo,
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('tokyvideo-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('tokyvideo', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('tokyvideo', { outDir, formatter: 'prism' }), 'utf8');
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

function tokyvideoRoute(options = {}) {
  const search = options.search === undefined ? searchHtml : options.search;
  const movieMeta = options.movieMeta === undefined ? metaMovie : options.movieMeta;
  const tvMeta = options.tvMeta === undefined ? metaTv : options.tvMeta;
  const videoPages = options.videoPages === undefined ? defaultVideoPages : options.videoPages;
  const fatalSearch = options.fatalSearch === true;
  return async (url) => {
    const hostname = url.hostname;
    if (hostname === 'api.themoviedb.org') {
      if (/^\/3\/movie\/\d+$/.test(url.pathname)) return asResponse(movieMeta);
      if (url.pathname === `/3/tv/${TV_ID}`) return asResponse(tvMeta);
      throw new Error(`Rota inesperada: ${url.pathname}`);
    }
    if (hostname === 'www.tokyvideo.com' || hostname === 'www.tokyvideo.example.test') {
      if (url.pathname === '/br/procurar') return fatalSearch ? { status: 500, body: 'erro' } : asResponse(search);
      const page = videoPages[url.pathname];
      if (page !== undefined) return asResponse(page);
      throw new Error(`Rota inesperada: ${url.pathname}`);
    }
    throw new Error(`Host inesperado: ${hostname}`);
  };
}

test('1.1 carrega o pacote sem rede e expõe getStreams', () => {
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

test('2.1 e 4.3 valida entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(tokyvideoRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    ['12345', 'anime', null, null],
    ['12346', 'tv', null, 1],
    ['12346', 'tv', 1, 0],
    ['12346', 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    const streams = await runtime.exports.getStreams(...args);
    assert.deepEqual(Array.from(streams), []);
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  for (const message of runtime.errors) {
    assert.match(message, /^\[Tokyvideo\] Falha em .*: Entrada: /);
  }
});

test('2.2 resolve filme pelo portal', async () => {
  const gdriveRuntime = makeRuntime(tokyvideoRoute());
  const gdriveStreams = await gdriveRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(gdriveStreams.length, 1);
  const movie = gdriveStreams[0];
  assert.equal(movie.url, GTA_TRAILER_CDN);
  assert.equal(movie.quality, '720p');
  assert.equal(movie.language, 'Idioma Desconhecido');
  assert.equal(movie.type, 'mp4');
  assert.equal(movie.provider, 'cdn.tokyvideo.example.test');
  assert.equal(movie.format, undefined);
  assert.match(movie.name, /^Tokyvideo 720p/);
  assert.match(movie.title, /🗣️ Idioma Desconhecido/);
  assert.equal(movie.headers.Referer, GTA_TRAILER_CARD);
  assert.equal(movie.headers.Origin, 'https://www.tokyvideo.example.test');
  assert.ok(typeof movie.headers['User-Agent'] === 'string');
  assert.deepEqual(gdriveRuntime.errors, []);
  assert.deepEqual(gdriveRuntime.warnings, []);
  assert.equal(gdriveRuntime.calls.length, 3);

  const prismRuntime = makeRuntime(tokyvideoRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(prismStreams.length, 1);
  assert.equal(prismStreams[0].quality, '720p');
  assert.equal(prismStreams[0].url, GTA_TRAILER_CDN);
  assert.match(prismStreams[0].title, /🎬 GTA TRAILER/);
});

test('2.2 resolve episódio avulso pelo portal', async () => {
  const runtime = makeRuntime(tokyvideoRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(streams.length, 1);
  const episode = streams[0];
  assert.equal(episode.url, GTA_AUTO_VI_CDN);
  assert.equal(episode.quality, '720p');
  assert.equal(episode.language, 'Idioma Desconhecido');
  assert.equal(episode.headers.Referer, GTA_AUTO_VI_CARD);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);

  const prismRuntime = makeRuntime(tokyvideoRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(prismStreams.length, 1);
  assert.equal(prismStreams[0].url, GTA_AUTO_VI_CDN);
  assert.match(prismStreams[0].title, /🎬 Grand Theft Auto VI/);
  assert.match(prismStreams[0].title, /T01E02/);
  assert.match(prismStreams[0].name, /💿 HD 720p/);
});

test('2.3 falha isolada de ficha descarta somente a opção que falhou', async () => {
  const runtime = makeRuntime(tokyvideoRoute({
    movieMeta: metaGta6,
    search: searchGta6Html,
    videoPages: {
      '/br/video/gta6': { status: 500, body: 'erro' },
      '/br/video/gta6-trailer-official': videoGta6Trailer,
    },
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, GTA6_TRAILER_CDN);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Tokyvideo\] Opção "GTA 6" descartada: HTTP 500 em \[url\]$/);
  assert.doesNotMatch(runtime.warnings.join('\n'), /tokyvideo\.example\.test|secure=/);
});

test('2.4 falha na busca sobe até getStreams', async () => {
  const runtime = makeRuntime(tokyvideoRoute({ fatalSearch: true }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Tokyvideo\] Falha em movie 12345: HTTP 500 em \[url\]$/);
});

test('4.1 ausência reconhecida devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(tokyvideoRoute({
    movieMeta: metaGameOn,
    search: searchGeoHtml,
  }));
  const streams = await runtime.exports.getStreams(GTA6_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('5.1 fixtures sanitizadas e manifest do Tokyvideo', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'tokyvideo');
  assert.ok(entry);
  assert.equal(entry.name, 'Tokyvideo');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/tokyvideo.js');
  assert.equal(entry.enabled, true);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /tokyvideo/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /Policy=|Signature=|Key-PairId=|token=|\b[a-f0-9]{64}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.match(match[1], /(^|\.)example\.test$/, `${name}: ${match[1]}`);
    }
  }
});
