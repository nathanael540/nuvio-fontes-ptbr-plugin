const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'topfilmes');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdb = readJson('tmdb-24428.json');
const searchVingadores = read('search-vingadores.html');
const searchFallback = read('search-fallback.html');
const searchEmpty = read('search-empty.html');
const searchBroken = read('search-broken.html');
const detailMovie = read('detail-movie.html');
const detailYearMismatch = read('detail-year-mismatch.html');
const detailNoYear = read('detail-no-year.html');
const detailTitleMismatch = read('detail-title-mismatch.html');
const detailNoPlayer = read('detail-no-player.html');
const detailExternalPlayer = read('detail-external-player.html');
const detailLeg = read('detail-leg.html');
const detailTwoPlayers = read('detail-two-players.html');
const detailNoLinks = read('detail-no-links.html');
const playerTwoSources = read('player-two-sources.html');
const playerOneSource = read('player-one-source.html');
const playerDuplicateSource = read('player-duplicate-source.html');
const playerMissingSource = read('player-missing-source.html');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

let codes = {};

test.before(async () => {
  const outDir = createTempDir('topfilmes-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('topfilmes', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('topfilmes', { outDir, formatter: 'prism' }), 'utf8');
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

function searchResponse(query) {
  if (query === 'Os Vingadores') return { body: searchVingadores };
  if (query === 'The Avengers') return { body: searchFallback };
  return { body: searchEmpty };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdb };
    if (url.hostname !== 'topfilmes.biz') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/busca') {
      if (overrides.search) return overrides.search(url);
      return searchResponse(url.searchParams.get('q'));
    }
    if (url.pathname.startsWith('/player/')) {
      if (overrides.player) return overrides.player(url);
      const player = url.searchParams.get('player');
      if (player === '1') return { body: playerTwoSources };
      if (player === '2') return { body: playerOneSource };
      if (player === '3') return { body: playerDuplicateSource };
      if (player === '4') return { body: playerMissingSource };
      return { status: 404, body: 'player ausente' };
    }
    if (url.pathname.startsWith('/assistir/')) {
      if (overrides.detail) {
        return typeof overrides.detail === 'function' ? overrides.detail(url) : { body: overrides.detail };
      }
      return { body: detailMovie };
    }
    throw new Error(`Rota TopFilmes inesperada: ${url.pathname}`);
  };
}

function searchCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname === '/busca');
}

function playerCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/player/'));
}

function detailCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/assistir/'));
}

function qualities(streams) {
  return Array.from(streams, (stream) => stream.quality);
}

test('1.1 e 4.1 carrega o pacote sem rede e devolve lista vazia para série', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);

  const tv = await runtime.exports.getStreams('24428', 'tv', 1, 1);
  assert.deepEqual(Array.from(tv), []);
  assert.equal(fetchCalled, false);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.1, 2.2, 2.3, 3.1, 3.2 e 3.3 resolve o filme dublado com duas qualidades', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('24428', 'movie', 1, 2);

  assert.equal(streams.length, 2);
  assert.deepEqual(qualities(streams), ['720p', '360p']);
  assert.equal(streams[0].url, 'https://topfilmes.biz/direct/mf/fixture/abc/hd');
  assert.equal(streams[1].url, 'https://topfilmes.biz/direct/mf/fixture/abc/sd');
  for (const stream of streams) {
    assert.equal(stream.language, 'Dublado');
    assert.equal(stream.provider, 'MediaFire');
    assert.equal(stream.type, 'mp4');
    assert.equal(stream.headers, undefined);
    assert.equal(stream.size, undefined);
    assert.equal(stream.subtitles, undefined);
    assert.equal(stream.format, undefined);
    assert.match(stream.name, /^TopFilmes (720p|360p)\n/);
    assert.match(stream.title, /🗣️ Dublado/);
  }

  const searches = searchCalls(runtime.calls);
  assert.equal(searches.length, 1);
  assert.equal(new URL(searches[0].url).searchParams.get('q'), 'Os Vingadores');
  // O link repetido na ficha é deduplicado antes da consulta.
  assert.equal(playerCalls(runtime.calls).length, 1);
  assert.equal(detailCalls(runtime.calls).length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 usa o título original quando o título PT-BR não confirma candidato', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (url) => {
      const query = url.searchParams.get('q');
      if (query === 'Os Vingadores') return { body: searchEmpty };
      return searchResponse(query);
    },
  }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('q')),
    ['Os Vingadores', 'The Avengers'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('2.2 busca vazia em todos os termos é ausência sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchEmpty }) }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('q')),
    ['Os Vingadores', 'The Avengers', 'Vingadores', 'Avengers'],
  );
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.4 layout da busca alterado e HTTP fora de 2xx são fatais', async () => {
  const broken = makeRuntime(fullRoute({ search: () => ({ body: searchBroken }) }));
  const brokenStreams = await broken.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(brokenStreams), []);
  assert.match(broken.errors[0], /\[TopFilmes\] Falha em movie 24428: Busca sem o contêiner \.filmes/);

  const http = makeRuntime(fullRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const httpStreams = await http.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(httpStreams), []);
  assert.match(http.errors[0], /\[TopFilmes\] Falha em movie 24428: HTTP 500/);
});

test('2.3 ano da ficha incompatível descarta o candidato sem consultar player', async () => {
  const runtime = makeRuntime(fullRoute({ detail: detailYearMismatch }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.3 ficha sem ano mantém o ano do cartão e o título do TMDB no formatador', async () => {
  const runtime = makeRuntime(fullRoute({ detail: detailNoYear }), codes.prism);
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.match(streams[0].title, /🎬 Os Vingadores \(2012\)/);
  assert.match(streams[0].name, /^💿 HD 720p\n/);
});

test('2.3 título da ficha incompatível descarta o candidato sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ detail: detailTitleMismatch }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('3.1 ficha sem player e embed externo são ausência sem erro', async () => {
  for (const detail of [detailNoPlayer, detailExternalPlayer]) {
    const runtime = makeRuntime(fullRoute({ detail }));
    const streams = await runtime.exports.getStreams('24428', 'movie', null, null);
    assert.deepEqual(Array.from(streams), []);
    assert.equal(playerCalls(runtime.calls).length, 0);
    assert.deepEqual(runtime.errors, []);
    assert.deepEqual(runtime.warnings, []);
  }
});

test('3.1 ficha sem contêiner de links é erro de layout', async () => {
  const runtime = makeRuntime(fullRoute({ detail: detailNoLinks }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(playerCalls(runtime.calls).length, 0);
  assert.match(runtime.errors[0], /Ficha .* sem o contêiner \.links/);
});

test('3.1 player legendado usa o contêiner .links_leg', async () => {
  const runtime = makeRuntime(fullRoute({ detail: detailLeg }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(new URL(playerCalls(runtime.calls)[0].url).searchParams.get('player'), '2');
  assert.deepEqual(runtime.errors, []);
});

test('3.2 um source e source repetido produzem as qualidades esperadas', async () => {
  const one = makeRuntime(fullRoute({ detail: detailLeg }));
  const oneStreams = await one.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(qualities(oneStreams), ['720p']);

  const duplicate = makeRuntime(fullRoute({
    player: () => ({ body: playerDuplicateSource }),
  }));
  const duplicateStreams = await duplicate.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(qualities(duplicateStreams), ['720p']);
  assert.equal(duplicateStreams.length, 1);

  const repeatedAcrossPlayers = makeRuntime(fullRoute({
    detail: detailTwoPlayers,
    player: () => ({ body: playerTwoSources }),
  }));
  const repeatedStreams = await repeatedAcrossPlayers.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(qualities(repeatedStreams), ['720p', '360p']);
  assert.equal(repeatedStreams.length, 2);
});

test('3.2 source sem size é preservado com qualidade Desconhecida', async () => {
  const withoutSize = '<video id="player"><source src="//topfilmes.biz/direct/mf/fixture/nohd" type="video/mp4"></video>';
  const runtime = makeRuntime(fullRoute({ player: () => ({ body: withoutSize }) }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].type, 'mp4');
});

test('3.4 um player com falha preserva o outro e registra console.warn', async () => {
  const runtime = makeRuntime(fullRoute({
    detail: detailTwoPlayers,
    player: (url) => (url.searchParams.get('player') === '1'
      ? { status: 500, body: 'erro' }
      : { body: playerOneSource }),
  }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(playerCalls(runtime.calls).length, 2);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[TopFilmes\] Opção 1 \(Dublado\) descartada: Player 1: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('3.4 e 4.2 todos os players com falha devolvem lista vazia e console.error', async () => {
  const runtime = makeRuntime(fullRoute({
    detail: detailTwoPlayers,
    player: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(
    runtime.errors[0],
    /\[TopFilmes\] Falha em movie 24428: Nenhuma opção produziu stream: Opção 1 \(Dublado\): Player 1: HTTP 500; Opção 2 \(Dublado\): Player 2: HTTP 500/,
  );
});

test('3.4 e 4.3 mensagem de source inválido não expõe URL de mídia nem parâmetro de validade', async () => {
  const signed = `https://topfilmes.biz/direct/mf/fixture/x?${'expires'}=segredo`;
  const withSignedSource = `<video id="player"><source src="${signed}" size="720" type="video/mp4"><source size="360" type="video/mp4"></video>`;
  const runtime = makeRuntime(fullRoute({ player: () => ({ body: withSignedSource }) }));
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Source 2 do player 1 sem src/);
  const messages = runtime.errors.concat(runtime.warnings).join('\n');
  assert.doesNotMatch(messages, /expires/);
  assert.doesNotMatch(messages, new RegExp(signed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('3.4 player sem source falha isoladamente e a ficha sem contêiner é fatal', async () => {
  const missing = makeRuntime(fullRoute({ player: () => ({ body: playerMissingSource }) }));
  const missingStreams = await missing.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(missingStreams), []);
  assert.match(missing.warnings[0], /Player 1 sem <source>/);
  assert.match(missing.errors[0], /Nenhuma opção produziu stream/);

  const detailError = makeRuntime(fullRoute({ detail: () => ({ status: 500, body: 'erro' }) }));
  const detailStreams = await detailError.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(detailStreams), []);
  assert.equal(playerCalls(detailError.calls).length, 0);
  assert.match(detailError.errors[0], /HTTP 500/);
});

test('4.3 ausência reconhecida não registra console.error', async () => {
  const empty = makeRuntime(fullRoute({ search: () => ({ body: searchEmpty }) }));
  const emptyStreams = await empty.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(emptyStreams), []);
  assert.deepEqual(empty.errors, []);

  const noPlayer = makeRuntime(fullRoute({ detail: detailNoPlayer }));
  const noPlayerStreams = await noPlayer.exports.getStreams('24428', 'movie', null, null);
  assert.deepEqual(Array.from(noPlayerStreams), []);
  assert.deepEqual(noPlayer.errors, []);
});

test('3.3 e 8.2 contrato do stream não inventa campos e ordena por qualidade', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('24428', 'movie', null, null);

  assert.deepEqual(qualities(streams), ['720p', '360p']);
  for (const stream of streams) {
    assert.match(stream.url, /^https:\/\/topfilmes\.biz\/direct\/mf\/fixture\/abc\//);
    assert.match(stream.quality, /^(360|720)p$/);
    assert.ok(['Dublado', 'Legendado'].includes(stream.language));
    assert.equal(stream.provider, 'MediaFire');
    assert.equal(stream.type, 'mp4');
    assert.equal(typeof stream.name, 'string');
    assert.equal(typeof stream.title, 'string');
    assert.equal(stream.name.length > 0, true);
    assert.equal(stream.title.length > 0, true);
  }
});

test('1.2 manifest anuncia somente filme em MP4 e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'topfilmes');
  assert.ok(entry);
  assert.equal(entry.name, 'TopFilmes');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /expires=|mediafire\.com|cookie|token=|api[_-]?key/i, name);
  }
});
