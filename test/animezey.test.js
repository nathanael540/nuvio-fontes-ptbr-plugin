const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'animezey');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchChihiro = readJson('search-chihiro.json');
const searchJjk = readJson('search-jjk.json');
const searchBoruto = readJson('search-boruto.json');
const searchEmpty = readJson('search-empty.json');
const searchMalformed = readJson('search-malformed.json');
const searchMissingLink = readJson('search-missing-link.json');
const searchPartialLink = readJson('search-partial-link.json');
const searchWrongYear = readJson('search-wrong-year.json');

const MOVIE_ID = '129';
const TV_ID = '95479';
const NARUTO_ID = '46260';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [MOVIE_ID]: tmdbMovie({
    title: 'A Viagem de Chihiro',
    originalTitle: '千と千尋の神隠し',
    year: 2001,
  }),
  [TV_ID]: tmdbTv({
    title: 'Jujutsu Kaisen',
    originalTitle: '呪術廻戦',
    year: 2020,
    seasons: [
      { number: 1, episodeCount: 24, name: 'Temporada 1', airDate: '2020-10-03' },
      { number: 2, episodeCount: 23, name: 'Temporada 2', airDate: '2023-07-06' },
    ],
  }),
  [NARUTO_ID]: tmdbTv({
    title: 'Naruto',
    originalTitle: 'ナルト',
    year: 2002,
    seasons: [{ number: 1, episodeCount: 220, name: 'Temporada 1', airDate: '2002-10-03' }],
  }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animezey-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animezey', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animezey', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbMovie({ title, originalTitle, year, alternativeTitles = [] }) {
  return {
    id: 1,
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      titles: alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
    },
  };
}

function tmdbTv({ title, originalTitle, year, seasons = [], alternativeTitles = [] }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    seasons: seasons.map((season) => ({
      season_number: season.number,
      episode_count: season.episodeCount,
      name: season.name,
      air_date: season.airDate,
    })),
    alternative_titles: {
      results: alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
    },
  };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const mediaType = parts[2];
  const id = parts[3];
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  return mediaType === 'movie' || mediaType === 'tv' ? data : { status: 404, body: { status_message: 'Not found' } };
}

function searchFor(query) {
  if (query.includes('Chihiro')) return searchChihiro;
  if (query.includes('Jujutsu')) return searchJjk;
  if (query.includes('Naruto') || query.includes('Boruto')) return searchBoruto;
  return searchEmpty;
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== '1.animezey23112022.workers.dev') {
      throw new Error(`Host inesperado: ${url.hostname}`);
    }
    if (url.pathname !== '/1:search') throw new Error(`Rota inesperada: ${url.pathname}`);
    if (options.search) return asResponse(options.search(url, init));
    const body = JSON.parse(String(init.body || '{}'));
    return asResponse(searchFor(String(body.q || '')));
  };
}

function searchCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === '1.animezey23112022.workers.dev');
}

test('carrega o pacote sem rede e não usa APIs proibidas', () => {
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

test('valida a entrada antes de qualquer requisição', async () => {
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
  for (const message of runtime.errors) assert.match(message, /^\[AnimeZeY\] Falha em .*: Entrada: /);
});

test('resolve filme com título, ano, qualidade, idioma e tamanho no nome', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, 'https://animezey16082023.animezey16082023.workers.dev/download.aspx?file=fictional-chihiro&expiry=999&mac=fictional');
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Dublado (Não PT-BR?)');
  assert.equal(stream.type, 'mkv');
  assert.equal(stream.provider, 'AnimeZeY');
  assert.equal(stream.size, '2.27 GB');
  assert.equal(stream.headers, undefined);
  assert.match(stream.name, /1080p/);
  assert.match(stream.title, /A Viagem de Chihiro/);
  assert.match(stream.title, /\(2001\)/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  for (const item of streams) assert.ok(LANGUAGE_VALUES.includes(item.language));
  assert.ok(streams.every((item) => !item.url.includes('a=view')));
});

test('rejeita filme com ano divergente', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchWrongYear }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('resolve episódio com coordenadas explícitas e rejeita temporada divergente', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);

  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Idioma Desconhecido');
  assert.equal(stream.type, 'mkv');
  assert.equal(stream.size, '1.12 GB');
  assert.match(stream.name, /Jujutsu Kaisen/);
  assert.match(stream.title, /T02E01/);
  assert.match(stream.title, /Jujutsu Kaisen/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('S05E01 não atende pedido S01E01', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchJjk }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('Boruto é rejeitado para pedido de Naruto', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchBoruto }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('arquivo sem link falha isolada e não derruba o arquivo válido', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchPartialLink }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://animezey16082023.animezey16082023.workers.dev/download.aspx?file=fictional-jjk-alt&expiry=999&mac=fictional');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Arquivo sem link/);
});

test('todos os arquivos sem link sobem como erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchMissingLink }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeZeY\]/);
});

test('429 do worker é falha e não usa o secundário', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 429, body: 'error code: 1027' }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeZeY\]/);
  assert.equal(searchCalls(runtime.calls).length > 0, true);
  assert.ok(searchCalls(runtime.calls).every((call) => new URL(call.url).hostname === '1.animezey23112022.workers.dev'));
});

test('JSON inválido e lista vazia são tratados sem confundir ausência com falha', async () => {
  const malformed = makeRuntime(makeRoute({ search: () => 'não é json' }));
  assert.deepEqual(Array.from(await malformed.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(malformed.errors.length, 1);

  const structure = makeRuntime(makeRoute({ search: () => searchMalformed }));
  assert.deepEqual(Array.from(await structure.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(structure.errors.length, 1);

  const empty = makeRuntime(makeRoute({ search: () => searchEmpty }));
  assert.deepEqual(Array.from(await empty.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(empty.errors.length, 0);
  assert.equal(empty.warnings.length, 0);
});

test('não consulta o host de download nem gera mais de seis buscas', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);
  assert.ok(streams.length > 0);
  assert.ok(searchCalls(runtime.calls).length <= 6);
  assert.ok(searchCalls(runtime.calls).every((call) => call.init.method === 'POST'));
  const downloadCalls = runtime.calls.filter((call) => new URL(call.url).hostname === 'animezey16082023.animezey16082023.workers.dev');
  assert.equal(downloadCalls.length, 0);
});
