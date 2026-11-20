const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'redecanais');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbDuna = readJson('tmdb-duna.json');
const tmdbViajantes = readJson('tmdb-viajantes.json');
const tmdbTlou = readJson('tmdb-tlou.json');
const tmdbNinguem = readJson('tmdb-ninguem.json');
const tmdbDemon = readJson('tmdb-demon.json');
const tmdbNovosVingadores = readJson('tmdb-novos-vingadores.json');

const searchDuna = read('search-duna.html');
const searchViajantes = read('search-viajantes.html');
const searchTlou = read('search-tlou.html');
const searchNinguem = read('search-ninguem.html');
const searchEmpty = read('search-empty.html');
const searchNoMarker = read('search-no-marker.html');
const searchPage1 = read('search-page-1.html');
const searchPage2 = read('search-page-2.html');

const movieDuna = read('movie-duna.html');
const movieViajantes = read('movie-viajantes.html');
const movieNovosVingadores = read('movie-novos-vingadores.html');
const seriesTlou = read('series-tlou.html');
const seriesNinguem = read('series-ninguem.html');
const episodeTlouS1E1 = read('episode-tlou-s1e1.html');
const episodeTlouS2E1 = read('episode-tlou-s2e1.html');
const episodeNinguemS1E1 = read('episode-ninguem-s1e1.html');
const playerMp4 = read('player-mp4.html');
const playerHls = read('player-hls.html');
const playerNoSrc = read('player-no-src.html');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'manifest.json'), 'utf8'));

const PATH_DUNA = '/duna-parte-dois-2024-dublado_e7188a975.html';
const PATH_VIAJANTES = '/viajantes-do-tempo-iptv-leg-1080p_71a9c3218.html';
const PATH_TLOU = '/the-last-of-us-lista-de-episodios_d6a60c652.html';
const PATH_NINGUEM = '/ninguem-alem-de-voce-lista-de-episodios_34212a1ee.html';
const PATH_NOVOS_VINGADORES = '/os-novos-vingadores-herois-do-amanha-2008-dublado_3318a7a19.html';
const PATH_EP_TLOU_S1E1 = '/the-last-of-us-1a-temporada-episodio-1-quando-voce-estiver-perdido-na-escuridao-dublado_484c085c1.html';
const PATH_EP_TLOU_S2E1 = '/the-last-of-us-2a-temporada-episodio-01-dias-futuros_442fc8f04.html';
const PATH_EP_NINGUEM_S1E1 = '/ninguem-alem-de-voce-leg-1a-temporada-episodio-01_ecb3bd2c9.html';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('redecanais-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('redecanais', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('redecanais', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbResponse(url, overrides = {}) {
  if (overrides.tmdb) return typeof overrides.tmdb === 'function' ? overrides.tmdb(url) : { body: overrides.tmdb };
  if (url.pathname.endsWith('/movie/693134')) return { body: tmdbDuna };
  if (url.pathname.endsWith('/movie/566182')) return { body: tmdbViajantes };
  if (url.pathname.endsWith('/movie/14613')) return { body: tmdbNovosVingadores };
  if (url.pathname.endsWith('/tv/100088')) return { body: tmdbTlou };
  if (url.pathname.endsWith('/tv/263001')) return { body: tmdbNinguem };
  if (url.pathname.endsWith('/tv/85937')) return { body: tmdbDemon };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(query, page, overrides = {}) {
  if (overrides.search) {
    return typeof overrides.search === 'function'
      ? overrides.search(query, page)
      : { body: overrides.search };
  }
  if (query.includes('Duna')) return { body: searchDuna };
  if (query.includes('Viajantes')) return { body: searchViajantes };
  if (query === 'The Last of Us') return { body: searchTlou };
  if (query.includes('Ninguém')) return { body: searchNinguem };
  if (query.includes('Novos Vingadores')) {
    return { body: page === '2' ? searchPage2 : searchPage1 };
  }
  return { body: searchEmpty };
}

function detailResponse(url, overrides = {}) {
  if (overrides.detail) {
    return typeof overrides.detail === 'function' ? overrides.detail(url) : { body: overrides.detail };
  }
  const pathname = url.pathname;
  if (pathname === PATH_DUNA) return { body: movieDuna };
  if (pathname === PATH_VIAJANTES) return { body: movieViajantes };
  if (pathname === PATH_NOVOS_VINGADORES) return { body: movieNovosVingadores };
  if (pathname === PATH_TLOU) return { body: seriesTlou };
  if (pathname === PATH_NINGUEM) return { body: seriesNinguem };
  if (pathname === PATH_EP_TLOU_S1E1) return { body: episodeTlouS1E1 };
  if (pathname === PATH_EP_TLOU_S2E1) return { body: episodeTlouS2E1 };
  if (pathname === PATH_EP_NINGUEM_S1E1) return { body: episodeNinguemS1E1 };
  return { status: 404, body: 'ficha ausente' };
}

function playerResponse(url, overrides = {}) {
  if (overrides.player) {
    return typeof overrides.player === 'function' ? overrides.player(url) : { body: overrides.player };
  }
  const vid = url.searchParams.get('vid');
  if (vid === 'r2-26966' || vid === 'r2-292737' || vid === 'r2-10589'
    || vid === 'r2-204284' || vid === 'r2-282715' || vid === 'r2-292648') {
    return { body: playerMp4 };
  }
  return { status: 404, body: 'player ausente' };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') return tmdbResponse(url, overrides);
    if (url.hostname !== 'redecanais.lt') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/search.php') {
      return searchResponse(url.searchParams.get('keywords'), url.searchParams.get('page') || '1', overrides);
    }
    if (url.pathname === '/player3/server.php') return playerResponse(url, overrides);
    return detailResponse(url, overrides);
  };
}

function searches(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.lt' && url.pathname === '/search.php';
  });
}

function detailCalls(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.lt' && url.pathname !== '/search.php' && url.pathname !== '/player3/server.php';
  });
}

function playerCalls(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.lt' && url.pathname === '/player3/server.php';
  });
}

function replaceAll(text, pairs) {
  return pairs.reduce((value, [from, to]) => value.split(from).join(to), text);
}

function twoCardSearch(first, second) {
  return `<html><head><title>Buscar Conteúdo RedeCanais: Duna</title></head><body>
<ul class="row pm-ul-browse-videos list-unstyled" id="pm-grid">
<li><div class="thumbnail"><div class="caption"><h3><a href="${first.href}" title="${first.title}" class="ellipsis">${first.title}</a></h3></div></div></li>
<li><div class="thumbnail"><div class="caption"><h3><a href="${second.href}" title="${second.title}" class="ellipsis">${second.title}</a></h3></div></div></li>
</ul></body></html>`;
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

test('1.4 e 5.2 filme dublado resolve pelo domínio único, com encodeURIComponent e sem rede fora da fonte', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('693134', 'movie', 1, 2);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, 'https://cdn.exemplo.test/media/duna-parte-dois-2024.mp4');
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'R2');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.headers, undefined);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.size, undefined);
  assert.equal(stream.format, undefined);
  assert.match(stream.name, /^RedeCanais 1080p\n/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /🔍 R2/);

  const firstSearch = new URL(searches(runtime)[0].url);
  assert.equal(firstSearch.searchParams.get('keywords'), 'Duna: Parte Dois');
  assert.match(firstSearch.search, /Duna%3A%20Parte%20Dois/);

  for (const call of runtime.calls) {
    const url = new URL(call.url);
    assert.ok(
      url.hostname === 'api.themoviedb.org' || url.hostname === 'redecanais.lt',
      `requisição fora da fonte: ${url.hostname}`,
    );
    assert.doesNotMatch(url.hostname, /redecanais\.(phd|by|deals|in)$/);
  }
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('1.2 manifest anuncia filme e série em MP4 e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'redecanais');
  assert.ok(entry);
  assert.equal(entry.name, 'RedeCanais');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/redecanais.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes e séries/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /\bexp=|\bsig=|cookie|token=|api[_-]?key|k=[A-Za-z0-9]/i, name);
    assert.doesNotMatch(content, /cnn\.|linkdireto|radiogaucha/i, name);
  }
});

test('2.1 prioriza romaji da temporada, deduplica e limita a oito termos', async () => {
  const many = {
    ...tmdbDemon,
    alternative_titles: {
      results: [
        ...tmdbDemon.alternative_titles.results,
        { iso_3166_1: 'BR', title: 'Caçador de Demônios', type: '' },
        { iso_3166_1: 'BR', title: 'demon slayer: kimetsu no yaiba', type: '' },
        { iso_3166_1: 'BR', title: 'Caçador de Oni', type: '' },
        { iso_3166_1: 'BR', title: 'Lâmina Demoníaca', type: '' },
      ],
    },
  };
  const runtime = makeRuntime(fullRoute({
    search: () => ({ body: searchEmpty }),
    tmdb: (url) => (url.pathname.endsWith('/tv/85937') ? { body: many } : { status: 404 }),
  }));
  const streams = await runtime.exports.getStreams('85937', 'tv', 3, 1);

  assert.deepEqual(Array.from(streams), []);
  const terms = searches(runtime).map((call) => new URL(call.url).searchParams.get('keywords'));
  assert.equal(terms.length, 8);
  assert.equal(terms[0], 'Kimetsu no Yaiba: Yuukaku-hen');
  assert.equal(terms[1], 'Demon Slayer: Kimetsu no Yaiba');
  assert.equal(terms[2], '鬼滅の刃');
  assert.ok(!terms.includes('demon slayer: kimetsu no yaiba'));
  assert.ok(!terms.includes('Kimetsu no Yaiba: Katanakaji no Sato-hen'));
  assert.ok(!terms.includes('Kimetsu no Yaiba: Hashira Geiko-hen'));
});

test('2.2 pagina até a segunda página e confirma o cartão publicado nela', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('14613', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].quality, '1080p');
  const pages = searches(runtime).map((call) => new URL(call.url).searchParams.get('page') || '1');
  assert.deepEqual(pages, ['1', '2']);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 busca válida sem cartões é ausência e não consulta a próxima página', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchEmpty }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.ok(searches(runtime).length >= 1);
  assert.equal(detailCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 página sem o título de busca é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (query, page) => ({ body: page === '2' ? searchNoMarker : searchPage1 }),
  }));
  const streams = await runtime.exports.getStreams('14613', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais\] Falha em movie 14613: Busca sem o título de resultados/);
});

test('2.3 cartão de série é descartado em pedido de filme sem abrir a ficha', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchTlou }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 série sem marcador na rota é confirmada pela estrutura da ficha', async () => {
  const unmarkedPath = '/the-last-of-us_09b129891.html';
  const unmarkedSearch = searchTlou.replace(PATH_TLOU, unmarkedPath);
  const runtime = makeRuntime(fullRoute({
    search: unmarkedSearch,
    detail: (url) => (url.pathname === unmarkedPath ? { body: seriesTlou } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.deepEqual(runtime.errors, []);
});

test('2.3 ficha de filme com o mesmo título é descartada em pedido de série', async () => {
  const movieTlou = replaceAll(movieDuna, [
    ['Duna: Parte Dois', 'The Last of Us'],
    ['2024', '2023'],
  ]);
  const unmarkedPath = '/the-last-of-us_09b129891.html';
  const unmarkedSearch = searchTlou.replace(PATH_TLOU, unmarkedPath);
  const runtime = makeRuntime(fullRoute({
    search: unmarkedSearch,
    detail: (url) => (url.pathname === unmarkedPath ? { body: movieTlou } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime).length, 1);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 ficha de série sem marcador é descartada em pedido de filme', async () => {
  const unmarkedPath = '/the-last-of-us_09b129891.html';
  const unmarkedSearch = searchTlou.replace(PATH_TLOU, unmarkedPath);
  const tmdbTlouMovie = {
    ...tmdbTlou,
    title: tmdbTlou.name,
    original_title: tmdbTlou.original_name,
    release_date: tmdbTlou.first_air_date,
    alternative_titles: { titles: [] },
  };
  const runtime = makeRuntime(fullRoute({
    search: unmarkedSearch,
    tmdb: (url) => (url.pathname.endsWith('/movie/100088') ? { body: tmdbTlouMovie } : tmdbResponse(url)),
    detail: (url) => (url.pathname === unmarkedPath ? { body: seriesTlou } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime).length, 1);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 filme legendado confirma pelo h1 e devolve Legendado', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('566182', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].quality, '1080p');
});

test('2.4 ano divergente descarta o candidato sem erro', async () => {
  const divergent = replaceAll(movieDuna, [
    ['<h1>Duna: Parte Dois (Dublado) - 2024 - 1080p</h1>', '<h1>Duna: Parte Dois (Dublado) - 1999 - 1080p</h1>'],
    ['"dateCreated":"2024"', '"dateCreated":"1999"'],
  ]);
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 ficha sem ano mantém o ano do cartão e não descarta', async () => {
  const noYear = replaceAll(movieDuna, [
    ['<h1>Duna: Parte Dois (Dublado) - 2024 - 1080p</h1>', '<h1>Duna: Parte Dois (Dublado) - 1080p</h1>'],
    [',"dateCreated":"2024"', ''],
  ]);
  const runtime = makeRuntime(fullRoute({ detail: noYear }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  const prismRuntime = makeRuntime(fullRoute({ detail: noYear }), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('693134', 'movie', null, null);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /🎬 Duna: Parte Dois \(2024\)/);
});

test('2.4 título divergente descarta o candidato sem erro', async () => {
  const divergent = replaceAll(movieDuna, [
    ['<h1>Duna: Parte Dois (Dublado) - 2024 - 1080p</h1>', '<h1>Titanic (Dublado) - 2024 - 1080p</h1>'],
    ['"name":"Duna: Parte Dois (Dublado)"', '"name":"Titanic (Dublado)"'],
  ]);
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.1 e 3.2 série confirma identidade e resolve o par S01E01 pelo href publicado', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].provider, 'R2');
  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('100088', 'tv', 1, 1);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /🎬 The Last of Us \(2023\) T01E01/);

  const episodeCall = detailCalls(runtime).find((call) => new URL(call.url).pathname === PATH_EP_TLOU_S1E1);
  assert.ok(episodeCall);
  const playerCall = playerCalls(runtime)[0];
  assert.ok(playerCall);
  assert.equal(playerCall.init.headers.Referer, `https://redecanais.lt${PATH_EP_TLOU_S1E1}`);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.2 seleciona a temporada 2 pelo par e não pela posição', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 2, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.ok(detailCalls(runtime).some((call) => new URL(call.url).pathname === PATH_EP_TLOU_S2E1));
  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('100088', 'tv', 2, 1);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /The Last of Us \(2023\) T02E01/);
});

test('3.2 link absoluto do episódio continua sendo usado', async () => {
  const absolute = seriesTlou.replace(
    `href="${PATH_EP_TLOU_S1E1}"`,
    'href="https://redecanais.lt/the-last-of-us-1a-temporada-episodio-1-quando-voce-estiver-perdido-na-escuridao-dublado_484c085c1.html"',
  );
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_TLOU ? { body: absolute } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.ok(detailCalls(runtime).some((call) => new URL(call.url).pathname === PATH_EP_TLOU_S1E1));
});

test('3.2 coordenadas divergentes no h1 descartam a opção', async () => {
  const divergent = episodeTlouS1E1.replace(
    '<h1>The Last of Us - 1ª Temporada - Episódio 01 - Quando Você Estiver Perdido na Escuridão</h1>',
    '<h1>The Last of Us - 1ª Temporada - Episódio 02 - Infectados</h1>',
  );
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_EP_TLOU_S1E1 ? { body: divergent } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /coordenadas divergentes: 1x2/);
});

test('3.3 par não publicado é ausência sem erro', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 9, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.3 série sem o contêiner de episódios é erro de estrutura', async () => {
  const withoutDescription = seriesTlou.replace('<div itemprop="description">', '<div class="sinopse">')
    .replace(/<\/div>\s*$/, '</div>');
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_TLOU ? { body: withoutDescription } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais\].*sem div\[itemprop="description"\]/);
});

test('4.1 player declara HLS e o stream sai como hls', async () => {
  const runtime = makeRuntime(fullRoute({ player: playerHls }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].url, 'https://cdn.exemplo.test/media/the-last-of-us-s01e01.m3u8');
});

test('4.1 formato declarado fora do contrato é triagem, não falha', async () => {
  const unsupported = playerMp4.replace('"file"', '"dash"');
  const runtime = makeRuntime(fullRoute({ player: unsupported }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('4.1 player sem SRC falha isoladamente com aviso', async () => {
  const runtime = makeRuntime(fullRoute({ player: playerNoSrc }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: Opção Dublado 1080p: Player sem SRC/);
});

test('4.1 ficha sem iframe Player falha isoladamente com aviso', async () => {
  const withoutFrame = movieDuna.replace(/<iframe name="Player"[\s\S]*?<\/iframe>/, '');
  const runtime = makeRuntime(fullRoute({ detail: withoutFrame }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Opção Dublado 1080p: Ficha sem iframe Player/);
});

test('4.2 qualidade ausente cai na descoberta local e sai Desconhecida', async () => {
  const noQualitySearch = searchDuna.replace(' - 1080p', '');
  const noQualityMovie = replaceAll(movieDuna, [
    ['Duna: Parte Dois (Dublado) - 2024 - 1080p</h1>', 'Duna: Parte Dois (Dublado) - 2024</h1>'],
    ['"name":"Duna: Parte Dois (Dublado)"', '"name":"Duna: Parte Dois (Dublado)"'],
  ]).replace('Duna: Parte Dois (Dublado) - 2024 - 1080p - RedeCanais', 'Duna: Parte Dois (Dublado) - 2024 - RedeCanais');
  const runtime = makeRuntime(fullRoute({ search: noQualitySearch, detail: noQualityMovie }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
});

test('4.3 ordena por qualidade e deduplica o mesmo arquivo e idioma', async () => {
  const cards = twoCardSearch(
    { href: '/duna-720_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 720p' },
    { href: '/duna-1080_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
  );
  const detail720 = replaceAll(movieDuna, [
    ['<h1>Duna: Parte Dois (Dublado) - 2024 - 1080p</h1>', '<h1>Duna: Parte Dois (Dublado) - 2024 - 720p</h1>'],
    ['"dateCreated":"2024"', '"dateCreated":"2024"'],
    ['r2-26966', 'r2-720'],
  ]);
  const detail1080 = replaceAll(movieDuna, [['r2-26966', 'r2-1080']]);
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-720_e7188a975.html') return { body: detail720 };
      if (url.pathname === '/duna-1080_e7188a975.html') return { body: detail1080 };
      return { status: 404, body: 'ausente' };
    },
    player: (url) => {
      const vid = url.searchParams.get('vid');
      if (vid === 'r2-720') return { body: playerMp4.replace('duna-parte-dois-2024.mp4', 'duna-parte-dois-2024-720.mp4') };
      if (vid === 'r2-1080') return { body: playerMp4.replace('duna-parte-dois-2024.mp4', 'duna-parte-dois-2024-1080.mp4') };
      return { status: 404, body: 'ausente' };
    },
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '720p']);
});

test('4.3 dois áudios do mesmo arquivo permanecem como streams independentes', async () => {
  const cards = twoCardSearch(
    { href: '/duna-dub_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
    { href: '/duna-leg_e7188a975.html', title: 'Duna: Parte Dois (Legendado) - 2024 - 1080p' },
  );
  const dubbed = movieDuna.replace('r2-26966', 'r2-dub');
  const subtitled = replaceAll(movieDuna, [
    ['(Dublado)', '(Legendado)'],
    ['r2-26966', 'r2-leg'],
  ]);
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-dub_e7188a975.html') return { body: dubbed };
      if (url.pathname === '/duna-leg_e7188a975.html') return { body: subtitled };
      return { status: 404, body: 'ausente' };
    },
    player: () => ({ body: playerMp4 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language).sort(), ['Dublado', 'Legendado']);
});

test('4.3 mesmo arquivo e mesmo idioma vira um único stream', async () => {
  const cards = twoCardSearch(
    { href: '/duna-a_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
    { href: '/duna-b_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
  );
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-a_e7188a975.html') return { body: movieDuna.replace('r2-26966', 'r2-a') };
      if (url.pathname === '/duna-b_e7188a975.html') return { body: movieDuna.replace('r2-26966', 'r2-b') };
      return { status: 404, body: 'ausente' };
    },
    player: () => ({ body: playerMp4 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
});

test('4.4 episódio [LEG] prevalece sobre o rótulo dublado da série', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('263001', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('263001', 'tv', 1, 1);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /Ninguém Além de Você \(2024\) T01E01/);
});

test('4.4 episódio sem marcador usa o rótulo da série', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 2, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
});

test('4.4 texto genérico Dublado e Legendado não classifica o áudio', async () => {
  const genericSeries = replaceAll(seriesTlou, [
    ['(Dublado)', '(Dublado e Legendado)'],
    ['-dublado_484c085c1.html', '_484c085c1.html'],
  ]);
  const genericSearch = searchTlou.replaceAll('(Dublado)', '(Dublado e Legendado)');
  const runtime = makeRuntime(fullRoute({
    search: genericSearch,
    detail: (url) => {
      if (url.pathname === PATH_TLOU) return { body: genericSeries };
      if (url.pathname.endsWith('_484c085c1.html')) return { body: episodeTlouS1E1 };
      return detailResponse(url);
    },
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Idioma Desconhecido');
});

test('4.5 uma opção falha e a outra entrega stream, com aviso da descartada', async () => {
  const cards = twoCardSearch(
    { href: '/duna-dub_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
    { href: '/duna-leg_e7188a975.html', title: 'Duna: Parte Dois (Legendado) - 2024 - 1080p' },
  );
  const dubbed = movieDuna.replace('r2-26966', 'r2-dub');
  const subtitled = replaceAll(movieDuna, [
    ['(Dublado)', '(Legendado)'],
    ['r2-26966', 'r2-leg'],
  ]);
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-dub_e7188a975.html') return { body: dubbed };
      if (url.pathname === '/duna-leg_e7188a975.html') return { body: subtitled };
      return { status: 404, body: 'ausente' };
    },
    player: (url) => (url.searchParams.get('vid') === 'r2-dub'
      ? { status: 403, body: 'proibido' }
      : { body: playerMp4 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[RedeCanais\] Opção Dublado 1080p descartada: HTTP 403/);
  assert.deepEqual(runtime.errors, []);
});

test('4.5 todas as opções falham e o erro agregado sobe', async () => {
  const cards = twoCardSearch(
    { href: '/duna-dub_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
    { href: '/duna-leg_e7188a975.html', title: 'Duna: Parte Dois (Legendado) - 2024 - 1080p' },
  );
  const dubbed = movieDuna.replace('r2-26966', 'r2-dub');
  const subtitled = replaceAll(movieDuna, [
    ['(Dublado)', '(Legendado)'],
    ['r2-26966', 'r2-leg'],
  ]);
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-dub_e7188a975.html') return { body: dubbed };
      if (url.pathname === '/duna-leg_e7188a975.html') return { body: subtitled };
      return { status: 404, body: 'ausente' };
    },
    player: () => ({ status: 403, body: 'proibido' }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Opção Dublado 1080p: HTTP 403/);
  assert.match(runtime.errors[0], /Opção Legendado 1080p: HTTP 403/);
});

test('4.5 candidato 404 é removido e os demais continuam', async () => {
  const cards = twoCardSearch(
    { href: '/duna-404_e7188a975.html', title: 'Duna: Parte Dois (Dublado) - 2024 - 1080p' },
    { href: '/duna-ok_e7188a975.html', title: 'Duna: Parte Dois (Legendado) - 2024 - 1080p' },
  );
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/duna-404_e7188a975.html') return { status: 404, body: 'ausente' };
      if (url.pathname === '/duna-ok_e7188a975.html') {
        return { body: replaceAll(movieDuna, [['(Dublado)', '(Legendado)'], ['r2-26966', 'r2-leg']]) };
      }
      return { status: 404, body: 'ausente' };
    },
    player: () => ({ body: playerMp4 }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('5.2 erro inesperado é registrado com [RedeCanais] e devolve lista vazia', async () => {
  const runtime = makeRuntime(async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdbDuna };
    throw new Error('falha simulada');
  });
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais\] Falha em movie 693134: falha simulada/);
});

test('1.2 template Prism é usado quando o build fixa o formato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^🚀 FHD 1080p\n/);
  assert.match(streams[0].title, /🎬 Duna: Parte Dois \(2024\)/);
});
