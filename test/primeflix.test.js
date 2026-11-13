const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'primeflix');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const MOVIE_ID = '693134';
const TV_ID = '100088';
const MOVIE_FINAL = 'https://media.exemplo.test/a1/out/5002/5002_duna-parte-dois-2024-1080p-web-dl-dual-5.1.m3u8';
const TV_FINAL = 'https://media.exemplo.test/a1/out/3045/3045_s01e01_dub_mostbet.m3u8';

const tmdbMovie = readJson('tmdb-movie.json');
const tmdbTv = readJson('tmdb-tv.json');
const searchLive = readJson('search-live.json');
const searchLiveTv = readJson('search-live-tv.json');
const searchEmpty = readJson('search-empty.json');
const searchHtml = read('search-html.html');
const searchHtmlEmpty = read('search-html-empty.html');
const detailMovie = read('detail-movie.html');
const detailMovie2021 = read('detail-movie-2021.html');
const detailTv = read('detail-tv.html');
const detailMissing = read('detail-missing.html');
const detailNoYear = read('detail-no-year.html');
const detailNoVid = read('detail-no-vid.html');
const detailWrongYear = read('detail-wrong-year.html');
const playerMovie = read('player-movie.html');
const playerTv = read('player-tv.html');
const http403 = read('http-403.txt');
const http500 = read('http-500.txt');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

let codes = {};

test.before(async () => {
  const outDir = createTempDir('primeflix-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('primeflix', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('primeflix', { outDir, formatter: 'prism' }), 'utf8');
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
  const textReads = [];
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
        text: async () => {
          textReads.push(String(url));
          return text;
        },
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings, textReads };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname.endsWith(`/movie/${MOVIE_ID}`)) return { body: tmdbMovie };
      if (url.pathname.endsWith(`/tv/${TV_ID}`)) return { body: tmdbTv };
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.hostname !== 'primeflix.sh') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/live-search') {
      if (overrides.liveSearch) return overrides.liveSearch(url);
      const term = url.searchParams.get('q');
      if (term === 'Duna: Parte Dois' || term === 'Dune: Part Two') return { body: searchLive };
      if (term === 'The Last of Us') return { body: searchLiveTv };
      return { body: searchEmpty };
    }
    if (url.pathname === '/search') {
      if (overrides.search) return overrides.search(url);
      const term = url.searchParams.get('q');
      if (term === 'Duna: Parte Dois' || term === 'Dune: Part Two') return { body: searchHtml };
      return { body: searchHtmlEmpty };
    }
    if (url.pathname.startsWith('/movie/')) {
      if (overrides.detail) return overrides.detail(url);
      if (url.pathname === '/movie/duna-parte-dois') return { body: detailMovie };
      if (url.pathname === '/movie/duna2') return { body: detailMovie2021 };
      if (url.pathname === '/movie/the-last-of-us') return { body: detailTv };
      return { status: 404, body: detailMissing };
    }
    if (url.pathname === '/vvv') {
      if (overrides.player) return overrides.player(url);
      const id = url.searchParams.get('id');
      if (id === '5002') return { url: MOVIE_FINAL, body: playerMovie };
      if (id === '3045') return { url: TV_FINAL, body: playerTv };
      return { status: 404, body: detailMissing };
    }
    throw new Error(`Rota Primeflix inesperada: ${url.pathname}`);
  };
}

function callsTo(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname);
}

test('manifesto registra o Primeflix com filme e série', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'primeflix');
  assert.ok(entry);
  assert.equal(entry.name, 'Primeflix');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8', 'mkv']);
});

test('filme resolve HLS sem baixar mídia e monta o contrato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(runtime.errors.length, 0);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, MOVIE_FINAL);
  assert.equal(stream.type, 'hls');
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Idioma Desconhecido');
  assert.equal(stream.provider, 'Primeflix');
  assert.ok(stream.name.includes('1080p'));
  assert.ok(stream.title.includes('Duna: Parte Dois'));
  assert.ok(stream.title.includes('2024'));
  assert.equal('headers' in stream, false);
  assert.equal('size' in stream, false);
  assert.equal('subtitles' in stream, false);
  assert.equal('seeders' in stream, false);
  assert.equal('peers' in stream, false);

  const playerCalls = callsTo(runtime.calls, '/vvv');
  assert.equal(playerCalls.length, 1);
  assert.equal(playerCalls[0].init.headers.Referer, 'https://primeflix.sh/movie/duna-parte-dois');
  assert.equal(playerCalls[0].init.headers.Range, 'bytes=0-0');
  assert.match(playerCalls[0].url, /id=5002/);
  assert.doesNotMatch(playerCalls[0].url, /season=/);
  assert.equal(runtime.textReads.some((url) => url.includes('/vvv')), false);
});

test('fixtures de playlist são sanitizadas e mantêm #EXTM3U', () => {
  for (const name of ['player-movie.html', 'player-tv.html', 'playlist.m3u8']) {
    const content = read(name);
    assert.match(content, /^#EXTM3U/);
    assert.doesNotMatch(content, /\b(?:md5|expires)=/);
  }
});

test('filme aceita arquivo MKV direto', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => ({
      url: 'https://media.exemplo.test/a1/inbox/5002_duna-parte-dois-2024-1080p.mkv',
      body: '',
    }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'mkv');
  assert.equal(streams[0].quality, '1080p');
});

test('filme com 403 do player devolve lista vazia e registra a falha', async () => {
  const runtime = makeRuntime(fullRoute({ player: () => ({ status: 403, body: http403 }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Primeflix\]/);
  assert.match(runtime.errors[0], /HTTP 403/);
});

test('filme com 5xx do player devolve lista vazia e registra a falha', async () => {
  const runtime = makeRuntime(fullRoute({ player: () => ({ status: 500, body: http500 }) }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('URL final sem extensão de mídia é falha, não ausência', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => ({ url: 'https://media.exemplo.test/video-sem-extensao', body: '' }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /extensão de mídia/);
});

test('série resolve episódio HLS dublado com temporada e episódio', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(runtime.errors.length, 0);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, TV_FINAL);
  assert.equal(stream.type, 'hls');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.quality, 'Desconhecida');
  assert.ok(stream.name.includes('T01E01'));
  assert.ok(stream.title.includes('T01E01'));

  const playerCalls = callsTo(runtime.calls, '/vvv');
  assert.equal(playerCalls.length, 1);
  assert.match(playerCalls[0].url, /season=1&episode=1/);
  assert.equal(playerCalls[0].init.headers.Range, undefined);
});

test('temporada ausente na ficha devolve lista vazia sem chamar o player', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
  assert.equal(callsTo(runtime.calls, '/vvv').length, 0);
});

test('episódio ausente na ficha devolve lista vazia sem chamar o player', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 10);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
  assert.equal(callsTo(runtime.calls, '/vvv').length, 0);
});

test('episódio anunciado com player 404 é falha da fonte', async () => {
  const runtime = makeRuntime(fullRoute({ player: () => ({ status: 404, body: detailMissing }) }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /HTTP 404/);
});

test('episódio com URL final que não é playlist é falha', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => ({ url: 'https://media.exemplo.test/a1/out/3045/erro.html', body: '' }),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /extensão de mídia/);
});

test('busca HTML entra quando o JSON não devolve candidato confirmável', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: searchEmpty }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(runtime.errors.length, 0);
  assert.equal(streams.length, 1);
  assert.equal(callsTo(runtime.calls, '/live-search').length, 1);
  assert.equal(callsTo(runtime.calls, '/search').length, 1);
});

test('busca HTML entra quando os candidatos do JSON têm ano incompatível', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'Duna', link: '/movie/duna2' }] }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(runtime.errors.length, 0);
  assert.equal(streams.length, 1);
  assert.equal(callsTo(runtime.calls, '/search').length, 1);
});

test('título original encontra candidato quando o PT-BR não confirma', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: (url) => url.searchParams.get('q') === 'Dune: Part Two'
      ? { body: searchLive }
      : { body: searchEmpty },
    search: () => ({ body: searchHtmlEmpty }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(runtime.errors.length, 0);
  assert.equal(streams.length, 1);
  const terms = callsTo(runtime.calls, '/live-search').map((call) => new URL(call.url).searchParams.get('q'));
  assert.deepEqual(terms, ['Duna: Parte Dois', 'Dune: Part Two']);
});

test('busca vazia devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: searchEmpty }),
    search: () => ({ body: searchHtmlEmpty }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
});

test('tipo incompatível é descartado sem erro', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'The Last of Us', link: '/movie/the-last-of-us' }] }),
    search: () => ({ body: searchHtmlEmpty }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
});

test('ano incompatível é descartado sem erro', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'Duna: Parte Dois', link: '/movie/duna-parte-dois' }] }),
    search: () => ({ body: searchHtmlEmpty }),
    detail: () => ({ body: detailWrongYear }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
});

test('ficha 404 é candidato removido e vira ausência', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'Duna: Parte Dois', link: '/movie/duna-parte-dois' }] }),
    search: () => ({ body: searchHtmlEmpty }),
    detail: () => ({ status: 404, body: detailMissing }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 0);
});

test('ficha sem v_id é falha de layout', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'Duna: Parte Dois', link: '/movie/duna-parte-dois' }] }),
    detail: () => ({ body: detailNoVid }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /v_id/);
});

test('ficha sem ano é falha de layout', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: [{ title: 'Duna: Parte Dois', link: '/movie/duna-parte-dois' }] }),
    detail: () => ({ body: detailNoYear }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Year/);
});

test('busca JSON com formato inválido é falha', async () => {
  const runtime = makeRuntime(fullRoute({
    liveSearch: () => ({ body: { resultados: [] } }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Busca JSON/);
});

test('idioma estrangeiro conhecido sem português sai como Gringo', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => ({
      url: 'https://media.exemplo.test/a1/inbox/5002_duna-parte-dois-2024-english-1080p.mkv',
      body: '',
    }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Gringo');
});

test('título e descrição do site não promovem o idioma sem prova no arquivo', async () => {
  const runtime = makeRuntime(fullRoute({
    detail: () => ({
      body: detailMovie.replace('<head>', '<head><meta name="description" content="Dublado e Legendado">'),
    }),
    player: () => ({
      url: 'https://media.exemplo.test/a1/inbox/5002_duna-parte-dois-2024-1080p.mkv',
      body: '',
    }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Idioma Desconhecido');
});

test('erro com URL assinada é saneado antes do log', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => new Error('falha em https://media.exemplo.test/a1/x.m3u8?assinatura=abc&token=segredo'),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /<assinatura>/);
  assert.doesNotMatch(runtime.errors[0], /assinatura=abc|token=segredo/);
});

test('idioma e qualidade saem do arquivo final, sem requisição extra', async () => {
  const runtime = makeRuntime(fullRoute({
    player: () => ({
      url: 'https://media.exemplo.test/a1/inbox/5002_duna-parte-dois-2024-leg-camrip.mkv',
      body: '',
    }),
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].quality, 'CAM');
  assert.equal(callsTo(runtime.calls, '/vvv').length, 1);
});

test('formatador Prism gera name e title a partir do format', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(typeof streams[0].name, 'string');
  assert.equal(typeof streams[0].title, 'string');
  assert.notEqual(streams[0].name, '');
  assert.notEqual(streams[0].title, '');
  assert.equal('format' in streams[0], false);
});
