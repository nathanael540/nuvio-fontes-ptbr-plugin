const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'kairou');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const tmdbMovie = readJson('tmdb-movie.json');
const tmdbTv = readJson('tmdb-tv.json');
const tmdbAnime = readJson('tmdb-anime.json');

const MOVIE_ID = '550';
const TV_ID = '1396';
const ANIME_ID = '85937';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('kairou-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('kairou', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('kairou', { outDir, formatter: 'prism' }), 'utf8');
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
      calls.push({ url: String(url), init: init || {} });
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

function routeWith(extractResponse) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname === `/3/movie/${MOVIE_ID}`) return asResponse(tmdbMovie);
      if (url.pathname === `/3/tv/${TV_ID}`) return asResponse(tmdbTv);
      if (url.pathname === `/3/tv/${ANIME_ID}`) return asResponse(tmdbAnime);
      throw new Error(`TMDB inesperado: ${url.pathname}`);
    }
    if (url.hostname === 'www.kairou.space' && url.pathname === '/api/extract') {
      return asResponse(typeof extractResponse === 'function' ? extractResponse(url) : extractResponse);
    }
    throw new Error(`Requisição inesperada: ${url.href}`);
  };
}

function extractCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname === '/api/extract');
}

function paramsOf(call) {
  return new URL(call.url).searchParams;
}

test('carregamento CommonJS sem rede, sem timeout e com validação de entrada', async () => {
  const app = runtime();
  assert.equal(typeof app.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(codes.gdrive, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(codes.gdrive, /AbortController|Promise\.allSettled|setTimeout|setInterval/);

  const invalid = [
    ['abc', 'movie', null, null],
    ['550', 'series', null, null],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', '1', 1],
    [TV_ID, 'tv', 1, 1.5],
    [ANIME_ID, 'tv', null, null],
  ];
  for (const args of invalid) assert.deepEqual(await app.getStreams(...args), []);

  assert.equal(app.calls.length, 0);
  assert.equal(app.errors.length, invalid.length);
  assert.ok(app.errors.every((log) => log.startsWith('[Kairou] Falha em ')));
  assert.match(app.errors[0], /ID do TMDB inválido/);
  assert.match(app.errors[1], /Tipo de mídia inválido/);
});

test('filme consulta a extração com os parâmetros do site e monta streams e legendas', async () => {
  const app = runtime(routeWith(readJson('movie.json')));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams.length, 4);
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '1080p', '720p', 'Desconhecida']);
  assert.deepEqual(streams.map((item) => item.language), ['Dublado', 'Legendado', 'Dublado', 'Dublado']);
  assert.deepEqual(streams.map((item) => item.provider), ['veyra', 'pstream', 'fenix', 'popplay']);
  assert.deepEqual(streams.map((item) => item.type), ['mp4', 'hls', 'mp4', 'mp4']);

  assert.equal(streams[0].url, 'https://www.kairou.space/api/proxy?url=https%3A%2F%2Fcdn.example%2Ffight-club-1080.mp4&referer=veyra');
  assert.equal(streams[1].url, 'https://bridge.pstream.example/e/abc123/master.m3u8');
  assert.equal(streams[2].url, 'https://www.kairou.space/api/proxy?url=https%3A%2F%2Fcdn.example%2Ffight-club-720.mp4&referer=fenix');
  assert.match(streams[3].url, /^https:\/\/www\.kairou\.space\/api\/proxy\?url=/);
  assert.ok(streams.every((item) => !('headers' in item)));
  assert.ok(streams.every((item) => !('name' in item) || item.name !== ''));

  assert.equal(streams[0].name, 'Kairou 1080p\n🗣️ Dublado\n🌐 HTTP 🔍 veyra');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP 🔍 veyra');
  assert.equal(streams[1].name, 'Kairou 1080p\n🗣️ Legendado\n🌐 HTTP 🔍 pstream');

  assert.equal(streams[0].subtitles.length, 2);
  assert.deepEqual(streams[0].subtitles.map((item) => item.language), ['Português (Brasil)', 'English']);
  assert.equal(streams[0].subtitles[0].name, 'Português (Brasil) · Opção 1');
  assert.equal(streams[0].subtitles[0].url, 'https://www.kairou.space/api/proxy?format=vtt&url=https%3A%2F%2Fsubs.example%2Ffight-club-ptbr.vtt');
  assert.deepEqual(streams[1].subtitles.map((item) => item.language), ['Português (Brasil)']);
  assert.equal(streams[1].subtitles[0].name, 'Português (Brasil) · Opção 1');

  const calls = extractCalls(app.calls);
  assert.equal(calls.length, 1);
  const params = paramsOf(calls[0]);
  assert.equal(params.get('tmdbId'), MOVIE_ID);
  assert.equal(params.get('type'), 'movie');
  assert.equal(params.get('title'), 'Clube da Luta');
  assert.equal(params.get('season'), null);
  assert.equal(params.get('episode'), null);
  assert.equal(params.get('isAnime'), null);
  assert.equal(params.get('fast'), null);
  assert.match(calls[0].url, /^https:\/\/www\.kairou\.space\/api\/extract\?/);
});

test('episódio envia temporada e episódio, classifica Gringo sem legenda PT e usa formato Prism', async () => {
  const app = runtime(routeWith(readJson('episode.json')));
  const streams = await app.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '720p']);
  assert.deepEqual(streams.map((item) => item.language), ['Gringo', 'Dublado']);
  assert.equal(streams[0].subtitles[0].language, 'English');
  assert.equal(streams[1].subtitles[0].language, 'English');

  const params = paramsOf(extractCalls(app.calls)[0]);
  assert.equal(params.get('tmdbId'), TV_ID);
  assert.equal(params.get('type'), 'series');
  assert.equal(params.get('season'), '1');
  assert.equal(params.get('episode'), '1');
  assert.equal(params.get('title'), 'Breaking Bad');
  assert.equal(params.get('isAnime'), null);
  assert.equal(params.get('fast'), null);

  const prism = runtime(routeWith(readJson('episode.json')), codes.prism);
  const prismStreams = await prism.getStreams(TV_ID, 'tv', 1, 1);
  assert.match(prismStreams[0].title, /^🎬 Breaking Bad \(2008\) T01E01/);
});

test('anime recebe isAnime=1 e stream sem legendas não traz o campo', async () => {
  const app = runtime(routeWith(readJson('anime.json')));
  const streams = await app.getStreams(ANIME_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].type, 'hls');
  assert.ok(!('subtitles' in streams[0]));

  const params = paramsOf(extractCalls(app.calls)[0]);
  assert.equal(params.get('tmdbId'), ANIME_ID);
  assert.equal(params.get('type'), 'series');
  assert.equal(params.get('isAnime'), '1');
  assert.equal(params.get('season'), '1');
  assert.equal(params.get('episode'), '1');
  assert.equal(params.get('fast'), null);
});

test('ausência reconhecida devolve lista vazia sem erro', async () => {
  const app = runtime(routeWith(readJson('empty.json')));
  assert.deepEqual(await app.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(app.errors.length, 0);
  assert.equal(app.warnings.length, 0);
  assert.equal(extractCalls(app.calls).length, 1);
});

test('falha HTTP, JSON inválido, recusa e estrutura inesperada sobem até getStreams', async () => {
  const failure = runtime(routeWith({ status: 503, body: 'indisponível' }));
  assert.deepEqual(await failure.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(failure.errors[0], /^\[Kairou\] Falha em movie 550: HTTP 503/);

  const malformed = runtime(routeWith(read('malformed.json')));
  assert.deepEqual(await malformed.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(malformed.errors[0], /Resposta não é JSON válido/);

  const refused = runtime(routeWith(readJson('invalid.json')));
  assert.deepEqual(await refused.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(refused.errors[0], /Extração recusada pela fonte: Título não encontrado no catálogo/);

  const missing = runtime(routeWith(readJson('missing-streams.json')));
  assert.deepEqual(await missing.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(missing.errors[0], /sem "streams" como lista/);

  const badSubtitles = runtime(routeWith({ ok: true, streams: [], subtitles: {} }));
  assert.deepEqual(await badSubtitles.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(badSubtitles.errors[0], /"subtitles" fora do formato de lista/);
});

test('4K é descartado por triagem, URL inválida é isolada e duplicata mantém a primeira opção', async () => {
  const app = runtime(routeWith(readJson('mixed.json')));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '720p']);
  assert.deepEqual(streams.map((item) => item.provider), ['fenix', 'zeusoficial']);
  assert.deepEqual(streams.map((item) => item.language), ['Dublado', 'Legendado']);
  assert.equal(streams.length, 2);
  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0], /^\[Kairou\] Opção bad descartada: URL de mídia não é HTTP\(S\)/);

  const only4k = runtime(routeWith(readJson('only-4k.json')));
  assert.deepEqual(await only4k.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(only4k.errors.length, 0);
  assert.equal(only4k.warnings.length, 0);
});

test('todas as opções inválidas sobem como erro agregado', async () => {
  const app = runtime(routeWith(readJson('invalid-options.json')));
  assert.deepEqual(await app.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(app.warnings.length, 2);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /^\[Kairou\] Falha em movie 550: Todas as opções falharam: \[/);
  assert.match(app.errors[0], /bad-scheme: URL de mídia não é HTTP\(S\)/);
  assert.match(app.errors[0], /missing-url: URL de mídia ausente/);
});

test('tipo é inferido de isHls quando a fonte não informa e omitido sem ambos', async () => {
  const response = {
    ok: true,
    fast: false,
    count: 2,
    streams: [
      {
        id: 'inferred-hls',
        source: 'veyra',
        url: '/api/proxy?url=https%3A%2F%2Fcdn.example%2Finferred.m3u8',
        quality: '1080p',
        isHls: true,
        isDub: true,
        subtitles: [],
      },
      {
        id: 'no-type',
        source: 'fenix',
        url: '/api/proxy?url=https%3A%2F%2Fcdn.example%2Fno-type.mp4',
        quality: '720p',
        isDub: true,
        subtitles: [],
      },
    ],
    subtitles: [],
  };
  const app = runtime(routeWith(response));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 2);
  assert.equal(streams[0].type, 'hls');
  assert.ok(!('type' in streams[1]));
});

test('rótulo de qualidade não resolvido é omitido sem descartar a opção', async () => {
  const response = {
    ok: true,
    fast: false,
    count: 2,
    streams: [
      {
        id: 'auto-com-resolucao',
        source: 'vidbolt',
        url: '/api/proxy?url=https%3A%2F%2Fcdn.example%2Fmovie-720p.mp4',
        type: 'mp4',
        quality: 'Auto',
        isDub: true,
        subtitles: [],
      },
      {
        id: 'auto-sem-resolucao',
        source: 'vidbolt',
        url: '/api/proxy?url=https%3A%2F%2Fcdn.example%2Fvideo%2Fa1b2.mp4',
        type: 'mp4',
        quality: 'Auto',
        isDub: true,
        subtitles: [],
      },
    ],
    subtitles: [],
  };
  const app = runtime(routeWith(response));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(streams.map((item) => item.quality), ['720p', 'Desconhecida']);
  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
});
