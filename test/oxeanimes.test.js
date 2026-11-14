const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'oxeanimes');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const searchKimetsu = readJson('search-kimetsu.json');
const searchDemonSlayer = readJson('search-demon-slayer.json');
const searchJujutsu = readJson('search-jujutsu.json');
const searchYourName = readJson('search-your-name.json');
const searchEmpty = readJson('search-empty.json');
const searchUnrelated = readJson('search-unrelated.json');
const searchCandidateRetry = readJson('search-candidate-retry.json');
const episodeStreamUrl = readJson('episode-stream-url.json');
const episodeDub = readJson('episode-dub.json');
const episodeMovie = readJson('episode-movie.json');
const episodeSourcesHls = readJson('episode-sources-hls.json');
const episode720 = readJson('episode-720.json');
const episodeDirectHls = readJson('episode-direct-hls.json');
const episodeEmbed = readJson('episode-embed.json');

const KIMETSU_ID = '85937';
const JUJUTSU_ID = '95479';
const YOUR_NAME_ID = '372058';
const AKIRA_ID = '149';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

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
  }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('oxeanimes-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('oxeanimes', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('oxeanimes', { outDir, formatter: 'prism' }), 'utf8');
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
  vm.runInNewContext(bundle, context, { filename: 'oxeanimes.js' });
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
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function defaultTmdb(url) {
  const [, , mediaType, id] = url.pathname.split('/');
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  return mediaType === 'movie' || mediaType === 'tv' ? data : { status: 404, body: {} };
}

function searchFor(query) {
  if (query === 'Demon Slayer: Kimetsu no Yaiba') return searchDemonSlayer;
  if (query === 'Kimetsu no Yaiba') return searchKimetsu;
  if (query === 'Jujutsu Kaisen' || query === 'Jujutsu Kaisen 2') return searchJujutsu;
  if (query === 'Your Name.' || query === 'Kimi no Na wa.') return searchYourName;
  if (query === 'Akira') return searchUnrelated;
  return searchEmpty;
}

function pageFor(slug) {
  if (slug === 'kimetsu-no-yaiba') return read('page-series.html');
  if (slug === 'kimetsu-no-yaiba-dublado') return read('page-series-dub.html');
  if (slug === 'demon-slayer-kimetsu-no-yaiba-castelo-infinito') return read('page-arc.html');
  if (slug === 'demon-slayer-kimetsu-no-yaiba-castelo-infinito-dublado') return read('page-arc-dub.html');
  if (slug === 'kimetsu-no-yaiba-hashira-geiko-hen-todos-os-episodios') return read('page-no-links.html');
  if (slug === 'kimetsu-no-yaiba-arco-dublado') return read('page-arc-dub.html');
  if (slug === 'your-name') return read('page-movie.html');
  if (slug === 'jujutsu-kaisen-2' || slug === 'jujutsu-kaisen-2-dublado') return read('page-jujutsu2.html');
  if (slug === 'jujutsu-kaisen-dublado' || slug === 'jujutsu-kaisen-0-o-filme-dublado') return read('page-jujutsu2.html');
  return { status: 404, body: 'Obra não encontrada' };
}

function episodeFor(id) {
  if (id === '9677') return episodeStreamUrl;
  if (id === '20109') return episodeDub;
  if (id === '20110') return episodeSourcesHls;
  if (id === '22331') return episodeMovie;
  if (id === '11884' || id === '11885') return episodeEmbed;
  return { status: 404, body: 'Episódio não encontrado' };
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'oxeanimes.com.br') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/api/chat-search') {
      const query = url.searchParams.get('q');
      if (options.search) return asResponse(options.search(query));
      return asResponse(searchFor(query));
    }
    if (url.pathname.startsWith('/anime/')) {
      const slug = decodeURIComponent(url.pathname.slice('/anime/'.length));
      if (options.page) return asResponse(options.page(slug));
      return asResponse(pageFor(slug));
    }
    if (url.pathname.startsWith('/api/episode/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/episode/'.length));
      if (options.episode) return asResponse(options.episode(id));
      return asResponse(episodeFor(id));
    }
    if (url.pathname === '/api/stream') throw new Error('O provedor não deve abrir o proxy');
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function callsTo(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname);
}

function pageCallPaths(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/anime/'))
    .map((url) => url.pathname);
}

function episodeCallIds(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/api/episode/'))
    .map((url) => decodeURIComponent(url.pathname.slice('/api/episode/'.length)));
}

function searchQueries(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname === '/api/chat-search')
    .map((url) => url.searchParams.get('q'));
}

function proxyUrl(value) {
  return new URL(value, 'https://oxeanimes.com.br/').href;
}

test('1.1 e 3.4 carrega o pacote sem rede, expõe getStreams e não lê settings', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.getStreams, 'function');
  assert.equal(fetchCalled, false);
  for (const bundle of [codes.gdrive, codes.prism]) {
    assert.doesNotMatch(bundle, /Promise\.allSettled|AbortController|setTimeout|SCRAPER_SETTINGS|require\(['"]node:/);
  }
});

test('1.4 entrada inválida lança antes de qualquer requisição', async () => {
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

test('1.2 e 3.2 série resolve dublado e legendado com o contrato completo', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['Desconhecida', 'Desconhecida']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    proxyUrl(episodeDub.streamUrl),
    proxyUrl(episodeStreamUrl.streamUrl),
  ]);

  for (const stream of streams) {
    assert.ok(LANGUAGE_VALUES.includes(stream.language));
    assert.equal(stream.provider, 'OxeAnimes');
    assert.equal(stream.type, 'hls');
    assert.deepEqual(Object.keys(stream.headers).sort(), ['Referer', 'User-Agent']);
    assert.equal(stream.headers.Referer, 'https://oxeanimes.com.br/');
    assert.match(stream.headers['User-Agent'], /Mozilla\/5\.0/);
    assert.equal(stream.headers.Origin, undefined);
    assert.equal(stream.format, undefined);
    assert.equal(stream.size, undefined);
    assert.equal(stream.subtitles, undefined);
    assert.equal(stream.infoHash, undefined);
    assert.equal(stream.seeders, undefined);
    assert.equal(stream.peers, undefined);
  }
  assert.match(streams[0].name, /^OxeAnimes Desconhecida\n/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.match(streams[1].title, /🗣️ Legendado/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.2 acumula variantes e o título exato vence a página do arco', async () => {
  const runtime = makeRuntime();
  await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  const queries = searchQueries(runtime.calls);
  assert.ok(queries.includes('Demon Slayer: Kimetsu no Yaiba'));
  assert.ok(queries.includes('Kimetsu no Yaiba'));
  const pages = pageCallPaths(runtime.calls);
  assert.ok(pages.includes('/anime/kimetsu-no-yaiba'));
  assert.ok(pages.includes('/anime/kimetsu-no-yaiba-dublado'));
  assert.ok(!pages.includes('/anime/demon-slayer-kimetsu-no-yaiba-castelo-infinito'));
  assert.ok(!pages.includes('/anime/demon-slayer-kimetsu-no-yaiba-castelo-infinito-dublado'));
  assert.equal(callsTo(runtime.calls, '/api/stream').length, 0);
});

test('3.2 template Prism mantém os campos com apresentação própria', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.match(streams[0].name, /Desconhecida/);
  assert.match(streams[0].title, /🎬 Demon Slayer: Kimetsu no Yaiba \(2019\) T01E01/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[1].language, 'Legendado');
});

test('3.2 rótulo numérico vira qualidade e FHD sem número fica Desconhecida', async () => {
  const numeric = makeRuntime(makeRoute({ episode: () => episode720 }));
  const numericStreams = await numeric.getStreams(KIMETSU_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(numericStreams, (stream) => stream.quality), ['720p', '720p']);
  assert.match(numericStreams[0].name, /^OxeAnimes 720p\n/);

  const fhd = makeRuntime();
  const fhdStreams = await fhd.getStreams(KIMETSU_ID, 'tv', 1, 1);
  assert.deepEqual(Array.from(fhdStreams, (stream) => stream.quality), ['Desconhecida', 'Desconhecida']);
});

test('2.3 usa a primeira fonte HLS quando streamUrl está ausente', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: (id) => (id === '9677' || id === '20109' ? episodeSourcesHls : { status: 404, body: 'x' }),
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    proxyUrl(episodeSourcesHls.sources[1].url),
    proxyUrl(episodeSourcesHls.sources[1].url),
  ]);
});

test('2.3 aceita HLS direto absoluto quando não há proxy', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDirectHls }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 2);
  for (const stream of streams) {
    assert.equal(stream.url, 'https://cdn.example.test/oxeanimes/direto/master.m3u8');
    assert.equal(stream.quality, '1080p');
  }
});

test('2.3 episódio só embed é triagem e devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 2, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(episodeCallIds(runtime.calls).length, 2);
});

test('3.1 um áudio falha e o outro resolve com aviso', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: (id) => (id === '20109'
      ? { status: 502, body: read('episode-502.txt') }
      : episodeFor(id)),
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[OxeAnimes\] Opção dublado descartada: HTTP 502 em \[url\]/);
  assert.deepEqual(runtime.errors, []);
});

test('3.1 todos os áudios falham e o erro agregado sobe', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: () => ({ status: 502, body: read('episode-502.txt') }),
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /Opção dublado descartada: HTTP 502/);
  assert.match(runtime.warnings[1], /Opção legendado descartada: HTTP 502/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: dublado: HTTP 502 em \[url\]; legendado: HTTP 502 em \[url\]/);
});

test('1.3 tenta o próximo candidato quando a página não tem o episódio', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (query) => (query === 'Kimetsu no Yaiba' ? searchCandidateRetry : searchEmpty),
    page: (slug) => {
      if (slug === 'kimetsu-no-yaiba-arco-dublado') return read('page-arc-dub.html');
      if (slug === 'kimetsu-no-yaiba-dublado') return read('page-series-dub.html');
      return { status: 404, body: 'x' };
    },
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 2);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.deepEqual(pageCallPaths(runtime.calls), [
    '/anime/kimetsu-no-yaiba-arco-dublado',
    '/anime/kimetsu-no-yaiba-dublado',
  ]);
  assert.deepEqual(episodeCallIds(runtime.calls), ['20110']);
});

test('1.3 série sem o episódio devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 99);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(episodeCallIds(runtime.calls).length, 0);
});

test('2.1 página sem links é ausência reconhecida', async () => {
  const runtime = makeRuntime(makeRoute({ page: () => read('page-no-links.html') }));
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(episodeCallIds(runtime.calls).length, 0);
});

test('2.1 link sem número legível é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ page: () => read('page-unreadable.html') }));
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção legendado descartada: Link de reprodução sem número legível/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem número legível/);
  assert.equal(episodeCallIds(runtime.calls).length, 0);
});

test('2.2 filme usa a entrada única e deduplica o mesmo link', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].url, proxyUrl(episodeMovie.streamUrl));
  assert.deepEqual(episodeCallIds(runtime.calls), ['22331']);
  assert.doesNotMatch(streams[0].title, /T\d+E\d+/);
});

test('2.2 filme com duas URLs distintas usa a rotulada Episódio 1', async () => {
  const runtime = makeRuntime(makeRoute({ page: () => read('page-movie-multiple.html') }));
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.deepEqual(episodeCallIds(runtime.calls), ['22331']);
});

test('2.2 filme com duas entradas ambíguas é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ page: () => read('page-movie-ambiguous.html') }));
  const streams = await runtime.getStreams(YOUR_NAME_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção legendado descartada: Página de filme com 2 entradas distintas sem rótulo inequívoco/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /sem rótulo inequívoco/);
  assert.equal(episodeCallIds(runtime.calls).length, 0);
});

test('1.2 título sem similaridade suficiente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(AKIRA_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.equal(pageCallPaths(runtime.calls).length, 0);
});

test('3.3 busca fora de 2xx vira erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[OxeAnimes\] Falha em tv 85937: HTTP 500 em https:\/\/oxeanimes\.com\.br\/api\/chat-search/);
  assert.equal(pageCallPaths(runtime.calls).length, 0);
});

test('3.3 JSON inválido na API do episódio vira falha da opção', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: (id) => (id === '9677' ? read('episode-invalid.json') : episodeFor(id)),
  }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção legendado descartada: Resposta não é JSON válido/);
  assert.deepEqual(runtime.errors, []);
});

test('3.3 ausência da chave do TMDB termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[OxeAnimes\] Falha em tv 85937: TMDB_API_KEY indisponível/);
  assert.equal(runtime.calls.length, 0);
});

test('3.4 o provedor só consulta TMDB, busca, página e API do episódio', async () => {
  const runtime = makeRuntime();
  await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  for (const call of runtime.calls) {
    const url = new URL(call.url);
    if (url.hostname === 'api.themoviedb.org') continue;
    assert.equal(url.hostname, 'oxeanimes.com.br');
    assert.ok(
      ['/api/chat-search', '/api/episode/9677', '/api/episode/20109'].includes(url.pathname)
      || url.pathname.startsWith('/anime/'),
      url.pathname,
    );
  }
  assert.equal(callsTo(runtime.calls, '/api/stream').length, 0);
});

test('4.1 manifest declara o OxeAnimes com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'oxeanimes');
  assert.ok(entry);
  assert.equal(entry.name, 'OxeAnimes');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/oxeanimes.js');
  assert.equal(entry.enabled, true);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublados?|legendados?/i);
});

test('1.1 fixtures sanitizadas sem URL assinada, token ou cookie', () => {
  const expected = [
    'search-kimetsu.json',
    'search-demon-slayer.json',
    'search-jujutsu.json',
    'search-your-name.json',
    'search-empty.json',
    'search-unrelated.json',
    'search-candidate-retry.json',
    'page-series.html',
    'page-series-dub.html',
    'page-arc.html',
    'page-arc-dub.html',
    'page-jujutsu2.html',
    'page-movie.html',
    'page-movie-multiple.html',
    'page-movie-ambiguous.html',
    'page-unreadable.html',
    'page-no-links.html',
    'episode-stream-url.json',
    'episode-dub.json',
    'episode-movie.json',
    'episode-sources-hls.json',
    'episode-720.json',
    'episode-direct-hls.json',
    'episode-embed.json',
    'episode-invalid.json',
    'episode-502.txt',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /Policy=|Signature=|Key-Pair-Id=|token=|cookie|expires=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"'\s]+)/g)) {
      assert.match(match[1], /(^|\.)example\.test$/, `${name}: ${match[1]}`);
    }
  }
});
