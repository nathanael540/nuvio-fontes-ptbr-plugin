const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'donghuanosekai');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbSwallowed = readJson('tmdb-swallowed.json');
const tmdbDoupo = readJson('tmdb-doupo.json');
const tmdbWhiteSnake = readJson('tmdb-whitesnake.json');
const tmdbXueluo = readJson('tmdb-xueluo.json');
const tmdbMatrix = readJson('tmdb-matrix.json');

const searchSwallowed = read('search-swallowed.html');
const searchDoupo = read('search-doupo.html');
const searchWhiteSnake = read('search-whitesnake.html');
const searchXueluo = read('search-xueluo.html');
const searchEmpty = read('search-empty.html');
const searchNoStructure = read('search-no-structure.html');

const pageSwallowed = read('swallowed-star.html');
const pageSwallowedEpisode = read('swallowed-star-episodio-01.html');
const pageEpisodeWithoutPlayers = read('episode-without-players.html');
const pageDoupo = read('doupo-2a-temporada.html');
const pageDoupoEpisode = read('doupo-2-episodio-01.html');
const pageWhiteSnakeCollection = read('white-snake-filme.html');
const pageWhiteSnakeMovie = read('white-snake-o-filme.html');
const pageXueluo = read('xueluo-o-filme.html');
const pageWrongYear = read('white-snake-wrong-year.html');
const pageWrongType = read('white-snake-wrong-type.html');
const pageNoH1 = read('page-no-h1.html');
const pageMultipleMovies = read('movie-collection-multiple.html');

const playerNative = read('player-native.html');
const playerNativeDual = read('player-native-dual.html');
const playerNativeDoupo = read('player-native-doupo.html');
const playerNativeXueluo = read('player-native-xueluo.html');
const playerNew = read('player-new.html');
const playerNewWhiteSnake = read('player-new-whitesnake.html');
const playerNewXueluo = read('player-new-xueluo.html');
const playerSource = read('player-source.html');
const playerBlogger = read('player-blogger.html');
const playerDailymotion = read('player-dailymotion.html');
const playerStreamSB = read('player-streamsb.html');
const bloggerVideo = read('blogger-video.html');

let codes = {};

test.before(async () => {
  const outDir = createTempDir('donghuanosekai-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('donghuanosekai', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('donghuanosekai', { outDir, formatter: 'prism' }), 'utf8');
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
  return { exports: context.module.exports, calls, errors, warnings };
}

function tmdbResponse(url) {
  if (url.pathname.endsWith('/tv/101172')) return { body: tmdbSwallowed };
  if (url.pathname.endsWith('/tv/79481')) return { body: tmdbDoupo };
  if (url.pathname.endsWith('/movie/573699')) return { body: tmdbWhiteSnake };
  if (url.pathname.endsWith('/movie/1398725')) return { body: tmdbXueluo };
  if (url.pathname.endsWith('/movie/603')) return { body: tmdbMatrix };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(term) {
  if (term.includes('Swallowed') || term.includes('吞噬星空')) return searchSwallowed;
  if (term.includes('Doupo') || term.includes('斗破')) return searchDoupo;
  if (term.includes('A Lenda') || term.includes('白蛇')) return searchWhiteSnake;
  if (term.includes('Xueluo') || term.includes('吞噬星空剧场版')) return searchXueluo;
  return searchEmpty;
}

function pageResponse(url) {
  const pages = {
    '/swallowed-star': pageSwallowed,
    '/swallowed-star-episodio-01': pageSwallowedEpisode,
    '/swallowed-star-episodio-19': pageSwallowedEpisode,
    '/swallowed-star-episodio-02': pageEpisodeWithoutPlayers,
    '/doupo-cangqiong-2a-temporada': pageDoupo,
    '/doupo-cangqiong-2-episodio-01': pageDoupoEpisode,
    '/white-snake-filme': pageWhiteSnakeCollection,
    '/white-snake-o-filme': pageWhiteSnakeMovie,
    '/swallowed-star-xueluo-continent-o-filme': pageXueluo,
  };
  const body = pages[url.pathname];
  if (body === undefined) throw new Error(`Página inesperada: ${url.pathname}`);
  return { body };
}

function playerResponse(url) {
  const file = url.searchParams.get('file');
  const type = url.searchParams.get('type');
  if (file === 'SW1') {
    if (type === '3') return { body: playerNew };
    if (type === '4') return { body: playerStreamSB };
    return { body: playerNative };
  }
  if (file === 'DP2') {
    return type === '1' ? { body: playerStreamSB } : { body: playerNativeDoupo };
  }
  if (file === 'WS') {
    if (type === '0' || type === '1') return { body: playerNativeDual };
    if (type === '2') return { body: playerNewWhiteSnake };
    if (type === '3') return { body: playerSource };
    if (type === '4') return { body: playerBlogger };
    return { body: playerDailymotion };
  }
  if (file === 'XL') {
    return type === '1' ? { body: playerNewXueluo } : { body: playerNativeXueluo };
  }
  throw new Error(`Player inesperado: ${file} ${type}`);
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return typeof overrides.tmdb === 'function' ? overrides.tmdb(url) : tmdbResponse(url);
    }
    if (url.hostname === 'www.blogger.com') {
      return overrides.blogger ? overrides.blogger(url) : { body: bloggerVideo };
    }
    if (url.hostname !== 'donghuanosekai.com') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/player') {
      if (overrides.player) {
        return typeof overrides.player === 'function' ? overrides.player(url) : { body: overrides.player };
      }
      return playerResponse(url);
    }
    if (url.pathname === '/' && url.searchParams.has('s')) {
      const term = url.searchParams.get('s');
      if (overrides.search) {
        return typeof overrides.search === 'function' ? overrides.search(term, url) : { body: overrides.search };
      }
      return { body: searchResponse(term) };
    }
    if (overrides.page) {
      return typeof overrides.page === 'function' ? overrides.page(url) : { body: overrides.page };
    }
    return pageResponse(url);
  };
}

function callsTo(runtime, pathname) {
  return runtime.calls.filter((call) => new URL(call.url).pathname === pathname);
}

test('1.1 carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
});

test('1.1 valida entrada antes de qualquer requisição', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  const badId = await runtime.exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(badId), []);
  assert.match(runtime.errors[0], /\[Donghua No Sekai\] Falha em movie abc: ID do TMDB inválido/);

  const badType = await runtime.exports.getStreams('101172', 'anime', null, null);
  assert.deepEqual(Array.from(badType), []);
  assert.match(runtime.errors[1], /Tipo de mídia inválido/);

  const noSeason = await runtime.exports.getStreams('101172', 'tv', null, 1);
  assert.deepEqual(Array.from(noSeason), []);
  assert.match(runtime.errors[2], /Série sem temporada\/episódio válidos/);

  assert.equal(fetchCalled, false);
});

test('2.1 e 3.1 resolvem série de temporada única em HLS', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, 'https://cdn.example.test/swallowed-star/season1/01_1080p_EXAMPLE.mp4/index.m3u8');
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Legendado');
  assert.equal(stream.provider, 'DNSK Player');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.headers, undefined);
  assert.equal(stream.format, undefined);
  assert.match(stream.name, /^Donghua No Sekai 1080p/);
  assert.match(stream.title, /Legendado/);
  assert.match(stream.title, /DNSK Player/);
  assert.match(stream.title, /01_1080p_EXAMPLE\.mp4/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(callsTo(runtime, '/swallowed-star-episodio-01').length, 1);
});

test('2.2 seleciona a temporada específica da ficha', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('79481', 'tv', 2, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/doupo-cangqiong/season2/01_1080p_EXAMPLE.mp4/index.m3u8');
  assert.match(streams[0].title, /T02E01/);
  assert.match(streams[0].name, /^🚀 FHD 1080p/);
  assert.equal(callsTo(runtime, '/doupo-cangqiong-2a-temporada').length, 1);
  assert.equal(callsTo(runtime, '/player').length, 2);
});

test('2.2 usa o número local e ignora a numeração global do episódio', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 19);

  assert.equal(streams.length, 1);
  assert.equal(callsTo(runtime, '/swallowed-star-episodio-19').length, 1);
  assert.equal(callsTo(runtime, '/swallowed-star-episodio-184').length, 0);
});

test('2.3 descarta ficha com ano divergente', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageWrongYear }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 descarta ficha com tipo divergente', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageWrongType }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 busca vazia é ausência', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('603', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 busca sem estrutura é erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchNoStructure }));
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[Donghua No Sekai\].*Busca sem o contêiner de resultados/);
});

test('2.4 episódio ausente é ausência', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 250);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 link __trashed é ausência', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 249);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 episódio sem players é ausência', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 2);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.5 filme em coleção segue o único item e resolve todos os players', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.equal(streams.length, 4);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '720p', '720p', '360p']);
  const providers = streams.map((stream) => stream.provider);
  assert.ok(providers.includes('DNSK Player'));
  assert.ok(providers.includes('Blogger'));
  const blogger = streams.filter((stream) => stream.provider === 'Blogger');
  assert.equal(blogger.length, 2);
  for (const stream of blogger) assert.equal(stream.type, 'mp4');
  assert.equal(callsTo(runtime, '/white-snake-o-filme').length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.5 filme direto deduplica player nativo e player novo', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('1398725', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '816p');
  assert.equal(streams[0].url, 'https://cdn.example.test/swallowed-star-movie/movie1/01_816p_EXAMPLE.mp4/index.m3u8');
  assert.equal(callsTo(runtime, '/player').length, 2);
});

test('2.5 coleção de filme com mais de um item é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageMultipleMovies }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.5 host de triagem devolve ausência sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ player: playerDailymotion }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.6 falha de um player é isolada com aviso', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url) => {
      if (url.searchParams.get('type') === '0') return { status: 500, body: 'falha' };
      return playerResponse(url);
    },
  }));
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[Donghua No Sekai\] Opção Player 1 descartada: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('3.7 todos os players falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(fullRoute({ player: () => ({ status: 500, body: 'falha' }) }));
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[Donghua No Sekai\].*Nenhum player produziu stream/);
  assert.ok(runtime.warnings.length >= 1);
});

test('3.8 logs não contêm URL, token ou credencial', async () => {
  const runtime = makeRuntime(fullRoute({ player: () => ({ status: 500, body: 'falha' }) }));
  const streams = await runtime.exports.getStreams('101172', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  for (const message of [...runtime.warnings, ...runtime.errors]) {
    assert.equal(message.includes('https://'), false);
    assert.equal(message.includes('token'), false);
  }
});

test('2.3 página sem h1 é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoH1 }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[Donghua No Sekai\].*Página sem h1/);
});

test('3.2 player-new isolado devolve HLS', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url) => (url.searchParams.get('type') === '2' ? { body: playerNewWhiteSnake } : { body: playerDailymotion }),
  }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/white-snake/movie/1080p_EXAMPLE.mp4/index.m3u8');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].type, 'hls');
});

test('3.3 source direto isolado devolve HLS com a qualidade de size', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url) => (url.searchParams.get('type') === '3' ? { body: playerSource } : { body: playerDailymotion }),
  }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/white-snake/movie/720p_EXAMPLE.mp4/index.m3u8');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].type, 'hls');
});

test('3.4 Blogger é lido pelo bloco blogger-video', async () => {  const runtime = makeRuntime(fullRoute({
    player: (url) => (url.searchParams.get('type') === '4' ? { body: playerBlogger } : { body: playerDailymotion }),
  }));
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '360p']);
  for (const stream of streams) {
    assert.equal(stream.provider, 'Blogger');
    assert.equal(stream.type, 'mp4');
  }
});

test('2.1 usa o template do build para name e title', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('573699', 'movie', null, null);

  assert.ok(streams.length > 0);
  assert.match(streams[0].name, /^🚀 FHD 1080p/);
  assert.match(streams[0].title, /A Lenda da Serpente \(2019\)/);
});
