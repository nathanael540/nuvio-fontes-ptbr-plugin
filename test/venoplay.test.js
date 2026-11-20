const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'venoplay');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const readSharedJson = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cineagora', name), 'utf8'));

const tmdbDuna = readSharedJson('tmdb-duna.json');
const tmdbThePitt = readSharedJson('tmdb-the-pitt.json');
const searchMovie = read('search-movie.html');
const searchSeries = read('search-series.html');
const searchAmbiguous = read('search-ambiguous.html');
const searchTypeMismatch = read('search-type-mismatch.html');
const searchEmpty = read('search-empty.html');
const searchEmptyPt = read('search-empty-pt.html');
const searchCardsEmptyCategory = read('search-cards-empty-category.html');
const searchMalformed = read('search-malformed.html');
const pageMovie = read('page-movie.html');
const pageSeries = read('page-series.html');
const pageWrongYear = read('page-wrong-year.html');
const pageWrongType = read('page-wrong-type.html');
const pageNoJsonLd = read('page-no-jsonld.html');
const pageEmptyJsonLd = read('page-empty-jsonld.html');
const pageFallback = read('page-fallback.html');
const pageNoMediaId = read('page-no-media-id.html');
const playersMovie = readJson('players-movie.json');
const playersSeries = readJson('players-series.json');
const playersEmpty = readJson('players-empty.json');
const playersInvalid = readJson('players-invalid.json');
const mgebHls = read('mgeb-hls.html');
const mgebHlsPhp = read('mgeb-hls-php.html');
const mgebHlsLat = read('mgeb-hls-lat.html');
const mgebCredential = read('mgeb-credential.html');
const mgebWorker = read('mgeb-worker.html');
const mgebNovix = read('mgeb-novix.html');
const mgebInfra = read('mgeb-infra.html');
const mgebFontedecanais = read('mgeb-fontedecanais.html');
const mgebEmpty = read('mgeb-empty.html');
const mgebNoSources = read('mgeb-no-sources.html');
const mgebMixed = read('mgeb-mixed.html');
const mgebDuplicate = read('mgeb-duplicate.html');
const mgebGreys = read('mgeb-greys-anatomy.html');
const mgebBreakingBad = read('mgeb-breaking-bad.html');
const searchGreys = read('search-greys-anatomy.html');
const searchBreakingBad = read('search-breaking-bad.html');
const pageGreys = read('page-greys-anatomy.html');
const pageBreakingBad = read('page-breaking-bad.html');
const playersGreys = readJson('players-greys-anatomy.json');
const playersBreakingBad = readJson('players-breaking-bad.json');
const tmdbGreys = readJson('tmdb-greys-anatomy.json');
const tmdbBreakingBad = readJson('tmdb-breaking-bad.json');

let codes = {};

test.before(async () => {
  const outDir = createTempDir('venoplay-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('venoplay', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('venoplay', { outDir, formatter: 'prism' }), 'utf8');
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
  if (url.pathname.endsWith('/movie/693134')) return { body: tmdbDuna };
  if (url.pathname.endsWith('/tv/250307')) return { body: tmdbThePitt };
  if (url.pathname.endsWith('/tv/1416')) return { body: tmdbGreys };
  if (url.pathname.endsWith('/tv/1396')) return { body: tmdbBreakingBad };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(query) {
  if (query === 'Duna: Parte Dois' || query === 'Dune: Part Two') return { body: searchMovie };
  if (query === 'The Pitt') return { body: searchSeries };
  return { body: searchEmpty };
}

function pageResponse(url) {
  if (url.pathname.includes('filme-693134')) return { body: pageMovie };
  if (url.pathname.includes('serie-250307')) return { body: pageSeries };
  throw new Error(`Página inesperada: ${url.pathname}`);
}

function playersResponse(url) {
  if (url.searchParams.get('id') === '693134') return { body: playersMovie };
  if (url.searchParams.get('id') === '250307') return { body: playersSeries };
  return { body: playersEmpty };
}

function mgebResponse(url) {
  if (url.hostname === 'mgeb.lat') return { body: mgebHlsLat };
  return { body: mgebHls };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return typeof overrides.tmdb === 'function' ? overrides.tmdb(url) : tmdbResponse(url);
    }
    if (url.hostname === 'www2.venoplay.com' && url.pathname === '/') {
      if (overrides.seed === 'fail') return new Error('semente indisponível');
      if (overrides.seed === 'no-redirect') return { url: 'https://www2.venoplay.com/', body: '<html></html>' };
      return { url: 'https://w2.venoplay.site/', body: '<html></html>' };
    }
    if (url.hostname === 'w2.venoplay.site' || url.hostname === 'www2.venoplay.com') {
      if (url.pathname === '/busca') {
        if (overrides.search) {
          return typeof overrides.search === 'function'
            ? overrides.search(url.searchParams.get('q'), url)
            : { body: overrides.search };
        }
        return searchResponse(url.searchParams.get('q'));
      }
      if (url.pathname.startsWith('/assistir/')) {
        if (overrides.page) {
          return typeof overrides.page === 'function' ? overrides.page(url) : { body: overrides.page };
        }
        return pageResponse(url);
      }
      if (url.pathname === '/api/get_players') {
        if (overrides.players) {
          return typeof overrides.players === 'function' ? overrides.players(url) : { body: overrides.players };
        }
        return playersResponse(url);
      }
      throw new Error(`Rota VenoPlay inesperada: ${url.pathname}`);
    }
    if (url.hostname === 'mgeb.space' || url.hostname === 'mgeb.lat') {
      if (overrides.player) {
        return typeof overrides.player === 'function' ? overrides.player(url) : { body: overrides.player };
      }
      return mgebResponse(url);
    }
    if (url.hostname === 'nhdapi.com') {
      throw new Error('nhdapi.com não deve ser requisitado');
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function searchCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname === '/busca');
}

function mgebCalls(calls) {
  return calls.filter((call) => ['mgeb.space', 'mgeb.lat'].includes(new URL(call.url).hostname));
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
  assert.match(runtime.errors[0], /\[VenoPlay\] Falha em movie abc: ID do TMDB inválido/);

  const badType = await runtime.exports.getStreams('693134', 'anime', null, null);
  assert.deepEqual(Array.from(badType), []);
  assert.match(runtime.errors[1], /Tipo de mídia inválido/);

  const noSeason = await runtime.exports.getStreams('250307', 'tv', null, 2);
  assert.deepEqual(Array.from(noSeason), []);
  assert.match(runtime.errors[2], /Série sem temporada\/episódio válidos/);

  assert.equal(fetchCalled, false);
});

test('2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.6 e 3.7 resolvem filme dublado no mgeb', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('693134', 'movie', 1, 2);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, 'https://mgeb.space/cache/hls/EXAMPLE.m3u8');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'MGEB');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.headers, undefined);
  assert.equal(stream.format, undefined);
  assert.match(stream.name, /^VenoPlay Desconhecida/);
  assert.match(stream.title, /Dublado/);
  assert.match(stream.title, /MGEB/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.some((call) => new URL(call.url).hostname === 'nhdapi.com'), false);
});

test('2.2 e 3.1 resolvem série com temporada e episódio no get_players', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('250307', 'tv', 1, 2);

  assert.equal(streams.length, 1);
  assert.match(streams[0].title, /T01E02/);
  const apiCall = runtime.calls.find((call) => new URL(call.url).pathname === '/api/get_players');
  assert.ok(apiCall);
  const apiUrl = new URL(apiCall.url);
  assert.equal(apiUrl.searchParams.get('season_number'), '1');
  assert.equal(apiUrl.searchParams.get('episode_number'), '2');
  assert.equal(apiUrl.searchParams.get('site_id'), '4');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.3 descarta tipo divergente sem abrir a página', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchTypeMismatch }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.calls.filter((call) => new URL(call.url).pathname.startsWith('/assistir/')).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 descarta ano divergente', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageWrongYear }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 descarta tipo divergente no JSON-LD', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageWrongType }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 resolve ambiguidade como ausência', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchAmbiguous }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 usa h1 e datePublished quando o JSON-LD está vazio', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageFallback }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 página sem título ou ano é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoJsonLd }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[VenoPlay\].*sem ano/);
});

test('2.3 ignora bloco JSON-LD vazio antes do válido', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageEmptyJsonLd }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 página sem mediaId é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ page: pageNoMediaId }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[VenoPlay\].*sem mediaId/);
});

test('2.2 busca sem cartões nem ausência é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchMalformed }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[VenoPlay\].*Busca sem cartões/);
});

test('2.2 busca sem cartões com ausência localizada é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchEmptyPt }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 busca sem cartões com ausência em inglês continua ausência', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchEmpty }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 cartões com mensagem de categoria vazia são processados', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchCardsEmptyCategory }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.space/cache/hls/EXAMPLE.m3u8');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 busca com HTTP 522 é falha HTTP saneada', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ status: 522, body: 'erro de borda' }) }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /\[VenoPlay\].*HTTP 522 em \[url\]/);
  assert.doesNotMatch(runtime.errors[0], /Busca sem cartões/);
});

test('3.2 get_players vazio é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ players: playersEmpty }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(mgebCalls(runtime.calls).length, 0);
});

test('3.2 get_players inválido é erro de contrato', async () => {
  const runtime = makeRuntime(fullRoute({ players: playersInvalid }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[VenoPlay\].*players em lista/);
});

test('3.4 usa mgeb.lat quando mgeb.space responde 403', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url) => (url.hostname === 'mgeb.space'
      ? { status: 403, body: 'bloqueado' }
      : { body: mgebHlsLat }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.lat/cache/hls/EXAMPLE.m3u8');
  assert.equal(runtime.errors.length, 0);
});

test('3.3 aceita HLS em mgeb.lat', async () => {
  const runtime = makeRuntime(fullRoute({
    players: {
      players: [{ name: 'Dublado', url: 'https://mgeb.lat/embed/693134?media_id=693134&site_id=4' }],
    },
    player: mgebHlsLat,
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.lat/cache/hls/EXAMPLE.m3u8');
});

test('3.3 aceita HLS em endpoint .php no host mgeb', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebHlsPhp }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.space/cache/hls/EXAMPLE.php');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].provider, 'MGEB');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test("3.3 preserva Grey's Anatomy com dois HLS .m3u8 no mgeb", async () => {
  const runtime = makeRuntime(fullRoute({
    search: () => ({ body: searchGreys }),
    page: () => ({ body: pageGreys }),
    players: () => ({ body: playersGreys }),
    player: () => ({ body: mgebGreys }),
  }));
  const streams = await runtime.exports.getStreams('1416', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(
    Array.from(streams, (stream) => stream.url).sort(),
    ['https://mgeb.space/cache/hls/GREYS-1.m3u8', 'https://mgeb.space/cache/hls/GREYS-2.m3u8'],
  );
  for (const stream of streams) {
    assert.equal(stream.language, 'Dublado');
    assert.equal(stream.quality, 'Desconhecida');
    assert.equal(stream.provider, 'MGEB');
    assert.equal(stream.type, 'hls');
  }
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.some((call) => new URL(call.url).hostname === 'nhdapi.com'), false);
});

test('3.3 preserva Breaking Bad com um HLS .m3u8 no mgeb', async () => {
  const runtime = makeRuntime(fullRoute({
    search: () => ({ body: searchBreakingBad }),
    page: () => ({ body: pageBreakingBad }),
    players: () => ({ body: playersBreakingBad }),
    player: () => ({ body: mgebBreakingBad }),
  }));
  const streams = await runtime.exports.getStreams('1396', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.space/cache/hls/BREAKING-BAD.m3u8');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.calls.some((call) => new URL(call.url).hostname === 'nhdapi.com'), false);
});

test('3.3 credencial na URL é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebCredential }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 fonte de worker é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebWorker }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 fonte de novix é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebNovix }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 fonte de infrastructuredesign é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebInfra }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 fonte de fontedecanais é triagem', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebFontedecanais }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 sources vazio é ausência', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebEmpty }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.5 sources ausente é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebNoSources }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[VenoPlay\].*sem var sources/);
});

test('3.3 mistura de fontes mantém só o HLS de host comprovado', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebMixed }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://mgeb.space/cache/hls/EXAMPLE.m3u8');
});

test('3.3 fontes repetidas geram um único stream', async () => {
  const runtime = makeRuntime(fullRoute({ player: mgebDuplicate }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
});

test('3.8 logs não contêm URL, token ou credencial', async () => {
  const runtime = makeRuntime(fullRoute({
    players: {
      players: [{ name: 'Dublado', url: 'https://mgeb.space/embed/693134?token=EXEMPLO' }],
    },
    player: () => ({ status: 403, body: 'bloqueado' }),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.ok(runtime.warnings.length > 0);
  assert.ok(runtime.errors.length > 0);
  for (const message of [...runtime.warnings, ...runtime.errors]) {
    assert.equal(message.includes('EXEMPLO'), false);
    assert.equal(message.includes('https://'), false);
  }
});

test('2.1 usa o fallback quando a semente falha', async () => {
  const runtime = makeRuntime(fullRoute({ seed: 'fail' }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(new URL(searchCalls(runtime.calls)[0].url).hostname, 'w2.venoplay.site');
});

test('2.1 usa o host da semente quando não há redirecionamento', async () => {
  const runtime = makeRuntime(fullRoute({ seed: 'no-redirect' }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(new URL(searchCalls(runtime.calls)[0].url).hostname, 'www2.venoplay.com');
});

test('5.1 usa o template Prism quando o build fixa o formato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^❓ Desconhecida/);
  assert.match(streams[0].title, /Duna: Parte Dois \(2024\)/);
});
