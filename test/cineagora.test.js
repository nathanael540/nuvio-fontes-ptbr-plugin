const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'cineagora');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbDuna = readJson('tmdb-duna.json');
const tmdbRentFree = readJson('tmdb-rent-free.json');
const tmdbThePitt = readJson('tmdb-the-pitt.json');
const searchImdbMovie = read('search-imdb-movie.html');
const searchImdbTv = read('search-imdb-tv.html');
const searchImdbRentFree = read('search-imdb-rent-free.html');
const searchTitle = read('search-title.html');
const searchEmpty = read('search-empty.html');
const movieDuna = read('movie-duna.html');
const movieDuna1984 = read('movie-duna-1984.html');
const movieDuna2021 = read('movie-duna-2021.html');
const movieTwoMirrors = read('movie-two-mirrors.html');
const movieTrailerOnly = read('movie-trailer-only.html');
const seriesPage = read('series-page.html');
const watchMovie = read('watch-movie.html');
const watchEpisode = read('watch-episode.html');
const watchTv = read('watch-tv.html');
const watchInvalid = read('watch-invalid.html');
const seriesData = readJson('series-data.json');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

let codes = {};

test.before(async () => {
  const outDir = createTempDir('cineagora-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('cineagora', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('cineagora', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbResponse(url) {
  if (url.pathname.endsWith('/movie/693134')) return { body: tmdbDuna };
  if (url.pathname.endsWith('/movie/1665710')) return { body: tmdbRentFree };
  if (url.pathname.endsWith('/tv/250307')) return { body: tmdbThePitt };
  return { status: 404, body: 'TMDB ausente' };
}

function searchResponse(query) {
  if (query === 'tt15239678') return { body: searchImdbMovie };
  if (query === 'tt31938062') return { body: searchImdbTv };
  if (query === 'tt38066403') return { body: searchImdbRentFree };
  if (query === 'Duna: Parte Dois') return { body: searchTitle };
  return { body: searchEmpty };
}

function fullRoute(overrides = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return typeof overrides.tmdb === 'function' ? overrides.tmdb(url) : tmdbResponse(url);
    }
    if (url.hostname === 'cineagora.club') {
      if (url.pathname === '/index.php') {
        if (overrides.search) {
          return typeof overrides.search === 'function'
            ? overrides.search(url.searchParams.get('story'), url)
            : { body: overrides.search };
        }
        return searchResponse(url.searchParams.get('story'));
      }
      if (overrides.detail) {
        return typeof overrides.detail === 'function' ? overrides.detail(url) : { body: overrides.detail };
      }
      if (url.pathname === '/filmes-hd-online/1163-duna-parte-2.html') return { body: movieDuna };
      if (url.pathname === '/filmes-hd-online/602-duna.html') return { body: movieDuna2021 };
      if (url.pathname === '/filmes-hd-online/1720-duna.html') return { body: movieDuna1984 };
      if (url.pathname === '/filmes-hd-online/3794-rent-free.html') return { body: movieTwoMirrors };
      if (url.pathname === '/series-online-hd-gratis/2797-the-pitt.html') return { body: seriesPage };
      throw new Error(`Rota CineAgora inesperada: ${url.pathname}`);
    }
    if (url.hostname === 'watch.brstream.cc') {
      if (url.pathname === '/fetch_series_data.php') {
        if (overrides.seriesData) {
          return typeof overrides.seriesData === 'function' ? overrides.seriesData(url) : { body: overrides.seriesData };
        }
        return { body: seriesData };
      }
      if (url.pathname === '/tv/the-pitt') return { body: watchTv };
      if (url.pathname === '/watch' || url.pathname === '/watch/') {
        if (overrides.watch) {
          return typeof overrides.watch === 'function' ? overrides.watch(url) : { body: overrides.watch };
        }
        return { body: watchMovie };
      }
      if (url.pathname.startsWith('/watch/')) {
        if (overrides.episodeWatch) {
          return typeof overrides.episodeWatch === 'function' ? overrides.episodeWatch(url) : { body: overrides.episodeWatch };
        }
        return { body: watchEpisode };
      }
      return { status: 404, body: 'player ausente' };
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function replaceAll(html, replacements) {
  return replacements.reduce((text, [from, to]) => text.split(from).join(to), html);
}

function searches(calls) {
  return calls.filter((call) => new URL(call.url).href.startsWith('https://cineagora.club/index.php'));
}

function detailCalls(calls) {
  return calls.filter((call) => {
    const url = new URL(call.url);
    return url.hostname === 'cineagora.club' && url.pathname !== '/index.php';
  });
}

function watchCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === 'watch.brstream.cc');
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

test('2.3 e 5.2 valida entrada antes de qualquer requisição', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  const badId = await runtime.exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(badId), []);
  assert.match(runtime.errors[0], /\[CineAgora\] Falha em movie abc: ID do TMDB inválido/);

  const noSeason = await runtime.exports.getStreams('250307', 'tv', null, 1);
  assert.deepEqual(Array.from(noSeason), []);
  assert.match(runtime.errors[1], /Série sem temporada\/episódio válidos/);

  const fraction = await runtime.exports.getStreams('250307', 'tv', 1, 1.5);
  assert.deepEqual(Array.from(fraction), []);
  assert.match(runtime.errors[2], /Série sem temporada\/episódio válidos/);

  assert.equal(fetchCalled, false);
});

test('2.1, 2.2, 3.1, 3.2, 4.1 e 5.1 resolve filme dublado por IMDb com um espelho', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('693134', 'movie', 1, 2);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(
    stream.url,
    'https://watch.brstream.cc/m3u8/42/0123456789abcdef0123456789abcdef/master.txt?s=1&id=9001&cache=1',
  );
  assert.equal(stream.quality, '720p');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'BrStream');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.headers, undefined);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.size, undefined);
  assert.equal(stream.seeders, undefined);
  assert.equal(stream.peers, undefined);
  assert.equal(stream.format, undefined);
  assert.match(stream.name, /^CineAgora 720p\n/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /🔍 BrStream/);
  assert.match(stream.title, /📁 Duna - Parte 2 2024/);

  // Filme ignora temporada/episódio e confia no IMDb: nenhuma busca por título é feita.
  assert.deepEqual(
    searches(runtime.calls).map((call) => new URL(call.url).searchParams.get('story')),
    ['tt15239678'],
  );
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('5.1 usa o template Prism quando o build fixa o formato', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^💿 HD 720p\n/);
  assert.match(streams[0].title, /🎬 Duna: Parte Dois \(2024\)/);
  assert.match(streams[0].title, /🗣️ Dublado/);
});

test('3.1 e 5.1 filme com dublado e legendado gera dois streams independentes', async () => {
  const legendadoWatch = replaceAll(watchMovie, [
    ['"id":"9001"', '"id":"9003"'],
    ['"uid":"42"', '"uid":"44"'],
    ['"md5":"0123456789abcdef0123456789abcdef"', '"md5":"11111111111111111111111111111111"'],
  ]);
  const runtime = makeRuntime(fullRoute({
    watch: (url) => (url.searchParams.get('v') === 'MOVLEG2' ? { body: legendadoWatch } : { body: watchMovie }),
  }));
  const streams = await runtime.exports.getStreams('1665710', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '720p']);
  assert.equal(streams[0].url, 'https://watch.brstream.cc/m3u8/42/0123456789abcdef0123456789abcdef/master.txt?s=1&id=9001&cache=1');
  assert.equal(streams[1].url, 'https://watch.brstream.cc/m3u8/44/11111111111111111111111111111111/master.txt?s=1&id=9003&cache=1');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.1 somente trailer do YouTube é ausência sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ detail: movieTrailerOnly }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(watchCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('3.1 host desconhecido é descartado sem interromper o espelho BrStream', async () => {
  const withUnknown = movieDuna.replace(
    '<span class="button" role="button" data-link="https://watch.brstream.cc/watch?v=MOVDUB1">',
    '<span class="button" role="button" data-link="https://player.exemplo/e/abc">Outro</span>\n'
      + '<span class="button" role="button" data-link="https://watch.brstream.cc/watch?v=MOVDUB1">',
  );
  const runtime = makeRuntime(fullRoute({ detail: withUnknown }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(watchCalls(runtime.calls).length, 1);
});

test('2.1 usa o título PT-BR quando o IMDb não confirma candidato', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (query) => (query === 'tt15239678' ? { body: searchEmpty } : searchResponse(query)),
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(
    searches(runtime.calls).map((call) => new URL(call.url).searchParams.get('story')),
    ['tt15239678', 'Duna: Parte Dois'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('2.1 usa o título original quando IMDb e título PT-BR não confirmam', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (query) => {
      if (query === 'tt15239678' || query === 'Duna: Parte Dois') return { body: searchEmpty };
      if (query === 'Dune: Part Two') return { body: searchTitle };
      return { body: searchEmpty };
    },
  }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(
    searches(runtime.calls).map((call) => new URL(call.url).searchParams.get('story')),
    ['tt15239678', 'Duna: Parte Dois', 'Dune: Part Two'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('2.1 nenhuma variante encontra o título: lista vazia sem erro', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchEmpty }) }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(searches(runtime.calls).length, 3);
  assert.equal(detailCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 resultado de outra seção é descartado', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: searchImdbTv }) }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 IMDb divergente descarta o candidato', async () => {
  const divergent = movieDuna.replaceAll('tt15239678', 'tt0000001');
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime.calls).length, 4);
  assert.equal(watchCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 ano divergente descarta o candidato', async () => {
  const divergent = replaceAll(movieDuna, [['>2024</a>', '>2023</a>']]);
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(watchCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 título da página divergente descarta o candidato', async () => {
  const divergent = movieDuna.replace('<h1 class="title">Duna - Parte 2</h1>', '<h1 class="title">Titanic</h1>');
  const runtime = makeRuntime(fullRoute({ detail: divergent }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(watchCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 dois candidatos confirmados são ausência por ambiguidade', async () => {
  const twoResults = `<html><body>
    <a class="item" href="https://cineagora.club/filmes-hd-online/1-duna-a.html" data-title="Duna - Parte 2">A</a>
    <a class="item" href="https://cineagora.club/filmes-hd-online/2-duna-b.html" data-title="Duna - Parte 2">B</a>
  </body></html>`;
  const runtime = makeRuntime(fullRoute({ search: twoResults, detail: movieDuna }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(detailCalls(runtime.calls).length, 2);
  assert.equal(watchCalls(runtime.calls).length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 HTTP fora de 2xx na busca é erro registrado e devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[CineAgora\] Falha em movie 693134: HTTP 500/);
});

test('2.1 busca sem cartões nem mensagem de ausência é erro de estrutura', async () => {
  const runtime = makeRuntime(fullRoute({ search: '<html><body>layout novo</body></html>' }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Busca sem cartões nem mensagem explícita de ausência/);
});

test('2.2 e 4.1 série confirma identidade e resolve S01E01 pelas coordenadas', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('250307', 'tv', 1, 1);

  assert.equal(streams.length, 1);
  const stream = streams[0];
  assert.equal(stream.url, 'https://watch.brstream.cc/m3u8/43/fedcba9876543210fedcba9876543210/master.txt?s=1&id=9002&cache=1');
  assert.equal(stream.quality, '720p');
  assert.equal(stream.language, 'Dublado');
  assert.match(stream.title, /📁 The Pitt S01E01/);

  const dataCalls = watchCalls(runtime.calls).filter((call) => new URL(call.url).pathname === '/fetch_series_data.php');
  assert.equal(dataCalls.length, 1);
  assert.equal(new URL(dataCalls[0].url).searchParams.get('seriesSlug'), 'the-pitt');
  assert.ok(watchCalls(runtime.calls).some((call) => new URL(call.url).pathname === '/watch/TESTS1E1'));
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);

  const prismRuntime = makeRuntime(fullRoute(), codes.prism);
  const prismStreams = await prismRuntime.exports.getStreams('250307', 'tv', 1, 1);
  assert.equal(prismStreams.length, 1);
  assert.match(prismStreams[0].title, /🎬 The Pitt \(2025\) T01E01/);
});

test('4.1 série resolve S02E03 pela coordenada, não pela posição', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('250307', 'tv', 2, 3);

  assert.equal(streams.length, 1);
  assert.match(streams[0].title, /The\.Pitt\.S02E03/);
  assert.ok(watchCalls(runtime.calls).some((call) => new URL(call.url).pathname === '/watch/TESTS2E3'));
  assert.deepEqual(runtime.errors, []);
});

test('4.1 temporada ausente e episódio ausente são ausência sem erro', async () => {
  const season = makeRuntime(fullRoute());
  const noSeason = await season.exports.getStreams('250307', 'tv', 9, 1);
  assert.deepEqual(Array.from(noSeason), []);
  assert.deepEqual(season.errors, []);
  assert.deepEqual(season.warnings, []);

  const episode = makeRuntime(fullRoute());
  const noEpisode = await episode.exports.getStreams('250307', 'tv', 1, 9);
  assert.deepEqual(Array.from(noEpisode), []);
  assert.deepEqual(episode.errors, []);
  assert.deepEqual(episode.warnings, []);
});

test('4.1 resposta sem seasons é falha da opção, não ausência', async () => {
  const runtime = makeRuntime(fullRoute({ seriesData: { series: { slug: 'the-pitt' } } }));
  const streams = await runtime.exports.getStreams('250307', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[CineAgora\] Opção Dublado descartada: Resposta da série sem seasons utilizável/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('4.2 video_slug inválido falha a opção', async () => {
  const invalid = {
    ...seriesData,
    seasons: { ...seriesData.seasons, 1: [{ episode_number: '1', episode_title: 'The Pitt', video_slug: 'nao/valido' }] },
  };
  const runtime = makeRuntime(fullRoute({ seriesData: invalid }));
  const streams = await runtime.exports.getStreams('250307', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /video_slug inválido/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('3.2 página de filme sem objeto video falha a opção', async () => {
  const runtime = makeRuntime(fullRoute({ watch: '<html><body>sem player</body></html>' }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /sem objeto video/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('3.2 página Video is not found falha com mensagem reconhecível', async () => {
  const runtime = makeRuntime(fullRoute({ watch: watchInvalid }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.warnings[0], /Video is not found/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('3.2 status inválido e campos fora do formato falham a opção', async () => {
  const inactive = watchMovie.replace('"status":"1"', '"status":"2"');
  const inactiveRuntime = makeRuntime(fullRoute({ watch: inactive }));
  const inactiveStreams = await inactiveRuntime.exports.getStreams('693134', 'movie', null, null);
  assert.deepEqual(Array.from(inactiveStreams), []);
  assert.match(inactiveRuntime.warnings[0], /Vídeo inativo.*status 2/);

  const badMd5 = watchMovie.replace('0123456789abcdef0123456789abcdef', 'xyz');
  const badRuntime = makeRuntime(fullRoute({ watch: badMd5 }));
  const badStreams = await badRuntime.exports.getStreams('693134', 'movie', null, null);
  assert.deepEqual(Array.from(badStreams), []);
  assert.match(badRuntime.warnings[0], /md5 inválido/);

  const badUid = watchMovie.replace('"uid":"42"', '"uid":"abc"');
  const uidRuntime = makeRuntime(fullRoute({ watch: badUid }));
  const uidStreams = await uidRuntime.exports.getStreams('693134', 'movie', null, null);
  assert.deepEqual(Array.from(uidStreams), []);
  assert.match(uidRuntime.warnings[0], /uid inválido/);
});

test('3.3 um espelho falha e o outro resolve, com console.warn da opção descartada', async () => {
  const runtime = makeRuntime(fullRoute({
    watch: (url) => (url.searchParams.get('v') === 'MOVDUB2'
      ? { status: 500, body: 'erro' }
      : { body: watchMovie }),
  }));
  const streams = await runtime.exports.getStreams('1665710', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[CineAgora\] Opção Dublado descartada: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 todos os espelhos falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(fullRoute({ watch: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams('1665710', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.errors[0], /\[CineAgora\] Falha em movie 1665710: Nenhuma opção produziu stream: Opção Dublado: HTTP 500 .*Opção Legendado: HTTP 500/);
});

test('5.1 rótulo desconhecido usa DUAL da release como dublado sem região comprovada', async () => {
  const unknownLabel = movieDuna.replace('>\n\t\t\t\t\t\tDublado\n\t\t\t\t\t</span>', '>\n\t\t\t\t\t\tPlayer\n\t\t\t\t\t</span>');
  const runtime = makeRuntime(fullRoute({ detail: unknownLabel }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado (Não PT-BR?)');
});

test('5.1 qualidade máxima é escolhida mesmo fora de ordem na lista', async () => {
  const reordered = watchMovie.replace('"[\\"720p\\",\\"480p\\",\\"240p\\"]"', '"[\\"240p\\",\\"720p\\",\\"480p\\"]"');
  const runtime = makeRuntime(fullRoute({ watch: reordered }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
});

test('5.1 qualidade não declarada usa a descoberta local', async () => {
  const withoutQuality = watchMovie.replace(',"quality":"[\\"720p\\",\\"480p\\",\\"240p\\"]"', '');
  const runtime = makeRuntime(fullRoute({ watch: withoutQuality }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
});

test('5.1 qualidade inválida cai na descoberta local e sem resolução fica Desconhecida', async () => {
  const invalidQuality = watchMovie.replace('[\\"720p\\",\\"480p\\",\\"240p\\"]', 'nao-json');
  const runtime = makeRuntime(fullRoute({ watch: invalidQuality }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');

  const noResolution = replaceAll(watchMovie, [
    [',"quality":"[\\"720p\\",\\"480p\\",\\"240p\\"]"', ''],
    ['Duna%20-%20Parte%202%202024%20WEB-DL%201080p%20x264%20DUAL%205.1_PT.mkv', 'Duna%20WEB-DL%20DUAL.mkv'],
  ]);
  const unknownRuntime = makeRuntime(fullRoute({ watch: noResolution }));
  const unknownStreams = await unknownRuntime.exports.getStreams('693134', 'movie', null, null);
  assert.equal(unknownStreams.length, 1);
  assert.equal(unknownStreams[0].quality, 'Desconhecida');
});

test('5.2 erro inesperado é registrado com [CineAgora] e devolve lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({ detail: () => { throw new Error('falha simulada'); } }));
  const streams = await runtime.exports.getStreams('693134', 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /\[CineAgora\] Falha em movie 693134: falha simulada/);
});

test('1.2 manifest anuncia filme e série em HLS e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'cineagora');
  assert.ok(entry);
  assert.equal(entry.name, 'CineAgora');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/cineagora.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /filmes e séries/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /cookie|token=|api[_-]?key|expires=|localsubs\/|master\.txt/i, name);
    assert.doesNotMatch(content, /HVP8M2GO|FCBPHGMY|X4DWB92E|F7VHALE3|3156231783935e97c9ac263991fe57cc/, name);
  }
  assert.match(read('watch-movie.html'), /"uid":"42"/);
  assert.match(read('watch-episode.html'), /"uid":"43"/);
  assert.match(read('series-data.json'), /TESTS1E1/);
});
