const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'animesdigital');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const searchKimetsu = read('search-kimetsu.html');
const searchEmpty = read('search-empty.html');
const searchUnrecognized = read('search-unrecognized.html');
const searchJujutsu = read('search-jujutsu.html');
const searchJujutsuSeason1Only = read('search-jujutsu-season1-only.html');
const searchMovieAmbiguous = read('search-movie-ambiguous.html');
const searchKimi = read('search-kimi.html');
const searchFilmeOnly = read('search-filme-only.html');
const detailSeries = read('detail-series.html');
const detailSeriesDub = read('detail-series-dub.html');
const detailSeriesSeason2 = read('detail-series-season2.html');
const detailMovie = read('detail-movie.html');
const detailMovieDub = read('detail-movie-dub.html');
const detailMovieSingle = read('detail-movie-single.html');
const videoAnivideo = read('video-anivideo.html');
const videoEncoded = read('video-encoded.html');
const videoBackgroundOnly = read('video-background-only.html');
const videoNoPlayer = read('video-no-player.html');
const videoEmptyD = read('video-empty-d.html');
const videoInvalidProtocol = read('video-invalid-protocol.html');
const videoMixedOptions = read('video-mixed-options.html');
const videoAllInvalid = read('video-all-invalid.html');

const KIMETSU_ID = '85937';
const JUJUTSU_ID = '95479';
const MUGEN_TRAIN_ID = '635302';
const YOUR_NAME_ID = '372058';
const AKIRA_ID = '149';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];
const ANIVIDEO_SERIES = 'https://cdn.example.test/stream/j/jujutsu-kaisen/24.mp4/index.m3u8';
const ANIVIDEO_MOVIE = 'https://cdn.example.test/stream/k/kimetsu-movie/01cambr.mp4/index.m3u8';

const TMDB_BY_ID = {
  [KIMETSU_ID]: seriesInfo({
    name: 'Demon Slayer: Kimetsu no Yaiba',
    original: '鬼滅の刃',
    year: 2019,
    romaji: [{ title: 'Kimetsu no Yaiba', season: null }],
    seasons: [
      { number: 1, name: 'Temporada 1', year: 2019, episodeCount: 26 },
      { number: 2, name: 'Temporada 2', year: 2021, episodeCount: 7 },
    ],
  }),
  [JUJUTSU_ID]: seriesInfo({
    name: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    year: 2020,
    romaji: [{ title: 'Jujutsu Kaisen', season: null }],
    seasons: [
      { number: 1, name: 'Temporada 1', year: 2020, episodeCount: 24 },
      { number: 2, name: 'Temporada 2', year: 2023, episodeCount: 23 },
    ],
  }),
  [MUGEN_TRAIN_ID]: movieInfo({
    title: 'Demon Slayer: Mugen Train',
    original: '劇場版「鬼滅の刃」無限列車編',
    year: 2020,
    romaji: [{ title: 'Kimetsu no Yaiba Movie: Mugen Jou-hen', season: null }],
  }),
  [YOUR_NAME_ID]: movieInfo({
    title: 'Your Name.',
    original: '君の名は。',
    year: 2016,
    romaji: [{ title: 'Kimi no Na wa.', season: null }],
  }),
  [AKIRA_ID]: movieInfo({
    title: 'Akira',
    original: 'アキラ',
    year: 1988,
    romaji: [{ title: 'Akira', season: null }],
  }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animesdigital-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('animesdigital', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('animesdigital', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animesdigital', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function movieInfo({ title, original, year, alts = [], romaji = [] }) {
  return {
    title,
    original_title: original,
    release_date: `${year}-01-01`,
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      titles: [
        ...alts.map((item) => ({ iso_3166_1: 'BR', title: item, type: 'Alternative' })),
        ...romaji.map((item) => ({
          iso_3166_1: 'JP',
          title: item.title,
          type: item.season === null ? 'Romaji' : `Season ${item.season} Romaji`,
        })),
      ],
    },
  };
}

function seriesInfo({ name, original, year, alts = [], romaji = [], seasons = [] }) {
  return {
    name,
    original_name: original,
    first_air_date: `${year}-01-01`,
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: 'tt0000002' },
    alternative_titles: {
      results: [
        ...alts.map((item) => ({ iso_3166_1: 'BR', title: item, type: 'Alternative' })),
        ...romaji.map((item) => ({
          iso_3166_1: 'JP',
          title: item.title,
          type: item.season === null ? 'Romaji' : `Season ${item.season} Romaji`,
        })),
      ],
    },
    seasons: seasons.map((season) => ({
      season_number: season.number,
      name: season.name,
      air_date: `${season.year}-01-01`,
      episode_count: season.episodeCount,
    })),
  };
}

function makeRuntime(route = makeRoute(), bundle = codes.gdrive, options = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      log: () => {},
      warn: (message) => warnings.push(String(message)),
      error: (message) => errors.push(String(message)),
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const result = await route(new URL(url), init || {});
      if (result instanceof Error) throw result;
      const text = typeof result === 'string'
        ? result
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body);
      const status = result.status === undefined ? 200 : result.status;
      return {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    },
  };
  if (options.apiKey !== null) context.TMDB_API_KEY = options.apiKey || 'chave-ficticia';
  vm.runInNewContext(bundle, context, { filename: 'animesdigital.js' });
  return {
    calls,
    errors,
    warnings,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value || 'url' in value)) return value;
  return { body: value };
}

function defaultTmdb(url) {
  const [, , mediaType, id] = url.pathname.split('/');
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  return mediaType === 'movie' || mediaType === 'tv' ? data : { status: 404, body: {} };
}

function finalSearchUrl(query) {
  return `https://animesdigital.org/pesquisa/${encodeURIComponent(query)}/`;
}

function searchFor(query) {
  if (query === 'Kimetsu no Yaiba' || query === 'Kimetsu no Yaiba Movie: Mugen Jou-hen') {
    return { body: searchKimetsu, url: finalSearchUrl(query) };
  }
  if (query === 'Jujutsu Kaisen') return { body: searchJujutsu, url: finalSearchUrl(query) };
  return { body: searchEmpty, url: finalSearchUrl(query) };
}

function pageFor(slug) {
  if (slug === 'kimetsu-no-yaiba' || slug === 'kimetsu-no-yaiba-dublado') return detailSeriesDub;
  if (slug === 'kimetsu-no-yaiba-movie-mugen-jou-hen-dublado-filme') return detailMovieDub;
  if (slug === 'kimetsu-no-yaiba-movie-mugen-jou-hen-filme') return detailMovie;
  if (slug === 'kimetsu-no-yaiba-movie-mugen-jou-hen-copia-filme') return detailMovie;
  if (slug === 'jujutsu-kaisen') return detailSeries;
  if (slug === 'jujutsu-kaisen-2') return detailSeriesSeason2;
  if (slug === 'kimi-no-na-wa') return detailMovieSingle;
  return { status: 404, body: 'Ficha não encontrada' };
}

function videoFor(id) {
  const normalized = id.replace(/\/$/, '');
  if (normalized === '130927z' || normalized === '84767') return videoEncoded;
  if (['25344b001', '25345b001', '25346b002', '25367b002', '25682z001', '25683z001', '132281z'].includes(normalized)) {
    return videoAnivideo;
  }
  return { status: 404, body: 'Vídeo não encontrado' };
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'animesdigital.org') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/') {
      const query = url.searchParams.get('s');
      return asResponse(options.search ? options.search(query) : searchFor(query));
    }
    if (url.pathname.startsWith('/anime/a/')) {
      const slug = decodeURIComponent(url.pathname.slice('/anime/a/'.length));
      return asResponse(options.page ? options.page(slug) : pageFor(slug));
    }
    if (url.pathname.startsWith('/video/a/')) {
      const id = decodeURIComponent(url.pathname.slice('/video/a/'.length));
      return asResponse(options.video ? options.video(id) : videoFor(id));
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function searchQueries(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname === '/')
    .map((url) => url.searchParams.get('s'));
}

function pageCallPaths(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/anime/a/'))
    .map((url) => url.pathname);
}

function videoCallIds(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/video/a/'))
    .map((url) => decodeURIComponent(url.pathname.slice('/video/a/'.length)).replace(/\/$/, ''));
}

test('1.1 e 2.5 o pacote carrega sem rede, expõe getStreams e não lê settings', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.getStreams, 'function');
  assert.equal(fetchCalled, false);
  for (const bundle of [codes.base, codes.gdrive, codes.prism]) {
    assert.doesNotMatch(bundle, /Promise\.allSettled|AbortController|setTimeout|SCRAPER_SETTINGS|require\(['"]node:/);
  }
});

test('1.1 entrada inválida lança antes de qualquer requisição', async () => {
  const cases = [
    ['abc', 'movie', null, null, /tmdbId inválido/],
    [KIMETSU_ID, 'anime', 1, 1, /mediaType inválido/],
    [KIMETSU_ID, 'tv', null, null, /Série sem temporada\/episódio válidos/],
  ];
  for (const [id, type, season, episode, pattern] of cases) {
    const runtime = makeRuntime();
    const streams = await runtime.getStreams(id, type, season, episode);
    assert.deepEqual(Array.from(streams), [], `${id} ${type}`);
    assert.equal(runtime.calls.length, 0, `${id} ${type}`);
    assert.equal(runtime.errors.length, 1, `${id} ${type}`);
    assert.match(runtime.errors[0], pattern);
  }
});

test('1.2 título PT-BR ausente e romaji presente encontra a obra', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(searchQueries(runtime.calls), ['Demon Slayer: Kimetsu no Yaiba', '鬼滅の刃', 'Kimetsu no Yaiba']);
  assert.deepEqual(pageCallPaths(runtime.calls), ['/anime/a/kimetsu-no-yaiba']);
  assert.deepEqual(videoCallIds(runtime.calls), ['25683z001']);
  assert.equal(streams.length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.1 episódio escolhido pelo número do título, em lista fora de ordem', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(videoCallIds(runtime.calls), ['25345b001']);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, ANIVIDEO_SERIES);
  assert.match(streams[0].title, /🗣️ Idioma Desconhecido/);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 decimais não são confundidos e episódio ausente devolve lista vazia', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 13);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(videoCallIds(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 temporada 1 sem marcador é aceita', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, ANIVIDEO_SERIES);
  assert.deepEqual(runtime.errors, []);
});

test('2.2 temporada 2 declarada no título é aceita', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 2, 1);

  assert.deepEqual(pageCallPaths(runtime.calls), ['/anime/a/jujutsu-kaisen', '/anime/a/jujutsu-kaisen-2']);
  assert.deepEqual(videoCallIds(runtime.calls), ['25683z001']);
  assert.equal(streams.length, 1);
  assert.deepEqual(runtime.errors, []);

  const prism = makeRuntime(makeRoute(), codes.prism);
  const prismStreams = await prism.getStreams(JUJUTSU_ID, 'tv', 2, 1);
  assert.match(prismStreams[0].title, /T02E01/);
});

test('2.2 temporada 2 não declarada devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => ({ body: searchJujutsuSeason1Only, url: finalSearchUrl(query) }),
  }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(videoCallIds(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.3 ano divergente é descartado e o filme sem ano é aceito quando é único', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(MUGEN_TRAIN_ID, 'movie', null, null);

  assert.deepEqual(pageCallPaths(runtime.calls), [
    '/anime/a/kimetsu-no-yaiba-movie-mugen-jou-hen-dublado-filme',
    '/anime/a/kimetsu-no-yaiba-movie-mugen-jou-hen-filme',
  ]);
  assert.deepEqual(videoCallIds(runtime.calls), ['130927z']);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, ANIVIDEO_MOVIE);
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].language, 'Idioma Desconhecido');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].provider, 'Anivideo');
  assert.equal(streams[0].headers, undefined);
  assert.match(streams[0].title, /🗣️ Idioma Desconhecido/);
  assert.doesNotMatch(streams[0].title, /T\d+E\d+/);
  assert.deepEqual(runtime.errors, []);

  const prism = makeRuntime(makeRoute(), codes.prism);
  const prismStreams = await prism.getStreams(MUGEN_TRAIN_ID, 'movie', null, null);
  assert.match(prismStreams[0].title, /🎬 Demon Slayer: Mugen Train \(2020\)/);
});

test('1.3 dois candidatos sem ano são ambiguidade e devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => ({ body: searchMovieAmbiguous, url: finalSearchUrl(query) }),
  }));
  const streams = await runtime.getStreams(MUGEN_TRAIN_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(videoCallIds(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.4 filme publicado com pseudoepisódio é aceito como mídia única', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => ({
      body: query === 'Kimi no Na wa.' ? searchKimi : searchEmpty,
      url: finalSearchUrl(query),
    }),
  }));
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.deepEqual(pageCallPaths(runtime.calls), ['/anime/a/kimi-no-na-wa']);
  assert.deepEqual(videoCallIds(runtime.calls), ['84767']);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, ANIVIDEO_MOVIE);
  assert.doesNotMatch(streams[0].title, /T\d+E\d+/);
  assert.deepEqual(runtime.errors, []);
});

test('2.4 página só com bg.mp4 devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoBackgroundOnly }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.4 página sem player devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoNoPlayer }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.3 parâmetro d vazio é falha agregada quando é a única opção', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoEmptyD }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AnimesDigital\] Opção iframe 1 descartada: parâmetro d ausente/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: iframe 1: parâmetro d ausente/);
});

test('2.3 parâmetro d fora de http(s) é falha agregada', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoInvalidProtocol }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção iframe 1 descartada: parâmetro d fora de http\(s\)/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
});

test('3.4 uma opção falha e a outra resolve com aviso', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoMixedOptions }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/stream/j/jujutsu-kaisen/25.mp4/index.m3u8');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AnimesDigital\] Opção iframe 1 descartada: parâmetro d ausente/);
  assert.deepEqual(runtime.errors, []);
});

test('3.4 todas as opções falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(makeRoute({ video: () => videoAllInvalid }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /Opção iframe 1 descartada: parâmetro d ausente/);
  assert.match(runtime.warnings[1], /Opção iframe 2 descartada: parâmetro d fora de http\(s\)/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: iframe 1: parâmetro d ausente.*iframe 2: parâmetro d fora de http\(s\)/);
});

test('3.1 e 3.2 contrato completo nos três formatos publicados', async () => {
  for (const [label, bundle] of Object.entries(codes)) {
    const runtime = makeRuntime(makeRoute(), bundle);
    const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 25);

    assert.equal(streams.length, 1, label);
    const [stream] = streams;
    assert.equal(stream.url, ANIVIDEO_SERIES, label);
    assert.equal(stream.type, 'hls', label);
    assert.equal(stream.provider, 'Anivideo', label);
    assert.equal(stream.quality, 'Desconhecida', label);
    assert.ok(LANGUAGE_VALUES.includes(stream.language), label);
    assert.equal(stream.language, 'Idioma Desconhecido', label);
    assert.equal(stream.name.includes('🗣️ Idioma Desconhecido'), true, label);
    assert.equal(stream.format, undefined, label);
    assert.equal(stream.headers, undefined, label);
    assert.equal(stream.size, undefined, label);
    assert.equal(stream.subtitles, undefined, label);
    assert.equal(stream.infoHash, undefined, label);
    assert.equal(typeof stream.name, 'string', label);
    assert.equal(typeof stream.title, 'string', label);
    assert.ok(stream.name.length > 0 && stream.title.length > 0, label);
  }
});

test('3.2 dublado só quando o título ou a ficha declaram', async () => {
  const gdrive = makeRuntime(makeRoute(), codes.gdrive);
  const dubbed = await gdrive.getStreams(KIMETSU_ID, 'tv', 1, 1);
  assert.equal(dubbed.length, 1);
  assert.equal(dubbed[0].language, 'Dublado');
  assert.match(dubbed[0].name, /^AnimesDigital Desconhecida\n🗣️ Dublado/);
  assert.match(dubbed[0].title, /🗣️ Dublado/);

  const prism = makeRuntime(makeRoute(), codes.prism);
  const unknown = await prism.getStreams(JUJUTSU_ID, 'tv', 1, 25);
  assert.equal(unknown[0].language, 'Idioma Desconhecido');
  assert.match(unknown[0].name, /^❓ Desconhecida\n🎬 Jujutsu Kaisen/);
  assert.match(unknown[0].name, /🗣️ Idioma Desconhecido/);
});

test('3.3 headers e qualidade não são inventados', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(MUGEN_TRAIN_ID, 'movie', null, null);

  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].headers, undefined);
});

test('1.1 busca sem cartões é ausência reconhecida', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(pageCallPaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.1 página só com fichas /filme/ é ausência reconhecida', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => ({ body: searchFilmeOnly, url: finalSearchUrl(query) }),
  }));
  const streams = await runtime.getStreams(AKIRA_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(pageCallPaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.1 HTML de busca não reconhecido é falha estrutural', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => ({ body: searchUnrecognized, url: finalSearchUrl(query) }),
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesDigital\] Falha em tv 85937: Busca fora do esquema/);
});

test('3.3 busca fora de 2xx vira erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesDigital\] Falha em tv 85937: HTTP 500 em https:\/\/animesdigital\.org\/\?s=/);
});

test('3.3 ausência da chave do TMDB termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesDigital\] Falha em tv 85937: TMDB_API_KEY indisponível/);
  assert.equal(runtime.calls.length, 0);
});

test('4.1 manifest declara o AnimesDigital com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'animesdigital');
  assert.ok(entry);
  assert.equal(entry.name, 'AnimesDigital');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/animesdigital.js');
  assert.equal(entry.enabled, true);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublados?|legendados?/i);
});

test('4.1 fixtures sanitizadas sem URL assinada, token ou cookie', () => {
  const expected = [
    'search-kimetsu.html',
    'search-empty.html',
    'search-unrecognized.html',
    'search-jujutsu.html',
    'search-jujutsu-season1-only.html',
    'search-movie-ambiguous.html',
    'search-kimi.html',
    'search-filme-only.html',
    'detail-series.html',
    'detail-series-dub.html',
    'detail-series-season2.html',
    'detail-movie.html',
    'detail-movie-dub.html',
    'detail-movie-single.html',
    'video-anivideo.html',
    'video-encoded.html',
    'video-background-only.html',
    'video-no-player.html',
    'video-empty-d.html',
    'video-invalid-protocol.html',
    'video-mixed-options.html',
    'video-all-invalid.html',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /\bPolicy=|Signature=|Key-Pair-Id=|token=|cookie|expires=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"'\s]+)/g)) {
      assert.match(match[1], /^(animesdigital\.org|api\.anivideo\.net|cdn\.example\.test|example\.blogspot\.com)$/, `${name}: ${match[1]}`);
    }
  }
});
