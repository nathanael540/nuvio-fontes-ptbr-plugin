const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'animesonlinecc');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const searchNaruto = read('search-naruto.html');
const searchDemon = read('search-demon-slayer.html');
const searchJujutsu = read('search-jujutsu.html');
const searchEmpty = read('search-empty.html');

const animeNaruto = read('anime-naruto.html');
const animeShippuden = read('anime-naruto-shippuden.html');
const animeJujutsu = read('anime-jujutsu-kaisen.html');
const animeBerserk = read('anime-berserk.html');
const animeWithoutH1 = read('anime-without-h1.html');
const animeWithoutYear = read('anime-without-year.html');
const animeWithoutSeasons = read('anime-without-seasons.html');
const animeWithOptions = read('anime-with-options.html');

const episodeNaruto = read('episode-naruto-1.html');
const episodeNoOptions = read('episode-no-options.html');
const episodeWithoutStructure = read('episode-without-structure.html');
const episodeDirect = read('episode-direct.html');
const episodeOrder = read('episode-order.html');
const episodeUnknownHost = read('episode-unknown-host.html');
const episodeLookalike = read('episode-lookalike-host.html');
const episodeMixdrop = read('episode-mixdrop.html');
const episodeStreamtape = read('episode-streamtape.html');
const episodeDood = read('episode-dood.html');
const episodeByse = read('episode-byse.html');
const episodeTechnical = read('episode-technical-label.html');
const episodeDuplicate = read('episode-duplicate.html');
const episodeDivSrc = read('episode-div-src.html');

const bloggerTwo = read('blogger-two-formats.html');
const bloggerNoFormats = read('blogger-no-formats.html');
const mixdropEmbed = read('mixdrop-embed.html');
const streamtapeEmbed = read('streamtape-embed.html');
const doodEmbed = read('dood-embed.html');
const doodPass = read('dood-pass.txt');
const byseEmbed = read('byse-embed.html');

const NARUTO_ID = '46260';
const NARUTO_SHIPPUDEN_ID = '31910';
const DEMON_SLAYER_ID = '85937';
const JUJUTSU_ID = '95479';
const MOVIE_ID = '129';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [NARUTO_ID]: seriesInfo({
    name: 'Naruto',
    original: 'NARUTO',
    year: 2002,
    seasons: [{ number: 1, episodeCount: 220, year: 2002 }],
  }),
  [NARUTO_SHIPPUDEN_ID]: seriesInfo({
    name: 'Naruto Shippuden',
    original: 'NARUTO 疾風伝',
    year: 2007,
    romaji: ['Naruto: Shippuden'],
    seasons: [{ number: 1, episodeCount: 500, year: 2007 }],
  }),
  [DEMON_SLAYER_ID]: seriesInfo({
    name: 'Demon Slayer: Kimetsu no Yaiba',
    original: '鬼滅の刃',
    year: 2019,
    romaji: ['Kimetsu no Yaiba'],
    seasons: [{ number: 1, episodeCount: 26, year: 2019 }],
  }),
  [JUJUTSU_ID]: seriesInfo({
    name: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    year: 2020,
    seasons: [
      { number: 1, episodeCount: 24, year: 2020 },
      { number: 2, episodeCount: 23, year: 2023 },
      { number: 3, episodeCount: 12, year: 2026 },
    ],
  }),
  [ABSENT_ID]: seriesInfo({
    name: 'Título Inexistente',
    original: 'Missing Title',
    year: 2020,
    seasons: [{ number: 1, episodeCount: 1, year: 2020 }],
  }),
  [MOVIE_ID]: movieInfo({ title: 'A Viagem de Chihiro', original: '千と千尋の神隠し', year: 2001 }),
};

const ANIME_FIXTURES = {
  'naruto': animeNaruto,
  'naruto-shippuden': animeShippuden,
  'jujutsu-kaisen': animeJujutsu,
  'berserk': animeBerserk,
};

const EPISODE_FIXTURES = {
  'naruto-episodio-1': 'episode-naruto-classic.html',
  'naruto-shippuden-episodio-1': 'episode-naruto-1.html',
  'naruto-shippuden-episodio-2': 'episode-no-options.html',
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animesonlinecc-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('animesonlinecc', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('animesonlinecc', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animesonlinecc', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

function movieInfo({ title, original, year }) {
  return {
    title,
    original_title: original,
    release_date: `${year}-01-01`,
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: { titles: [] },
  };
}

function seriesInfo({ name, original, year, romaji = [], seasons = [] }) {
  return {
    name,
    original_name: original,
    first_air_date: `${year}-01-01`,
    original_language: 'ja',
    origin_country: ['JP'],
    genres: [{ id: 16 }],
    external_ids: { imdb_id: 'tt0000002' },
    alternative_titles: {
      results: romaji.map((title) => ({ iso_3166_1: 'JP', title, type: 'Romaji' })),
    },
    seasons: seasons.map((season) => ({
      season_number: season.number,
      episode_count: season.episodeCount,
      name: `Temporada ${season.number}`,
      air_date: `${season.year}-01-01`,
    })),
  };
}

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = makeRoute(), bundle = codes.gdrive, options = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const logs = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    require: (name) => {
      assert.equal(name, 'cheerio-without-node-native');
      return { load };
    },
    console: {
      log: (message) => logs.push(String(message)),
      warn: (message) => warnings.push(String(message)),
      error: (message) => errors.push(String(message)),
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
  vm.runInNewContext(bundle, context, { filename: 'animesonlinecc.js' });
  return {
    calls,
    errors,
    warnings,
    logs,
    getStreams: async (...args) => JSON.parse(JSON.stringify(await context.module.exports.getStreams(...args))),
  };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (value instanceof Error) return value;
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value || 'url' in value)) return value;
  return { body: value };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const mediaType = parts[2];
  const id = parts[3];
  const data = TMDB_BY_ID[id];
  if (!data || (mediaType !== 'movie' && mediaType !== 'tv')) {
    return { status: 404, body: { status_message: 'Not found' } };
  }
  return data;
}

function searchFor(query) {
  if (query === 'Naruto' || query === 'Naruto Shippuden' || query === 'Naruto: Shippuden') return searchNaruto;
  if (query === 'Demon Slayer: Kimetsu no Yaiba' || query === 'Kimetsu no Yaiba') return searchDemon;
  if (query === 'Jujutsu Kaisen') return searchJujutsu;
  return searchEmpty;
}

function animeFor(slug) {
  const fixture = ANIME_FIXTURES[slug];
  if (fixture !== undefined) return fixture;
  return { status: 404, body: 'not found' };
}

function episodeFor(slug) {
  const fixture = EPISODE_FIXTURES[slug];
  if (fixture !== undefined) return read(fixture);
  return { status: 404, body: 'not found' };
}

function bloggerFor(url) {
  const fixture = url.searchParams.get('fixture');
  if (fixture === 'dublado') return bloggerTwo;
  if (fixture === 'legendado') return bloggerNoFormats;
  throw new Error(`fixture de player inesperada: ${fixture}`);
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname === 'animesonlinecc.to') {
      if (url.pathname === '/' && url.searchParams.has('s')) {
        const query = url.searchParams.get('s');
        return asResponse(options.search === undefined ? searchFor(query) : options.search(query));
      }
      if (url.pathname.startsWith('/anime/')) {
        const slug = url.pathname.split('/').filter(Boolean).pop();
        return asResponse(options.anime === undefined ? animeFor(slug) : options.anime(slug));
      }
      if (url.pathname.startsWith('/episodio/')) {
        const slug = url.pathname.split('/').filter(Boolean).pop();
        return asResponse(options.episode === undefined ? episodeFor(slug) : options.episode(slug));
      }
      throw new Error(`Rota inesperada: ${url.pathname}`);
    }
    if (url.hostname === 'www.blogger.com' || url.hostname === 'blogger.com') {
      return asResponse(options.blogger === undefined ? bloggerFor(url) : options.blogger(url));
    }
    if (url.hostname === 'mixdrop.co') return asResponse(options.mixdrop === undefined ? mixdropEmbed : options.mixdrop);
    if (url.hostname === 'streamtape.com') return asResponse(options.streamtape === undefined ? streamtapeEmbed : options.streamtape);
    if (url.hostname === 'dood.to') {
      if (url.pathname.startsWith('/pass_md5/')) return asResponse(options.doodPass === undefined ? doodPass : options.doodPass);
      return asResponse(options.dood === undefined ? doodEmbed : options.dood);
    }
    if (url.hostname === 'byse.sx') return asResponse(options.byse === undefined ? byseEmbed : options.byse);
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function searchQueries(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.hostname === 'animesonlinecc.to' && url.pathname === '/' && url.searchParams.has('s'))
    .map((url) => url.searchParams.get('s'));
}

function animePaths(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.hostname === 'animesonlinecc.to' && url.pathname.startsWith('/anime/'))
    .map((url) => url.pathname);
}

function episodePaths(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.hostname === 'animesonlinecc.to' && url.pathname.startsWith('/episodio/'))
    .map((url) => url.pathname);
}

function assertNoForbiddenApi(bundle) {
  assert.doesNotMatch(bundle, /Promise\.allSettled|AbortController|setTimeout|SCRAPER_SETTINGS|hasSettings/);
  assert.doesNotMatch(bundle, /require\(['"]node:|from ['"]node:/);
}

function assertNoProbe(runtime) {
  for (const call of runtime.calls) {
    assert.equal(call.init.method === undefined ? 'GET' : call.init.method, 'GET', call.url);
    const headers = call.init.headers || {};
    assert.equal(Object.keys(headers).some((name) => name.toLowerCase() === 'range'), false, call.url);
  }
}

test('o pacote carrega sem rede, expõe getStreams e não lê settings', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.getStreams, 'function');
  assert.equal(fetchCalled, false);
  for (const bundle of [codes.base, codes.gdrive, codes.prism]) {
    assertNoForbiddenApi(bundle);
  }
});

test('filme é recusado sem requisição ao AnimesOnlineCC', async () => {
  for (const args of [[MOVIE_ID, 'movie', null, null], [NARUTO_SHIPPUDEN_ID, 'movie', 1, 1]]) {
    const runtime = makeRuntime(makeRoute());
    const streams = await runtime.getStreams(...args);
    assert.deepEqual(streams, []);
    assert.equal(runtime.calls.length, 0);
    assert.deepEqual(runtime.errors, []);
  }
});

test('entrada inválida falha antes de qualquer requisição', async () => {
  const cases = [
    ['abc', 'tv', 1, 1, /tmdbId inválido/],
    ['abc', 'movie', null, null, /tmdbId inválido/],
    [NARUTO_SHIPPUDEN_ID, 'anime', 1, 1, /mediaType inválido/],
    [NARUTO_SHIPPUDEN_ID, 'tv', null, 1, /Série sem temporada\/episódio válidos/],
    [NARUTO_SHIPPUDEN_ID, 'tv', 1, 0, /Série sem temporada\/episódio válidos/],
    [NARUTO_SHIPPUDEN_ID, 'tv', 1, 1.5, /Série sem temporada\/episódio válidos/],
  ];
  for (const [id, type, season, episode, pattern] of cases) {
    const runtime = makeRuntime(makeRoute());
    const streams = await runtime.getStreams(id, type, season, episode);
    assert.deepEqual(streams, [], `${id} ${type}`);
    assert.equal(runtime.calls.length, 0, `${id} ${type}`);
    assert.equal(runtime.errors.length, 1, `${id} ${type}`);
    assert.match(runtime.errors[0], /^\[AnimesOnlineCC\] Falha em/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('o TMDB é consultado antes da fonte e as variantes saem na ordem do TMDB', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchEmpty }));
  await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.match(runtime.calls[0].url, /^https:\/\/api\.themoviedb\.org\/3\/tv\/31910/);
  assert.deepEqual(searchQueries(runtime.calls), ['Naruto Shippuden', 'NARUTO 疾風伝']);
});

test('Naruto Shippuden S01E01 confirma a ficha e resolve as duas opções do Blogger', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(animePaths(runtime.calls), ['/anime/naruto-shippuden/']);
  assert.deepEqual(episodePaths(runtime.calls), ['/episodio/naruto-shippuden-episodio-1/']);
  assert.equal(streams.length, 2);
  assert.deepEqual(
    streams.map((stream) => ({ quality: stream.quality, language: stream.language, url: stream.url, provider: stream.provider, type: stream.type })),
    [
      { quality: '360p', language: 'Dublado', url: 'https://cdn.example.test/blogger/360.mp4', provider: 'Blogger', type: 'mp4' },
      { quality: '144p', language: 'Dublado', url: 'https://cdn.example.test/blogger/144.mp4', provider: 'Blogger', type: 'mp4' },
    ],
  );
  assert.equal(streams[0].headers, undefined);
  assert.equal(streams[0].format, undefined);
  assert.match(streams[0].name, /^AnimesOnlineCC 360p/);
  assert.doesNotMatch(streams[0].title, /Naruto Shippuden/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.ok(streams.every((stream) => LANGUAGE_VALUES.includes(stream.language)));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção Legendado descartada: Player do Blogger sem streamingData/);
  assert.deepEqual(runtime.errors, []);
  assertNoProbe(runtime);
});

test('título "Naruto Clássico Dublado" é confirmado depois de limpar o sufixo Clássico', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(animePaths(runtime.calls), ['/anime/naruto-shippuden/', '/anime/naruto/']);
  assert.deepEqual(episodePaths(runtime.calls), ['/episodio/naruto-episodio-1/']);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '360p');
  assert.equal(streams[0].language, 'Dublado');
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('busca sem resultado devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(ABSENT_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(searchQueries(runtime.calls).length, 2);
  assert.deepEqual(animePaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('resultado alheio é rejeitado na ficha por título e ano', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(DEMON_SLAYER_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.deepEqual(animePaths(runtime.calls), ['/anime/berserk/']);
  assert.deepEqual(episodePaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('ano divergente rejeita o candidato e a busca termina em ausência', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: (slug) => (slug === 'naruto-shippuden' ? animeShippuden.replace('<span class="date">2007</span>', '<span class="date">2015</span>') : animeFor(slug)),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.deepEqual(episodePaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
});

test('ficha 404 é pulada e os demais candidatos continuam sendo avaliados', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: (slug) => (slug === 'naruto-shippuden' ? { status: 404, body: 'not found' } : animeFor(slug)),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.deepEqual(animePaths(runtime.calls), [
    '/anime/naruto-shippuden/',
    '/anime/naruto/',
    '/anime/boruto-naruto-next-generations/',
  ]);
  assert.deepEqual(runtime.errors, []);
});

test('no máximo quatro fichas são abertas no total', async () => {
  const cards = Array.from({ length: 6 }, (_, index) => `<article class="item se tvshows"><div class="data"><h3> <a href="https://animesonlinecc.to/anime/naruto-${index}/">Naruto ${index}</a></h3></div></article>`).join('\n');
  const runtime = makeRuntime(makeRoute({
    search: () => `<div class="module"><div class="content">${cards}</div></div>`,
    anime: () => animeBerserk,
  }));
  const streams = await runtime.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.equal(streams.length, 0);
  assert.equal(animePaths(runtime.calls).length, 4);
  assert.equal(runtime.errors.length, 0);
});

test('ficha 200 sem h1 ou sem ano é erro de estrutura', async () => {
  for (const [fixture, pattern] of [[animeWithoutH1, /sem h1/], [animeWithoutYear, /sem span\.date/]]) {
    const runtime = makeRuntime(makeRoute({ anime: () => fixture }));
    const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
    assert.deepEqual(streams, []);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], /^\[AnimesOnlineCC\]/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('busca sem cartões e sem marcador de nenhum resultado é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => '<div class="module"><div class="content"></div></div>' }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem cartões e sem o marcador de nenhum resultado/);
});

test('temporada não publicada e temporada agrupada devolvem lista vazia', async () => {
  for (const args of [[JUJUTSU_ID, 'tv', 4, 1], [NARUTO_SHIPPUDEN_ID, 'tv', 2, 1]]) {
    const runtime = makeRuntime();
    const streams = await runtime.getStreams(...args);
    assert.deepEqual(streams, [], `${args[2]}x${args[3]}`);
    assert.deepEqual(episodePaths(runtime.calls), []);
    assert.deepEqual(runtime.errors, []);
  }
});

test('temporada 2 de Jujutsu Kaisen usa o href publicado da segunda temporada', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDirect }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 2, 1);

  assert.deepEqual(episodePaths(runtime.calls), ['/episodio/jujutsu-kaisen-2-episodio-1/']);
  assert.equal(streams.length, 2);
  assert.deepEqual(runtime.errors, []);
});

test('episódio não publicado devolve lista vazia', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 2);

  assert.deepEqual(streams, []);
  assert.deepEqual(episodePaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
});

test('ficha confirmada sem div.se-c é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ anime: () => animeWithoutSeasons }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem div\.se-c/);
});

test('embed no próprio div e embed no iframe interno resolvem', async () => {
  const divRuntime = makeRuntime(makeRoute({ episode: () => episodeDivSrc }));
  const divStreams = await divRuntime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
  assert.equal(divStreams.length, 1);
  assert.equal(divStreams[0].url, 'https://cdn.example.test/div-src/480p.mp4');
  assert.equal(divStreams[0].language, 'Legendado');

  const iframeRuntime = makeRuntime(makeRoute({ episode: () => episodeDirect }));
  const iframeStreams = await iframeRuntime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
  assert.equal(iframeStreams.length, 2);
  assert.equal(iframeStreams[0].language, 'Idioma Desconhecido');
});

test('fallback para /anime/<slug>/ resolve as opções da ficha', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: () => animeWithOptions,
    episode: () => episodeNoOptions,
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(animePaths(runtime.calls), ['/anime/naruto-shippuden/']);
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map((stream) => [stream.quality, stream.type]), [['1080p', 'mp4'], ['Desconhecida', 'hls']]);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('episódio 404 usa o fallback da ficha', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: () => animeWithOptions,
    episode: () => ({ status: 404, body: 'not found' }),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(episodePaths(runtime.calls), ['/episodio/naruto-shippuden-episodio-1/']);
  assert.equal(streams.length, 2);
  assert.deepEqual(runtime.errors, []);
});

test('sem option-* nas duas páginas devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeNoOptions }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.logs, []);
});

test('página de episódio sem h1.epih1 nem #info h1 é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeWithoutStructure }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Página de episódio sem h1\.epih1 ou #info h1/);
});

test('host desconhecido e host parecido são triagem, não falha', async () => {
  for (const [fixture, label, reason] of [
    [episodeUnknownHost, 'HD', 'host player.example.test não suportado'],
    [episodeLookalike, 'Legendado', 'host mixdrop.co.example.test não suportado'],
  ]) {
    const runtime = makeRuntime(makeRoute({ episode: () => fixture }));
    const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

    assert.deepEqual(streams, []);
    assert.equal(runtime.logs.length, 1);
    assert.ok(runtime.logs[0].includes(`Opção ${label} descartada por triagem: ${reason}`), runtime.logs[0]);
    assert.deepEqual(runtime.warnings, []);
    assert.deepEqual(runtime.errors, []);
  }
});

test('uma opção falha e a outra resolve, com aviso', async () => {
  const runtime = makeRuntime(makeRoute({
    blogger: (url) => (url.searchParams.get('fixture') === 'legendado' ? { status: 500, body: 'erro' } : bloggerTwo),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.ok(streams.every((stream) => stream.language === 'Dublado'));
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AnimesOnlineCC\] Opção Legendado descartada: HTTP 500 em \[url\]$/);
  assert.deepEqual(runtime.errors, []);
});

test('todas as opções falham e o erro agregado sobe até getStreams', async () => {
  const runtime = makeRuntime(makeRoute({
    blogger: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /Opção Dublado descartada: HTTP 500 em \[url\]/);
  assert.match(runtime.warnings[1], /Opção Legendado descartada: HTTP 500 em \[url\]/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesOnlineCC\] Falha em tv 31910: Nenhuma opção produziu stream: Dublado: HTTP 500 em \[url\]; Legendado: HTTP 500 em \[url\]$/);
});

test('mídia direta MP4 e HLS é aceita sem buscar player e sem sonda', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDirect }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams.map((stream) => [stream.url, stream.type, stream.quality]), [
    ['https://cdn.example.test/direto/1080p.mp4', 'mp4', '1080p'],
    ['https://cdn.example.test/direto/master.m3u8', 'hls', 'Desconhecida'],
  ]);
  assert.ok(streams.every((stream) => stream.provider === 'AnimesOnlineCC'));
  const fetched = runtime.calls.map((call) => call.url);
  assert.equal(fetched.some((url) => url.startsWith('https://cdn.example.test/direto/')), false);
  assertNoProbe(runtime);
});

test('rótulo técnico preserva o stream com idioma desconhecido', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeTechnical }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Idioma Desconhecido');
});

test('MixDrop resolve a mídia e devolve os cabeçalhos do adaptador', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeMixdrop }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/mixdrop/720.mp4');
  assert.equal(streams[0].type, 'mp4');
  assert.equal(streams[0].provider, 'MixDrop');
  assert.equal(streams[0].language, 'Legendado');
  assert.match(streams[0].headers['User-Agent'], /Mozilla/);
  assert.equal(streams[0].headers.Referer, 'https://mixdrop.co/e/abc123');
  assert.deepEqual(runtime.errors, []);
});

test('Streamtape resolve o robotlink e devolve os cabeçalhos do adaptador', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeStreamtape }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/streamtape/get_video?id=stape123&signature=EXAMPLE');
  assert.equal(streams[0].provider, 'Streamtape');
  assert.equal(streams[0].headers.Referer, 'https://streamtape.com/e/stape123');
  assert.deepEqual(runtime.errors, []);
});

test('DoodStream resolve via pass_md5 e devolve os cabeçalhos do adaptador', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDood }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.match(streams[0].url, /^https:\/\/cdn\.example\.test\/dood\/[A-Za-z0-9]{10}\?token=def456&expiry=\d+$/);
  assert.equal(streams[0].provider, 'DoodStream');
  assert.equal(streams[0].headers.Referer, 'https://dood.to/');
  assert.deepEqual(runtime.errors, []);
});

test('Byse resolve o HLS desempacotado como master inteiro', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeByse }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/byse/master.m3u8');
  assert.equal(streams[0].type, 'hls');
  assert.equal(streams[0].provider, 'Byse');
  assert.equal(streams[0].headers, undefined);
  assert.deepEqual(runtime.errors, []);
});

test('deduplicação mantém o primeiro stream da mesma URL', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDuplicate }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].url, 'https://cdn.example.test/direto/360p.mp4');
});

test('ordenação final põe as qualidades conhecidas antes da desconhecida', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeOrder }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams.map((stream) => [stream.quality, stream.language]), [
    ['1080p', 'Dublado'],
    ['720p', 'Legendado'],
    ['Desconhecida', 'Legendado'],
  ]);
});

test('busca 403 e ficha 503 sobem como erro registrado', async () => {
  const cases = [
    [makeRoute({ search: () => ({ status: 403, body: 'bloqueado' }) }), /HTTP 403/],
    [makeRoute({ anime: () => ({ status: 503, body: 'indisponível' }) }), /HTTP 503/],
  ];
  for (const [route, pattern] of cases) {
    const runtime = makeRuntime(route);
    const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
    assert.deepEqual(streams, []);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], /^\[AnimesOnlineCC\]/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('episódio 403 é falha fatal, sem fallback', async () => {
  const runtime = makeRuntime(makeRoute({
    anime: () => animeWithOptions,
    episode: () => ({ status: 403, body: 'bloqueado' }),
  }));
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /HTTP 403/);
  assert.deepEqual(runtime.warnings, []);
});

test('ausência da chave do TMDB termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimesOnlineCC\] Falha em tv 31910: TMDB_API_KEY indisponível/);
});

test('contrato dos streams nos três formatos publicados', async () => {
  for (const [label, bundle] of Object.entries(codes)) {
    const runtime = makeRuntime(makeRoute(), bundle);
    const streams = await runtime.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);

    assert.equal(streams.length, 2, label);
    for (const stream of streams) {
      assert.equal(typeof stream.url, 'string', label);
      assert.match(stream.url, /^https:\/\//, label);
      assert.equal(typeof stream.name, 'string', label);
      assert.equal(typeof stream.title, 'string', label);
      assert.ok(stream.name.length > 0 && stream.title.length > 0, label);
      assert.ok(LANGUAGE_VALUES.includes(stream.language), label);
      assert.equal(stream.type, 'mp4', label);
      assert.equal(stream.provider, 'Blogger', label);
      assert.equal(stream.format, undefined, label);
      assert.equal(stream.headers, undefined, label);
      assert.equal(stream.size, undefined, label);
      assert.equal(stream.subtitles, undefined, label);
      assert.equal(stream.infoHash, undefined, label);
    }
    assert.ok(streams.every((stream) => stream.name.includes('🗣️')), label);
  }

  const gdrive = makeRuntime(makeRoute(), codes.gdrive);
  const gdriveStreams = await gdrive.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
  assert.match(gdriveStreams[0].name, /^AnimesOnlineCC 360p\n🗣️ Dublado/);

  const prism = makeRuntime(makeRoute(), codes.prism);
  const prismStreams = await prism.getStreams(NARUTO_SHIPPUDEN_ID, 'tv', 1, 1);
  assert.match(prismStreams[0].name, /360p/);
  assert.match(prismStreams[0].title, /🎬 Naruto Shippuden \(2007\) T01E01/);
});

test('manifest declara o AnimesOnlineCC com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'animesonlinecc');
  assert.ok(entry);
  assert.equal(entry.name, 'AnimesOnlineCC');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['tv']);
  assert.deepEqual(entry.formats, ['mp4', 'm3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/animesonlinecc.js');
  assert.equal(entry.enabled, true);
  assert.equal(entry.hasSettings, undefined);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublada|legendada/i);
});

test('fixtures estão presentes e sanitizadas', () => {
  const expected = [
    'search-naruto.html',
    'search-demon-slayer.html',
    'search-jujutsu.html',
    'search-empty.html',
    'anime-naruto.html',
    'anime-naruto-shippuden.html',
    'anime-jujutsu-kaisen.html',
    'anime-berserk.html',
    'anime-without-h1.html',
    'anime-without-year.html',
    'anime-without-seasons.html',
    'anime-with-options.html',
    'episode-naruto-1.html',
    'episode-naruto-classic.html',
    'episode-no-options.html',
    'episode-without-structure.html',
    'episode-direct.html',
    'episode-order.html',
    'episode-div-src.html',
    'episode-technical-label.html',
    'episode-duplicate.html',
    'episode-unknown-host.html',
    'episode-lookalike-host.html',
    'episode-mixdrop.html',
    'episode-streamtape.html',
    'episode-dood.html',
    'episode-byse.html',
    'blogger-two-formats.html',
    'blogger-no-formats.html',
    'mixdrop-embed.html',
    'streamtape-embed.html',
    'dood-embed.html',
    'dood-pass.txt',
    'byse-embed.html',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  const allowedHosts = [
    'animesonlinecc\\.to',
    'www\\.blogger\\.com',
    'blogger\\.com',
    'cdn\\.example\\.test',
    'player\\.example\\.test',
    'mixdrop\\.co',
    'mixdrop\\.co\\.example\\.test',
    'streamtape\\.com',
    'dood\\.to',
    'byse\\.sx',
  ];
  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /\btoken=(?!EXAMPLE\b)/, name);
    assert.doesNotMatch(content, /googlevideo|Signature=|Key-Pair-Id=/, name);
    assert.doesNotMatch(content, /\bcookie\b/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https?:\/\/([^/"'\s]+)/g)) {
      assert.match(match[1], new RegExp(`^(${allowedHosts.join('|')})$`), `${name}: ${match[1]}`);
    }
  }
});

test('fixtures preservam o contrato observado da fonte', () => {
  assert.deepEqual(
    [...searchNaruto.matchAll(/<div class="data"><h3> <a href="https:\/\/animesonlinecc\.to\/anime\/([^/]+)\/">/g)].map((match) => match[1]),
    ['boruto-naruto-next-generations', 'naruto-shippuden', 'naruto'],
  );
  assert.match(searchEmpty, /Nenhum resultado encontrado\./);
  assert.match(animeShippuden, /<h1>Naruto Shippuden Todos os Episodios Online<\/h1>/);
  assert.match(animeShippuden, /<span class="date">2007<\/span>/);
  assert.match(animeShippuden, /<span class="se-t se-o">1<\/span>/);
  assert.match(animeShippuden, /<div class="numerando">Ep - 1<\/div>/);
  assert.match(episodeNaruto, /<div id="option-1" class="play-box-iframe fixidtab">/);
  assert.match(episodeNaruto, /<iframe[^>]+src="https:\/\/www\.blogger\.com\/video\.g\?token=EXAMPLE/);
  assert.match(episodeNaruto, /<a class="options" href="#option-1">[^<]*<b[^>]*><\/b> Dublado/);
});
