const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'animesfhd');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const home = readJson('home.json');
const page1 = read('catalog-page-1.html');
const page2 = read('catalog-page-2.html');
const emptyPage = read('catalog-empty.html');
const seriesLatest = read('series-latest.html');
const seriesV1 = read('series-v1.html');
const seriesV1Leg = read('series-v1-leg.html');
const seriesV2 = read('series-v2.html');
const seriesV2Leg = read('series-v2-leg.html');
const versions = readJson('versions.json');
const episode193825 = readJson('episode-193825.json');
const episode4922 = readJson('episode-4922.json');
const episode137713Dub = readJson('episode-137713-dub.json');
const episode137713Leg = readJson('episode-137713-leg.json');
const episodeMixed = readJson('episode-mixed.json');
const episodeInvalid = readJson('episode-invalid.json');

const TV_ID = '85937';
const MOVIE_ID = '129';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: 'Kimetsu no Yaiba',
    year: 2019,
    seasons: [
      { number: 1, episodeCount: 26, name: 'Temporada 1', airDate: '2019-04-06' },
      { number: 2, episodeCount: 7, name: 'Temporada 2', airDate: '2021-10-10' },
      { number: 3, episodeCount: 11, name: 'Temporada 3', airDate: '2023-04-09' },
      { number: 4, episodeCount: 8, name: 'Temporada 4', airDate: '2024-05-12' },
    ],
    romaji: ['Kimetsu no Yaiba'],
  }),
  [MOVIE_ID]: tmdbMovie({
    title: 'A Viagem de Chihiro',
    originalTitle: '千と千尋の神隠し',
    year: 2001,
  }),
  [ABSENT_ID]: tmdbTv({ title: 'Título Inexistente', originalTitle: 'Missing Title', year: 2020 }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animesfhd-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animesfhd', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animesfhd', { outDir, formatter: 'prism' }), 'utf8');
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
      if (name === 'cheerio-without-node-native') {
        return require('../test/support/basic-html.js');
      }
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

function tmdbMovie({ title, originalTitle, year }) {
  return {
    id: 1,
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: { titles: [] },
  };
}

function tmdbTv({ title, originalTitle, year, seasons = [], romaji = [] }) {
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
      results: romaji.map((titleRomaji) => ({ iso_3166_1: 'US', title: titleRomaji, type: 'Romaji' })),
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

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'animesfhd.net') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/api/home') {
      return asResponse(options.home === undefined ? home : options.home);
    }
    if (url.pathname === '/animes') {
      const page = Number(url.searchParams.get('page'));
      if (options.catalog) return asResponse(options.catalog(page, url));
      if (page === 1) return asResponse(page1);
      if (page === 2) return asResponse(page2);
      return asResponse(emptyPage);
    }
    if (url.pathname === '/serie/4305442346626588') {
      return asResponse(options.seriesLatest === undefined ? seriesLatest : options.seriesLatest(url));
    }
    if (url.pathname === '/serie/3176795044965301') return asResponse(seriesV1);
    if (url.pathname === '/serie/3701093336042303') return asResponse(seriesV1Leg);
    if (url.pathname === '/serie/226614734288731') return asResponse(seriesV2);
    if (url.pathname === '/serie/1833424083742565') return asResponse(seriesV2Leg);
    if (url.pathname === '/api/episodes/1815938127981516') return asResponse(versions);
    if (url.pathname === '/api/episodes/1938250517685094') {
      return asResponse(options.episodeDub === undefined ? episode193825 : options.episodeDub);
    }
    if (url.pathname === '/api/episodes/4922') {
      return asResponse(options.episodeLeg === undefined ? episode4922 : options.episodeLeg);
    }
    if (url.pathname === '/api/episodes/1377136699794902') {
      return asResponse(options.episodeS03Dub === undefined ? episode137713Dub : options.episodeS03Dub);
    }
    if (url.pathname === '/api/episodes/1377136699794903') {
      return asResponse(options.episodeS03Leg === undefined ? episode137713Leg : options.episodeS03Leg);
    }
    if (url.pathname === '/api/animes/pesquisar') {
      return { status: 401, body: { error: 'Você precisa estar conectado.' } };
    }
    return { status: 404, body: 'not found' };
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

test('recusa filme sem requisição externa', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.calls.length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('valida a entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'tv', 1, 1],
    ['0', 'tv', 1, 1],
    [TV_ID, 'anime', 1, 1],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
});

test('resolve S01E01 dublado e legendado pelo carrossel da home', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language).sort(), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url).sort(), [
    'https://animesfhd.net/api/v/s6?source=fictional-dub&playlist=.m3u8',
    'https://animesfhd.net/api/v/s6?source=fictional-leg&playlist=.m3u8',
  ]);
  assert.ok(streams.every((stream) => stream.quality === 'Desconhecida'));
  assert.ok(streams.every((stream) => stream.type === 'hls'));
  assert.ok(streams.every((stream) => stream.provider === 'Player 1'));
  assert.ok(streams.every((stream) => stream.headers === undefined));
  assert.match(streams[0].title, /Kimetsu no Yaiba/);
  assert.match(streams[0].title, /T01E01/);
  assert.ok(streams.every((stream) => LANGUAGE_VALUES.includes(stream.language)));
  assert.equal(runtime.calls.some((call) => new URL(call.url).pathname === '/api/animes/pesquisar'), false);
  assert.deepEqual(runtime.errors, []);
});

test('S03E01 usa o episódio global 34 e a versão 2 local 8', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 3, 1);
  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.url).sort(), [
    'https://animesfhd.net/api/v/s6?source=fictional-s03-dub&playlist=.m3u8',
    'https://animesfhd.net/api/v/s6?source=fictional-s03-leg&playlist=.m3u8',
  ]);
  assert.ok(streams.every((stream) => stream.quality === 'Desconhecida'));
  assert.ok(streams.every((stream) => stream.language !== undefined));
  assert.match(streams[0].title, /T03E01/);
  assert.equal(runtime.calls.some((call) => new URL(call.url).pathname === '/api/animes/pesquisar'), false);
  assert.deepEqual(runtime.errors, []);
});

test('episódio ausente na versão sazonal devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 3);
  assert.deepEqual(Array.from(streams), []);
  const selectedEpisodeCalls = runtime.calls.filter((call) => {
    const pathname = new URL(call.url).pathname;
    return pathname === '/api/episodes/1938250517685094' || pathname === '/api/episodes/4922';
  });
  assert.equal(selectedEpisodeCalls.length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('404 da ficha sazonal é ausência, não falha', async () => {
  const runtime = makeRuntime(makeRoute({ seriesLatest: () => ({ status: 404, body: 'not found' }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('título fora do catálogo devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ home: { hero: [], carousels: [] } }));
  const streams = await runtime.exports.getStreams(ABSENT_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('encontra o título na segunda página do catálogo quando a home não o traz', async () => {
  const runtime = makeRuntime(makeRoute({ home: { hero: [], carousels: [] } }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 2);
  const pages = runtime.calls
    .filter((call) => new URL(call.url).pathname === '/animes')
    .map((call) => new URL(call.url).searchParams.get('page'));
  assert.deepEqual(pages, ['1', '2']);
  assert.deepEqual(runtime.errors, []);
});

test('uma fonte inválida é descartada e a válida permanece', async () => {
  const runtime = makeRuntime(makeRoute({ episodeDub: episodeMixed, episodeLeg: episodeMixed }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.ok(streams[0].url.includes('fictional-good'));
  assert.equal(runtime.warnings.length, 2);
  assert.ok(runtime.warnings.every((warning) => warning.includes('Player inválido')));
});

test('todas as fontes inválidas sobem até getStreams e devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ episodeDub: episodeInvalid, episodeLeg: episodeInvalid }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesFHD\]/);
});

test('403/JSON inválido da API sobe como erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({
    episodeDub: () => ({ status: 500, body: 'erro' }),
    episodeLeg: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesFHD\]/);
});
