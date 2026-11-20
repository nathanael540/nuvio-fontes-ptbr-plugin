const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'redecanais-deals');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbUltron = readJson('tmdb-ultron.json');
const tmdbTlou = readJson('tmdb-tlou.json');
const tmdbFightClub = readJson('tmdb-fight-club.json');

const searchUltron = read('search-ultron.html');
const searchTlou = read('search-tlou.html');
const searchEmpty = read('search-empty.html');
const searchNoMarker = read('search-no-marker.html');

const movieUltron = read('movie-ultron.html');
const seriesTlou = read('series-tlou.html');
const episodeTlouS1E1 = read('episode-tlou-s1e1.html');
const episodeTlouS2E1 = read('episode-tlou-s2e1.html');
const playerMovie = read('player-movie.html');
const playerSeriesS1E1 = read('player-series-s1e1.html');
const playerSeriesS2E1 = read('player-series-s2e1.html');
const playerNoSource = read('player-no-source.html');
const resolveDub = readJson('resolve-dub.json');
const resolveLeg = readJson('resolve-leg.json');
const resolveNoAudio = readJson('resolve-no-audio.json');
const resolveNotOk = readJson('resolve-not-ok.json');
const resolveNoSrc = readJson('resolve-no-src.json');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'manifest.json'), 'utf8'));

const PATH_ULTRON = '/vingadores-era-de-ultron-2015-1080p_000000ce0.html';
const PATH_TLOU = '/the-last-of-us-lista-de-episodios_0000091af.html';
const PATH_EP_TLOU_S1E1 = '/the-last-of-us-1a-temporada-episodio-01_03b9fc64e.html';
const PATH_EP_TLOU_S2E1 = '/the-last-of-us-2a-temporada-episodio-01_03b9fc657.html';
const URL_ULTRON = 'https://media.exemplo.test/videos-veo/m/Vingadores_Era_de_Ultron_2015_tmdb_99861.mp4';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('redecanais-deals-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('redecanais-deals', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('redecanais-deals', { outDir, formatter: 'prism' }), 'utf8');
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
  if (url.pathname.endsWith('/movie/99861')) return { body: tmdbUltron };
  if (url.pathname.endsWith('/movie/550')) return { body: tmdbFightClub };
  if (url.pathname.endsWith('/tv/100088')) return { body: tmdbTlou };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(query, overrides = {}) {
  if (overrides.search) {
    return typeof overrides.search === 'function' ? overrides.search(query) : { body: overrides.search };
  }
  if (query === 'Vingadores: Era de Ultron') return { body: searchUltron };
  if (query === 'The Last of Us') return { body: searchTlou };
  return { body: searchEmpty };
}

function detailResponse(url, overrides = {}) {
  if (overrides.detail) {
    return typeof overrides.detail === 'function' ? overrides.detail(url) : { body: overrides.detail };
  }
  const pathname = url.pathname;
  if (pathname === PATH_ULTRON) return { body: movieUltron };
  if (pathname === PATH_TLOU) return { body: seriesTlou };
  if (pathname === PATH_EP_TLOU_S1E1) return { body: episodeTlouS1E1 };
  if (pathname === PATH_EP_TLOU_S2E1) return { body: episodeTlouS2E1 };
  return { status: 404, body: 'ficha ausente' };
}

function playerResponse(url, overrides = {}) {
  if (url.searchParams.get('action') === 'resolve') {
    if (overrides.resolve) {
      return typeof overrides.resolve === 'function' ? overrides.resolve(url) : { body: overrides.resolve };
    }
    return { body: resolveDub };
  }
  if (overrides.playerPage) {
    return typeof overrides.playerPage === 'function' ? overrides.playerPage(url) : { body: overrides.playerPage };
  }
  const server = url.searchParams.get('server');
  if (server !== null && server !== 'XT') return { status: 403, body: 'proibido' };
  const vid = url.searchParams.get('vid');
  if (vid === 'm99861.mp4') return { body: playerMovie };
  if (vid === 'e100088-1-1.mp4') return { body: playerSeriesS1E1 };
  if (vid === 'e100088-2-1.mp4') return { body: playerSeriesS2E1 };
  return { status: 404, body: 'player ausente' };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') return tmdbResponse(url, overrides);
    if (url.hostname !== 'redecanais.deals') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/search.php') return searchResponse(url.searchParams.get('keywords'), overrides);
    if (url.pathname === '/player3/server.php') return playerResponse(url, overrides);
    return detailResponse(url, overrides);
  };
}

function searches(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.deals' && url.pathname === '/search.php';
  });
}

function detailCalls(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.deals' && url.pathname !== '/search.php' && url.pathname !== '/player3/server.php';
  });
}

function playerCalls(runtime) {
  return runtime.calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'redecanais.deals' && url.pathname === '/player3/server.php';
  });
}

function replaceAll(text, pairs) {
  return pairs.reduce((value, [from, to]) => value.split(from).join(to), text);
}

function twoCardSearch(first, second) {
  return `<html><head><title>Buscar Conteúdo RedeCanais: Vingadores</title></head><body>
<div class="listagem" aria-live="polite"><div><span style="color:#fff;">${first.title}</span> - <a href="${first.href}" target="_blank" rel="noopener">Acessar</a></div><div><span style="color:#fff;">${second.title}</span> - <a href="${second.href}" target="_blank" rel="noopener">Acessar</a></div></div><div id="search-pagination"></div>
</body></html>`;
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
  const runtime = makeRuntime(fullRoute());
  const invalidId = await runtime.exports.getStreams('abc', 'movie', null, null);
  const invalidType = await runtime.exports.getStreams('99861', 'person', null, null);
  const invalidSeason = await runtime.exports.getStreams('100088', 'tv', null, 1);

  assert.deepEqual(Array.from(invalidId), []);
  assert.deepEqual(Array.from(invalidType), []);
  assert.deepEqual(Array.from(invalidSeason), []);
  assert.equal(runtime.calls.length, 0);
  assert.match(runtime.errors[0], /\[RedeCanais Deals\] Falha em movie abc: tmdbId inválido/);
  assert.match(runtime.errors[1], /mediaType inválido/);
  assert.match(runtime.errors[2], /Série sem temporada\/episódio válidos/);
});

test('1.2 manifest anuncia filme e série em MP4 e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'redecanais-deals');
  assert.ok(entry);
  assert.equal(entry.name, 'RedeCanais Deals');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/redecanais-deals.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes e séries/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /X-Amz-|download\.php|cookie|\bexp=|\bsig=|token=|api[_-]?key/i, name);
    assert.doesNotMatch(content, /redecanais\.(lt|phd|by|in)\b/i, name);
  }
});

test('1.4 e 2.2 filme dublado resolve pelo domínio único, com encodeURIComponent e sem rede fora da fonte', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('99861', 'movie', 1, 2);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, URL_ULTRON);
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'XT');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.headers, undefined);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.size, undefined);
  assert.equal(stream.format, undefined);
  assert.match(stream.name, /^RedeCanais Deals 1080p\n/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /🔍 XT/);

  const firstSearch = new URL(searches(runtime)[0].url);
  assert.equal(firstSearch.searchParams.get('keywords'), 'Vingadores: Era de Ultron');
  assert.match(firstSearch.search, /Vingadores%3A%20Era%20de%20Ultron/);

  for (const call of runtime.calls) {
    const url = new URL(call.url);
    assert.ok(
      url.hostname === 'api.themoviedb.org' || url.hostname === 'redecanais.deals',
      `requisição fora da fonte: ${url.hostname}`,
    );
    assert.doesNotMatch(url.hostname, /redecanais\.(lt|phd|by|in)$/);
  }
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 deduplica os termos e limita a busca a oito', async () => {
  const many = {
    ...tmdbFightClub,
    alternative_titles: {
      titles: [
        { iso_3166_1: 'BR', title: 'Clube da Luta' },
        { iso_3166_1: 'BR', title: 'clube da luta' },
        { iso_3166_1: 'BR', title: 'Fight Club' },
        { iso_3166_1: 'BR', title: 'Clube de Combate' },
        { iso_3166_1: 'BR', title: 'Clube da Pancadaria' },
        { iso_3166_1: 'BR', title: 'Clube da Luta 2' },
        { iso_3166_1: 'BR', title: 'Clube da Luta 3' },
        { iso_3166_1: 'BR', title: 'Clube da Luta 4' },
        { iso_3166_1: 'BR', title: 'Clube da Luta 5' },
        { iso_3166_1: 'BR', title: 'Clube da Luta 6' },
      ],
    },
  };
  const runtime = makeRuntime(fullRoute({
    search: () => ({ body: searchEmpty }),
    tmdb: (url) => (url.pathname.endsWith('/movie/550') ? { body: many } : { status: 404 }),
  }));
  const streams = await runtime.exports.getStreams('550', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  const terms = searches(runtime).map((call) => new URL(call.url).searchParams.get('keywords'));
  assert.equal(terms.length, 8);
  assert.deepEqual(terms, [
    'Clube da Luta',
    'Fight Club',
    'Clube de Combate',
    'Clube da Pancadaria',
    'Clube da Luta 2',
    'Clube da Luta 3',
    'Clube da Luta 4',
    'Clube da Luta 5',
  ]);
});

test('2.2 busca válida sem resultado é ausência e não abre ficha', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('550', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(searches(runtime).length, 2);
  assert.equal(detailCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 página sem o título de busca é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchNoMarker }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais Deals\] Falha em movie 99861: Busca sem o título de resultados/);
});

test('2.3 cartão de série é descartado em pedido de filme sem abrir a ficha', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchTlou }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 cartão de filme é descartado em pedido de série sem abrir a ficha', async () => {
  const runtime = makeRuntime(fullRoute({ search: searchUltron }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.3 cartão de série abre a página da série no pedido de série', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.ok(detailCalls(runtime).some((call) => new URL(call.url).pathname === PATH_TLOU));
});

test('2.4 série confirma pelo h1 sem ano, seleciona o par publicado e resolve o player', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].provider, 'XT');
  assert.equal(streams[0].type, 'mp4');
  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('100088', 'tv', 1, 1);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /🎬 The Last of Us \(2023\) T01E01/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.4 ano divergente descarta o candidato sem erro', async () => {
  const divergent = movieUltron.replace(
    '<h1>Vingadores: Era de Ultron - 2015 (Dublado) - 1080p</h1>',
    '<h1>Vingadores: Era de Ultron - 1999 (Dublado) - 1080p</h1>',
  );
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 ficha sem ano mantém o ano do cartão e não descarta', async () => {
  const noYear = movieUltron.replace(
    '<h1>Vingadores: Era de Ultron - 2015 (Dublado) - 1080p</h1>',
    '<h1>Vingadores: Era de Ultron (Dublado) - 1080p</h1>',
  );
  const runtime = makeRuntime(fullRoute({ detail: noYear }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  const prismRuntime = makeRuntime(fullRoute({ detail: noYear }), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('99861', 'movie', null, null);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /🎬 Vingadores: Era de Ultron \(2015\)/);
});

test('2.4 título divergente descarta o candidato sem erro', async () => {
  const divergent = movieUltron.replace(
    '<h1>Vingadores: Era de Ultron - 2015 (Dublado) - 1080p</h1>',
    '<h1>Titanic - 2015 (Dublado) - 1080p</h1>',
  );
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.1 e 3.2 seleciona a temporada 2 pelo par do href, não pela posição', async () => {
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

test('3.1 link absoluto do episódio continua sendo usado', async () => {
  const absolute = seriesTlou.replace(
    `href="${PATH_EP_TLOU_S1E1}"`,
    `href="https://redecanais.deals${PATH_EP_TLOU_S1E1}"`,
  );
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_TLOU ? { body: absolute } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.ok(detailCalls(runtime).some((call) => new URL(call.url).pathname === PATH_EP_TLOU_S1E1));
});

test('3.2 par não publicado é ausência sem erro', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('100088', 'tv', 9, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.3 h1 do episódio com coordenadas divergentes descarta a opção sem erro', async () => {
  const divergent = episodeTlouS1E1.replace(
    '<h1>The Last of Us - 1ª Temporada - Episódio 01</h1>',
    '<h1>The Last of Us - 1ª Temporada - Episódio 02</h1>',
  );
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_EP_TLOU_S1E1 ? { body: divergent } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 série sem lista de episódios é erro de estrutura', async () => {
  const withoutList = seriesTlou.replace(
    /<div class="pm-category-description">[\s\S]*?<\/div>/,
    '<div class="pm-category-description"><p>Sinopse sem episódios.</p></div>',
  );
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_TLOU ? { body: withoutList } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais Deals\].*sem lista de episódios/);
});

test('4.1 ficha sem iframe Player falha isoladamente com aviso', async () => {
  const withoutFrame = movieUltron.replace(/<iframe name="Player"[\s\S]*?<\/iframe>/, '');
  const runtime = makeRuntime(fullRoute({ detail: withoutFrame }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Opção Vingadores: Era de Ultron 1080p: Ficha sem iframe Player/);
});

test('4.1 player sem SOURCE_URL falha isoladamente com aviso', async () => {
  const runtime = makeRuntime(fullRoute({ playerPage: playerNoSource }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Opção Vingadores: Era de Ultron 1080p: Player sem SOURCE_URL/);
});

test('4.2 vid divergente do TMDB descarta o candidato sem abrir o player', async () => {
  const divergent = movieUltron.replace('vid=m99861.mp4', 'vid=m99999.mp4');
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('4.2 vid de série com temporada ou episódio divergente descarta o candidato', async () => {
  const divergent = episodeTlouS1E1.replace('vid=e100088-1-1.mp4', 'vid=e100088-1-2.mp4');
  const runtime = makeRuntime(fullRoute({
    detail: (url) => (url.pathname === PATH_EP_TLOU_S1E1 ? { body: divergent } : detailResponse(url)),
  }));
  const streams = await runtime.exports.getStreams('100088', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('4.3 resolve com ok falso falha a opção', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: resolveNotOk }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Resolve recusou a mídia \(ok=false\)/);
});

test('4.3 resolve sem src falha a opção', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: resolveNoSrc }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Resolve sem src/);
});

test('4.3 JSON inválido no resolve falha a opção', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: () => ({ body: 'nao-json' }) }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Resposta não é JSON válido/);
});

test('4.3 HTTP fora de 2xx no resolve falha a opção', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /HTTP 500/);
});

test('4.4 download com audio=leg classifica como Legendado', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: resolveLeg }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
});

test('4.4 fachada ?audio=leg com download dub continua Dublado', async () => {
  const legPage = replaceAll(movieUltron, [['(Dublado)', '(Legendado)'], ['audio=dub', 'audio=leg']]);
  const legPlayer = playerMovie.replace('audio=dub', 'audio=leg');
  const runtime = makeRuntime(fullRoute({
    detail: legPage,
    playerPage: legPlayer,
  }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
});

test('4.4 resolve sem marcador de áudio sai Idioma Desconhecido', async () => {
  const runtime = makeRuntime(fullRoute({ resolve: resolveNoAudio }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Idioma Desconhecido');
});

test('5.1 qualidade ausente cai na descoberta local e sai Desconhecida', async () => {
  const noQualitySearch = searchUltron.replace(' - 1080p', '');
  const noQualityMovie = movieUltron.replace(
    '<h1>Vingadores: Era de Ultron - 2015 (Dublado) - 1080p</h1>',
    '<h1>Vingadores: Era de Ultron - 2015 (Dublado)</h1>',
  );
  const runtime = makeRuntime(fullRoute({ search: noQualitySearch, detail: noQualityMovie }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
});

test('5.1 mesmo vid e mesmo áudio viram um único stream', async () => {
  const cards = twoCardSearch(
    { href: '/vingadores-era-de-ultron-a_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
    { href: '/vingadores-era-de-ultron-b_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
  );
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => (url.pathname.endsWith('_000000ce0.html') ? { body: movieUltron } : { status: 404 }),
    playerPage: playerMovie,
  }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
});

test('5.2 uma opção falha e a outra entrega stream, com aviso da descartada', async () => {
  const cards = twoCardSearch(
    { href: '/vingadores-era-de-ultron-xx_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
    { href: '/vingadores-era-de-ultron-xt_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
  );
  const failing = movieUltron.replace('server=XT', 'server=XX');
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/vingadores-era-de-ultron-xx_000000ce0.html') return { body: failing };
      if (url.pathname === '/vingadores-era-de-ultron-xt_000000ce0.html') return { body: movieUltron };
      return { status: 404, body: 'ausente' };
    },
  }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'XT');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[RedeCanais Deals\] Opção Vingadores: Era de Ultron 1080p descartada: HTTP 403/);
  assert.deepEqual(runtime.errors, []);
});

test('5.2 todas as opções falham e o erro agregado sobe', async () => {
  const cards = twoCardSearch(
    { href: '/vingadores-era-de-ultron-xx_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
    { href: '/vingadores-era-de-ultron-yy_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
  );
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/vingadores-era-de-ultron-xx_000000ce0.html') {
        return { body: movieUltron.replace('server=XT', 'server=XX') };
      }
      if (url.pathname === '/vingadores-era-de-ultron-yy_000000ce0.html') {
        return { body: movieUltron.replace('server=XT', 'server=YY') };
      }
      return { status: 404, body: 'ausente' };
    },
  }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Opção Vingadores: Era de Ultron 1080p: HTTP 403/);
  assert.equal(runtime.errors[0].match(/HTTP 403/g).length, 2);
});

test('5.2 candidato 404 é removido e os demais continuam', async () => {
  const cards = twoCardSearch(
    { href: '/vingadores-era-de-ultron-404_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
    { href: '/vingadores-era-de-ultron-ok_000000ce0.html', title: 'Vingadores: Era de Ultron - 2015 - 1080p (Dublado)' },
  );
  const runtime = makeRuntime(fullRoute({
    search: cards,
    detail: (url) => {
      if (url.pathname === '/vingadores-era-de-ultron-ok_000000ce0.html') return { body: movieUltron };
      return { status: 404, body: 'ausente' };
    },
  }));
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('5.2 erro inesperado é registrado com [RedeCanais Deals] e devolve lista vazia', async () => {
  const runtime = makeRuntime(async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdbUltron };
    throw new Error('falha simulada');
  });
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[RedeCanais Deals\] Falha em movie 99861: falha simulada/);
});

test('1.2 template Prism é usado quando o build fixa o formato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('99861', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^🚀 FHD 1080p\n/);
  assert.match(streams[0].title, /🎬 Vingadores: Era de Ultron \(2015\)/);
});
