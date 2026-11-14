const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'anibunker');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];
const KIMI_ID = '372058';
const AKIRA_ID = '149';
const JUJUTSU_ID = '95479';
const ATTACK_ID = '1429';
const ABSENT_ID = '999999';

let codes = {};

test.before(async () => {
  const outDir = createTempDir('anibunker-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('anibunker', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('anibunker', { outDir, formatter: 'prism' }), 'utf8');
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
      air_date: season.year ? `${season.year}-01-01` : '',
      episode_count: season.episodeCount,
    })),
  };
}

const TMDB = {
  [KIMI_ID]: movieInfo({
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
  [ATTACK_ID]: seriesInfo({
    name: 'Attack on Titan',
    original: '進撃の巨人',
    year: 2013,
    romaji: [{ title: 'Shingeki no Kyojin', season: null }],
    seasons: [{ number: 1, name: 'Temporada 1', year: 2013, episodeCount: 25 }],
  }),
  [ABSENT_ID]: movieInfo({
    title: 'Título Inexistente',
    original: '存在しないタイトル',
    year: 2024,
  }),
};

const SEARCH_FIXTURES = {
  'Kimi no Na wa.': 'search-kimi.json',
  'Kimi no Na wa': 'search-kimi.json',
  'Your Name.': 'search-kimi.json',
  Akira: 'search-akira.json',
  'Jujutsu Kaisen': 'search-jujutsu.json',
  'Jujutsu Kaisen 2': 'search-jujutsu.json',
  'Shingeki no Kyojin': 'search-shingeki.json',
};

const PAGE_FIXTURES = {
  '/anime/kimi-no-na-wa': 'anime-kimi.html',
  '/anime/akira': 'anime-akira.html',
  '/anime/jujutsu-kaisen': 'anime-jujutsu.html',
  '/anime/jujutsu-kaisen-2': 'anime-jujutsu-2.html',
  '/anime/shingeki-no-kyojin': 'anime-attack.html',
};

function makeRuntime(route, bundle = codes.gdrive, options = {}) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL,
    URLSearchParams,
    TMDB_API_KEY: 'chave-ficticia',
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
      const text = typeof result === 'string' ? result : result.body;
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
  if (options.apiKey !== null) context.TMDB_API_KEY = 'chave-ficticia';
  else delete context.TMDB_API_KEY;
  vm.runInNewContext(bundle, context, { filename: 'anibunker.js' });
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

function formBody(init) {
  return new URLSearchParams(init.body || '');
}

function withVideoId(name, videoId) {
  const data = JSON.parse(read(name));
  data.url = data.url
    .replace('/hd/', `/hd/${videoId}/`)
    .replace('fixturehd3', `fixture-${videoId}`)
    .replace('/sendvid/direct.mp4', `/sendvid/${videoId}/direct.mp4`)
    .replace('fixture-token-jujutsu', `fixture-token-${videoId}`)
    .replace('fixture-drive-id', `fixture-drive-${videoId}`);
  return JSON.stringify(data);
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      const match = /\/3\/(movie|tv)\/(\d+)/.exec(url.pathname);
      const id = match === null ? null : match[2];
      const body = options.tmdb && options.tmdb[id] ? options.tmdb[id] : TMDB[id];
      if (!body) return asResponse({ status: 404, body: JSON.stringify({ status_message: 'Not found' }) });
      return asResponse({ body: JSON.stringify(body) });
    }

    if (url.hostname === 'anibunker.com' && url.pathname === '/php/search.php') {
      if (options.searchStatus) return asResponse({ status: options.searchStatus, body: 'erro' });
      if (options.searchInvalidJson) return asResponse({ body: read('search-invalid-json.json') });
      if (options.searchInvalidItem) return asResponse({ body: read('search-invalid-item.json') });
      if (options.search) return asResponse({ body: JSON.stringify(options.search(url, formBody(init).get('query'))) });
      const query = formBody(init).get('query') || '';
      const fixture = SEARCH_FIXTURES[query];
      return asResponse({ body: read(fixture || 'search-empty.json') });
    }

    if (url.hostname === 'anibunker.com' && url.pathname.startsWith('/anime/') && url.pathname.includes('-episodio-')) {
      if (options.episodeStatus) {
        const status = options.episodeStatus[url.pathname];
        if (status) return asResponse({ status, body: 'erro' });
      }
      if (options.episodePage) {
        const custom = options.episodePage(url);
        if (custom !== undefined) return asResponse(custom);
      }
      if (url.pathname.includes('jujutsu-kaisen') && url.pathname.endsWith('-legendado')) {
        return asResponse({ body: read('episode-jujutsu-1-legendado.html') });
      }
      if (url.pathname.includes('jujutsu-kaisen') && url.pathname.endsWith('-dublado')) {
        return asResponse({ body: read('episode-jujutsu-1-dublado.html') });
      }
      if (url.pathname === '/anime/kimi-no-na-wa-episodio-1-legendado') {
        return asResponse({ body: read('episode-kimi-1-legendado.html') });
      }
      if (url.pathname === '/anime/kimi-no-na-wa-episodio-1-dublado') {
        return asResponse({ body: read('episode-kimi-1-dublado.html') });
      }
      if (url.pathname === '/anime/akira-episodio-1-dublado') {
        return asResponse({ body: read('episode-akira-1-dublado.html') });
      }
      if (url.pathname === '/anime/shingeki-no-kyojin-episodio-1-legendado') {
        return asResponse({ body: read('episode-jujutsu-1-legendado.html') });
      }
      throw new Error(`Episódio inesperado: ${url.pathname}`);
    }

    if (url.hostname === 'anibunker.com' && url.pathname.startsWith('/anime/')) {
      if (options.pageStatus && options.pageStatus[url.pathname]) {
        return asResponse({ status: options.pageStatus[url.pathname], body: 'erro' });
      }
      if (options.page) {
        const custom = options.page(url);
        if (custom !== undefined) return asResponse(custom);
      }
      const fixture = PAGE_FIXTURES[url.pathname];
      if (!fixture) throw new Error(`Página inesperada: ${url.pathname}`);
      return asResponse({ body: read(fixture) });
    }

    if (url.hostname === 'anibunker.com' && url.pathname === '/php/loader.php') {
      const body = formBody(init);
      const playerId = body.get('player_id');
      const videoId = body.get('video_id');
      if (options.loaderFailures && options.loaderFailures.includes(playerId)) {
        return asResponse({ body: read('loader-refused.json') });
      }
      if (options.loaderInvalid && options.loaderInvalid.includes(playerId)) {
        return asResponse({ body: read('loader-invalid.json') });
      }
      if (options.loader) {
        const custom = options.loader(playerId, videoId);
        if (custom !== undefined) return asResponse(custom);
      }
      if (playerId === 'custom') {
        return asResponse({ body: JSON.stringify({ success: true, url: `https://video.example.test/custom/${videoId}/media.mp4` }) });
      }
      const fixtures = {
        token: 'loader-token.json',
        url_drive: 'loader-drive.json',
        url_hd: 'loader-hd.json',
        url_hd_2: 'loader-hd-2.json',
        url_hd_3: 'loader-hd-3.json',
        sendvid: 'loader-sendvid.json',
        url_mega: 'loader-mega.json',
      };
      const fixture = fixtures[playerId];
      if (!fixture) throw new Error(`Loader inesperado: ${playerId}`);
      return asResponse({ body: withVideoId(fixture, videoId) });
    }

    if (url.hostname === 'www.blogger.com' && url.pathname === '/video.g') {
      const token = url.searchParams.get('token') || '';
      const videoId = (token.match(/fixture-token-(.+)$/) || [null, 'fixture'])[1];
      if (options.tokenFixture === 'invalid' || token.includes('invalid')) {
        return asResponse({ body: read('blogger-invalid.html') });
      }
      if (options.tokenFixture === 'unknown' || token.includes('unknown')) {
        return asResponse({ body: read('blogger-unknown-itag.html').replaceAll('/blogger/unknown.mp4', `/blogger/${videoId}/unknown.mp4`) });
      }
      return asResponse({ body: read('blogger-formats.html').replaceAll('/blogger/', `/blogger/${videoId}/`) });
    }

    if (url.hostname === 'sendvid.com' && url.pathname.startsWith('/embed/')) {
      if (options.sendvidEmpty || url.pathname.includes('empty')) {
        return asResponse({ body: read('sendvid-empty.html') });
      }
      const videoId = url.pathname.split('/').filter(Boolean).pop();
      return asResponse({ body: read('sendvid-embed.html').replaceAll('/sendvid/fixture.mp4', `/sendvid/${videoId}-embed.mp4`) });
    }

    throw new Error(`Host inesperado: ${url.hostname}${url.pathname}`);
  };
}

function callsTo(app, pathname) {
  return app.calls.filter((call) => new URL(call.url).pathname === pathname);
}

function searchQueries(app) {
  return callsTo(app, '/php/search.php').map((call) => formBody(call.init).get('query'));
}

function loaderRequests(app) {
  return callsTo(app, '/php/loader.php').map((call) => formBody(call.init).get('player_id'));
}

function episodeCalls(app) {
  return app.calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.includes('-episodio-'))
    .map((url) => url.pathname);
}

function assertStreamContract(stream) {
  assert.ok(stream.url.startsWith('http'));
  assert.ok(LANGUAGE_VALUES.includes(stream.language), stream.language);
  assert.equal(typeof stream.name, 'string');
  assert.equal(typeof stream.title, 'string');
  assert.equal(stream.format, undefined);
  for (const key of ['size', 'subtitles', 'infoHash', 'seeders', 'peers']) {
    assert.equal(stream[key], undefined, key);
  }
}

// --- Funções puras ---

test('1.1 lê a busca e rejeita itens fora do esquema', async () => {
  const { parseSearchResults } = await import('../src/anibunker/search.js');
  assert.deepEqual(parseSearchResults([{ name: 'Kimi no Na wa.', url: 'kimi-no-na-wa' }]), [
    { title: 'Kimi no Na wa.', url: 'https://anibunker.com/anime/kimi-no-na-wa' },
  ]);
  assert.deepEqual(parseSearchResults([]), []);
  assert.deepEqual(parseSearchResults([{ name: 'X', url: 'https://anibunker.com/anime/x' }]), [
    { title: 'X', url: 'https://anibunker.com/anime/x' },
  ]);
  assert.throws(() => parseSearchResults({}), /fora do esquema/);
  assert.throws(() => parseSearchResults([{ name: 'X' }]), /sem name\/url/);
  assert.throws(() => parseSearchResults([{ name: 'X', url: 'https://outro.example/anime/x' }]), /fora do AniBunker/);
});

test('1.3 monta as consultas com romaji, temporada e nome do TMDB', async () => {
  const { buildQueries } = await import('../src/anibunker/search.js');
  const media = {
    title: 'Jujutsu Kaisen',
    originalTitle: '呪術廻戦',
    alternativeTitles: [],
    romajiTitles: [
      { title: 'Jujutsu Kaisen', season: null },
      { title: 'Jujutsu Kaisen 2', season: 2 },
    ],
    seasons: [{ number: 1, name: 'Temporada 1' }, { number: 2, name: 'Temporada 2' }],
  };
  const queries = buildQueries(media, 'tv', 2);
  assert.equal(queries[0].query, 'Jujutsu Kaisen 2');
  assert.equal(queries[0].season, 2);
  assert.ok(queries.some((item) => item.query === 'Jujutsu Kaisen Temporada 2' && item.season === 2));
  assert.ok(queries.some((item) => item.query === 'Jujutsu Kaisen' && item.season === 1));
  assert.equal(new Set(queries.map((item) => item.query.toLowerCase())).size, queries.length);

  const movie = buildQueries(
    { title: 'Your Name.', originalTitle: '君の名は。', romajiTitles: [{ title: 'Kimi no Na wa.', season: null }] },
    'movie',
    null,
  );
  assert.deepEqual(movie.map((item) => item.query), ['Your Name.', '君の名は。', 'Kimi no Na wa.']);
  assert.ok(movie.every((item) => item.season === null));
});

test('1.3 lê temporada por marcador, sufixo e base do TMDB', async () => {
  const { readExplicitSeason, readSeasonNumber, isSeasonCandidate } = await import('../src/anibunker/titles.js');
  assert.equal(readExplicitSeason('Jujutsu Kaisen 2nd Season'), 2);
  assert.equal(readExplicitSeason('Jujutsu Kaisen 2ª Temporada'), 2);
  assert.equal(readExplicitSeason('Jujutsu Kaisen 2'), null);
  assert.equal(readSeasonNumber('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }), 2);
  assert.equal(readSeasonNumber('Jujutsu Kaisen', { title: 'Jujutsu Kaisen' }), 1);
  assert.equal(readSeasonNumber('Mob Psycho 100', { title: 'Mob Psycho 100' }), 1);
  assert.equal(isSeasonCandidate('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }, 'tv', 2), true);
  assert.equal(isSeasonCandidate('Jujutsu Kaisen 2', { title: 'Jujutsu Kaisen' }, 'tv', 1), false);
  assert.equal(isSeasonCandidate('Kimi no Na wa.', { title: 'Your Name.' }, 'movie', null), true);
});

// --- Integração com o pacote gerado ---

test('4.2 carrega o pacote sem rede e expõe getStreams', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
});

test('1.4 valida entrada antes de qualquer requisição', async () => {
  const invalid = [
    ['abc', 'movie', null, null],
    ['372058', 'anime', null, null],
    ['95479', 'tv', null, 1],
    ['95479', 'tv', 1, 0],
    ['95479', 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    const app = makeRuntime(makeRoute());
    assert.deepEqual(await app.getStreams(...args), [], args.join('/'));
    assert.equal(app.calls.length, 0, args.join('/'));
    assert.equal(app.errors.length, 1, args.join('/'));
    assert.match(app.errors[0], /^\[AniBunker\] Falha em /);
  }

  const noKey = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  assert.deepEqual(await noKey.getStreams(KIMI_ID, 'movie', null, null), []);
  assert.equal(noKey.calls.length, 0);
  assert.match(noKey.errors[0], /TMDB_API_KEY indisponível/);
});

test('1.3 filme romaji resolve as duas faixas e descarta Mega', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams(KIMI_ID, 'movie', null, null);

  assert.equal(streams.length, 10);
  assert.equal(streams.filter((stream) => stream.language === 'Legendado').length, 5);
  assert.equal(streams.filter((stream) => stream.language === 'Dublado').length, 5);
  assert.ok(streams.every((stream) => stream.language === 'Legendado' || stream.language === 'Dublado'));
  assert.ok(streams.every((stream) => stream.type === 'mp4' || stream.type === 'hls'));
  assert.ok(!loaderRequests(app).includes('url_mega'));

  const drive = streams.filter((stream) => stream.provider === 'Gdrive');
  assert.equal(drive.length, 2);
  assert.ok(drive.every((stream) => stream.quality === 'Desconhecida' && !stream.headers));
  assert.match(drive[0].url, /^https:\/\/drive\.usercontent\.google\.com\/download\?id=fixture-drive-\d+&export=download&confirm=t$/);

  const hd = streams.find((stream) => stream.provider === 'HD+' && stream.language === 'Legendado');
  assert.equal(hd.quality, '720p');
  assert.equal(hd.type, 'mp4');
  assert.equal(hd.url, 'https://video.example.test/hd/37181/1080p/file.mp4');

  const hls = streams.find((stream) => stream.provider === 'HD 2' && stream.language === 'Dublado');
  assert.equal(hls.quality, '720p');
  assert.equal(hls.type, 'hls');
  assert.equal(hls.url, 'https://video.example.test/hd/37182/01.mp4/index.m3u8');

  const embed = streams.find((stream) => stream.provider === 'HD 3' && stream.language === 'Legendado');
  assert.equal(embed.quality, '720p');
  assert.equal(embed.type, 'mp4');
  assert.equal(embed.url, 'https://video.example.test/sendvid/fixture-37181-embed.mp4');

  const sendvid = streams.find((stream) => stream.provider === 'Sendvid' && stream.language === 'Legendado');
  assert.equal(sendvid.quality, 'Desconhecida');
  assert.equal(sendvid.type, 'mp4');
  assert.equal(sendvid.url, 'https://video.example.test/sendvid/37181/direct.mp4');

  for (const stream of streams) assertStreamContract(stream);
  assert.match(streams.find((stream) => stream.provider === 'HD+').name, /^AniBunker 720p\n/);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('1.3 e 2.2 filme aceita somente a faixa anunciada', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams(AKIRA_ID, 'movie', null, null);

  assert.ok(streams.length > 0);
  assert.ok(streams.every((stream) => stream.language === 'Dublado'));
  assert.ok(!episodeCalls(app).some((pathname) => pathname.endsWith('-legendado')));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('2.2 e 3.2 série S01E01 resolve Blogger, Drive, HD e Sendvid', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 12);
  assert.equal(streams.filter((stream) => stream.language === 'Legendado').length, 6);
  assert.equal(streams.filter((stream) => stream.language === 'Dublado').length, 6);

  const blogger = streams.filter((stream) => stream.provider === 'YTube');
  assert.equal(blogger.length, 4);
  assert.deepEqual(new Set(blogger.map((stream) => stream.quality)), new Set(['360p', '720p']));
  assert.ok(blogger.every((stream) => stream.type === 'mp4'));
  assert.ok(blogger.every((stream) => stream.headers.Referer === 'https://www.blogger.com/'));
  assert.ok(blogger.every((stream) => stream.headers.Origin === 'https://www.blogger.com'));
  assert.ok(blogger.some((stream) => stream.language === 'Dublado' && stream.quality === '720p'));

  const drive = streams.filter((stream) => stream.provider === 'Gdrive');
  assert.equal(drive.length, 2);
  assert.ok(drive.every((stream) => stream.quality === 'Desconhecida'));

  const hd = streams.filter((stream) => stream.provider === 'HD+');
  assert.equal(hd.length, 2);
  assert.ok(hd.every((stream) => stream.quality === '720p' && stream.type === 'mp4'));

  const sendvid = streams.filter((stream) => stream.provider === 'Sendvid');
  assert.equal(sendvid.length, 2);
  assert.ok(sendvid.every((stream) => stream.quality === 'Desconhecida'));

  for (const stream of streams) assertStreamContract(stream);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);

  const loader = callsTo(app, '/php/loader.php');
  assert.ok(loader.length > 0);
  assert.ok(loader.every((call) => call.init.headers.Origin === 'https://anibunker.com'));
});

test('2.2 temporada posterior usa a página e o episódio pedidos', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 2, 2);

  assert.ok(streams.length > 0);
  assert.ok(streams.every((stream) => stream.language === 'Legendado' || stream.language === 'Dublado'));
  assert.equal(searchQueries(app)[0], 'Jujutsu Kaisen 2');
  assert.ok(episodeCalls(app).includes('/anime/jujutsu-kaisen-2-episodio-2-legendado'));
  assert.ok(!episodeCalls(app).includes('/anime/jujutsu-kaisen-episodio-2-legendado'));
  assert.deepEqual(app.errors, []);
});

test('2.3 episódio fora da contagem é ausência sem requisição de episódio', async () => {
  const app = makeRuntime(makeRoute());
  assert.deepEqual(await app.getStreams(JUJUTSU_ID, 'tv', 1, 99), []);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
  assert.deepEqual(episodeCalls(app), []);
});

test('2.2 faixa não anunciada não é inventada', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams(ATTACK_ID, 'tv', 1, 1);

  assert.ok(streams.length > 0);
  assert.ok(streams.every((stream) => stream.language === 'Legendado'));
  assert.ok(episodeCalls(app).every((pathname) => pathname.endsWith('-legendado')));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('3.3 Mega é triagem e não chama o carregador', async () => {
  const app = makeRuntime(makeRoute({
    episodePage: () => ({ body: read('episode-only-mega.html') }),
  }));
  assert.deepEqual(await app.getStreams(JUJUTSU_ID, 'tv', 1, 1), []);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
  assert.deepEqual(loaderRequests(app), []);
});

test('3.4 um player falha e os demais resolvem com aviso', async () => {
  const app = makeRuntime(makeRoute({ loaderFailures: ['url_drive'] }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.ok(streams.length > 0);
  assert.ok(!streams.some((stream) => stream.provider === 'Gdrive'));
  assert.equal(app.warnings.length, 2);
  assert.ok(app.warnings.every((warning) => /^\[AniBunker\] Opção Gdrive descartada: Carregador recusou url_drive: Access denied\.$/.test(warning)));
  assert.deepEqual(app.errors, []);
});

test('3.1 carregador com JSON inválido ou sem URL falha isolado', async () => {
  const notJson = makeRuntime(makeRoute({
    loader: (playerId) => (playerId === 'url_drive' ? { body: 'não é json' } : undefined),
  }));
  const streams = await notJson.getStreams(JUJUTSU_ID, 'tv', 1, 1);
  assert.ok(streams.length > 0);
  assert.ok(notJson.warnings.some((warning) => /Opção Gdrive descartada: Resposta não é JSON válido/.test(warning)));

  const noUrl = makeRuntime(makeRoute({
    loader: (playerId) => (playerId === 'url_drive' ? { body: read('loader-invalid.json') } : undefined),
  }));
  const withNoUrl = await noUrl.getStreams(JUJUTSU_ID, 'tv', 1, 1);
  assert.ok(withNoUrl.length > 0);
  assert.ok(noUrl.warnings.some((warning) => /Opção Gdrive descartada: Carregador do AniBunker sem URL para url_drive/.test(warning)));
});

test('3.4 todos os players falham e o erro agregado sobe', async () => {
  const players = ['token', 'url_drive', 'url_hd', 'url_hd_3', 'sendvid'];
  const app = makeRuntime(makeRoute({ loaderFailures: players }));
  assert.deepEqual(await app.getStreams(JUJUTSU_ID, 'tv', 1, 1), []);

  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /^\[AniBunker\] Falha em tv 95479: Nenhuma faixa produziu stream: Legendado: Nenhum player produziu stream/);
  assert.ok(app.errors[0].includes('Dublado: Nenhum player produziu stream'));
  assert.equal(app.warnings.length, players.length * 2);
  assert.ok(app.warnings.every((warning) => /^\[AniBunker\] Opção .+ descartada: Carregador recusou /.test(warning)));
});

test('2.3 HTTP 404 de uma faixa é ausência e preserva a outra', async () => {
  const app = makeRuntime(makeRoute({
    episodeStatus: { '/anime/jujutsu-kaisen-episodio-1-legendado': 404 },
  }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.ok(streams.length > 0);
  assert.ok(streams.every((stream) => stream.language === 'Dublado'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('2.3 página 2xx sem player é falha da faixa com aviso', async () => {
  const app = makeRuntime(makeRoute({
    episodePage: () => ({ body: read('episode-no-players.html') }),
  }));
  assert.deepEqual(await app.getStreams(JUJUTSU_ID, 'tv', 1, 1), []);
  assert.equal(app.warnings.length, 2);
  assert.ok(app.warnings.every((warning) => /^\[AniBunker\] Opção (Legendado|Dublado) descartada: Episódio do AniBunker em \[url\] sem player$/.test(warning)));
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /Nenhuma faixa produziu stream/);
});

test('3.2 Blogger sem streamingData falha isolado e o restante resolve', async () => {
  const app = makeRuntime(makeRoute({ tokenFixture: 'invalid' }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.ok(streams.length > 0);
  assert.ok(!streams.some((stream) => stream.provider === 'YTube'));
  assert.equal(app.warnings.length, 2);
  assert.ok(app.warnings.every((warning) => /Opção YTube descartada: Player do Blogger sem streamingData/.test(warning)));
  assert.deepEqual(app.errors, []);
});

test('3.2 itag desconhecido fica sem qualidade declarada', async () => {
  const app = makeRuntime(makeRoute({ tokenFixture: 'unknown' }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  const blogger = streams.filter((stream) => stream.provider === 'YTube');
  assert.equal(blogger.length, 2);
  assert.ok(blogger.every((stream) => stream.quality === 'Desconhecida'));
  assert.deepEqual(app.errors, []);
});

test('3.3 embed sem source falha isolado', async () => {
  const app = makeRuntime(makeRoute({
    sendvidEmpty: true,
    loader: (playerId, videoId) => {
      if (playerId === 'sendvid') {
        return { body: JSON.stringify({ success: true, url: `https://sendvid.com/embed/empty-${videoId}` }) };
      }
      return undefined;
    },
  }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.ok(streams.length > 0);
  assert.ok(!streams.some((stream) => stream.provider === 'Sendvid'));
  assert.ok(app.warnings.some((warning) => /Opção Sendvid descartada: Embed sem source MP4 ou og:video/.test(warning)));
  assert.deepEqual(app.errors, []);
});

test('3.3 player desconhecido aceita mídia direta e deduplica por URL', async () => {
  const app = makeRuntime(makeRoute({
    episodePage: () => ({ body: read('episode-unknown-player.html') }),
  }));
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].provider, 'Custom');
  assert.equal(streams[0].type, 'mp4');
  assert.equal(streams[0].quality, 'Desconhecida');
  assert.equal(streams[0].url, 'https://video.example.test/custom/88888/media.mp4');
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.3 deduplica URLs repetidas dentro da faixa', async () => {
  const app = makeRuntime(makeRoute({
    loader: (playerId, videoId) => {
      if (playerId === 'url_hd' || playerId === 'url_hd_2') {
        return { body: JSON.stringify({ success: true, url: `https://video.example.test/hd/${videoId}/same.mp4` }) };
      }
      return undefined;
    },
  }));
  const streams = await app.getStreams(KIMI_ID, 'movie', null, null);

  const repeated = streams.filter((stream) => stream.url === 'https://video.example.test/hd/37181/same.mp4');
  assert.equal(repeated.length, 1);
  assert.equal(new Set(streams.map((stream) => stream.url)).size, streams.length);
  assert.deepEqual(app.errors, []);
});

test('1.3 ausência de título devolve lista vazia sem erro', async () => {
  const app = makeRuntime(makeRoute());
  assert.deepEqual(await app.getStreams(ABSENT_ID, 'movie', null, null), []);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
  assert.ok(searchQueries(app).length >= 1);
  assert.deepEqual(episodeCalls(app), []);
});

test('1.3 candidato 404 é ausência e não interrompe a busca', async () => {
  const app = makeRuntime(makeRoute({ pageStatus: { '/anime/kimi-no-na-wa': 404 } }));
  assert.deepEqual(await app.getStreams(KIMI_ID, 'movie', null, null), []);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
  assert.deepEqual(episodeCalls(app), []);
});

test('1.1 JSON inválido ou lista fora do esquema viram erro registrado', async () => {
  const broken = makeRuntime(makeRoute({ searchInvalidJson: true }));
  assert.deepEqual(await broken.getStreams(KIMI_ID, 'movie', null, null), []);
  assert.match(broken.errors[0], /Resposta não é JSON válido/);

  const invalid = makeRuntime(makeRoute({ searchInvalidItem: true }));
  assert.deepEqual(await invalid.getStreams(KIMI_ID, 'movie', null, null), []);
  assert.match(invalid.errors[0], /Busca do AniBunker fora do esquema/);
});

test('1.3 página de obra fora do esquema vira erro registrado', async () => {
  const app = makeRuntime(makeRoute({
    page: () => ({ body: read('anime-invalid.html') }),
  }));
  assert.deepEqual(await app.getStreams(KIMI_ID, 'movie', null, null), []);
  assert.match(app.errors[0], /Ficha do AniBunker .* sem \.field-info/);
  assert.deepEqual(episodeCalls(app), []);
});

test('4.1 template Prism mostra título, ano e coordenadas', async () => {
  const app = makeRuntime(makeRoute(), codes.prism);
  const streams = await app.getStreams(JUJUTSU_ID, 'tv', 2, 2);

  assert.ok(streams.length > 0);
  assert.match(streams[0].name, /^💿 HD 720p\n/);
  assert.match(streams[0].title, /🎬 Jujutsu Kaisen \(2020\) T02E02/);
  assert.match(streams[0].title, /🗣️ (Legendado|Dublado)/);
});

test('5.1 manifest declara o AniBunker com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'anibunker');
  assert.ok(entry, 'entrada anibunker ausente no manifest');
  assert.equal(entry.name, 'AniBunker');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8', 'mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/anibunker.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublados?|legendados?/i);
});

test('1.2 fixtures reais sanitizadas sem URL assinada, token ou cookie', () => {
  const expected = [
    'search-kimi.json',
    'search-jujutsu.json',
    'search-empty.json',
    'search-invalid-json.json',
    'search-invalid-item.json',
    'anime-jujutsu.html',
    'anime-jujutsu-2.html',
    'anime-kimi.html',
    'anime-akira.html',
    'anime-attack.html',
    'anime-invalid.html',
    'episode-jujutsu-1-legendado.html',
    'episode-jujutsu-1-dublado.html',
    'episode-kimi-1-legendado.html',
    'episode-kimi-1-dublado.html',
    'episode-akira-1-dublado.html',
    'episode-only-mega.html',
    'episode-no-players.html',
    'episode-unknown-player.html',
    'blogger-formats.html',
    'blogger-unknown-itag.html',
    'blogger-invalid.html',
    'sendvid-embed.html',
    'sendvid-empty.html',
    'loader-token.json',
    'loader-drive.json',
    'loader-hd.json',
    'loader-hd-2.json',
    'loader-hd-3.json',
    'loader-sendvid.json',
    'loader-mega.json',
    'loader-refused.json',
    'loader-invalid.json',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /googlevideo|drive\.google|drive\.usercontent|wixstatic|rumble|maximaimg|videos2\.sendvid|validfrom|Policy=|Signature=|Key-Pair-Id=|token=AD|coisa=/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{40,}\b/i, name);
  }
});
