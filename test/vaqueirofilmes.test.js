const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'vaqueirofilmes');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdb = readJson('tmdb-9320.json');
const search = readJson('search-os-vingadores.json');
const movie1998 = read('movie-os-vingadores.html');
const movie2012 = read('movie-os-vingadores-2012.html');
const movieMismatch = read('movie-mismatch.html');
const movieSeries = read('movie-serie.html');
const movieTheAvengers = read('movie-the-avengers.html');
const video0 = read('movie-video-0.html');
const video0WithoutEmbed = read('movie-video-0-without-embedplay.html');
const video1 = read('movie-video-1.html');
const video1WrongHost = read('movie-video-1-wrong-host.html');
const embedHtml = read('embedplayapi-embed.html');
const linkJson = readJson('embedplay-link.json');
const linkRefused = readJson('embedplay-link-refused.json');
const vipHtml = read('embedplay-vip.html');
const playerByse = readJson('embedplay-player-byse.json');
const playerAbyss = readJson('embedplay-player-abyss.json');
const playerError = readJson('embedplay-player-error.json');
const byseReal = readJson('byse-avengers.json');
const byseNoSources = readJson('byse-no-sources.json');
const byseWithTracks = readJson('byse-with-tracks.json');
const byseUnknownQuality = readJson('byse-unknown-quality.json');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const KEY_A = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const KEY_B = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
const IV = Buffer.from('000102030405060708090a0b', 'hex');

let codes = {};

test.before(async () => {
  const outDir = createTempDir('vaqueirofilmes-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('vaqueirofilmes', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('vaqueirofilmes', { outDir, formatter: 'prism' }), 'utf8');
    const result = await esbuild.build({
      entryPoints: ['src/vaqueirofilmes/byse.js'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      external: ['crypto-js'],
    });
    codes.byse = result.outputFiles[0].text;
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
      if (name === 'crypto-js') return require('crypto-js');
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

function videoUrl(code) {
  return `https://embedplaybyse.top/e/${code}/fixture`;
}

function defaultPlayer(init) {
  const videoId = new URLSearchParams(init.body || '').get('video_id');
  if (videoId === '289055') {
    return { body: { ...playerByse, data: { ...playerByse.data, video_url: videoUrl('bgpzmj9gpspd') } } };
  }
  if (videoId === '289054' || videoId === '289056') return { body: playerAbyss };
  return { body: playerError };
}

function byseResponse(url) {
  const segments = url.pathname.split('/').filter(Boolean);
  const code = segments[segments.length - 1];
  if (code === 'bgpzmj9gpspd') return { body: byseReal };
  if (code === 'testcomlegendas') return { body: byseWithTracks };
  if (code === 'testequalidade') return { body: byseUnknownQuality };
  if (code === 'testsemfontes') return { body: byseNoSources };
  return undefined;
}

function fullRoute(overrides = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') return { body: tmdb };
    if (url.hostname === 'vaqueirofilmes.com') {
      if (url.pathname === '/wp-json/wp/v2/search') {
        return overrides.search ? overrides.search(url, init) : { body: search };
      }
      if (overrides.pages && overrides.pages[url.pathname]) {
        return { body: overrides.pages[url.pathname] };
      }
      if (url.pathname === '/pt/movie/os-vingadores/') {
        if (url.searchParams.get('video') === '0') return { body: overrides.video0 || video0 };
        if (url.searchParams.get('video') === '1') return { body: overrides.video1 || video1 };
        return { body: movie1998 };
      }
      if (url.pathname === '/pt/movie/os-vingadores-the-avengers/') return { body: movie2012 };
      if (url.pathname === '/pt/movie/the-avengers/') return { body: movieTheAvengers };
      if (url.pathname === '/pt/movie/serie/') return { body: movieSeries };
      if (url.pathname.startsWith('/pt/movie/')) return { body: movieMismatch };
      throw new Error(`Rota Vaqueiro inesperada: ${url.href}`);
    }
    if (url.hostname === 'embedplayapi.top') {
      if (url.pathname === '/embed/9320') return { body: embedHtml };
      if (url.pathname === '/ajax/get_stream_link') return overrides.link || { body: linkJson };
      throw new Error(`Rota EmbedPlay inesperada: ${url.href}`);
    }
    if (url.hostname === 'embedplay.vip') {
      if (url.pathname === '/filme/tt0118661') return { body: overrides.options || vipHtml };
      if (url.pathname === '/api') return overrides.player ? overrides.player(url, init) : { body: defaultPlayer(init).body };
      throw new Error(`Rota embedplay.vip inesperada: ${url.href}`);
    }
    if (url.hostname === 'embedplaybyse.top') {
      if (url.pathname.startsWith('/api/videos/')) {
        if (overrides.byse) return overrides.byse(url, init);
        const response = byseResponse(url);
        if (response) return response;
      }
      throw new Error(`Rota Byse inesperada: ${url.href}`);
    }
    throw new Error(`Host inesperado: ${url.href}`);
  };
}

function searchCalls(calls) {
  return calls.filter((call) => call.url.includes('/wp-json/wp/v2/search'));
}

function videoCalls(calls, option) {
  return calls.filter((call) => new URL(call.url).searchParams.get('video') === option);
}

function playerCalls(calls) {
  return calls.filter((call) => call.url === 'https://embedplay.vip/api');
}

test('1.1 e 2.3 carrega o pacote sem rede, recusa tv e valida a entrada de filme', async () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });

  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);

  const tv = await runtime.exports.getStreams('1396', 'tv', 1, 1);
  assert.deepEqual(Array.from(tv), []);
  assert.equal(fetchCalled, false);
  assert.ok(runtime.warnings.some((warning) => /\[VaqueiroFilmes\] Pedido tv recusado/.test(warning)));

  const invalidId = await runtime.exports.getStreams('abc', 'movie', null, null);
  assert.deepEqual(Array.from(invalidId), []);
  assert.equal(fetchCalled, false);
  assert.match(runtime.errors[0], /\[VaqueiroFilmes\] Entrada: ID do TMDB inválido/);

  const invalidType = await runtime.exports.getStreams('9320', 'anime', null, null);
  assert.deepEqual(Array.from(invalidType), []);
  assert.equal(fetchCalled, false);
  assert.match(runtime.errors[1], /Tipo de mídia inválido/);
});

test('2.1, 2.2 e 3.x busca PT-BR e resolve a cadeia completa até o HLS dublado', async () => {
  const runtime = makeRuntime(fullRoute());
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].type, 'hls');
  assert.match(streams[0].url, /^https:\/\/edge1-madrid-sprintcdn\.r66nv9ed\.com\/hls2\//);
  assert.equal(streams[0].headers.Referer, videoUrl('bgpzmj9gpspd'));
  assert.match(streams[0].name, /^VaqueiroFilmes 1080p/);
  assert.equal(streams[0].subtitles, undefined);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);

  const searches = searchCalls(runtime.calls);
  assert.equal(searches.length, 1);
  assert.equal(new URL(searches[0].url).searchParams.get('search'), 'Os Vingadores');
  assert.equal(new URL(searches[0].url).searchParams.get('subtype'), 'movie');
  assert.equal(new URL(searches[0].url).searchParams.get('per_page'), '20');
  assert.equal(videoCalls(runtime.calls, '0').length, 1);
  assert.equal(videoCalls(runtime.calls, '1').length, 1);
  assert.equal(playerCalls(runtime.calls).length, 3);
  assert.equal(runtime.calls.filter((call) => call.url.includes('/api/videos/')).length, 1);
});

test('2.1 usa o título original quando a busca PT-BR não confirma candidato', async () => {
  const runtime = makeRuntime(fullRoute({
    search: (url) => {
      const query = url.searchParams.get('search');
      if (query === 'Os Vingadores') return { body: [] };
      if (query === 'The Avengers') {
        return {
          body: [{
            id: 1,
            title: 'The Avengers',
            url: 'https://vaqueirofilmes.com/pt/movie/os-vingadores/',
            type: 'post',
            subtype: 'movie',
          }],
        };
      }
      return { body: [] };
    },
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('search')),
    ['Os Vingadores', 'The Avengers'],
  );
  assert.deepEqual(runtime.errors, []);
});

test('2.1 ausência nas duas buscas não vira falha', async () => {
  const runtime = makeRuntime(fullRoute({ search: () => ({ body: [] }) }));
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(searchCalls(runtime.calls).length, 2);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 erro HTTP, JSON inválido e resposta sem lista falham sem fallback silencioso', async () => {
  const http = makeRuntime(fullRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const httpStreams = await http.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(httpStreams), []);
  assert.equal(searchCalls(http.calls).length, 1);
  assert.match(http.errors[0], /\[VaqueiroFilmes\] Falha em movie 9320: HTTP 500/);

  const invalidJson = makeRuntime(fullRoute({ search: () => ({ body: 'isto não é json' }) }));
  const jsonStreams = await invalidJson.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(jsonStreams), []);
  assert.match(invalidJson.errors[0], /Resposta não é JSON válido/);

  const noList = makeRuntime(fullRoute({ search: () => ({ body: {} }) }));
  const listStreams = await noList.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(listStreams), []);
  assert.match(noList.errors[0], /Busca do WordPress sem lista de resultados/);
});

test('2.1 lê duas páginas de 20 resultados e descarta subtipo diferente de movie', async () => {
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    title: `Outro Filme ${index}`,
    url: `https://vaqueirofilmes.com/pt/movie/outro-${index}/`,
    type: 'post',
    subtype: 'movie',
  }));
  const runtime = makeRuntime(fullRoute({
    search: (url) => {
      const page = url.searchParams.get('page');
      if (page === '1') {
        return {
          body: [
            ...firstPage,
            {
              id: 99,
              title: 'Uma Série',
              url: 'https://vaqueirofilmes.com/pt/movie/serie/',
              type: 'post',
              subtype: 'tv',
            },
          ],
        };
      }
      return {
        body: [{
          id: 100,
          title: 'Os Vingadores',
          url: 'https://vaqueirofilmes.com/pt/movie/os-vingadores/',
          type: 'post',
          subtype: 'movie',
        }],
      };
    },
    video0: video0WithoutEmbed,
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(
    searchCalls(runtime.calls).map((call) => new URL(call.url).searchParams.get('page')),
    ['1', '2'],
  );
  assert.ok(!runtime.calls.some((call) => call.url.includes('/pt/movie/serie/')));
  assert.ok(runtime.logs.some((log) => /EmbedPlay ausente/.test(log)));
});

test('2.2 descarta ano divergente e resultado de série', async () => {
  const divergent = makeRuntime(fullRoute({
    search: () => ({
      body: [{
        id: 1,
        title: 'Os Vingadores',
        url: 'https://vaqueirofilmes.com/pt/movie/os-vingadores-the-avengers/',
        type: 'post',
        subtype: 'movie',
      }],
    }),
  }));
  const divergentStreams = await divergent.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(divergentStreams), []);
  assert.equal(divergent.errors.length, 0);

  const series = makeRuntime(fullRoute({
    search: () => ({
      body: [{
        id: 2,
        title: 'Os Vingadores',
        url: 'https://vaqueirofilmes.com/pt/movie/serie/',
        type: 'post',
        subtype: 'movie',
      }],
    }),
  }));
  const seriesStreams = await series.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(seriesStreams), []);
  assert.equal(series.errors.length, 0);
});

test('2.2 ambiguidade de dois candidatos confirmados é ausência sem escolher o primeiro', async () => {
  const runtime = makeRuntime(fullRoute({
    search: () => ({
      body: [
        { id: 1, title: 'Os Vingadores', url: 'https://vaqueirofilmes.com/pt/movie/a/', type: 'post', subtype: 'movie' },
        { id: 2, title: 'Os Vingadores', url: 'https://vaqueirofilmes.com/pt/movie/b/', type: 'post', subtype: 'movie' },
      ],
    }),
    pages: {
      '/pt/movie/a/': movie1998,
      '/pt/movie/b/': movie1998,
    },
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(searchCalls(runtime.calls).length, 1);
  assert.equal(runtime.errors.length, 0);
});

test('3.1 EmbedPlay ausente é ausência reconhecida e as opções desconhecidas são triagem', async () => {
  const runtime = makeRuntime(fullRoute({ video0: video0WithoutEmbed }));
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(videoCalls(runtime.calls, '1').length, 0);
  for (const label of ['Myembed', 'VidSrc', 'Superflixapi']) {
    assert.ok(runtime.logs.some((log) => log.includes(`Opção ${label} descartada por triagem`)));
  }
});

test('3.2 iframe de outro host e iframe ausente falham a opção', async () => {
  const wrongHost = makeRuntime(fullRoute({ video1: video1WrongHost }));
  const wrongStreams = await wrongHost.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(wrongStreams), []);
  assert.match(wrongHost.errors[0], /Iframe de host não suportado: myembed\.biz/);

  const missing = makeRuntime(fullRoute({ video1: movie1998 }));
  const missingStreams = await missing.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(missingStreams), []);
  assert.match(missing.errors[0], /Iframe do EmbedPlay ausente/);
});

test('3.3 get_stream_link valida success, HTTP e JSON', async () => {
  const refused = makeRuntime(fullRoute({ link: { body: linkRefused } }));
  const refusedStreams = await refused.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(refusedStreams), []);
  assert.match(refused.errors[0], /EmbedPlay recusou a consulta do link/);

  const http = makeRuntime(fullRoute({ link: { status: 500, body: 'erro' } }));
  const httpStreams = await http.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(httpStreams), []);
  assert.match(http.errors[0], /HTTP 500/);

  const invalid = makeRuntime(fullRoute({ link: { body: 'não é json' } }));
  const invalidStreams = await invalid.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(invalidStreams), []);
  assert.match(invalid.errors[0], /Resposta não é JSON válido/);

  const missingLink = makeRuntime(fullRoute({ link: { body: { success: true, data: {} } } }));
  const missingStreams = await missingLink.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(missingStreams), []);
  assert.match(missingLink.errors[0], /Endereço obrigatório ausente/);
});

test('3.4 falha de uma opção dublada preserva as demais e só consulta o grupo Dublado', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url, init) => {
      const videoId = new URLSearchParams(init.body || '').get('video_id');
      if (videoId === '289055') return { body: playerError };
      if (videoId === '289056') {
        return { body: { ...playerByse, data: { ...playerByse.data, video_url: videoUrl('bgpzmj9gpspd') } } };
      }
      return { body: playerAbyss };
    },
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(playerCalls(runtime.calls).length, 3);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /\[VaqueiroFilmes\] Opção 2 \(BYSE\) descartada: getPlayer recusou a opção/);
  assert.deepEqual(runtime.errors, []);
});

test('3.4 opção sem video_url e errors diferente de zero falham isoladamente', async () => {
  for (const response of [
    { errors: '0', data: {} },
    playerError,
  ]) {
    const runtime = makeRuntime(fullRoute({
      player: (url, init) => {
        const videoId = new URLSearchParams(init.body || '').get('video_id');
        if (videoId === '289055') return { body: response };
        return { body: playerAbyss };
      },
    }));
    const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
    assert.deepEqual(Array.from(streams), []);
    assert.equal(runtime.warnings.length, 1);
    assert.match(runtime.warnings[0], /Opção 2 \(BYSE\) descartada/);
    assert.match(runtime.errors[0], /Falha em movie 9320: Opção 2 \(BYSE\)/);
  }
});

test('4.1 playback ausente e host não suportado são tratados sem inventar stream', async () => {
  const absent = makeRuntime(fullRoute({ byse: () => ({ body: { playback: null } }) }));
  const absentStreams = await absent.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(absentStreams), []);
  assert.match(absent.errors[0], /Playback Byse ausente/);

  const unsupported = makeRuntime(fullRoute({
    player: () => ({ body: playerAbyss }),
  }));
  const unsupportedStreams = await unsupported.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(unsupportedStreams), []);
  assert.equal(unsupported.errors.length, 0);
  assert.ok(unsupported.logs.some((log) => /host abyssplayer\.com não suportado/.test(log)));
  assert.equal(unsupported.calls.filter((call) => call.url.includes('/api/videos/')).length, 0);
});

test('4.1 playback sem sources falha com mensagem explícita', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url, init) => {
      const videoId = new URLSearchParams(init.body || '').get('video_id');
      if (videoId === '289055') {
        return { body: { ...playerByse, data: { ...playerByse.data, video_url: videoUrl('testsemfontes') } } };
      }
      return { body: playerAbyss };
    },
  }));
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Playback Byse sem fontes/);
});

test('4.2 decifra o payload real da fixture e rejeita chave, IV e JSON inválidos', () => {
  const runtime = makeRuntime(undefined, codes.byse);
  const decrypted = runtime.exports.decryptPlayback(byseReal.playback);
  assert.equal(decrypted.sources.length, 1);
  assert.equal(decrypted.sources[0].height, 1080);
  assert.equal(decrypted.sources[0].label, '1080p');
  assert.match(decrypted.sources[0].mime_type, /mpegurl/);

  assert.throws(
    () => runtime.exports.decryptPlayback({ version: '1', key_parts: ['AAAA', 'BBBB'], iv: 'AAAA', payload: 'AAAA' }),
    /Chave do playback com 6 bytes/,
  );
  assert.throws(
    () => runtime.exports.decryptPlayback({ ...byseReal.playback, iv: 'AAAA' }),
    /IV do playback com 3 bytes/,
  );
  assert.throws(
    () => runtime.exports.decryptPlayback(encryptedPlayback('isto não é json')),
    /Playback decifrado não é JSON válido/,
  );
});

test('4.2 seleciona key_parts por version e usa todas as partes quando a versão não mapeia', () => {
  const runtime = makeRuntime(undefined, codes.byse);
  const fallbackParts = [KEY_A.toString('base64url'), KEY_B.toString('base64url')];
  const playback = encryptedPlayback('{"sources":[]}', {
    version: '99',
    keyParts: fallbackParts,
    key: Buffer.concat([KEY_A, KEY_B]),
  });
  const decrypted = runtime.exports.decryptPlayback(playback);
  assert.equal(decrypted.sources.length, 0);

  assert.throws(
    () => runtime.exports.decryptPlayback(encryptedPlayback('{}', { version: '19', keyParts: ['AAAA'] })),
    /Chave do playback com 3 bytes/,
  );
});

test('4.3 monta 720p com legendas válidas e omite legenda sem URL ou idioma', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url, init) => {
      const videoId = new URLSearchParams(init.body || '').get('video_id');
      if (videoId === '289055') {
        return { body: { ...playerByse, data: { ...playerByse.data, video_url: videoUrl('testcomlegendas') } } };
      }
      return { body: playerAbyss };
    },
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].subtitles.length, 2);
  assert.deepEqual(
    Array.from(streams[0].subtitles, (subtitle) => subtitle.language),
    ['Português (BR)', 'English'],
  );
  assert.equal(streams[0].subtitles[0].name, 'Português (BR)');
  assert.equal(streams[0].subtitles[0].headers.Referer, videoUrl('testcomlegendas'));
  assert.equal(runtime.warnings.filter((warning) => /Legenda descartada/.test(warning)).length, 2);
  assert.deepEqual(runtime.errors, []);
});

test('4.3 fonte sem altura nem rótulo sai como Desconhecida', async () => {
  const runtime = makeRuntime(fullRoute({
    player: (url, init) => {
      const videoId = new URLSearchParams(init.body || '').get('video_id');
      if (videoId === '289055') {
        return { body: { ...playerByse, data: { ...playerByse.data, video_url: videoUrl('testequalidade') } } };
      }
      return { body: playerAbyss };
    },
  }));

  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].language, 'Dublado');
});

test('4.4 falha total registra console.error e retorna lista vazia', async () => {
  const runtime = makeRuntime(fullRoute({
    byse: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção 2 \(BYSE\) descartada: HTTP 500/);
  assert.match(runtime.errors[0], /\[VaqueiroFilmes\] Falha em movie 9320: Opção 2 \(BYSE\)/);
});

test('4.4 dois pedidos executam a cadeia de novo e obtêm URLs diferentes', async () => {
  let byseCount = 0;
  const runtime = makeRuntime(fullRoute({
    byse: () => {
      byseCount += 1;
      return { body: byseCount === 1 ? byseReal : byseWithTracks };
    },
  }));

  const first = await runtime.exports.getStreams('9320', 'movie', null, null);
  const second = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(byseCount, 2);
  assert.notEqual(first[0].url, second[0].url);
  assert.equal(first[0].quality, '1080p');
  assert.equal(second[0].quality, '720p');
});

test('formatação: variante Prism inclui título e qualidade', async () => {
  const runtime = makeRuntime(fullRoute(), codes.prism);
  const streams = await runtime.exports.getStreams('9320', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /^🚀 FHD 1080p/);
  assert.match(streams[0].title, /Os Vingadores/);
});

test('manifest anuncia somente filmes em HLS e as fixtures estão sanitizadas', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'vaqueirofilmes');
  assert.ok(entry);
  assert.deepEqual(entry.supportedTypes, ['movie']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.equal(entry.version, '1.0.0');
  assert.match(entry.description, /filmes/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /cf_clearance|api_token|enc\/go\.php|edge1-madrid|r66nv9ed/);
  }
});

function encryptedPlayback(plaintext, options = {}) {
  const version = options.version || '19';
  const keyParts = options.keyParts || keyPartsFor(version);
  const key = options.key || Buffer.concat([KEY_A, KEY_B]);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, IV);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64url');
  return {
    algorithm: 'AES-256-GCM',
    version,
    key_parts: keyParts,
    iv: IV.toString('base64url'),
    payload,
  };
}

function keyPartsFor(version) {
  const parts = Array.from({ length: 30 }, () => Buffer.alloc(16, 0x41).toString('base64url'));
  const number = Number(version);
  if (number >= 1 && number <= 20) {
    parts[number - 1] = KEY_A.toString('base64url');
    parts[30 - number] = KEY_B.toString('base64url');
  }
  return parts;
}
