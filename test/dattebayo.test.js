const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'dattebayo');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const SOURCE_HOST = 'www.dattebayo-br.com';

const searchMovie = read('search-movie.html');
const searchMovieDubbed = read('search-movie-dubbed.html');
const searchMovieSuffix = read('search-movie-suffix.html');
const searchMovieBoth = read('search-movie-both.html');
const searchTv = read('search-tv.html');
const searchTvDubbed = read('search-tv-dubbed.html');
const searchTvBoth = read('search-tv-both.html');
const searchReal = read('search-real.html');
const searchRealDubbed = read('search-real-dubbed.html');
const searchEmpty = read('search-empty.html');
const searchBroken = read('search-broken.html');
const detailMovie = read('detail-movie.html');
const detailMovieDubbed = read('detail-movie-dubbed.html');
const detailMovieYearMismatch = read('detail-movie-year-mismatch.html');
const detailMovieNoYear = read('detail-movie-no-year.html');
const detailMovieNoVideo = read('detail-movie-no-video.html');
const detailMovieAlternative = read('detail-movie-alternative.html');
const detailTypeMismatch = read('detail-type-mismatch.html');
const detailTvBase = read('detail-tv-base.html');
const detailTvBaseDubbed = read('detail-tv-base-dubbed.html');
const detailTvSolo = read('detail-tv-solo.html');
const detailTvYearMismatch = read('detail-tv-year-mismatch.html');
const detailTvSeason2 = read('detail-tv-season2.html');
const detailTvFinalNoDataBase = read('detail-tv-final-nodata-base.html');
const detailTvFinalNoDataSeason3 = read('detail-tv-final-nodata-season3.html');
const detailTvFinalNoDataFinal = read('detail-tv-final-nodata-final.html');
const detailTvPaged = read('detail-tv-paged.html');
const detailTvPage2 = read('detail-tv-page2.html');
const detailTvPage3 = read('detail-tv-page3.html');
const detailTvLong = read('detail-tv-long.html');
const detailTvFinalBase = read('detail-tv-final-base.html');
const detailTvFinalPart1 = read('detail-tv-final-part1.html');
const detailTvFinalPart2 = read('detail-tv-final-part2.html');
const detailTvAmbiguousBase = read('detail-tv-ambiguous-base.html');
const detailTvAmbiguous = read('detail-tv-ambiguous.html');
const detailTvAmbiguous2 = read('detail-tv-ambiguous-2.html');
const detailTvDragonBall = read('detail-tv-dragonball.html');
const detailTvSequence = read('detail-tv-sequence.html');
const detailReal = read('detail-real.html');
const detailRealSequence = read('detail-real-sequence.html');
const detailTvUnknownTotal = read('detail-tv-unknown-total.html');
const video3 = read('video-3-options.html');
const video2 = read('video-2-options.html');
const videoNoTabs = read('video-no-tabs.html');
const videoDuplicateVid = read('video-duplicate-vid.html');
const videoNoVid = read('video-no-vid.html');
const videoUnknownLabel = read('video-unknown-label.html');
const videoDubbed = read('video-dubbed-3-options.html');
const videoReal = read('video-real.html');
const signatureSd = read('signature-sd.json');
const signatureHd = read('signature-hd.json');
const signatureFullhd = read('signature-fullhd.json');
const signatureMissing = read('signature-missing.json');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const TMDB = {
  '693134': {
    id: 693134,
    title: 'Duna: Parte Dois',
    original_title: 'Dune: Part Two',
    release_date: '2024-02-27',
    original_language: 'en',
    origin_country: ['US'],
    genres: [{ id: 878, name: 'Ficção científica' }],
    external_ids: { imdb_id: 'tt15239678' },
    alternative_titles: { titles: [] },
  },
  '65930': {
    id: 65930,
    name: 'Boku no Hero Academia',
    original_name: 'Boku no Hero Academia',
    first_air_date: '2016-04-03',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16, name: 'Animação' }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [
      { season_number: 0, episode_count: 2, name: 'Especiais', air_date: '2016-04-03' },
      { season_number: 1, episode_count: 13, name: 'Temporada 1', air_date: '2016-04-03' },
      { season_number: 2, episode_count: 25, name: 'Temporada 2', air_date: '2017-04-01' },
    ],
  },
  '1001': {
    id: 1001,
    name: 'Série Paginada',
    original_name: 'Série Paginada',
    first_air_date: '2020-01-01',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [{ season_number: 1, episode_count: 72, name: 'Temporada 1', air_date: '2020-01-01' }],
  },
  '1002': {
    id: 1002,
    name: 'Naruto',
    original_name: 'Naruto',
    first_air_date: '2002-10-03',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [
      { season_number: 0, episode_count: 99, name: 'Especiais', air_date: '2002-10-03' },
      { season_number: 1, episode_count: 52, name: 'Temporada 1', air_date: '2002-10-03' },
      { season_number: 2, episode_count: 165, name: 'Temporada 2', air_date: '2003-10-01' },
      { season_number: 3, episode_count: 3, name: 'Temporada 3', air_date: '2005-04-01' },
    ],
  },
  '1003': {
    id: 1003,
    name: 'Shingeki no Kyojin',
    original_name: 'Shingeki no Kyojin',
    first_air_date: '2013-04-07',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [
      { season_number: 1, episode_count: 25, name: 'Temporada 1', air_date: '2013-04-07' },
      { season_number: 2, episode_count: 12, name: 'Temporada 2', air_date: '2017-04-01' },
      { season_number: 3, episode_count: 22, name: 'Temporada 3', air_date: '2018-07-23' },
      { season_number: 4, episode_count: 28, name: 'Temporada 4', air_date: '2020-12-07' },
    ],
  },
  '1004': {
    id: 1004,
    name: 'Série Ambígua',
    original_name: 'Série Ambígua',
    first_air_date: '2020-01-01',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [
      { season_number: 1, episode_count: 12, name: 'Temporada 1', air_date: '2020-01-01' },
      { season_number: 2, episode_count: 24, name: 'Temporada 2', air_date: '2021-01-01' },
    ],
  },
  '1005': {
    id: 1005,
    name: 'Dragon Ball',
    original_name: 'Dragon Ball',
    first_air_date: '1986-02-26',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [{ season_number: 1, episode_count: 153, name: 'Temporada 1', air_date: '1986-02-26' }],
  },
  '1006': {
    id: 1006,
    name: 'Série Sem Total',
    original_name: 'Série Sem Total',
    first_air_date: '1999-01-01',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
    seasons: [{ season_number: 1, episode_count: 1000, name: 'Temporada 1', air_date: '1999-01-01' }],
  },
  '1007': {
    id: 1007,
    name: 'Série Final Sem Dados',
    original_name: 'Série Final Sem Dados',
    first_air_date: '2020-01-01',
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: null },
    alternative_titles: { results: [] },
  },
  '1008': {
    id: 1008,
    title: 'Filme Alternativo',
    original_title: 'Alternative Movie',
    release_date: '2024-05-01',
    original_language: 'en',
    origin_country: ['US'],
    genres: [{ id: 18 }],
    external_ids: { imdb_id: null },
    alternative_titles: { titles: [{ iso_3166_1: 'BR', title: 'Nome na Fonte' }] },
  },
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('dattebayo-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('dattebayo', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('dattebayo', { outDir, formatter: 'prism' }), 'utf8');
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
  const logs = [];
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
      log: (message) => logs.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new AppURL(url), init || {});
      if (result instanceof Error) throw result;
      if (result === undefined) throw new Error(`Rota inesperada: ${url}`);
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
  return { exports: context.module.exports, calls, errors, warnings, logs };
}

function defaultSignature(url) {
  const vid = url.searchParams.get('url') || '';
  if (vid.includes('fixture-sd.mp4')) return signatureSd;
  if (vid.includes('fixture-hd.mp4')) return signatureHd;
  if (vid.includes('fixture-fullhd.mp4')) return signatureFullhd;
  const match = /fixture-([a-z0-9-]+)\.mp4/.exec(vid);
  if (!match) return signatureMissing;
  return JSON.stringify([{ publicidade: `?assinatura=${match[1]}` }]);
}

function makeRoute(config = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      const body = typeof config.tmdb === 'function' ? config.tmdb(url) : config.tmdb;
      if (body !== undefined) return { body };
      const id = url.pathname.split('/').filter((part) => part !== '').pop();
      if (!TMDB[id]) throw new Error(`TMDB inesperado: ${id}`);
      return { body: TMDB[id] };
    }
    if (url.hostname === 'ads.animeyabu.net') {
      return config.signature ? config.signature(url) : defaultSignature(url);
    }
    if (url.hostname !== SOURCE_HOST && url.hostname !== 'dattebayo-br.com') {
      throw new Error(`Host inesperado: ${url.hostname}`);
    }
    if (url.pathname === '/busca') {
      if (!config.search) throw new Error(`Busca inesperada: ${url.search}`);
      return config.search(url);
    }
    if (url.pathname.startsWith('/videos/')) {
      if (!config.video) throw new Error(`Vídeo inesperado: ${url.pathname}`);
      return config.video(url);
    }
    if (!config.detail) throw new Error(`Ficha inesperada: ${url.pathname}`);
    return config.detail(url);
  };
}

function searchByQuery(map) {
  return (url) => {
    const query = url.searchParams.get('busca');
    if (!Object.prototype.hasOwnProperty.call(map, query)) throw new Error(`Busca inesperada: ${query}`);
    return map[query];
  };
}

function detailByPath(map) {
  return (url) => {
    if (!Object.prototype.hasOwnProperty.call(map, url.pathname)) throw new Error(`Ficha inesperada: ${url.pathname}`);
    return map[url.pathname];
  };
}

function videoByPath(map) {
  return (url) => {
    if (!Object.prototype.hasOwnProperty.call(map, url.pathname)) throw new Error(`Vídeo inesperado: ${url.pathname}`);
    return map[url.pathname];
  };
}

function searchCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname === '/busca');
}

function detailCalls(calls) {
  return calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === SOURCE_HOST && !url.pathname.startsWith('/videos/') && url.pathname !== '/busca';
  });
}

function videoCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/videos/'));
}

function signatureCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === 'ads.animeyabu.net');
}

function qualities(streams) {
  return Array.from(streams, (stream) => stream.quality);
}

function searchCard(title, href) {
  return `<!doctype html><html><body><main class="aniContainer"><div class="ultimosAnimesHomeItem"><a href="${href}">${title}</a><span class="episodios">24 Episódios</span></div></main></body></html>`;
}

test('1.1 e 5.3 carrega o pacote sem rede e expõe getStreams', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return 'ok';
  });

  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
});

test('1.1 e 5.3 valida entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute({}));
  for (const args of [['abc', 'movie', null, null], ['693134', 'anime', null, null], ['65930', 'tv', 0, 1], ['65930', 'tv', 1, 0]]) {
    const streams = await runtime.exports.getStreams(...args);
    assert.deepEqual(Array.from(streams), []);
  }
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 4);
  assert.match(runtime.errors[0], /\[Dattebayo BR\] Falha em movie abc: ID do TMDB inválido/);
});

test('3.1, 3.2 e 5.3 filme legendado resolve SD, HD e FULLHD', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie, 'Dune: Part Two': searchEmpty }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video3 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(qualities(streams), ['1080p', '720p', '480p']);
  assert.deepEqual(
    Array.from(streams, (stream) => stream.url),
    [
      'https://media.exemplo.test/videos/fixture-fullhd.mp4?assinatura=fullhd',
      'https://media.exemplo.test/videos/fixture-hd.mp4?assinatura=hd',
      'https://media.exemplo.test/videos/fixture-sd.mp4?assinatura=sd',
    ],
  );
  for (const stream of streams) {
    assert.equal(stream.language, 'Legendado');
    assert.equal(stream.type, 'mp4');
    assert.equal(stream.provider, undefined);
    assert.equal(stream.headers, undefined);
    assert.equal(stream.size, undefined);
    assert.equal(stream.subtitles, undefined);
    assert.equal(stream.format, undefined);
    assert.match(stream.name, /^Dattebayo BR (1080p|720p|480p)\n/);
    assert.match(stream.title, /🗣️ Legendado/);
  }

  const searches = searchCalls(runtime.calls);
  assert.equal(searches.length, 1);
  const searchUrl = new URL(searches[0].url);
  assert.equal(searchUrl.searchParams.get('busca'), 'Duna: Parte Dois');
  assert.equal(searchUrl.searchParams.get('page'), null);
  assert.equal(detailCalls(runtime.calls).length, 1);
  assert.equal(videoCalls(runtime.calls).length, 1);

  const signatures = signatureCalls(runtime.calls);
  assert.equal(signatures.length, 3);
  for (const call of signatures) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get('token'), '');
    assert.equal(url.searchParams.get('url').startsWith('https://media.exemplo.test/videos/'), true);
    assert.equal(call.init.headers.Referer, 'https://www.dattebayo-br.com/videos/duna-filme');
  }
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.2 filme dublado pela seção /anime-dublado/', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovieDubbed }),
    detail: detailByPath({ '/anime-dublado/duna-parte-dois-dublado': detailMovieDubbed }),
    video: videoByPath({ '/videos/duna-filme-dublado': videoDubbed }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 3);
  for (const stream of streams) assert.equal(stream.language, 'Dublado');
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.deepEqual(runtime.errors, []);
});

test('3.2 filme dublado pelo sufixo fora da seção', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovieSuffix }),
    detail: detailByPath({ '/animes/duna-parte-dois-dublado': detailMovieDubbed }),
    video: videoByPath({ '/videos/duna-filme-dublado': videoDubbed }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 3);
  for (const stream of streams) assert.equal(stream.language, 'Dublado');
});

test('3.2 título original encontra a ficha quando o PT-BR não confirma', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchEmpty, 'Dune: Part Two': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video3 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('busca')),
    ['Duna: Parte Dois', 'Dune: Part Two'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('3.2 título alternativo encontra a ficha', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1008'],
    search: searchByQuery({
      'Filme Alternativo': searchEmpty,
      'Alternative Movie': searchEmpty,
      'Nome na Fonte': searchCard('Nome na Fonte', '/animes/nome-na-fonte'),
    }),
    detail: detailByPath({ '/animes/nome-na-fonte': detailMovieAlternative }),
    video: videoByPath({ '/videos/alternativo': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1008', 'movie', null, null);

  assert.equal(streams.length, 3);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('busca')),
    ['Filme Alternativo', 'Alternative Movie', 'Nome na Fonte'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('3.1 busca paginada para na terceira página e não pede a quarta', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1001'],
    search: (url) => {
      const page = url.searchParams.get('page');
      if (page === null) return searchCard('Outra Série', '/animes/outra');
      if (page === '2') return searchCard('Outra Série 2', '/animes/outra-2');
      if (page === '3') return searchCard('Série Paginada', '/animes/serie-paginada');
      throw new Error(`Página inesperada: ${page}`);
    },
    detail: detailByPath({
      '/animes/serie-paginada': detailTvPaged,
      '/animes/serie-paginada/page/2': detailTvPage2,
    }),
    video: videoByPath({ '/videos/paged-25': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1001', 'tv', 1, 25);

  assert.equal(streams.length, 3);
  const pages = searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('page'));
  assert.deepEqual(pages, [null, '2', '3']);
  assert.equal(pages.includes('4'), false);
  assert.equal(
    detailCalls(runtime.calls).some((call) => new URL(call.url).pathname === '/animes/serie-paginada/page/2'),
    true,
  );
  assert.deepEqual(runtime.errors, []);
});

test('3.1 busca vazia é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchEmpty, 'Dune: Part Two': searchEmpty }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('busca')),
    ['Duna: Parte Dois', 'Dune: Part Two'],
  );
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.1 busca sem .aniContainer é erro de layout', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchBroken }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[Dattebayo BR\] Falha em movie 693134: Busca sem o contêiner \.aniContainer/);
  assert.deepEqual(runtime.warnings, []);
});

test('3.1 HTTP fora de 2xx na busca é erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('3.3 tipo incompatível descarta o candidato sem stream', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie, 'Dune: Part Two': searchEmpty }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailTypeMismatch }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.3 ano do filme incompatível descarta o candidato sem stream', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie, 'Dune: Part Two': searchEmpty }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovieYearMismatch }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 ano da série incompatível descarta a família', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchCard('Boku no Hero Academia', '/animes/boku-no-hero-academia') }),
    detail: detailByPath({ '/animes/boku-no-hero-academia': detailTvYearMismatch }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 ficha de filme sem ano é erro de layout', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovieNoYear }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Ficha .* sem Ano/);
});

test('3.4 filme sem vídeo é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovieNoVideo }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('4.1 e 4.2 série temporada 1 episódio 1 usa a base e lê a família', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTv }),
    detail: detailByPath({
      '/animes/boku-no-hero-academia': detailTvBase,
      '/animes/boku-no-hero-academia-2': detailTvSeason2,
    }),
    video: videoByPath({ '/videos/hero-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.deepEqual(qualities(streams), ['1080p', '720p', '480p']);
  for (const stream of streams) {
    assert.equal(stream.language, 'Legendado');
    assert.match(stream.title, /🗣️ Legendado/);
  }
  const paths = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.deepEqual(paths.sort(), ['/animes/boku-no-hero-academia', '/animes/boku-no-hero-academia-2']);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/hero-01');
  assert.deepEqual(runtime.errors, []);
});

test('4.2 série temporada 2 explícita usa a ficha da temporada', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTv }),
    detail: detailByPath({
      '/animes/boku-no-hero-academia': detailTvBase,
      '/animes/boku-no-hero-academia-2': detailTvSeason2,
    }),
    video: videoByPath({ '/videos/hero2-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 2, 1);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/hero2-01');
  assert.deepEqual(runtime.errors, []);
});

test('4.4 episódio 0 não atende pedido positivo', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTv }),
    detail: detailByPath({
      '/animes/boku-no-hero-academia': detailTvBase,
      '/animes/boku-no-hero-academia-2': detailTvSeason2,
    }),
    video: videoByPath({ '/videos/hero-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/hero-01');
  assert.equal(videoCalls(runtime.calls).some((call) => new URL(call.url).pathname === '/videos/hero-00'), false);
});

test('3.1, 4.1 e 5.1 markup real do site: busca, ficha, cadeia e player', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1002'],
    search: searchByQuery({ Naruto: searchReal }),
    detail: detailByPath({
      '/animes/c8390d004e328c382d459e8455f10efb2a1588bb': detailReal,
      '/animes/ce2d64638ce1a0d3928d04cd395e462c1c834b1a': detailRealSequence,
    }),
    video: videoByPath({ '/videos/536411': videoReal }),
  }));
  const streams = await runtime.exports.getStreams('1002', 'tv', 1, 1);

  assert.deepEqual(qualities(streams), ['720p', '480p']);
  for (const stream of streams) {
    assert.equal(stream.language, 'Legendado');
    assert.match(stream.url, /^https:\/\/media\.exemplo\.test\/videos\/fixture-(sd|hd)\.mp4\?assinatura=/);
  }
  const paths = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.equal(paths.includes('/animes/ce2d64638ce1a0d3928d04cd395e462c1c834b1a'), true);
  assert.equal(videoCalls(runtime.calls).length, 1);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/536411');
  assert.deepEqual(runtime.errors, []);
});

test('3.2 markup real do cartão dublado usa o idioma da seção', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1002'],
    search: searchByQuery({ Naruto: searchRealDubbed }),
    detail: detailByPath({
      '/anime-dublado/c887ecca899044a19b8fb02d31cac71925fbb18a': detailReal,
    }),
    video: videoByPath({ '/videos/536411': videoReal }),
  }));
  const streams = await runtime.exports.getStreams('1002', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  for (const stream of streams) assert.equal(stream.language, 'Dublado');
  const paths = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.equal(paths.includes('/animes/ce2d64638ce1a0d3928d04cd395e462c1c834b1a'), false);
  assert.deepEqual(runtime.errors, []);
});

test('4.1 total desconhecido em Episódios/?? não impede o episódio', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1006'],
    search: searchByQuery({ 'Série Sem Total': searchCard('Série Sem Total', '/animes/serie-sem-total') }),
    detail: detailByPath({ '/animes/serie-sem-total': detailTvUnknownTotal }),
    video: videoByPath({ '/videos/sem-total-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1006', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/sem-total-01');
  assert.deepEqual(runtime.errors, []);
});

test('4.4 episódio na página 2 é localizado pela paginação', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1001'],
    search: searchByQuery({ 'Série Paginada': searchCard('Série Paginada', '/animes/serie-paginada') }),
    detail: detailByPath({
      '/animes/serie-paginada': detailTvPaged,
      '/animes/serie-paginada/page/2': detailTvPage2,
    }),
    video: videoByPath({ '/videos/paged-25': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1001', 'tv', 1, 25);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/paged-25');
  const pages = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.equal(pages.includes('/animes/serie-paginada/page/2'), true);
  assert.deepEqual(runtime.errors, []);
});

test('4.3 e 4.4 série longa converte S2E1 para absoluto 53 na página 3', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1002'],
    search: searchByQuery({ Naruto: searchCard('Naruto', '/animes/naruto') }),
    detail: detailByPath({
      '/animes/naruto': detailTvLong,
      '/animes/naruto/page/2': detailTvPage2,
      '/animes/naruto/page/3': detailTvPage3,
    }),
    video: videoByPath({ '/videos/paged-53': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1002', 'tv', 2, 1);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/paged-53');
  const pages = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.equal(pages.includes('/animes/naruto/page/3'), true);
  assert.equal(pages.includes('/animes/naruto/page/2'), false);
  assert.deepEqual(runtime.errors, []);
});

test('4.4 episódio ausente é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1001'],
    search: searchByQuery({ 'Série Paginada': searchCard('Série Paginada', '/animes/serie-paginada') }),
    detail: detailByPath({ '/animes/serie-paginada': detailTvPaged }),
  }));
  const streams = await runtime.exports.getStreams('1001', 'tv', 1, 73);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('4.2 temporada não mapeada é ausência sem erro', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchCard('Boku no Hero Academia', '/animes/boku-no-hero-academia') }),
    detail: detailByPath({ '/animes/boku-no-hero-academia': detailTvSolo }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('4.1 e 4.2 sequência Dragon Ball Z fica fora da família', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1005'],
    search: searchByQuery({ 'Dragon Ball': searchCard('Dragon Ball', '/animes/dragon-ball') }),
    detail: detailByPath({
      '/animes/dragon-ball': detailTvDragonBall,
      '/animes/dragon-ball-z': detailTvSequence,
    }),
  }));
  const streams = await runtime.exports.getStreams('1005', 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  const paths = detailCalls(runtime.calls).map((call) => new URL(call.url).pathname);
  assert.equal(paths.includes('/animes/dragon-ball-z'), true);
  assert.deepEqual(runtime.errors, []);
});

test('4.2 parte final distribui o episódio 17 na segunda parte', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1003'],
    search: searchByQuery({ 'Shingeki no Kyojin': searchCard('Shingeki no Kyojin', '/animes/shingeki-no-kyojin') }),
    detail: detailByPath({
      '/animes/shingeki-no-kyojin': detailTvFinalBase,
      '/animes/shingeki-no-kyojin-the-final-season': detailTvFinalPart1,
      '/animes/shingeki-no-kyojin-the-final-season-part-2': detailTvFinalPart2,
    }),
    video: videoByPath({ '/videos/shingeki-final2-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1003', 'tv', 4, 17);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/shingeki-final2-01');
  assert.deepEqual(runtime.errors, []);
});

test('4.2 Final Season sem dados de temporada usa a anterior mais um', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1007'],
    search: searchByQuery({ 'Série Final Sem Dados': searchCard('Série Final Sem Dados', '/animes/serie-final-sem-dados') }),
    detail: detailByPath({
      '/animes/serie-final-sem-dados': detailTvFinalNoDataBase,
      '/animes/serie-final-sem-dados-season-3': detailTvFinalNoDataSeason3,
      '/animes/serie-final-sem-dados-the-final-season': detailTvFinalNoDataFinal,
    }),
    video: videoByPath({ '/videos/nodata-final-01': video3 }),
  }));
  const streams = await runtime.exports.getStreams('1007', 'tv', 4, 1);

  assert.equal(streams.length, 3);
  assert.equal(videoCalls(runtime.calls)[0].url, 'https://www.dattebayo-br.com/videos/nodata-final-01');
  assert.deepEqual(runtime.errors, []);
});

test('4.2 duas entradas na mesma temporada são ausência por ambiguidade', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['1004'],
    search: searchByQuery({ 'Série Ambígua': searchCard('Série Ambígua', '/animes/serie-ambigua') }),
    detail: detailByPath({
      '/animes/serie-ambigua': detailTvAmbiguousBase,
      '/animes/serie-ambigua-season-2': detailTvAmbiguous,
      '/animes/serie-ambigua-2': detailTvAmbiguous2,
    }),
  }));
  const streams = await runtime.exports.getStreams('1004', 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('5.1 e 5.3 player com duas opções devolve dois streams sem inventar FULLHD', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video2 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(qualities(streams), ['720p', '480p']);
  assert.equal(streams.length, 2);
  assert.deepEqual(runtime.errors, []);
});

test('5.1 player sem abas é erro de layout', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': videoNoTabs }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /sem abas \.Aba/);
});

test('5.1 player sem var vid é erro de layout', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': videoNoVid }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /sem var vid/);
});

test('5.1 rótulo de opção desconhecido é erro de layout', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': videoUnknownLabel }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Rótulo de opção desconhecido/);
});

test('5.2 assinatura sem publicidade descarta só a opção', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video3 }),
    signature: (url) => (url.searchParams.get('url').includes('fixture-hd') ? signatureMissing : defaultSignature(url)),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(qualities(streams), ['1080p', '480p']);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[Dattebayo BR\] Opção HD descartada: .*publicidade/);
  assert.deepEqual(runtime.errors, []);
});

test('5.4 falha de todas as opções lança erro agregado e getStreams devolve []', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video3 }),
    signature: () => signatureMissing,
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 3);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: Opção SD: .*publicidade; Opção HD: .*publicidade; Opção FULLHD: .*publicidade/);
});

test('5.2 HTTP 500 na assinatura descarta só a opção', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': video3 }),
    signature: (url) => (url.searchParams.get('url').includes('fixture-hd') ? { status: 500, body: 'erro' } : defaultSignature(url)),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.match(runtime.warnings[0], /Opção HD descartada: Serviço de assinatura respondeu HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('3.2 série dublada pela seção devolve somente Dublado', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTvDubbed }),
    detail: detailByPath({ '/anime-dublado/boku-no-hero-academia-dublado': detailTvBaseDubbed }),
    video: videoByPath({ '/videos/hero-dub-01': videoDubbed }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  for (const stream of streams) assert.equal(stream.language, 'Dublado');
  assert.deepEqual(runtime.errors, []);
});

test('6.2 série dublada e legendada devolvem os dois idiomas', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTvBoth }),
    detail: detailByPath({
      '/animes/boku-no-hero-academia': detailTvBase,
      '/animes/boku-no-hero-academia-2': detailTvSeason2,
      '/anime-dublado/boku-no-hero-academia-dublado': detailTvBaseDubbed,
    }),
    video: videoByPath({
      '/videos/hero-01': video3,
      '/videos/hero-dub-01': videoDubbed,
    }),
  }));
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.equal(streams.length, 6);
  const languages = new Set(Array.from(streams, (stream) => stream.language));
  assert.deepEqual(Array.from(languages).sort(), ['Dublado', 'Legendado']);
  const urls = Array.from(streams, (stream) => stream.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(runtime.errors, []);
});

test('6.2 dublado e legendado devolvem os dois idiomas sem URL repetida', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovieBoth }),
    detail: detailByPath({
      '/animes/duna-parte-dois': detailMovie,
      '/anime-dublado/duna-parte-dois-dublado': detailMovieDubbed,
    }),
    video: videoByPath({
      '/videos/duna-filme': video3,
      '/videos/duna-filme-dublado': videoDubbed,
    }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 6);
  const languages = new Set(Array.from(streams, (stream) => stream.language));
  assert.deepEqual(Array.from(languages).sort(), ['Dublado', 'Legendado']);
  const urls = Array.from(streams, (stream) => stream.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(runtime.errors, []);
});

test('6.2 mesma URL em duas abas devolve um stream', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovie }),
    detail: detailByPath({ '/animes/duna-parte-dois': detailMovie }),
    video: videoByPath({ '/videos/duna-filme': videoDuplicateVid }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '480p');
  assert.equal(signatureCalls(runtime.calls).length, 1);
  assert.deepEqual(runtime.warnings, []);
});

test('6.3 falha na segunda ficha não devolve streams parciais', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['693134'],
    search: searchByQuery({ 'Duna: Parte Dois': searchMovieBoth }),
    detail: detailByPath({
      '/anime-dublado/duna-parte-dois-dublado': detailMovieDubbed,
      '/animes/duna-parte-dois': '<!doctype html><html><body></body></html>',
    }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(videoCalls(runtime.calls).length, 0);
  assert.match(runtime.errors[0], /Ficha .* sem h1/);
});

test('5.3 contrato do stream no template Prism', async () => {
  const runtime = makeRuntime(makeRoute({
    tmdb: TMDB['65930'],
    search: searchByQuery({ 'Boku no Hero Academia': searchTv }),
    detail: detailByPath({
      '/animes/boku-no-hero-academia': detailTvBase,
      '/animes/boku-no-hero-academia-2': detailTvSeason2,
    }),
    video: videoByPath({ '/videos/hero-01': video3 }),
  }), codes.prism);
  const streams = await runtime.exports.getStreams('65930', 'tv', 1, 1);

  assert.equal(streams.length, 3);
  for (const stream of streams) {
    assert.match(stream.url, /^https:\/\/media\.exemplo\.test\/videos\/fixture-(sd|hd|fullhd)\.mp4\?assinatura=/);
    assert.match(stream.quality, /^(480|720|1080)p$/);
    assert.equal(stream.language, 'Legendado');
    assert.equal(typeof stream.name, 'string');
    assert.equal(typeof stream.title, 'string');
    assert.match(stream.title, /T01E01/);
  }
});

test('1.2 manifest anuncia filme e série em MP4 e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'dattebayo');
  assert.ok(entry);
  assert.equal(entry.name, 'Dattebayo BR');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /animes/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /X-Amz-Signature|response-content-type|adssign|arft\.casa2\.online|anitube\.vip/i, name);
  }
  for (const name of ['signature-sd.json', 'signature-hd.json', 'signature-fullhd.json']) {
    assert.match(read(name), /\?assinatura=/);
  }
  assert.equal(readJson('signature-missing.json')[0].publicidade, 'BLOQUEADO');
});
