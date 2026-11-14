const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'seudorama');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const tmdbTv = readJson('tmdb-tv.json');
const tmdbTvSeason2 = readJson('tmdb-tv-season2.json');

const SERIES_ID = '94796';
const SERIES_SEASON2_ID = '110316';
const API_HOST = 'serv01.meusdoramas.club';
const TMDB_HOST = 'api.themoviedb.org';
const BLOGGER_HOST = 'www.blogger.com';

let codes = {};
let userAgent = '';

test.before(async () => {
  ({ DEFAULT_USER_AGENT: userAgent } = await import('../src/_blocks/http/index.mjs'));
  const outDir = createTempDir('seudorama-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('seudorama', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('seudorama', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('seudorama', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function runtime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.gdrive) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    TMDB_API_KEY: 'chave-ficticia',
    console: {
      error: (message) => errors.push(String(message)),
      warn: (message) => warnings.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {}, headers: (init && init.headers) || {} });
      const result = await route(new AppURL(url), init || {});
      if (result instanceof Error) throw result;
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      const status = result.status || 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  vm.runInNewContext(bundle, context);
  return {
    calls,
    errors,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function routeWith({ api, blogger, tmdb } = {}) {
  const apiResponse = api === undefined ? readJson('api-success.json') : api;
  const bloggerResponse = blogger === undefined ? read('blogger-itags-18-22.html') : blogger;
  const tmdbById = tmdb || {
    [SERIES_ID]: tmdbTv,
    [SERIES_SEASON2_ID]: tmdbTvSeason2,
  };
  return async (url) => {
    if (url.hostname === TMDB_HOST) {
      const match = url.pathname.match(/^\/3\/tv\/(\d+)$/);
      if (match && tmdbById[match[1]] !== undefined) return asResponse(tmdbById[match[1]]);
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.hostname === API_HOST && url.pathname === '/posts/get-video.php') {
      return asResponse(apiResponse);
    }
    if (url.hostname === BLOGGER_HOST && url.pathname === '/video.g') {
      return asResponse(bloggerResponse);
    }
    throw new Error(`Requisição inesperada: ${url.href}`);
  };
}

function apiCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === API_HOST);
}

function bloggerCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === BLOGGER_HOST);
}

function tmdbCalls(calls) {
  return calls.filter((call) => new URL(call.url).hostname === TMDB_HOST);
}

test('carregamento CommonJS sem rede, sem timeout e com validação de entrada', async () => {
  const app = runtime();
  assert.equal(typeof app.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(codes.gdrive, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(codes.gdrive, /AbortController|Promise\.allSettled|setTimeout|setInterval/);

  const invalid = [
    ['abc', 'tv', 1, 1],
    [SERIES_ID, 'movie', null, null],
    [SERIES_ID, 'series', 1, 1],
    [SERIES_ID, 'tv', null, 1],
    [SERIES_ID, 'tv', 1, 0],
    [SERIES_ID, 'tv', '1', 1],
    [SERIES_ID, 'tv', 1, 1.5],
  ];
  for (const args of invalid) assert.deepEqual(await app.getStreams(...args), []);

  assert.equal(app.calls.length, 0);
  assert.equal(app.errors.length, invalid.length);
  assert.ok(app.errors.every((log) => log.startsWith('[SeuDorama] Falha em ')));
  assert.match(app.errors[0], /ID do TMDB inválido/);
  assert.match(app.errors[1], /Tipo de mídia recusado/);
});

test('S01E01 consulta a API e o Blogger com User-Agent e monta 720p antes de 360p', async () => {
  const app = runtime(routeWith());
  const streams = await app.getStreams(SERIES_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((item) => item.quality), ['720p', '360p']);
  assert.deepEqual(streams.map((item) => item.language), ['Idioma Desconhecido', 'Idioma Desconhecido']);
  assert.deepEqual(streams.map((item) => item.provider), ['SeuDorama', 'SeuDorama']);
  assert.deepEqual(streams.map((item) => item.type), ['mp4', 'mp4']);
  assert.deepEqual(streams.map((item) => item.url), [
    'https://rr2---sn-example.googlevideo.com/videoplayback?mime=video%2Fmp4&itag=22',
    'https://rr1---sn-example.googlevideo.com/videoplayback?itag=18&mime=video%2Fmp4',
  ]);
  assert.ok(streams.every((item) => JSON.stringify(item.headers) === JSON.stringify({ 'User-Agent': userAgent })));
  for (const stream of streams) {
    for (const key of ['size', 'subtitles', 'infoHash', 'seeders', 'peers']) {
      assert.ok(!(key in stream), `${key} não deve existir`);
    }
  }

  assert.equal(streams[0].name, 'SeuDorama 720p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 SeuDorama');
  assert.equal(streams[0].title, '🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 SeuDorama');
  assert.equal(streams[1].name, 'SeuDorama 360p\n🗣️ Idioma Desconhecido\n🌐 HTTP 🔍 SeuDorama');

  const api = apiCalls(app.calls);
  assert.equal(api.length, 1);
  assert.equal(new URL(api[0].url).search, '?episode_number=1&season_number=1&tmdb=94796');
  assert.equal(api[0].headers['User-Agent'], userAgent);
  assert.equal(api[0].headers.Accept, 'application/json, text/plain, */*');
  assert.ok(!('X-Requested-With' in api[0].headers));

  const blogger = bloggerCalls(app.calls);
  assert.equal(blogger.length, 1);
  assert.equal(blogger[0].url, 'https://www.blogger.com/video.g?video=fixture');
  assert.equal(blogger[0].headers['User-Agent'], userAgent);

  assert.equal(tmdbCalls(app.calls).length, 1);
  assert.equal(new URL(tmdbCalls(app.calls)[0].url).pathname, `/3/tv/${SERIES_ID}`);
});

test('S01E02 resolve o episódio avulso com o par correto na consulta', async () => {
  const app = runtime(routeWith());
  const streams = await app.getStreams(SERIES_ID, 'tv', 1, 2);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 2);
  const params = new URL(apiCalls(app.calls)[0].url).searchParams;
  assert.equal(params.get('season_number'), '1');
  assert.equal(params.get('episode_number'), '2');
  assert.equal(params.get('tmdb'), SERIES_ID);
});

test('S02E01 envia a temporada 2 e o itag 37 vira 1080p', async () => {
  const app = runtime(routeWith({ blogger: read('blogger-itag-37.html') }));
  const streams = await app.getStreams(SERIES_SEASON2_ID, 'tv', 2, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Idioma Desconhecido');

  const params = new URL(apiCalls(app.calls)[0].url).searchParams;
  assert.equal(params.get('season_number'), '2');
  assert.equal(params.get('episode_number'), '1');
  assert.equal(params.get('tmdb'), SERIES_SEASON2_ID);

  const prism = runtime(routeWith({ blogger: read('blogger-itag-37.html') }), codes.prism);
  const prismStreams = await prism.getStreams(SERIES_SEASON2_ID, 'tv', 2, 1);
  assert.equal(prismStreams[0].name, '🚀 FHD 1080p\n🎬 Alice in Borderland (2020) T02E01\n🗣️ Idioma Desconhecido\n🌐 HTTP\n📡 SeuDorama');
  assert.match(prismStreams[0].title, /^🎬 Alice in Borderland \(2020\) T02E01/);
});

test('o pacote base sorteia um dos templates e mantém o contrato', async () => {
  const app = runtime(routeWith(), codes.base);
  const streams = await app.getStreams(SERIES_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 2);
  assert.match(streams[0].name, /^(?:SeuDorama 720p|💿 HD 720p)\n/);
  assert.match(streams[0].title, /🗣️ Idioma Desconhecido/);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Idioma Desconhecido');
  assert.deepEqual(streams[0].headers, { 'User-Agent': userAgent });
});

test('série fora do catálogo devolve lista vazia sem consultar TMDB nem Blogger', async () => {
  const app = runtime(routeWith({ api: readJson('api-not-found.json') }));
  assert.deepEqual(await app.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.equal(app.errors.length, 0);
  assert.equal(app.warnings.length, 0);
  assert.equal(app.calls.length, 1);
  assert.equal(apiCalls(app.calls).length, 1);
  assert.equal(tmdbCalls(app.calls).length, 0);
  assert.equal(bloggerCalls(app.calls).length, 0);
});

test('filme é recusado sem requisição', async () => {
  const app = runtime();
  assert.deepEqual(await app.getStreams('496243', 'movie', null, null), []);
  assert.equal(app.calls.length, 0);
  assert.match(app.errors[0], /^\[SeuDorama\] Falha em movie 496243: Tipo de mídia recusado/);
});

test('videoUrl em lista é aceito e host diferente do Blogger é erro de estrutura', async () => {
  const list = runtime(routeWith({ api: readJson('api-success-list.json') }));
  const streams = await list.getStreams(SERIES_ID, 'tv', 1, 1);
  assert.equal(list.errors.length, 0, list.errors.join('\n'));
  assert.equal(streams.length, 2);
  assert.equal(bloggerCalls(list.calls)[0].url, 'https://www.blogger.com/video.g?video=fixture-lista');

  const foreign = runtime(routeWith({ api: readJson('api-foreign-host.json') }));
  assert.deepEqual(await foreign.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(foreign.errors[0], /fora do host blogger\.com/);
  assert.equal(bloggerCalls(foreign.calls).length, 0);

  const missing = runtime(routeWith({ api: readJson('api-missing-video.json') }));
  assert.deepEqual(await missing.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(missing.errors[0], /"success: true" sem "videoUrl"/);

  const invalidSuccess = runtime(routeWith({ api: readJson('api-invalid-success.json') }));
  assert.deepEqual(await invalidSuccess.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(invalidSuccess.errors[0], /sem "success" booleano/);
});

test('HTTP 500 e JSON inválido sobem com a etapa API', async () => {
  const failure = runtime(routeWith({ api: { status: 500, body: read('api-error.txt') } }));
  assert.deepEqual(await failure.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(failure.errors[0], /^\[SeuDorama\] Falha em tv 94796 S1E1: API: HTTP 500/);

  const malformed = runtime(routeWith({ api: read('api-invalid.json') }));
  assert.deepEqual(await malformed.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(malformed.errors[0], /API: Resposta não é JSON válido/);
});

test('página do Blogger sem streamingData ou com HTTP 500 sobe como estrutura', async () => {
  const block = runtime(routeWith({ blogger: read('blogger-no-streaming-data.html') }));
  assert.deepEqual(await block.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(block.errors[0], /^\[SeuDorama\] Falha em tv 94796 S1E1: Blogger: página sem streamingData/);

  const failure = runtime(routeWith({ blogger: { status: 500, body: 'falha' } }));
  assert.deepEqual(await failure.getStreams(SERIES_ID, 'tv', 1, 1), []);
  assert.match(failure.errors[0], /Blogger: HTTP 500/);
});

test('sabr sem itag e página sem URL são ausência reconhecida', async () => {
  for (const fixture of ['blogger-sabr.html', 'blogger-no-url.html']) {
    const app = runtime(routeWith({ blogger: read(fixture) }));
    assert.deepEqual(await app.getStreams(SERIES_ID, 'tv', 1, 1), [], fixture);
    assert.equal(app.errors.length, 0, `${fixture}: ${app.errors.join('\n')}`);
    assert.equal(app.warnings.length, 0, fixture);
    assert.equal(apiCalls(app.calls).length, 1, fixture);
    assert.equal(bloggerCalls(app.calls).length, 1, fixture);
  }
});

test('itag desconhecido fica Desconhecida e URL repetida é deduplicada', async () => {
  const unknown = runtime(routeWith({ blogger: read('blogger-unknown-itag.html') }));
  const unknownStreams = await unknown.getStreams(SERIES_ID, 'tv', 1, 1);
  assert.equal(unknown.errors.length, 0, unknown.errors.join('\n'));
  assert.deepEqual(unknownStreams.map((item) => item.quality), ['360p', 'Desconhecida']);

  const duplicate = runtime(routeWith({ blogger: read('blogger-duplicate.html') }));
  const duplicateStreams = await duplicate.getStreams(SERIES_ID, 'tv', 1, 1);
  assert.equal(duplicate.errors.length, 0, duplicate.errors.join('\n'));
  assert.deepEqual(duplicateStreams.map((item) => item.quality), ['720p', '360p']);
  assert.equal(new Set(duplicateStreams.map((item) => item.url)).size, 2);
});

test('nenhuma URL do Google Video entra em log, mensagem de erro ou fixture assinada', async () => {
  const cases = [
    runtime(routeWith()),
    runtime(routeWith({ api: { status: 500, body: read('api-error.txt') } })),
    runtime(routeWith({ api: read('api-invalid.json') })),
    runtime(routeWith({ blogger: read('blogger-no-streaming-data.html') })),
  ];
  for (const app of cases) await app.getStreams(SERIES_ID, 'tv', 1, 1);
  const messages = cases.flatMap((app) => app.errors.concat(app.warnings));
  assert.ok(messages.length > 0);
  assert.ok(messages.every((message) => !/googlevideo|videoplayback/i.test(message)));

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /[?&](?:expire|sig|signature|token|ip|ei|requiressl)=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{64}\b/i, name);
  }
});

test('manifest e perfil dorama registram o SeuDorama', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'seudorama');
  assert.ok(entry, 'entrada seudorama ausente no manifest');
  assert.equal(entry.name, 'SeuDorama');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/seudorama.js');
  assert.equal(entry.enabled, true);
  assert.equal(entry.logo, 'https://www.google.com/s2/favicons?domain=meusdoramas.club&sz=128');

  const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'online', 'profiles.json'), 'utf8'));
  assert.deepEqual(profiles.providers.seudorama, { exclusiveTag: 'dorama' });
  assert.equal(profiles.curatedAt, '2026-11-14');
});
