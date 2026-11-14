const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'animesonlineblue');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const searchKimetsu = readJson('search-kimetsu.json');
const searchDemon = readJson('search-demon-slayer.json');
const searchJujutsu = readJson('search-jujutsu.json');
const searchMob = readJson('search-mob-psycho.json');
const searchEmpty = readJson('search-empty.json');

const gridKimetsu = read('grid-kimetsu.txt');
const gridJujutsu = read('grid-jujutsu.txt');
const gridMob = read('grid-mob-psycho.txt');
const gridNoAudio = read('grid-no-audio.txt');
const gridWithoutTemporadas = read('grid-without-temporadas.txt');
const gridInvalid = read('grid-invalid.txt');
const gridEpisodeInvalid = read('grid-episode-invalid.txt');

const episodeLeg = readJson('episode-leg.json');
const episodeJujutsuLeg = readJson('episode-jujutsu-leg.json');
const episodeJujutsuDub = readJson('episode-jujutsu-dub.json');
const episodeMobLeg = readJson('episode-mob-leg.json');
const episodeNoPlayer = readJson('episode-no-player.json');
const episodeUnknownHost = readJson('episode-unknown-host.json');
const episodeInvalidProtocol = readJson('episode-invalid-protocol.json');
const episodeDirect = readJson('episode-direct.json');
const episodeBloggerEmpty = readJson('episode-blogger-empty.json');
const episodeInvalid = readJson('episode-invalid.json');

const bloggerOne = read('blogger-one-format.html');
const bloggerTwo = read('blogger-two-formats.html');
const bloggerNoFormats = read('blogger-no-formats.html');

const KIMETSU_ID = '85937';
const JUJUTSU_ID = '95479';
const MOB_ID = '100';
const MOVIE_ID = '129';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];
const QUALITY_VALUES = ['360p', '720p'];

const TMDB_BY_ID = {
  [KIMETSU_ID]: seriesInfo({
    name: 'Demon Slayer: Kimetsu no Yaiba',
    original: '鬼滅の刃',
    year: 2019,
    romaji: ['Kimetsu no Yaiba'],
    seasons: [
      { number: 1, episodeCount: 26, year: 2019 },
      { number: 2, episodeCount: 7, year: 2021 },
      { number: 3, episodeCount: 11, year: 2023 },
      { number: 4, episodeCount: 8, year: 2024 },
    ],
  }),
  [JUJUTSU_ID]: seriesInfo({
    name: 'Jujutsu Kaisen',
    original: '呪術廻戦',
    year: 2020,
    romaji: ['Jujutsu Kaisen'],
    seasons: [
      { number: 1, episodeCount: 24, year: 2020 },
      { number: 2, episodeCount: 23, year: 2023 },
      { number: 3, episodeCount: 12, year: 2024 },
    ],
  }),
  [MOB_ID]: seriesInfo({
    name: 'Mob Psycho 100',
    original: 'モブサイコ100',
    year: 2016,
    romaji: ['Mob Psycho 100'],
    seasons: [
      { number: 1, episodeCount: 12, year: 2016 },
      { number: 2, episodeCount: 13, year: 2019 },
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

const EPISODE_FIXTURES = {
  73428: episodeLeg,
  156586: episodeJujutsuLeg,
  158759: episodeJujutsuDub,
  156580: episodeJujutsuLeg,
  158753: episodeJujutsuDub,
  158828: episodeJujutsuLeg,
  158900: episodeJujutsuDub,
  41556: episodeMobLeg,
  40174: episodeMobLeg,
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animesonlineblue-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('animesonlineblue', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('animesonlineblue', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animesonlineblue', { outDir, formatter: 'prism' }), 'utf8');
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
      throw new Error(`require inesperado: ${name}`);
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
      const response = {
        ok: status >= 200 && status < 300,
        status,
        url: result.url || String(url),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
      return response;
    },
  };
  if (options.apiKey !== null) context.TMDB_API_KEY = options.apiKey || 'chave-ficticia';
  vm.runInNewContext(bundle, context, { filename: 'animesonlineblue.js' });
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
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
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
  if (query === 'Demon Slayer: Kimetsu no Yaiba' || query === 'Demon Slayer') return searchDemon;
  if (query === 'Kimetsu no Yaiba') return searchKimetsu;
  if (query === 'Jujutsu Kaisen') return searchJujutsu;
  if (query === 'Mob Psycho 100') return searchMob;
  return searchEmpty;
}

function gridFor(slug) {
  if (slug === 'kimetsu-no-yaiba') return gridKimetsu;
  if (slug === 'jujutsu-kaisen') return gridJujutsu;
  if (slug === 'mob-psycho-100') return gridMob;
  return { status: 404, body: 'not found' };
}

function episodeFor(id) {
  const fixture = EPISODE_FIXTURES[id];
  if (fixture === undefined) return { status: 404, body: { error: 'not found' } };
  return { ...fixture, id: Number(id) };
}

function bloggerFor(url) {
  const fixture = url.searchParams.get('fixture');
  if (fixture === 'legendado') return bloggerOne;
  if (fixture === 'dublado') return bloggerTwo;
  if (fixture === 'sem-formatos') return bloggerNoFormats;
  throw new Error(`fixture de player inesperada: ${fixture}`);
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname === 'animesonline.blue') {
      if (url.pathname === '/api/search') {
        const query = url.searchParams.get('q');
        return asResponse(options.search === undefined ? searchFor(query) : options.search(query));
      }
      if (url.pathname.startsWith('/anime/')) {
        const slug = decodeURIComponent(url.pathname.slice('/anime/'.length));
        return asResponse(options.grid === undefined ? gridFor(slug) : options.grid(slug));
      }
      if (url.pathname.startsWith('/api/episodio/')) {
        const id = Number(url.pathname.slice('/api/episodio/'.length));
        return asResponse(options.episode === undefined ? episodeFor(id) : options.episode(id));
      }
      throw new Error(`Rota inesperada: ${url.pathname}`);
    }
    if (url.hostname === 'www.blogger.com' || url.hostname === 'blogger.com') {
      return asResponse(options.blogger === undefined ? bloggerFor(url) : options.blogger(url));
    }
    throw new Error(`Host inesperado: ${url.hostname}`);
  };
}

function searchQueries(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname === '/api/search')
    .map((url) => url.searchParams.get('q'));
}

function gridPaths(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/anime/'))
    .map((url) => url.pathname);
}

function episodeIds(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.pathname.startsWith('/api/episodio/'))
    .map((url) => Number(url.pathname.slice('/api/episodio/'.length)));
}

function playerCalls(calls) {
  return calls
    .map((call) => new URL(call.url))
    .filter((url) => url.hostname === 'www.blogger.com' || url.hostname === 'blogger.com')
    .map((url) => url.searchParams.get('fixture'));
}

function assertNoForbiddenApi(bundle) {
  assert.doesNotMatch(bundle, /Promise\.allSettled|AbortController|setTimeout|SCRAPER_SETTINGS|hasSettings/);
  assert.doesNotMatch(bundle, /require\(['"]node:|from ['"]node:/);
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

test('filme é recusado sem requisição ao Animes Online Blue', async () => {
  for (const args of [[MOVIE_ID, 'movie', null, null], [KIMETSU_ID, 'movie', 1, 1]]) {
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
    [KIMETSU_ID, 'anime', 1, 1, /mediaType inválido/],
    [KIMETSU_ID, 'tv', null, 1, /Série sem temporada\/episódio válidos/],
    [KIMETSU_ID, 'tv', 1, 0, /Série sem temporada\/episódio válidos/],
    [KIMETSU_ID, 'tv', 1, 1.5, /Série sem temporada\/episódio válidos/],
  ];
  for (const [id, type, season, episode, pattern] of cases) {
    const runtime = makeRuntime(makeRoute());
    const streams = await runtime.getStreams(id, type, season, episode);
    assert.deepEqual(streams, [], `${id} ${type}`);
    assert.equal(runtime.calls.length, 0, `${id} ${type}`);
    assert.equal(runtime.errors.length, 1, `${id} ${type}`);
    assert.match(runtime.errors[0], /^\[Animes Online Blue\] Falha em/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('Demon Slayer S01E01 é encontrado pelo romaji, apesar do título PT-BR apontar para o filme de 2025', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(searchQueries(runtime.calls), ['Demon Slayer: Kimetsu no Yaiba', '鬼滅の刃', 'Kimetsu no Yaiba']);
  assert.deepEqual(gridPaths(runtime.calls), ['/anime/kimetsu-no-yaiba']);
  assert.deepEqual(episodeIds(runtime.calls), [73428]);
  assert.deepEqual(playerCalls(runtime.calls), ['legendado']);

  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, 'https://cdn.example.test/video/360.mp4');
  assert.equal(stream.quality, '360p');
  assert.equal(stream.language, 'Legendado');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.provider, 'Animes Online Blue');
  assert.equal(typeof stream.name, 'string');
  assert.equal(typeof stream.title, 'string');
  assert.match(stream.name, /^Animes Online Blue 360p/);
  assert.match(stream.name, /🗣️ Legendado/);
  assert.match(stream.title, /🗣️ Legendado/);
  assert.equal(stream.format, undefined);
  assert.equal(stream.headers, undefined);
  assert.equal(stream.size, undefined);
  assert.equal(stream.subtitles, undefined);
  assert.equal(stream.infoHash, undefined);
  assert.ok(LANGUAGE_VALUES.includes(stream.language));
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.logs, []);
});

test('Jujutsu Kaisen S01E01 resolve legendado e dublado como opções independentes', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.deepEqual(episodeIds(runtime.calls), [156586, 158759]);
  assert.deepEqual(playerCalls(runtime.calls), ['legendado', 'dublado']);
  assert.equal(streams.length, 3);
  assert.deepEqual(
    streams.map((stream) => ({ quality: stream.quality, language: stream.language, url: stream.url })),
    [
      { quality: '720p', language: 'Dublado', url: 'https://cdn.example.test/video/720.mp4' },
      { quality: '360p', language: 'Legendado', url: 'https://cdn.example.test/video/360.mp4' },
      { quality: '360p', language: 'Dublado', url: 'https://cdn.example.test/video/360.mp4' },
    ],
  );
  assert.ok(streams.every((stream) => stream.type === 'mp4'));
  assert.ok(streams.every((stream) => stream.provider === 'Animes Online Blue'));
  assert.ok(streams.every((stream) => LANGUAGE_VALUES.includes(stream.language)));
  assert.ok(streams.every((stream) => QUALITY_VALUES.includes(stream.quality)));
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.logs, []);
});

test('temporada e episódio são escolhidos pelo par numero/num, não pela posição', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(MOB_ID, 'tv', 2, 1);

  assert.deepEqual(gridPaths(runtime.calls), ['/anime/mob-psycho-100']);
  assert.deepEqual(episodeIds(runtime.calls), [40174]);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');

  const first = makeRuntime();
  await first.getStreams(MOB_ID, 'tv', 1, 1);
  assert.deepEqual(episodeIds(first.calls), [41556]);
  assert.deepEqual(first.errors, []);
});

test('temporada ou episódio ausente devolve lista vazia sem consultar áudio', async () => {
  for (const args of [[JUJUTSU_ID, 'tv', 3, 1], [JUJUTSU_ID, 'tv', 1, 3]]) {
    const runtime = makeRuntime();
    const streams = await runtime.getStreams(...args);
    assert.deepEqual(streams, [], `${args[2]}x${args[3]}`);
    assert.deepEqual(episodeIds(runtime.calls), []);
    assert.deepEqual(runtime.errors, []);
    assert.deepEqual(runtime.warnings, []);
  }
});

test('episódio sem áudio publicado devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ grid: () => gridNoAudio }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.deepEqual(episodeIds(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.logs, []);
});

test('um áudio falha e o outro resolve, com aviso', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: (id) => (id === 158759 ? { status: 500, body: 'erro' } : episodeFor(id)),
  }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.deepEqual(streams.map((stream) => stream.language), ['Legendado']);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[Animes Online Blue\] Opção Dublado descartada: HTTP 500 em \[url\]$/);
  assert.deepEqual(runtime.errors, []);
});

test('Blogger sem formatos descarta só a opção daquele áudio', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: (id) => (id === 158759
      ? { ...episodeBloggerEmpty, id: 158759, tipo: 'Dublado', title: 'Jujutsu Kaisen Dublado Episódio 1' }
      : episodeFor(id)),
  }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção Dublado descartada: Player do Blogger sem MP4 progressivo/);
  assert.deepEqual(runtime.errors, []);
});

test('todas as opções falham e o erro agregado sobe até getStreams', async () => {
  const runtime = makeRuntime(makeRoute({
    episode: () => ({ status: 500, body: 'erro' }),
  }));
  const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /Opção Legendado descartada: HTTP 500 em \[url\]/);
  assert.match(runtime.warnings[1], /Opção Dublado descartada: HTTP 500 em \[url\]/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animes Online Blue\] Falha em tv 95479: Nenhuma opção de áudio produziu stream: Legendado: HTTP 500 em \[url\]; Dublado: HTTP 500 em \[url\]$/);
});

test('episódio sem player e host desconhecido são triagem, não falha', async () => {
  for (const [fixture, reason] of [[episodeNoPlayer, 'episódio sem playerUrl'], [episodeUnknownHost, 'host player.example.test não suportado']]) {
    const runtime = makeRuntime(makeRoute({ episode: () => fixture }));
    const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

    assert.deepEqual(streams, []);
    assert.equal(runtime.logs.length, 1);
    assert.ok(
      runtime.logs[0].includes(`Opção Legendado descartada por triagem: ${reason}`),
      runtime.logs[0],
    );
    assert.deepEqual(runtime.warnings, []);
    assert.deepEqual(runtime.errors, []);
    assert.deepEqual(playerCalls(runtime.calls), []);
  }
});

test('playerUrl fora de HTTP(S) é triagem, não falha', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeInvalidProtocol }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.logs.length, 1);
  assert.match(runtime.logs[0], /Opção Legendado descartada por triagem: playerUrl fora de HTTP\(S\)/);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('mídia direta é aceita sem buscar o player e tem a qualidade da URL', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeDirect }));
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example.test/video/1080p/leg.mp4');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(streams[0].type, 'mp4');
  assert.deepEqual(playerCalls(runtime.calls), []);
  assert.deepEqual(runtime.logs, []);
  assert.deepEqual(runtime.warnings, []);
  assert.deepEqual(runtime.errors, []);
});

test('título ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime();
  const streams = await runtime.getStreams(ABSENT_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(searchQueries(runtime.calls).length, 2);
  assert.deepEqual(gridPaths(runtime.calls), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('busca fora de 2xx, JSON inválido e estrutura sem results viram erro registrado', async () => {
  const cases = [
    [() => ({ status: 500, body: 'erro' }), /HTTP 500/],
    [() => ({ body: 'não é json' }), /Resposta não é JSON válido/],
    [() => ({ body: { items: [] } }), /sem a lista results/],
  ];
  for (const [search, pattern] of cases) {
    const runtime = makeRuntime(makeRoute({ search }));
    const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);
    assert.deepEqual(streams, []);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], /^\[Animes Online Blue\]/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('RSC sem temporadas, JSON inválido e episódio sem leg/dub viram erro registrado', async () => {
  const cases = [
    [() => gridWithoutTemporadas, /sem o bloco temporadas/],
    [() => gridInvalid, /Bloco temporadas com JSON inválido/],
    [() => gridEpisodeInvalid, /sem o campo dub/],
  ];
  for (const [grid, pattern] of cases) {
    const runtime = makeRuntime(makeRoute({ grid }));
    const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);
    assert.deepEqual(streams, []);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], /^\[Animes Online Blue\]/);
    assert.match(runtime.errors[0], pattern);
  }
});

test('resposta de episódio inválida ou falha de rede descarta a opção e sobe o erro', async () => {
  for (const episode of [() => episodeInvalid, () => new Error('falha de rede')]) {
    const runtime = makeRuntime(makeRoute({ episode }));
    const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);
    assert.deepEqual(streams, []);
    assert.equal(runtime.warnings.length, 1);
    assert.match(runtime.warnings[0], /^\[Animes Online Blue\] Opção Legendado descartada: /);
    assert.equal(runtime.errors.length, 1);
    assert.match(runtime.errors[0], /^\[Animes Online Blue\] Falha em tv 85937: Nenhuma opção de áudio produziu stream/);
  }
});

test('ausência da chave do TMDB termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  const streams = await runtime.getStreams(KIMETSU_ID, 'tv', 1, 1);

  assert.deepEqual(streams, []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Animes Online Blue\] Falha em tv 85937: TMDB_API_KEY indisponível/);
});

test('contrato dos streams nos três formatos publicados', async () => {
  for (const [label, bundle] of Object.entries(codes)) {
    const runtime = makeRuntime(makeRoute(), bundle);
    const streams = await runtime.getStreams(JUJUTSU_ID, 'tv', 1, 1);

    assert.equal(streams.length, 3, label);
    for (const stream of streams) {
      assert.equal(typeof stream.url, 'string', label);
      assert.match(stream.url, /^https:\/\//, label);
      assert.equal(typeof stream.name, 'string', label);
      assert.equal(typeof stream.title, 'string', label);
      assert.ok(stream.name.length > 0 && stream.title.length > 0, label);
      assert.ok(QUALITY_VALUES.includes(stream.quality), label);
      assert.ok(LANGUAGE_VALUES.includes(stream.language), label);
      assert.equal(stream.type, 'mp4', label);
      assert.equal(stream.provider, 'Animes Online Blue', label);
      assert.equal(stream.format, undefined, label);
      assert.equal(stream.headers, undefined, label);
      assert.equal(stream.size, undefined, label);
      assert.equal(stream.subtitles, undefined, label);
      assert.equal(stream.infoHash, undefined, label);
    }
    assert.ok(streams.every((stream) => stream.name.includes('🗣️')), label);
  }

  const gdrive = makeRuntime(makeRoute(), codes.gdrive);
  const gdriveStreams = await gdrive.getStreams(JUJUTSU_ID, 'tv', 1, 1);
  assert.match(gdriveStreams[0].name, /^Animes Online Blue 720p\n🗣️ Dublado/);
  assert.doesNotMatch(gdriveStreams[0].title, /Jujutsu Kaisen/);

  const prism = makeRuntime(makeRoute(), codes.prism);
  const prismStreams = await prism.getStreams(JUJUTSU_ID, 'tv', 1, 1);
  assert.match(prismStreams[0].name, /^💿 HD 720p/);
  assert.match(prismStreams[0].title, /🎬 Jujutsu Kaisen \(2020\) T01E01/);
  assert.match(prismStreams[0].title, /🗣️ Dublado/);
});

test('manifest declara o Animes Online Blue com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'animesonlineblue');
  assert.ok(entry);
  assert.equal(entry.name, 'Animes Online Blue');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['tv']);
  assert.deepEqual(entry.formats, ['mp4']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/animesonlineblue.js');
  assert.equal(entry.enabled, true);
  assert.equal(entry.hasSettings, undefined);
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublados?|legendados?/i);
});

test('fixtures estão presentes e sanitizadas', () => {
  const expected = [
    'search-kimetsu.json',
    'search-demon-slayer.json',
    'search-jujutsu.json',
    'search-mob-psycho.json',
    'search-empty.json',
    'grid-kimetsu.txt',
    'grid-jujutsu.txt',
    'grid-mob-psycho.txt',
    'grid-no-audio.txt',
    'grid-without-temporadas.txt',
    'grid-invalid.txt',
    'grid-episode-invalid.txt',
    'episode-leg.json',
    'episode-jujutsu-leg.json',
    'episode-jujutsu-dub.json',
    'episode-mob-leg.json',
    'episode-no-player.json',
    'episode-unknown-host.json',
    'episode-invalid-protocol.json',
    'episode-direct.json',
    'episode-blogger-empty.json',
    'episode-invalid.json',
    'blogger-one-format.html',
    'blogger-two-formats.html',
    'blogger-no-formats.html',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /\btoken=|Signature=|Key-Pair-Id=|cookie|expires=|googlevideo/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https?:\/\/([^/"'\s]+)/g)) {
      assert.match(match[1], /^(animesonline\.blue|www\.blogger\.com|blogger\.com|cdn\.example\.test|player\.example\.test)$/, `${name}: ${match[1]}`);
    }
  }
});

test('fixtures preservam o contrato observado da fonte', () => {
  assert.deepEqual(searchKimetsu.results.map((item) => [item.slug, item.year]), [
    ['kimetsu-no-yaiba-movie-1-mugenjou-hen-akaza-sairai', '2025'],
    ['kimetsu-no-yaiba', '2019'],
  ]);
  assert.deepEqual(searchDemon.results.map((item) => item.slug), [
    'kimetsu-no-yaiba-movie-1-mugenjou-hen-akaza-sairai',
    'berserk-2016',
  ]);
  assert.equal(JSON.parse(gridJujutsu.slice('0:'.length)).temporadas.length, 2);
  assert.equal(JSON.parse(gridJujutsu.slice('0:'.length)).temporadas[0].eps[0].dub.id, 158759);
  assert.equal(JSON.parse(gridMob.slice('0:'.length)).temporadas.length, 2);
});
