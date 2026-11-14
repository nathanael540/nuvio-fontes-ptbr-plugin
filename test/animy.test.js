const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'animy');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchTv = readJson('search-tv.json');
const searchTvSingle = readJson('search-tv-single.json');
const searchMovie = readJson('search-movie.json');
const searchEmpty = readJson('search-empty.json');
const searchMalformed = readJson('search-malformed.json');
const searchTypeConflict = readJson('search-type-conflict.json');
const sheetTv = readJson('sheet-tv.json');
const sheetTvLeg = readJson('sheet-tv-leg.json');
const sheetMovie = readJson('sheet-movie.json');
const sheetMalformed = readJson('sheet-malformed.json');
const episodeDub = readJson('episode-dub.json');
const episodeLeg = readJson('episode-leg.json');
const episodeDubS02E01 = readJson('episode-dub-s02e01.json');
const episodeLegS02E01 = readJson('episode-leg-s02e01.json');
const episodeMovie = readJson('episode-movie.json');
const episodeMalformed = readJson('episode-malformed.json');

const TV_ID = '85937';
const MOVIE_ID = '372058';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: 'Kimetsu no Yaiba',
    year: 2019,
    alternativeTitles: ['Demon Slayer'],
    romaji: ['Kimetsu no Yaiba'],
  }),
  [MOVIE_ID]: tmdbMovie({
    title: 'Your Name.',
    originalTitle: 'Kimi no Na wa.',
    year: 2016,
    alternativeTitles: ['Your Name'],
    romaji: ['Kimi no na wa'],
  }),
  [ABSENT_ID]: tmdbMovie({
    title: 'Título Inexistente',
    originalTitle: 'Missing Title',
    year: 2020,
  }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animy-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animy', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animy', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbMovie({ title, originalTitle, year, alternativeTitles = [], romaji = [] }) {
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
      titles: [
        ...alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
        ...romaji.map((alternative) => ({ iso_3166_1: 'US', title: alternative, type: 'Romaji' })),
      ],
    },
  };
}

function tmdbTv({ title, originalTitle, year, alternativeTitles = [], romaji = [] }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      results: [
        ...alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
        ...romaji.map((alternative) => ({ iso_3166_1: 'US', title: alternative, type: 'Romaji' })),
      ],
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
  if (query.includes('Your Name') || query.includes('Kimi no')) return searchMovie;
  if (query.includes('Demon Slayer') || query.includes('Kimetsu')) return searchTv;
  return searchEmpty;
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'animy.net') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/api/v1/animes') {
      if (options.search) return asResponse(options.search(url.searchParams.get('search')));
      return asResponse(searchFor(url.searchParams.get('search') || ''));
    }
    if (url.pathname === '/api/v1/animes/84') {
      return asResponse(options.sheet === undefined ? sheetTv : options.sheet(url));
    }
    if (url.pathname === '/api/v1/animes/12') {
      return asResponse(options.sheetLeg === undefined ? sheetTvLeg : options.sheetLeg(url));
    }
    if (url.pathname === '/api/v1/animes/500') {
      return asResponse(options.sheetMovie === undefined ? sheetMovie : options.sheetMovie(url));
    }
    if (url.pathname === '/api/v1/animes/84/episodes/1/1') {
      return asResponse(options.episode === undefined ? episodeDub : options.episode(url));
    }
    if (url.pathname === '/api/v1/animes/12/episodes/1/1') {
      return asResponse(options.episodeLeg === undefined ? episodeLeg : options.episodeLeg(url));
    }
    if (url.pathname === '/api/v1/animes/84/episodes/2/1') {
      return asResponse(options.episodeS02 === undefined ? episodeDubS02E01 : options.episodeS02(url));
    }
    if (url.pathname === '/api/v1/animes/12/episodes/2/1') {
      return asResponse(options.episodeLegS02 === undefined ? episodeLegS02E01 : options.episodeLegS02(url));
    }
    if (url.pathname === '/api/v1/animes/500/episodes/1/1') {
      return asResponse(options.episodeMovie === undefined ? episodeMovie : options.episodeMovie(url));
    }
    if (url.pathname === '/api/v1/animes/84/episodes/1/3' || url.pathname === '/api/v1/animes/12/episodes/1/3') {
      return { status: 404, body: { error: 'episode not found' } };
    }
    return { status: 404, body: { error: 'not found' } };
  };
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
    [TV_ID, 'anime', null, null],
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
  for (const message of runtime.errors) assert.match(message, /^\[Animy\] Falha em .*: Entrada: /);
});

test('resolve filme pelo título romaji e monta o contrato', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, 'https://cdn.example.test/animy/your-name.mp4');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.provider, 'Animy');
  assert.equal(stream.format, undefined);
  assert.equal(stream.headers, undefined);
  assert.equal(stream.size, undefined);
  assert.match(stream.name, /^❓ Desconhecida\n/);
  assert.match(stream.title, /Your Name\./);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  for (const streamItem of streams) assert.ok(LANGUAGE_VALUES.includes(streamItem.language));
});

test('resolve série com dublado e legendado sem repetir stream', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language).sort(), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url).sort(), [
    'https://cdn.example.test/animy/dub-s01e01.mp4',
    'https://cdn.example.test/animy/leg-s01e01.mp4',
  ]);
  assert.ok(streams.every((stream) => stream.quality === 'Desconhecida'));
  assert.ok(streams.every((stream) => stream.type === 'mp4'));
  assert.ok(streams.every((stream) => stream.provider === 'Animy'));
  assert.equal(new Set(streams.map((stream) => stream.url)).size, streams.length);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('escolhe o episódio pelo par temporada e número', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);
  const urls = Array.from(streams, (stream) => stream.url).sort();
  assert.deepEqual(urls, [
    'https://cdn.example.test/animy/dub-s02e01.mp4',
    'https://cdn.example.test/animy/leg-s02e01.mp4',
  ]);
  assert.ok(streams.every((stream) => stream.quality === 'Desconhecida'));
});

test('episódio ausente na ficha devolve lista vazia sem chamar a rota de reprodução', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 4);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.includes('/episodes/')).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('404 episode not found é ausência, não falha', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 3);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('busca vazia e título ausente devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(ABSENT_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('tipo conflitante é descartado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchTypeConflict }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('busca malformada sobe até getStreams e devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchMalformed }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animy\]/);
});

test('ficha malformada sobe até getStreams e devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchTvSingle, sheet: () => sheetMalformed }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animy\]/);
});

test('episódio malformado sobe até getStreams e devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchTvSingle, episode: () => episodeMalformed }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animy\]/);
});

test('5xx na rota do episódio sobe até getStreams e devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchTvSingle, episode: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animy\]/);
});

test('formatador Prism aplica o template e as coordenadas', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 2);
  const dubbed = streams.find((stream) => stream.language === 'Dublado');
  assert.match(dubbed.name, /^❓ Desconhecida\n/);
  assert.match(dubbed.title, /Demon Slayer: Kimetsu no Yaiba/);
  assert.match(dubbed.title, /T01E01/);
  assert.match(dubbed.title, /Dublado/);
});
