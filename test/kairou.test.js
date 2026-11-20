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
const tmdbMovie4k = readJson('tmdb-movie-4k.json');

const MOVIE_ID = '550';
const TV_ID = '1396';
const ANIME_ID = '85937';
const MOVIE_4K_ID = '438631';

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
      if (url.pathname === `/3/movie/${MOVIE_4K_ID}`) return asResponse(tmdbMovie4k);
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

function bodyOf(call) {
  return JSON.parse(call.init.body);
}

test('carregamento CommonJS sem rede, sem timeout e com validação de entrada', async () => {
  const app = runtime();
  assert.equal(typeof app.getStreams, 'function');
  assert.equal(app.calls.length, 0);
  assert.doesNotMatch(codes.gdrive, /\basync\s+function\b|\bawait\s/);
  assert.doesNotMatch(codes.gdrive, /AbortController|Promise\.allSettled|setTimeout|setInterval|EventSource/);

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

test('filme consulta a extração por POST e monta os streams', async () => {
  const app = runtime(routeWith(readJson('movie.json')));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams.length, 6);
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '1080p', '1080p', '1080p', '1080p', '1080p']);
  assert.ok(streams.every((item) => item.language === 'Dublado'));
  assert.ok(streams.every((item) => item.type === 'mp4'));
  assert.ok(streams.every((item) => !('provider' in item)));
  assert.ok(streams.every((item) => !('headers' in item)));

  assert.equal(streams[0].url, 'https://www.kairou.space/api/stream/stream-1/media.mp4');
  assert.equal(streams[5].url, 'https://www.kairou.space/api/stream/stream-6/media.mp4');
  assert.equal(streams[0].name, 'Kairou 1080p\n🗣️ Dublado\n🌐 HTTP');
  assert.equal(streams[0].title, '🗣️ Dublado\n🌐 HTTP');

  const calls = extractCalls(app.calls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.kairou.space/api/extract');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(bodyOf(calls[0]), {
    target: MOVIE_ID,
    title: 'Clube da Luta',
    originalTitle: 'Fight Club',
    isAnime: false,
    imdbId: 'tt0137523',
  });
});

test('episódio envia target com temporada e episódio e usa formato Prism', async () => {
  const app = runtime(routeWith(readJson('episode.json')));
  const streams = await app.getStreams(TV_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams.length, 5);
  assert.ok(streams.every((item) => item.quality === '1080p'));
  assert.ok(streams.every((item) => item.language === 'Dublado'));

  assert.deepEqual(bodyOf(extractCalls(app.calls)[0]), {
    target: `${TV_ID}/1/1`,
    title: 'Breaking Bad',
    originalTitle: 'Breaking Bad',
    isAnime: false,
    imdbId: 'tt0903747',
  });

  const prism = runtime(routeWith(readJson('episode.json')), codes.prism);
  const prismStreams = await prism.getStreams(TV_ID, 'tv', 1, 1);
  assert.match(prismStreams[0].title, /^🎬 Breaking Bad \(2008\) T01E01/);
});

test('anime recebe isAnime e monta as opções da fonte', async () => {
  const app = runtime(routeWith(readJson('anime.json')));
  const streams = await app.getStreams(ANIME_ID, 'tv', 1, 1);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(streams.length, 6);
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '1080p', '1080p', '1080p', '1080p', '720p']);
  assert.ok(streams.every((item) => item.language === 'Dublado'));

  assert.deepEqual(bodyOf(extractCalls(app.calls)[0]), {
    target: `${ANIME_ID}/1/1`,
    title: 'Demon Slayer',
    originalTitle: '鬼滅の刃',
    isAnime: true,
    imdbId: 'tt9335498',
  });
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

  const notFound = runtime(routeWith({ status: 404, body: 'Error' }));
  assert.deepEqual(await notFound.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(notFound.errors[0], /^\[Kairou\] Falha em movie 550: HTTP 404/);

  const invalidTarget = runtime(routeWith({ status: 400, body: readJson('invalid.json') }));
  assert.deepEqual(await invalidTarget.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(invalidTarget.errors[0], /^\[Kairou\] Falha em movie 550: HTTP 400/);

  const malformed = runtime(routeWith(read('malformed.json')));
  assert.deepEqual(await malformed.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(malformed.errors[0], /Resposta não é JSON válido/);

  const missing = runtime(routeWith(readJson('missing-streams.json')));
  assert.deepEqual(await missing.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(missing.errors[0], /sem "streams" como lista/);

  const refused = runtime(routeWith({ error: 'Título não encontrado no catálogo' }));
  assert.deepEqual(await refused.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(refused.errors[0], /sem "streams" como lista: Título não encontrado no catálogo/);

  const badSubtitles = runtime(routeWith({ streams: [], subtitles: {} }));
  assert.deepEqual(await badSubtitles.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.match(badSubtitles.errors[0], /"subtitles" fora do formato de lista/);
});

test('4K é descartado por triagem', async () => {
  const app = runtime(routeWith(readJson('movie-4k.json')));
  const streams = await app.getStreams(MOVIE_4K_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '1080p']);
  assert.deepEqual(streams.map((item) => item.url), [
    'https://www.kairou.space/api/stream/fourk-1/media.mp4',
    'https://www.kairou.space/api/stream/fourk-2/media.mp4',
  ]);
  assert.deepEqual(bodyOf(extractCalls(app.calls)[0]), {
    target: MOVIE_4K_ID,
    title: 'Duna',
    originalTitle: 'Dune',
    isAnime: false,
    imdbId: 'tt1160419',
  });

  const only4k = runtime(routeWith({
    elapsedMs: 1,
    cached: false,
    streams: [readJson('movie-4k.json').streams[2]],
    subtitles: [],
  }));
  assert.deepEqual(await only4k.getStreams(MOVIE_4K_ID, 'movie', null, null), []);
  assert.equal(only4k.errors.length, 0);
  assert.equal(only4k.warnings.length, 0);
});

test('opção inválida é isolada, duplicata mantém a primeira e aviso usa o rótulo', async () => {
  const response = {
    elapsedMs: 1,
    cached: false,
    streams: [
      {
        id: 'mixed-1',
        label: 'Servidor 1',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/mixed-1/media.mp4',
      },
      {
        id: 'mixed-2',
        label: 'Servidor 2',
        audio: 'PT-BR · Dublado',
        quality: '720p HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/mixed-2/media.mp4',
      },
      {
        id: 'mixed-bad',
        label: 'Servidor 3',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: 'javascript:alert(1)',
      },
      {
        id: 'mixed-1-dup',
        label: 'Servidor 4',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/mixed-1/media.mp4',
      },
    ],
    subtitles: [],
  };
  const app = runtime(routeWith(response));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '720p']);
  assert.equal(streams.length, 2);
  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0], /^\[Kairou\] Opção Servidor 3 descartada: URL de mídia não é HTTP\(S\)/);
});

test('todas as opções inválidas sobem como erro agregado', async () => {
  const response = {
    elapsedMs: 1,
    cached: false,
    streams: [
      {
        id: 'bad-scheme',
        label: 'Ruim 1',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: 'javascript:alert(1)',
      },
      {
        id: 'missing-url',
        label: 'Ruim 2',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
      },
    ],
    subtitles: [],
  };
  const app = runtime(routeWith(response));
  assert.deepEqual(await app.getStreams(MOVIE_ID, 'movie', null, null), []);
  assert.equal(app.warnings.length, 2);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /^\[Kairou\] Falha em movie 550: Todas as opções falharam: \[/);
  assert.match(app.errors[0], /Ruim 1: URL de mídia não é HTTP\(S\)/);
  assert.match(app.errors[0], /Ruim 2: URL de mídia ausente/);
});

test('formato vira tipo, rótulo de qualidade não resolvido é omitido e resolução local é usada', async () => {
  const response = {
    elapsedMs: 1,
    cached: false,
    streams: [
      {
        id: 'hls',
        label: 'Servidor 1',
        audio: 'PT-BR · Dublado',
        quality: '1080p Full HD',
        format: 'hls',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/hls/master.m3u8',
      },
      {
        id: 'no-format',
        label: 'Servidor 2',
        audio: 'PT-BR · Dublado',
        quality: '720p HD',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/no-format/media.mp4',
      },
      {
        id: 'auto-com-resolucao',
        label: 'Servidor 3',
        audio: 'PT-BR · Dublado',
        quality: 'Auto',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/auto-1/media-720p.mp4',
      },
      {
        id: 'auto-sem-resolucao',
        label: 'Servidor 4',
        audio: 'PT-BR · Dublado',
        quality: 'Auto',
        format: 'mp4',
        isPtBr: true,
        is4k: false,
        streamUrl: '/api/stream/auto-2/video/a1b2.mp4',
      },
    ],
    subtitles: [],
  };
  const app = runtime(routeWith(response));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams[0].type, 'hls');
  assert.ok(!('type' in streams[1]));
  assert.deepEqual(streams.map((item) => item.quality), ['1080p', '720p', '720p', 'Desconhecida']);
});

test('idioma usa isPtBr, áudio e legenda em português', async () => {
  const base = {
    quality: '1080p Full HD',
    format: 'mp4',
    is4k: false,
    streamUrl: '/api/stream/language/media.mp4',
  };

  const ptBr = runtime(routeWith({
    streams: [{ ...base, id: 'ptbr', label: 'Servidor 1', audio: 'PT-BR · Dublado', isPtBr: true }],
    subtitles: [],
  }));
  assert.equal((await ptBr.getStreams(MOVIE_ID, 'movie', null, null))[0].language, 'Dublado');

  const gringo = runtime(routeWith({
    streams: [{ ...base, id: 'gringo', label: 'Servidor 1', audio: 'Inglês · Original', isPtBr: false }],
    subtitles: [],
  }));
  assert.equal((await gringo.getStreams(MOVIE_ID, 'movie', null, null))[0].language, 'Gringo');

  const foreignDub = runtime(routeWith({
    streams: [{ ...base, id: 'foreign', label: 'Servidor 1', audio: 'Espanhol · Dublado', isPtBr: false }],
    subtitles: [],
  }));
  assert.equal((await foreignDub.getStreams(MOVIE_ID, 'movie', null, null))[0].language, 'Dublado (Não PT-BR?)');

  const missingFlag = runtime(routeWith({
    streams: [{ ...base, id: 'missing-flag', label: 'Servidor 1', audio: 'PT-BR · Dublado' }],
    subtitles: [],
  }));
  assert.equal((await missingFlag.getStreams(MOVIE_ID, 'movie', null, null))[0].language, 'Dublado');
});

test('legendas do topo são resolvidas, deduplicadas e inválidas são omitidas', async () => {
  const response = {
    elapsedMs: 1,
    cached: false,
    streams: [
      {
        id: 'sub-1',
        label: 'Servidor 1',
        audio: 'Inglês · Original',
        quality: '1080p Full HD',
        format: 'mp4',
        isPtBr: false,
        is4k: false,
        streamUrl: '/api/stream/sub-1/media.mp4',
      },
    ],
    subtitles: [
      { id: 'subtitle-1', label: 'Português (Brasil)', lang: 'pt-BR', trackUrl: '/api/subtitles/subtitle-1.vtt' },
      { id: 'subtitle-2', label: 'English', lang: 'en', url: '/api/subtitles/subtitle-2.vtt' },
      { id: 'subtitle-2-dup', label: 'English duplicada', lang: 'en', trackUrl: '/api/subtitles/subtitle-2.vtt' },
      { id: 'subtitle-bad', label: 'Inválida', lang: 'en', trackUrl: 'javascript:alert(1)' },
      { id: 'subtitle-no-url', label: 'Sem URL', lang: 'pt-BR' },
    ],
  };
  const app = runtime(routeWith(response));
  const streams = await app.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(app.errors.length, 0, app.errors.join('\n'));
  assert.equal(app.warnings.length, 0, app.warnings.join('\n'));
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].subtitles.length, 2);
  assert.deepEqual(streams[0].subtitles.map((item) => item.language), ['Português (Brasil)', 'English']);
  assert.deepEqual(streams[0].subtitles.map((item) => item.name), ['Português (Brasil)', 'English']);
  assert.equal(streams[0].subtitles[0].url, 'https://www.kairou.space/api/subtitles/subtitle-1.vtt');
  assert.equal(streams[0].subtitles[1].url, 'https://www.kairou.space/api/subtitles/subtitle-2.vtt');
});
