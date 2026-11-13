const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { load } = require('./support/basic-html.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'anitube');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

let codes = {};

test.before(async () => {
  const outDir = createTempDir('anitube-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('anitube', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('anitube', { outDir, formatter: 'prism' }), 'utf8');
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
      episode_count: season.episodeCount === undefined ? null : season.episodeCount,
    })),
  };
}

const TMDB = {
  1429: seriesInfo({
    name: 'Attack on Titan',
    original: '進撃の巨人',
    year: 2013,
    alts: ['Ataque dos Titãs'],
    romaji: [{ title: 'Shingeki no Kyojin', season: null }],
    seasons: [
      { number: 1, name: 'Temporada 1', year: 2013, episodeCount: 25 },
      { number: 4, name: 'Temporada 4', year: 2020, episodeCount: 28 },
    ],
  }),
  95479: seriesInfo({
    name: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    year: 2020,
    romaji: [{ title: 'Jujutsu Kaisen', season: null }],
    seasons: [{ number: 1, name: 'Temporada 1', year: 2020, episodeCount: 24 }],
  }),
  85937: seriesInfo({
    name: 'Demon Slayer: Kimetsu no Yaiba',
    original: '鬼滅の刃',
    year: 2019,
    romaji: [
      { title: 'Kimetsu no Yaiba', season: null },
      { title: 'Kimetsu no Yaiba: Mugen Ressha-hen', season: 2 },
    ],
    seasons: [
      { number: 1, name: 'Temporada 1', year: 2019, episodeCount: 26 },
      { number: 2, name: 'Temporada 2', year: 2021, episodeCount: 7 },
    ],
  }),
  37854: seriesInfo({
    name: 'One Piece',
    original: 'ONE PIECE',
    year: 1999,
    romaji: [{ title: 'One Piece', season: null }],
    seasons: [{ number: 1, name: 'Temporada 1', year: 1999, episodeCount: 1000 }],
  }),
  372058: movieInfo({
    title: 'Your Name.',
    original: '君の名は。',
    year: 2016,
    romaji: [{ title: 'Kimi no Na wa.', season: null }],
  }),
  129: movieInfo({
    title: 'A Viagem de Chihiro',
    original: '千と千尋の神隠し',
    year: 2001,
  }),
  635302: movieInfo({
    title: 'Demon Slayer: Mugen Train',
    original: '劇場版 鬼滅の刃 無限列車編',
    year: 2020,
    romaji: [{ title: 'Kimetsu no Yaiba: Mugen Ressha-hen', season: null }],
  }),
  999999: movieInfo({
    title: 'Título Inexistente',
    original: '存在しないタイトル',
    year: 2024,
  }),
};

const SEARCH_FIXTURES = {
  'Shingeki no Kyojin': 'search-shingeki.html',
  'Jujutsu Kaisen 2': 'search-jujutsu-2.html',
  'Kimetsu no Yaiba: Mugen Ressha-hen': 'search-kimetsu-mugen.html',
  'One Piece': 'search-one-piece.html',
  'Kimi no Na wa': 'search-movie-kimi.html',
  'A Viagem de Chihiro': 'search-movie-chihiro.html',
};

const PAGE_FIXTURES = {
  '/video/931910/': 'series-shingeki.html',
  '/970537b002': 'series-jujutsu-2-dub.html',
  '/919956b003': 'series-jujutsu-2-leg.html',
  '/video/970145/': 'series-kimetsu-mugen-dub.html',
  '/video/906828/': 'series-kimetsu-mugen-leg.html',
  '/video/100/': 'series-one-piece.html',
  '/video/101/': 'series-one-piece-dub.html',
  '/video/932006/': 'episode-shingeki-01.html',
  '/video/970539b': 'episode-jujutsu-2-dub-01.html',
  '/video/919960/': 'episode-jujutsu-2-leg-01.html',
  '/video/970153/': 'episode-kimetsu-mugen-dub-01.html',
  '/video/906832/': 'episode-kimetsu-mugen-leg-01.html',
  '/video/1001/': 'episode-one-piece-01.html',
  '/video/1011/': 'episode-one-piece-dub-01.html',
  '/video/892906/': 'movie-kimi-aggregator.html',
  '/video/892909/': 'movie-kimi-leg.html',
  '/video/892912/': 'movie-kimi-dub.html',
  '/video/1030445/': 'movie-chihiro.html',
  '/video/970146/': 'movie-kimetsu-mugen-dub.html',
};

function makeRuntime(route, bundle = codes.gdrive) {
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
  vm.runInNewContext(bundle, context, { filename: 'anitube.js' });
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

function fhdPage(label, file) {
  return `<!DOCTYPE html>
<html><body>
<script>
const playerInstance = jwplayer('video-player').setup({
  playlist: [{
    sources: [{
      type: "video/mp4",
      label: "${label}",
      file: '${file}'
    }]
  }]
});
</script>
</body></html>
`;
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      const match = /\/3\/(movie|tv)\/(\d+)/.exec(url.pathname);
      const id = match === null ? null : Number(match[2]);
      const body = options.tmdb && options.tmdb[id] ? options.tmdb[id] : TMDB[id];
      if (!body) throw new Error(`TMDB sem fixture para ${id}`);
      return asResponse({ body: JSON.stringify(body) });
    }

    if (url.hostname === 'www.anitube.zip' && url.pathname === '/') {
      const query = url.searchParams.get('s');
      const key = query.replace(/[:.]+$/g, '').trim();
      const fixture = SEARCH_FIXTURES[key] || SEARCH_FIXTURES[query];
      return asResponse({ body: read(fixture || 'search-empty.html') });
    }

    if (url.hostname === 'www.anitube.zip') {
      if (options.page) {
        const custom = options.page(url);
        if (custom !== undefined) return asResponse(custom);
      }
      if (url.pathname.startsWith('/token-')) {
        if (options.player1Status) return asResponse({ status: options.player1Status, body: 'erro' });
        const token = url.pathname.split('/').filter(Boolean).pop();
        return asResponse({
          body: read('player-1.html').replaceAll('fixture-token', token),
          url: `https://api.anivideo.net/file/${token}`,
        });
      }
      const fixture = PAGE_FIXTURES[url.pathname];
      if (fixture) return asResponse({ body: read(fixture) });
      throw new Error(`Página inesperada: ${url.pathname}`);
    }

    if (url.hostname === 'api.anivideo.net' && url.pathname === '/videohls.php') {
      if (options.fhdStatus) return asResponse({ status: options.fhdStatus, body: 'erro' });
      const media = url.searchParams.get('d');
      const label = options.fhdLabel === undefined ? '720p HD' : options.fhdLabel;
      const fixtures = {
        '720p HD': 'player-fhd.html',
        '360p': 'player-fhd-360.html',
        '720p': 'player-fhd-720.html',
        '': 'player-fhd-unknown.html',
      };
      const fixture = fixtures[label];
      if (fixture) {
        return asResponse({ body: read(fixture).replace(/https:\/\/cdn\.example\.test\/player[^']*\/master\.m3u8/, media) });
      }
      return asResponse({ body: fhdPage(label, media) });
    }

    if (url.hostname === 'www.blogger.com') {
      const token = url.searchParams.get('token');
      return asResponse({
        body: read('player-blogger.html').replaceAll('https://video.example.test/', `https://video.example.test/${token}/`),
      });
    }

    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function searches(app) {
  return app.calls
    .filter((call) => new URL(call.url).hostname === 'www.anitube.zip' && new URL(call.url).pathname === '/')
    .map((call) => new URL(call.url).searchParams.get('s'));
}

function pageCalls(app) {
  return app.calls
    .filter((call) => new URL(call.url).hostname === 'www.anitube.zip' && new URL(call.url).pathname !== '/')
    .map((call) => new URL(call.url).pathname);
}

function assertStreamContract(stream) {
  assert.ok(stream.url.startsWith('http'));
  assert.ok(LANGUAGE_VALUES.includes(stream.language), stream.language);
  assert.equal(typeof stream.name, 'string');
  assert.equal(typeof stream.title, 'string');
  assert.equal(stream.format, undefined);
  assert.equal(stream.size, undefined);
  assert.equal(stream.headers, undefined);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.infoHash, undefined);
  assert.equal(stream.seeders, undefined);
  assert.equal(stream.peers, undefined);
}

// --- Funções puras ---

test('2.1 monta variantes de busca com romaji da temporada e sufixos', async () => {
  const { buildQueries } = await import('../src/anitube/search.js');
  const media = {
    title: 'Jujutsu Kaisen',
    originalTitle: '呪術廻戦',
    alternativeTitles: [],
    romajiTitles: [{ title: 'Jujutsu Kaisen', season: null }],
    seasons: [{ number: 1, year: 2020 }, { number: 2, year: 2023 }],
  };
  const queries = buildQueries(media, { mediaType: 'tv', season: 2 });
  const texts = queries.map((query) => query.query);
  assert.deepEqual(texts.slice(0, 3), ['Jujutsu Kaisen', '呪術廻戦', 'Jujutsu Kaisen 2']);
  assert.ok(texts.includes('Jujutsu Kaisen 2nd Season'));
  assert.ok(texts.includes('Jujutsu Kaisen Season 2'));
  assert.ok(texts.includes('Jujutsu Kaisen 2ª Temporada'));
  assert.ok(texts.includes('Jujutsu Kaisen Temporada 2'));
  assert.ok(texts.includes('Jujutsu Kaisen II'));
  assert.equal(new Set(texts.map((text) => text.toLowerCase())).size, texts.length);
});

test('2.1 coloca o romaji específico da temporada primeiro', async () => {
  const { buildQueries } = await import('../src/anitube/search.js');
  const media = {
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: '鬼滅の刃',
    alternativeTitles: [],
    romajiTitles: [
      { title: 'Kimetsu no Yaiba', season: null },
      { title: 'Kimetsu no Yaiba: Mugen Ressha-hen', season: 2 },
    ],
    seasons: [{ number: 2, year: 2021 }],
  };
  const queries = buildQueries(media, { mediaType: 'tv', season: 2 });
  assert.deepEqual(queries[0], { query: 'Kimetsu no Yaiba: Mugen Ressha-hen', season: 2 });
});

test('2.1 limpa as decorações do cartão e separa aliases', async () => {
  const { cleanCardTitle } = await import('../src/anitube/search.js');
  assert.deepEqual(cleanCardTitle('Kimi no Na wa (Your Name) Dublado – Filme'), {
    title: 'Kimi no Na wa',
    aliases: ['Your Name'],
  });
  assert.deepEqual(cleanCardTitle('A Viagem de Chihiro (Dublado) Filme'), {
    title: 'A Viagem de Chihiro',
    aliases: [],
  });
  assert.deepEqual(cleanCardTitle('Jujutsu Kaisen 2 – Todos Episódios'), {
    title: 'Jujutsu Kaisen 2',
    aliases: [],
  });
  assert.deepEqual(cleanCardTitle('Shingeki! Kyojin Chuugakkou – Todos os Episodios'), {
    title: 'Shingeki! Kyojin Chuugakkou',
    aliases: [],
  });
});

test('2.1 lê temporada explícita, sufixo, romano, final e Part N', async () => {
  const { readSeason } = await import('../src/anitube/search.js');
  const media = {
    title: 'Jujutsu Kaisen',
    originalTitle: 'Jujutsu Kaisen',
    alternativeTitles: [],
    romajiTitles: [{ title: 'Mushoku Tensei', season: null }, { title: 'Sword Art Online', season: null }],
    seasons: [{ number: 1 }, { number: 3 }],
  };
  assert.deepEqual(readSeason('Jujutsu Kaisen 2', media), { season: 2, final: false });
  assert.deepEqual(readSeason('Jujutsu Kaisen 3', media), { season: 3, final: false });
  assert.deepEqual(readSeason('Jujutsu Kaisen 2nd Season', media), { season: 2, final: false });
  assert.deepEqual(readSeason('Jujutsu Kaisen 2ª Temporada', media), { season: 2, final: false });
  assert.deepEqual(readSeason('Mushoku Tensei III', media), { season: 3, final: false });
  assert.deepEqual(readSeason('Jujutsu Kaisen: The Final Season', media), { season: null, final: true });
  assert.deepEqual(readSeason('Jujutsu Kaisen Part 2', media), { season: 1, final: false });
  assert.deepEqual(readSeason('Jujutsu Kaisen', media), { season: 1, final: false });
});

test('2.2 descarta spin-off, temporada conflitante e ano divergente', async () => {
  const { confirmCandidate } = await import('../src/anitube/search.js');
  const media = {
    title: 'Jujutsu Kaisen',
    originalTitle: 'Jujutsu Kaisen',
    alternativeTitles: [],
    romajiTitles: [{ title: 'Jujutsu Kaisen', season: null }],
    seasons: [{ number: 1, year: 2020 }, { number: 2, year: 2023 }],
  };
  const candidate = { title: 'Jujutsu Kaisen 2', aliases: [], type: 'tv', audio: 'Dublado', url: 'x' };
  const request = { mediaType: 'tv', season: 2 };
  assert.deepEqual(
    confirmCandidate(candidate, { h1: candidate.title, type: '', year: null, audio: 'Dublado' }, media, request, { query: 'Jujutsu Kaisen 2', season: 2 }),
    { audio: 'Dublado' },
  );
  assert.equal(
    confirmCandidate({ ...candidate, title: 'Jujutsu Kaisen 3' }, { h1: 'x', type: '', year: null, audio: 'Dublado' }, media, request, { query: 'Jujutsu Kaisen 2', season: 2 }),
    null,
  );
  assert.equal(
    confirmCandidate(candidate, { h1: 'x', type: '', year: 2010, audio: 'Dublado' }, media, request, { query: 'Jujutsu Kaisen 2', season: 2 }),
    null,
  );
  const onePiece = { title: 'One Piece', originalTitle: 'One Piece', alternativeTitles: [], romajiTitles: [], seasons: [{ number: 1, year: 1999 }] };
  assert.equal(
    confirmCandidate(
      { title: 'One Piece: Heroines', aliases: [], type: 'tv', audio: 'Legendado', url: 'x' },
      { h1: 'x', type: '', year: null, audio: 'Legendado' },
      onePiece,
      { mediaType: 'tv', season: 1 },
      { query: 'One Piece', season: 1 },
    ),
    null,
  );
});

// --- Integração com o pacote gerado ---

test('1.1 e 5.1 carrega o pacote sem rede e expõe getStreams', () => {
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

test('4.2 valida entrada antes de qualquer requisição', async () => {
  const app = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['95479', 'anime', null, null],
    ['95479', 'tv', null, 1],
    ['95479', 'tv', 1, 0],
    ['95479', 'tv', 1, 1.5],
  ];
  for (const args of invalid) {
    assert.deepEqual(await app.getStreams(...args), []);
  }
  assert.equal(app.calls.length, 0);
  assert.equal(app.errors.length, invalid.length);
  for (const message of app.errors) assert.match(message, /^\[AniTube\] Falha em /);
});

test('4.3 filme direto dublado monta o contrato e o formato', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('129', 'movie', null, null);

  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.quality, '720p');
  assert.equal(stream.language, 'Dublado');
  assert.equal(stream.provider, 'Player FHD');
  assert.equal(stream.type, 'hls');
  assert.equal(stream.url, 'https://cdn.example.test/chihiro/master.m3u8');
  assert.match(stream.name, /^AniTube 720p\n/);
  assert.match(stream.title, /🗣️ Dublado/);
  assert.match(stream.title, /🌐 HTTP/);
  assert.match(stream.title, /🔍 Player FHD/);
  assertStreamContract(stream);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.3 e 4.4 filme agregado resolve dublado e legendado', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('372058', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Legendado', 'Dublado']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    'https://cdn.example.test/kimi-leg/master.m3u8',
    'https://cdn.example.test/kimi-dub/master.m3u8',
  ]);
  assert.ok(streams.every((stream) => stream.quality === '720p'));
  assert.ok(streams.every((stream) => stream.provider === 'Player FHD'));
  assert.ok(pageCalls(app).includes('/video/892906/'));
  assert.ok(pageCalls(app).includes('/video/892909/'));
  assert.ok(pageCalls(app).includes('/video/892912/'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.4 filme por página de série com entrada de filme', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('635302', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].url, 'https://cdn.example.test/kimetsu-mugen-movie/master.m3u8');
  assert.ok(pageCalls(app).includes('/video/970145/'));
  assert.ok(pageCalls(app).includes('/video/970146/'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.4 episódio só com Player 1 usa os MP4 do Blogger', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('1429', 'tv', 1, 1);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '360p']);
  assert.ok(streams.every((stream) => stream.language === 'Legendado'));
  assert.ok(streams.every((stream) => stream.provider === 'Player 1'));
  assert.ok(streams.every((stream) => stream.type === 'mp4'));
  assert.ok(streams.every((stream) => stream.url.startsWith('https://video.example.test/token-shingeki/')));
  assert.ok(!app.calls.some((call) => new URL(call.url).hostname === 'api.anivideo.net'));
  assert.ok(pageCalls(app).includes('/video/932006/'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.4 episódio com dois players e duas fichas de áudio', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('95479', 'tv', 2, 1);

  assert.equal(streams.length, 6);
  const languages = streams.map((stream) => stream.language);
  assert.equal(languages.filter((language) => language === 'Dublado').length, 3);
  assert.equal(languages.filter((language) => language === 'Legendado').length, 3);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '720p', '720p', '720p', '360p', '360p']);
  assert.ok(pageCalls(app).includes('/970537b002'));
  assert.ok(pageCalls(app).includes('/919956b003'));
  assert.ok(!pageCalls(app).includes('/video/1037840/'));
  assert.ok(!pageCalls(app).includes('/video/1031725/'));
  assert.ok(!pageCalls(app).includes('/970484b003'));
  assert.ok(!pageCalls(app).includes('/897019b002'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('2.3 e 4.4 temporada posterior usa o romaji específico do TMDB', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('85937', 'tv', 2, 1);

  assert.equal(searches(app)[0], 'Kimetsu no Yaiba: Mugen Ressha-hen');
  assert.equal(streams.length, 6);
  assert.ok(streams.every((stream) => stream.quality === '720p' || stream.quality === '360p'));
  assert.ok(pageCalls(app).includes('/video/970145/'));
  assert.ok(pageCalls(app).includes('/video/906828/'));
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('4.4 spin-off não é escolhido e o episódio ausente é ausência', async () => {
  const app = makeRuntime(makeRoute());
  const streams = await app.getStreams('37854', 'tv', 1, 1);
  assert.equal(streams.length, 6);
  assert.ok(!pageCalls(app).includes('/video/200/'));

  const missing = makeRuntime(makeRoute());
  assert.deepEqual(await missing.getStreams('95479', 'tv', 2, 99), []);
  assert.deepEqual(missing.errors, []);
  assert.deepEqual(missing.warnings, []);
});

test('2.4 título ausente devolve lista vazia sem erro', async () => {
  const app = makeRuntime(makeRoute());
  assert.deepEqual(await app.getStreams('999999', 'movie', null, null), []);
  assert.deepEqual(app.errors, []);
  assert.deepEqual(app.warnings, []);
});

test('3.3 um player falha e o outro resolve com aviso', async () => {
  const failingEpisode = `<html><body><h1>Jujutsu Kaisen 2 (Dublado) – Episódio 01</h1>
<iframe src="https://api.anivideo.net/videohls.php"></iframe>
<iframe src="https://www.anitube.zip/token-jujutsu-2-dub"></iframe></body></html>`;
  const app = makeRuntime(makeRoute({
    page: (url) => (url.pathname === '/video/970539b' ? { body: failingEpisode } : undefined),
  }));
  const streams = await app.getStreams('95479', 'tv', 2, 1);

  assert.equal(streams.length, 5);
  assert.ok(streams.some((stream) => stream.provider === 'Player FHD' && stream.language === 'Legendado'));
  assert.equal(app.warnings.length, 1);
  assert.match(app.warnings[0], /\[AniTube\] Opção Player FHD descartada: Player FHD sem parâmetro d/);
  assert.deepEqual(app.errors, []);
});

test('3.3 todos os players falham e o erro agregado sobe', async () => {
  const failingEpisode = (h1) => `<html><body><h1>${h1}</h1>
<iframe src="https://api.anivideo.net/videohls.php"></iframe>
<iframe src="https://www.anitube.zip/token-fail"></iframe></body></html>`;
  const app = makeRuntime(makeRoute({
    player1Status: 500,
    page: (url) => {
      if (url.pathname === '/video/970539b') return { body: failingEpisode('Jujutsu Kaisen 2 (Dublado) – Episódio 01') };
      if (url.pathname === '/video/919960/') return { body: failingEpisode('Jujutsu Kaisen 2 – Episódio 01') };
      return undefined;
    },
  }));
  const streams = await app.getStreams('95479', 'tv', 2, 1);
  assert.deepEqual(streams, []);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /^\[AniTube\] Falha em tv 95479: Nenhuma ficha produziu stream/);
  assert.ok(app.warnings.some((warning) => /Opção Player FHD descartada: Player FHD sem parâmetro d/.test(warning)));
  assert.ok(app.warnings.some((warning) => /Opção Player 1 descartada: HTTP 500/.test(warning)));
  assert.ok(app.warnings.some((warning) => /Ficha Dublado descartada/.test(warning)));
  assert.ok(app.warnings.some((warning) => /Ficha Legendado descartada/.test(warning)));
});

test('3.3 ficha sem player é erro de estrutura', async () => {
  const app = makeRuntime(makeRoute({
    page: (url) => {
      if (url.pathname === '/video/932006/') return { body: '<html><body><h1>Shingeki no Kyojin – Episódio 01</h1></body></html>' };
      return undefined;
    },
  }));
  assert.deepEqual(await app.getStreams('1429', 'tv', 1, 1), []);
  assert.equal(app.errors.length, 1);
  assert.match(app.errors[0], /Ficha sem player/);
});

test('3.2 qualidade vem do rótulo do player, inclusive 360p, 720p e desconhecida', async () => {
  const cases = [
    ['720p HD', '720p'],
    ['360p', '360p'],
    ['720p', '720p'],
    ['', 'Desconhecida'],
  ];
  for (const [label, expected] of cases) {
    const app = makeRuntime(makeRoute({ fhdLabel: label }));
    const streams = await app.getStreams('129', 'movie', null, null);
    assert.equal(streams.length, 1, label);
    assert.equal(streams[0].quality, expected, label);
    assert.deepEqual(app.errors, [], label);
  }
});

test('3.3 qualidade desconhecida fica depois das conhecidas', async () => {
  const app = makeRuntime(makeRoute({ fhdLabel: '' }));
  const streams = await app.getStreams('95479', 'tv', 2, 1);
  assert.equal(streams.length, 6);
  assert.deepEqual(streams.slice(0, 4).map((stream) => stream.quality), ['720p', '720p', '360p', '360p']);
  assert.deepEqual(streams.slice(4, 6).map((stream) => stream.quality), ['Desconhecida', 'Desconhecida']);
});

test('2.2 ano conflitante na ficha descarta a série', async () => {
  const app = makeRuntime(makeRoute({
    page: (url) => {
      if (url.pathname === '/video/931910/') {
        return { body: read('series-shingeki.html').replace('<b>Ano:</b> 2013', '<b>Ano:</b> 2010') };
      }
      return undefined;
    },
  }));
  assert.deepEqual(await app.getStreams('1429', 'tv', 1, 1), []);
  assert.ok(!app.calls.some((call) => new URL(call.url).pathname === '/video/932006/'));
});

test('4.1 e 5.1 formata no template Prism com título e coordenadas', async () => {
  const movie = makeRuntime(makeRoute(), codes.prism);
  const movieStreams = await movie.getStreams('129', 'movie', null, null);
  assert.match(movieStreams[0].name, /^💿 HD 720p\n/);
  assert.match(movieStreams[0].title, /🎬 A Viagem de Chihiro \(2001\)/);

  const series = makeRuntime(makeRoute(), codes.prism);
  const seriesStreams = await series.getStreams('95479', 'tv', 2, 1);
  assert.ok(seriesStreams.length > 0);
  assert.match(seriesStreams[0].title, /🎬 Jujutsu Kaisen \(2020\) T02E01/);
});

test('5.1 fixtures sanitizadas e manifest do AniTube', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'anitube');
  assert.ok(entry, 'entrada anitube ausente no manifest');
  assert.equal(entry.name, 'AniTube');
  assert.equal(entry.version, '1.0.0');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8', 'mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/anitube.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /googlevideo|maximaimg|Policy=|Signature=|Key-Pair-Id=|\b[a-f0-9]{64}\b/i, name);
  }
});
