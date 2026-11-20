const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'anizero');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8'));

const searchAot = readJson('search-aot.json');
const searchOnepiece = readJson('search-onepiece.json');
const searchEmpty = readJson('search-empty.json');
const searchInvalid = readJson('search-invalid.json');
const animeAot = read('anime-aot.html');
const animeAotS2 = read('anime-aot-s2.html');
const animeOnepiece = read('anime-onepiece.html');
const animeInvalid = read('anime-invalid.html');
const videosAotS1 = readJson('videos-aot-s1.json');
const videosAotS2 = readJson('videos-aot-s2.json');
const videosOnepiece = readJson('videos-onepiece-absolute.json');
const videosInvalid = readJson('videos-invalid.json');
const videoAotS1 = read('video-aot-s1-ep1.html');
const videoAotS2 = read('video-aot-s2-ep1.html');
const videoOnepiece1 = read('video-onepiece-1.html');
const videoOnepiece2 = read('video-onepiece-2.html');
const playerAotS1 = read('player-aot-s1.html');
const playerAotS2 = read('player-aot-s2.html');
const embedAotDub = read('embed-aot-s1-dub.html');
const embedAotLeg = read('embed-aot-s1-leg.html');
const embedAotDubCaptions = read('embed-aot-s1-dub-captions.html');
const embedAotS2Dub = read('embed-aot-s2-dub.html');
const embedAotS2Leg = read('embed-aot-s2-leg.html');
const embedInvalid = read('embed-invalid.html');

const AOT_ID = '1429';
const ONEPIECE_ID = '37854';
const ABSENT_ID = '111111';
const AOT_BASE_ANIME_ID = '101746';
const AOT_S2_ANIME_ID = '101747';
const ONEPIECE_ANIME_ID = '25212';
const AOT_DUB_HASH = '1846c8193bc61c44214fa402eeacb64f';
const AOT_LEG_HASH = '7942e5089d7b39100cb3e16316342519';
const AOT_S2_DUB_HASH = '8f4fc8517ef09b9d95ccec061c993177';
const AOT_S2_LEG_HASH = '3baa67cdc16142ce00fb83870f7bf21c';
const EMBED_HOST = '00000221.xyz';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [AOT_ID]: tmdbTv({
    title: 'Attack on Titan',
    originalTitle: 'Shingeki no Kyojin',
    year: 2013,
    seasons: [
      { number: 1, episodeCount: 25, year: 2013 },
      { number: 2, episodeCount: 12, year: 2017 },
      { number: 3, episodeCount: 22, year: 2018 },
      { number: 4, episodeCount: 28, year: 2020 },
    ],
  }),
  [ONEPIECE_ID]: tmdbTv({
    title: 'One Piece',
    originalTitle: 'One Piece',
    year: 1999,
    seasons: [
      { number: 1, episodeCount: 1, year: 1999 },
      { number: 2, episodeCount: 1, year: 2000 },
    ],
  }),
  [ABSENT_ID]: tmdbTv({ title: 'Título Inexistente', originalTitle: 'Missing Title', year: 2020, seasons: [] }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('anizero-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('anizero', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('anizero', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.gdrive, options = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    require: (name) => {
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
  if (options.apiKey !== null) context.TMDB_API_KEY = options.apiKey || 'chave-ficticia';
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function tmdbTv({ title, originalTitle, year, seasons = [] }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: { results: [] },
    seasons: seasons.map((season) => ({
      season_number: season.number,
      name: `Season ${season.number}`,
      overview: '',
      air_date: season.year ? `${season.year}-01-01` : null,
      episode_count: season.episodeCount,
      poster_path: null,
    })),
  };
}

function defaultTmdb(url) {
  const [, , mediaType, id] = url.pathname.split('/');
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  if (mediaType !== 'tv' && mediaType !== 'movie') return { status: 404, body: { status_message: 'Not found' } };
  return data;
}

function bodyOf(call) {
  return new URLSearchParams(call.init.body || '');
}

function searchFor(term) {
  const normalized = String(term).toLowerCase();
  if (normalized.includes('attack on titan') || normalized.includes('shingeki no kyojin')) return searchAot;
  if (normalized.includes('one piece')) return searchOnepiece;
  return searchEmpty;
}

function animeFor(pathname) {
  if (pathname === '/anime/attack-on-titan/') return animeAot;
  if (pathname === '/anime/attack-on-titan-s2/') return animeAotS2;
  if (pathname === '/anime/one-piece1/') return animeOnepiece;
  return { status: 404, body: 'not found' };
}

function videosFor(animeId) {
  if (animeId === AOT_BASE_ANIME_ID) return videosAotS1;
  if (animeId === AOT_S2_ANIME_ID) return videosAotS2;
  if (animeId === ONEPIECE_ANIME_ID) return videosOnepiece;
  return { status: 404, body: 'not found' };
}

function videoFor(pathname) {
  if (pathname === '/video/101838/') return videoAotS1;
  if (pathname === '/video/101813/') return videoAotS2;
  if (pathname === '/video/1/') return videoOnepiece1;
  if (pathname === '/video/2/') return videoOnepiece2;
  return { status: 404, body: 'not found' };
}

function playerFor(url) {
  const season = url.searchParams.get('season');
  if (season === '2') return playerAotS2;
  return playerAotS1;
}

function embedFor(url, options) {
  if (options.embed) {
    const override = options.embed(url);
    if (override !== undefined) return override;
  }
  const data = url.searchParams.get('data');
  if (data === AOT_DUB_HASH) return options.captions ? embedAotDubCaptions : embedAotDub;
  if (data === AOT_LEG_HASH) return embedAotLeg;
  if (data === AOT_S2_DUB_HASH) return embedAotS2Dub;
  if (data === AOT_S2_LEG_HASH) return embedAotS2Leg;
  return { status: 404, body: 'not found' };
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }

    if (url.hostname === EMBED_HOST && url.pathname === '/player/index.php') {
      return asResponse(embedFor(url, options));
    }

    if (url.hostname !== 'anizero.org' && url.hostname !== 'www.anizero.org') {
      throw new Error(`Host inesperado: ${url.hostname}`);
    }

    if (url.pathname === '/wp-admin/admin-ajax.php') {
      const action = bodyOf({ init }).get('action');
      const term = bodyOf({ init }).get('termo');
      assert.equal(action, 'buscar_anime_rt');
      if (options.search) return asResponse(options.search(term));
      return asResponse(searchFor(term));
    }

    if (url.pathname === '/api/') {
      const action = bodyOf({ init }).get('action');
      assert.equal(action, 'show_videos');
      const animeId = bodyOf({ init }).get('anime_id');
      if (options.videos) return asResponse(options.videos(animeId));
      return asResponse(videosFor(animeId));
    }

    if (url.pathname.startsWith('/anime/')) {
      if (options.anime) return asResponse(options.anime(url.pathname));
      return asResponse(animeFor(url.pathname));
    }

    if (url.pathname.startsWith('/video/')) {
      if (options.video) return asResponse(options.video(url.pathname));
      return asResponse(videoFor(url.pathname));
    }

    if (url.pathname === '/player' || url.pathname === '/player/') {
      if (options.player) return asResponse(options.player(url));
      return asResponse(playerFor(url));
    }

    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function callsTo(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname);
}

function searchCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname === '/wp-admin/admin-ajax.php');
}

function videoCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/video/'));
}

test('carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.gdrive, /TextDecoder|new Function|eval\(/);
  assert.doesNotMatch(codes.prism, /TextDecoder|new Function|eval\(/);
});

test('S01E01 devolve dublado e legendado com contrato completo', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '720p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    `https://${EMBED_HOST}/hls/${AOT_DUB_HASH}/master.txt`,
    `https://${EMBED_HOST}/hls/${AOT_LEG_HASH}/master.txt`,
  ]);
  for (const stream of streams) {
    assert.equal(stream.type, 'hls');
    assert.equal(stream.provider, EMBED_HOST);
    assert.equal(stream.headers.Referer, `https://${EMBED_HOST}/player/index.php?data=${stream.url.includes(AOT_DUB_HASH) ? AOT_DUB_HASH : AOT_LEG_HASH}`);
    assert.equal(stream.headers.Origin, `https://${EMBED_HOST}`);
    assert.match(stream.name, /^💿 HD 720p\n/);
    assert.match(stream.title, /🎬 Attack on Titan \(2013\) T01E01/);
    assert.equal(stream.format, undefined);
    assert.equal(stream.size, undefined);
    assert.equal(stream.infoHash, undefined);
    assert.ok(LANGUAGE_VALUES.includes(stream.language));
  }

  assert.equal(searchCalls(runtime.calls).length >= 1, true);
  assert.equal(callsTo(runtime.calls, '/anime/attack-on-titan/').length, 1);
  const apiCalls = callsTo(runtime.calls, '/api/');
  assert.equal(apiCalls.length, 1);
  assert.equal(bodyOf(apiCalls[0]).get('anime_id'), AOT_BASE_ANIME_ID);
  assert.equal(callsTo(runtime.calls, '/video/101838/').length, 1);
  assert.equal(callsTo(runtime.calls, '/player').length + callsTo(runtime.calls, '/player/').length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('S02E01 anunciado sem vídeo pronto é ausência reconhecida', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(callsTo(runtime.calls, '/anime/attack-on-titan-s2/').length, 1);
  const apiCalls = callsTo(runtime.calls, '/api/');
  assert.equal(bodyOf(apiCalls[0]).get('anime_id'), AOT_S2_ANIME_ID);
  assert.equal(callsTo(runtime.calls, '/video/101813/').length, 1);
});

test('episódio ausente devolve lista vazia sem tocar no player', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 99);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(videoCalls(runtime.calls).length, 0);
});

test('título ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(ABSENT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(searchCalls(runtime.calls).length >= 2);
  assert.equal(videoCalls(runtime.calls).length, 0);
});

test('uma opção falha e a outra resolve com aviso', async () => {
  const runtime = makeRuntime(makeRoute({
    embed: (url) => (url.searchParams.get('data') === AOT_DUB_HASH ? { status: 500, body: 'erro' } : undefined),
  }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AniZero\] Opção Dublado descartada: HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('embed sem configuração é falha isolada', async () => {
  const runtime = makeRuntime(makeRoute({
    embed: (url) => (url.searchParams.get('data') === AOT_DUB_HASH ? embedInvalid : undefined),
  }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AniZero\] Opção Dublado descartada: Embed sem configuração FirePlayer/);
});

test('todas as opções falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(makeRoute({ embed: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AniZero\] Falha em tv 1429: Nenhuma opção produziu stream: Dublado: HTTP 500/);
  assert.match(runtime.errors[0], /Legendado: HTTP 500/);
});

test('lista de episódios fora do esquema é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ videos: () => videosInvalid }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Lista de episódios sem "episodios"/);
});

test('ficha sem anime_id é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: (pathname) => (pathname === '/anime/attack-on-titan/' ? animeInvalid : { status: 404, body: 'not found' }),
  }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Ficha fora do esquema/);
  assert.match(runtime.errors[0], /anime_id/);
});

test('página do player sem playerScripts é erro fatal', async () => {
  const runtime = makeRuntime(makeRoute({ player: () => '<html><body>sem player</body></html>' }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Página do player sem playerScripts/);
});

test('numeração absoluta resolve One Piece S02E01 na página única', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(ONEPIECE_ID, 'tv', 2, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.match(streams[0].title, /🎬 One Piece \(1999\) T02E01/);
  assert.equal(videoCalls(runtime.calls).length, 1);
  assert.equal(new URL(videoCalls(runtime.calls)[0].url).pathname, '/video/2/');
});

test('legendas de tracks captions são preservadas', async () => {
  const runtime = makeRuntime(makeRoute({ captions: true }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(streams[0].subtitles)), [{
    url: 'https://player.example.test/legendas/pt-BR.vtt',
    language: 'Português',
    name: 'Português',
  }]);
  assert.equal(streams[1].subtitles, undefined);
});

test('filme devolve lista vazia sem rede', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(AOT_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.calls.length, 0);
  assert.deepEqual(runtime.errors, []);
});

test('entrada inválida termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams('abc', 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AniZero\] Falha em tv abc: Entrada: ID do TMDB inválido/);
});

test('busca fora do esquema é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchInvalid }));
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Busca fora do esquema/);
});

test('manifest declara o AniZero como série em HLS', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'anizero');
  assert.ok(entry);
  assert.equal(entry.name, 'AniZero');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/anizero.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublada|legendada/i);
});

test('fixtures não contêm token, cookie, assinatura ou host fora da lista', () => {
  // O hash de 32 caracteres é o identificador público do conteúdo no player, não uma credencial.
  // Casos controlados (legendas e numeração absoluta) derivam de respostas reais e usam hosts de teste.
  const expected = [
    'search-aot.json',
    'search-onepiece.json',
    'search-empty.json',
    'search-invalid.json',
    'anime-aot.html',
    'anime-aot-s2.html',
    'anime-onepiece.html',
    'anime-invalid.html',
    'videos-aot-s1.json',
    'videos-aot-s2.json',
    'videos-onepiece-absolute.json',
    'videos-invalid.json',
    'video-aot-s1-ep1.html',
    'video-aot-s2-ep1.html',
    'video-onepiece-1.html',
    'video-onepiece-2.html',
    'player-aot-s1.html',
    'player-aot-s2.html',
    'embed-aot-s1-dub.html',
    'embed-aot-s1-leg.html',
    'embed-aot-s1-dub-captions.html',
    'embed-aot-s2-dub.html',
    'embed-aot-s2-leg.html',
    'embed-invalid.html',
  ];
  for (const name of expected) assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);

  const allowedHosts = new Set(['anizero.org', 'www.anizero.org', EMBED_HOST, 'luffy.00000410.xyz', 'player.example.test', 'ssl.p.jwpcdn.com']);
  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /token=|cookie|Policy=|Signature=|Key-Pair-Id=/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.ok(allowedHosts.has(match[1]), `${name}: ${match[1]}`);
    }
  }
});
