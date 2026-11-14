const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'animeq');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchPage = read('search.html');
const searchEmpty = read('search-empty.html');
const searchMalformed = read('search-malformed.html');
const seriesPage = read('series.html');
const seriesMalformed = read('series-malformed.html');
const filmPage = read('film.html');
const filmMalformed = read('film-malformed.html');
const ajaxFilm = readJson('ajax-film.json');
const episodeDirect = read('episode-direct.html');
const episodeBlogger = read('episode-blogger.html');
const episodeUnsupported = read('episode-unsupported.html');
const episodeInvalid = read('episode-invalid.html');
const bloggerPage = read('blogger.html');

const TV_ID = '85937';
const MOVIE_ID = '372058';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: 'Kimetsu no Yaiba',
    year: 2019,
    romaji: ['Kimetsu no Yaiba'],
  }),
  [MOVIE_ID]: tmdbMovie({
    title: 'Your Name.',
    originalTitle: 'Kimi no Na wa.',
    year: 2016,
    romaji: ['Kimi no na wa'],
  }),
  [ABSENT_ID]: tmdbMovie({ title: 'Título Inexistente', originalTitle: 'Missing Title', year: 2020 }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animeq-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animeq', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animeq', { outDir, formatter: 'prism' }), 'utf8');
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
      if (name === 'cheerio-without-node-native') return require('./support/basic-html.js');
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

function tmdbMovie({ title, originalTitle, year, romaji = [] }) {
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
      titles: romaji.map((titleRomaji) => ({ iso_3166_1: 'US', title: titleRomaji, type: 'Romaji' })),
    },
  };
}

function tmdbTv({ title, originalTitle, year, romaji = [] }) {
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
    if (url.hostname === 'www.blogger.com') {
      return asResponse(options.blogger === undefined ? bloggerPage : options.blogger);
    }
    if (url.hostname !== 'animeq.cloud') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/') {
      if (options.search) return asResponse(options.search(url.searchParams.get('s')));
      return asResponse(searchPage);
    }
    if (url.pathname === '/wp-admin/admin-ajax.php') {
      if (options.ajax) return asResponse(options.ajax(url));
      return asResponse(ajaxFilm);
    }
    if (url.pathname === '/anime/kimetsu-no-yaiba-hashira-geiko-hen') {
      return asResponse(options.series === undefined ? seriesPage : options.series(url));
    }
    if (url.pathname === '/episodio/kimetsu-no-yaiba-hashira-geiko-hen-episodio-01') {
      return asResponse(options.episode === undefined ? episodeDirect : options.episode(url));
    }
    if (url.pathname === '/episodio/kimetsu-no-yaiba-hashira-geiko-hen-episodio-02') {
      return asResponse(options.episode2 === undefined ? episodeBlogger : options.episode2(url));
    }
    if (url.pathname === '/filme/your-name') {
      return asResponse(options.film === undefined ? filmPage : options.film(url));
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
  for (const args of invalid) assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
});

test('resolve série com fonte direta e Blogger', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings, calls: runtime.calls.map((call) => call.url) }));
  const direct = streams.find((stream) => stream.provider === 'AnimeQ');
  const blogger = streams.find((stream) => stream.provider === 'Blogger');
  assert.equal(direct.url, 'https://animeflix.blog/Animes/Letra-K/Kimetsu/01-sd.mp4');
  assert.equal(direct.language, 'Dublado');
  assert.equal(direct.type, 'mp4');
  assert.equal(direct.quality, '480p');
  assert.equal(direct.headers, undefined);
  assert.equal(blogger.url, 'https://cdn.example.test/blogger-360.mp4');
  assert.equal(blogger.language, 'Legendado');
  assert.equal(blogger.type, 'mp4');
  assert.equal(blogger.quality, '360p');
  assert.match(streams[0].title, /Kimetsu no Yaiba/);
  assert.match(streams[0].title, /T01E01/);
  assert.ok(streams.every((stream) => LANGUAGE_VALUES.includes(stream.language)));
  assert.deepEqual(runtime.errors, []);
});

test('episódio só com Blogger devolve 360p', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'Blogger');
  assert.equal(streams[0].quality, '360p');
  assert.equal(streams[0].language, 'Dublado');
});

test('filme resolve jwplayer do DooPlay com Referer de aniplay', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, 'https://aniplay.online/fictional/your-name.mp4');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.provider, 'AnimeQ');
  assert.equal(stream.headers.Referer, 'https://animeq.cloud/');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Idioma Desconhecido');
  assert.deepEqual(runtime.errors, []);
});

test('hosts fora do contrato são triagem e devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeUnsupported }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('opção inválida sem outra fonte sobe até getStreams', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeInvalid }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeQ\]/);
});

test('busca vazia e título ausente devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchEmpty }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(ABSENT_ID, 'movie', null, null)), []);
  assert.deepEqual(runtime.errors, []);
});

test('busca malformada é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeQ\]/);
});

test('ficha de série malformada é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ series: () => seriesMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeQ\]/);
});

test('ficha de filme sem opções é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ film: () => filmMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeQ\]/);
});

test('temporada ou episódio ausente devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 2, 1)), []);
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 3)), []);
  assert.deepEqual(runtime.errors, []);
});
