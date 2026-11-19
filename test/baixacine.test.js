const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const BASE = 'https://baixacine.com';
const MOVIE_ID = '123500';
const AVENGERS_ID = '24428';
const OFFICE_ID = '2316';
const MOVIE_SEARCH = `${BASE}/index.php?busca=${encodeURIComponent('O Brilho do Mar')}`;
const AVENGERS_SEARCH = `${BASE}/index.php?busca=${encodeURIComponent('Os Vingadores')}`;
const AVENGERS_SEARCH_ORIGINAL = `${BASE}/index.php?busca=${encodeURIComponent('The Avengers')}`;
const OFFICE_SEARCH = `${BASE}/index.php?busca=${encodeURIComponent('The Office')}`;
const MOVIE_DETAIL = `${BASE}/o-brilho-do-mar-baixar-torrent/`;
const AVENGERS_DETAIL = `${BASE}/the-avengers-os-vingadores-baixar-torrent/`;
const OFFICE_DETAIL = `${BASE}/the-office-5-temporada-baixar-torrent/`;

const FIXTURES = path.join(__dirname, 'fixtures', 'baixacine');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

function oBrilhoPayload() {
  return {
    id: 123500,
    title: 'O Brilho do Mar',
    original_title: 'O Brilho do Mar',
    release_date: '2023-11-18',
    external_ids: { imdb_id: 'tt11773174' },
    alternative_titles: { titles: [] },
    original_language: 'pt',
    genres: [],
    origin_country: ['BR'],
  };
}

function avengersPayload() {
  return {
    id: 24428,
    title: 'Os Vingadores',
    original_title: 'The Avengers',
    release_date: '2012-04-25',
    external_ids: { imdb_id: 'tt0848228' },
    alternative_titles: { titles: [] },
    original_language: 'en',
    genres: [{ id: 12 }],
    origin_country: ['US'],
  };
}

function officePayload() {
  return {
    id: 2316,
    name: 'The Office',
    original_name: 'The Office',
    first_air_date: '2005-03-24',
    external_ids: { imdb_id: 'tt0386676' },
    alternative_titles: { results: [] },
    original_language: 'en',
    genres: [{ id: 35 }],
    origin_country: ['US'],
  };
}

let code;
test.before(async () => {
  const outDir = createTempDir('baixacine-test-');
  try {
    code = fs.readFileSync(await buildProvider('baixacine', { outDir, formatter: 'gdrive' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function makeRuntime(route) {
  const calls = [];
  const errors = [];
  const context = {
    module: { exports: {} },
    TMDB_API_KEY: 'chave-ficticia',
    URL,
    URLSearchParams,
    require: (name) => {
      if (name === 'cheerio-without-node-native') return require('./support/basic-html.js');
      throw new Error(`require inesperado: ${name}`);
    },
    console: {
      error: (message) => errors.push(String(message)),
      warn: () => {},
      log: () => {},
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
      return {
        ok: (result.status || 200) < 400,
        status: result.status || 200,
        url: String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(code, context, { filename: 'baixacine.js' });
  return {
    calls,
    errors,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function serve({ emptySearch = false } = {}) {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname.includes(`/movie/${MOVIE_ID}`)) return { body: oBrilhoPayload() };
      if (url.pathname.includes(`/movie/${AVENGERS_ID}`)) return { body: avengersPayload() };
      if (url.pathname.includes(`/tv/${OFFICE_ID}`)) return { body: officePayload() };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (emptySearch) return { body: '<html><body></body></html>' };
    if (url.href === MOVIE_SEARCH) return { body: readFixture('search.html') };
    if (url.href === AVENGERS_SEARCH || url.href === AVENGERS_SEARCH_ORIGINAL) {
      return { body: readFixture('search-avengers.html') };
    }
    if (url.href === OFFICE_SEARCH) return { body: readFixture('search-office.html') };
    if (url.href === MOVIE_DETAIL) return { body: readFixture('detail.html') };
    if (url.href === AVENGERS_DETAIL) return { body: readFixture('detail-avengers.html') };
    if (url.href === OFFICE_DETAIL) return { body: readFixture('detail-office.html') };
    throw new Error(`URL inesperada: ${url.href}`);
  };
}

test('filme confirmado: magnet hex, qualidade, idioma e tamanho do catálogo', async () => {
  const app = makeRuntime(serve());
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, '063f0d429a065401ff82ea36710753870181bc2c');
  assert.match(streams[0].url, /^magnet:\?xt=urn:btih:063f0d429a065401ff82ea36710753870181bc2c/);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].size, '2.48 GB');
  assert.equal(streams[0].type, 'magnet');
  assert.equal('headers' in streams[0], false);
  assert.equal('seeders' in streams[0] && streams[0].seeders !== undefined, false);
  assert.match(streams[0].name, /Baixa Cine/);
  assert.match(streams[0].name, /🧲 P2P/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.match(streams[0].title, /🧲 P2P 📦 2\.48 GB/);
  assert.deepEqual(app.calls.map((call) => call.url), [
    `https://api.themoviedb.org/3/movie/${MOVIE_ID}?api_key=chave-ficticia&language=pt-BR&append_to_response=external_ids,alternative_titles`,
    MOVIE_SEARCH,
    MOVIE_DETAIL,
  ]);
});

test('filme com sufixo de edição: variante do título confirma o cartão', async () => {
  const app = makeRuntime(serve());
  const streams = await app.getStreams(AVENGERS_ID, 'movie', null, null);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 3);
  assert.deepEqual(
    new Set(streams.map((stream) => stream.infoHash)),
    new Set([
      '00f17e8d27157b266b97be6f0be3c25c30287472',
      'd430c1bf03ccec2375e7950853dffabdf53c366b',
      '1526dd829688f315c4db8241fe658055128fb1af',
    ]),
  );
  assert.deepEqual(new Set(streams.map((stream) => stream.quality)), new Set(['1080p', '720p']));
  assert.ok(streams.every((stream) => stream.language === 'Dublado'));
  assert.ok(streams.every((stream) => !('size' in stream)));
  assert.deepEqual(app.calls.map((call) => call.url), [
    `https://api.themoviedb.org/3/movie/${AVENGERS_ID}?api_key=chave-ficticia&language=pt-BR&append_to_response=external_ids,alternative_titles`,
    AVENGERS_SEARCH,
    AVENGERS_DETAIL,
  ]);
});

test('série: cartão de temporada confirmado com o ano da temporada', async () => {
  const app = makeRuntime(serve());
  const streams = await app.getStreams(OFFICE_ID, 'tv', 1, 1);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, '3a6552ab23fc717ed7af63b4a7985bfa492fecf4');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].size, '16.3 GB');
  assert.deepEqual(app.calls.map((call) => call.url), [
    `https://api.themoviedb.org/3/tv/${OFFICE_ID}?api_key=chave-ficticia&language=pt-BR&append_to_response=external_ids,alternative_titles`,
    OFFICE_SEARCH,
    OFFICE_DETAIL,
  ]);
});

test('ausência: resultados sem correspondência devolvem lista vazia sem erros', async () => {
  const app = makeRuntime(serve({ emptySearch: true }));
  assert.deepEqual(await app.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.deepEqual(app.calls.map((call) => call.url), [
    `https://api.themoviedb.org/3/movie/${MOVIE_ID}?api_key=chave-ficticia&language=pt-BR&append_to_response=external_ids,alternative_titles`,
    MOVIE_SEARCH,
  ]);
});

test('entrada inválida: IDs e tipos rejeitados antes de qualquer requisição', async () => {
  const app = makeRuntime(serve());
  for (const args of [
    ['tt1', 'movie', null, null],
    ['100', 'series', null, null],
    ['100', 'tv', null, 1],
    ['100', 'tv', 0, 1],
    ['100', 'tv', 1, -1],
    ['100', 'tv', '2', 3],
    ['100', 'tv', 2, 1.5],
  ]) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.errors.length, 7);
  assert.ok(app.errors.every((message) => message.startsWith('[Baixa Cine] Entrada:')));
});

test('carrega CommonJS sem rede e sem async/await no bundle', () => {
  const app = makeRuntime(serve());
  assert.equal(typeof app.getStreams, 'function');
  assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(code, /searchParams\.(set|append)|Promise\.allSettled/);
});
