const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const HEX_HASH = '063f0d429a065401ff82ea36710753870181bc2c';
const BASE = 'https://baixacine.com';
const SEARCH_URL = `${BASE}/?s=${encodeURIComponent('O Brilho do Mar')}`;
const DETAIL_URL = `${BASE}/o-brilho-do-mar-baixar-torrent/`;
const MOVIE_ID = '123500';

const FIXTURES = path.join(__dirname, 'fixtures', 'baixacine');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

function moviePayload() {
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

function tvPayload() {
  return {
    id: 123500,
    name: 'O Brilho do Mar',
    original_name: 'O Brilho do Mar',
    first_air_date: '2023-11-18',
    external_ids: { imdb_id: 'tt11773174' },
    alternative_titles: { results: [] },
    original_language: 'pt',
    genres: [],
    origin_country: ['BR'],
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

function serve({ search = readFixture('search.html') } = {}) {
  return (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname.includes('/movie/')) return { body: moviePayload() };
      if (url.pathname.includes('/tv/')) return { body: tvPayload() };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.href === SEARCH_URL) return { body: search };
    if (url.href === DETAIL_URL) return { body: readFixture('detail.html') };
    throw new Error(`URL inesperada: ${url.href}`);
  };
}

test('filme confirmado: magnet hex, qualidade, idioma e tamanho do catálogo', async () => {
  const app = makeRuntime(serve());
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_HASH);
  assert.match(streams[0].url, new RegExp(`^magnet:\\?xt=urn:btih:${HEX_HASH}`));
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
    'https://api.themoviedb.org/3/movie/123500?api_key=chave-ficticia&language=pt-BR&append_to_response=external_ids,alternative_titles',
    SEARCH_URL,
    DETAIL_URL,
  ]);
});

test('entrada tv: passa a validação e consulta a fonte pelo catálogo', async () => {
  const app = makeRuntime(serve());
  const streams = await app.getStreams(MOVIE_ID, 'tv', 1, 1);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, HEX_HASH);
});

test('ausência: resultados sem correspondência devolvem lista vazia sem erros', async () => {
  const app = makeRuntime(serve({ search: '' }));
  assert.deepEqual(await app.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
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
