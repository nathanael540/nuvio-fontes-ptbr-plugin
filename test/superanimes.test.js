const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'superanimes');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];
const MOVIE_ID = '149';
const CHIHIRO_ID = '129';
const MUGEN_TRAIN_ID = '635302';
const DEMON_SLAYER_ID = '85937';
const AOT_ID = '1429';
const BOKU_NO_HERO_ID = '65930';
const NARUTO_ID = '46260';
const BLEACH_ID = '30984';
const KOORI_ID = '999999';
const TITANIC_ID = '999998';

const FIXTURE = {
  catalog: readJson('catalog.json'),
  dubbed: readJson('episodios-dublados.json'),
  subbed: readJson('episodios-legendados.json'),
  catalogNotArray: readJson('catalog-not-array.json'),
  episodesNotArray: readJson('episodes-not-array.json'),
  catalogEmpty: readJson('catalog-empty.json'),
  notJson: read('not-json.txt'),
};

const TMDB_BY_ID = {
  [MOVIE_ID]: tmdbMovie({ title: 'Akira', originalTitle: 'AKIRA', year: 1988 }),
  [CHIHIRO_ID]: tmdbMovie({
    title: 'A Viagem de Chihiro',
    originalTitle: '千と千尋の神隠し',
    year: 2001,
    alternatives: [
      { iso_3166_1: 'JP', title: 'Sen to Chihiro no Kamikakushi', type: 'Romaji' },
      { iso_3166_1: 'BR', title: 'A Viagem de Chihiro', type: '' },
    ],
  }),
  [MUGEN_TRAIN_ID]: tmdbMovie({
    title: 'Demon Slayer: Mugen Train - O Filme',
    originalTitle: '劇場版「鬼滅の刃」無限列車編',
    year: 2020,
    alternatives: [
      { iso_3166_1: 'JP', title: 'Gekijouban Kimetsu no Yaiba: Mugen Ressha-hen', type: 'Romaji' },
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba: Mugen Ressha-hen', type: 'Romaji' },
      { iso_3166_1: 'BR', title: 'Demon Slayer: Trem Infinito - O Filme', type: '' },
    ],
  }),
  [DEMON_SLAYER_ID]: tmdbTv({
    title: 'Demon Slayer: Kimetsu no Yaiba',
    originalTitle: '鬼滅の刃',
    year: 2019,
    alternatives: [
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba', type: 'Romaji' },
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba: Mugen Ressha-hen', type: 'Season 2 Romaji' },
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba: Yuukaku-hen', type: 'Season 3 Romaji' },
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba: Katanakaji no Sato-hen', type: 'Season 4 Romaji' },
      { iso_3166_1: 'JP', title: 'Kimetsu no Yaiba: Hashira Geiko-hen', type: 'Season 5 Romaji' },
    ],
    seasons: [
      season(0, 18, '2020-08-26'),
      season(1, 26, '2019-04-06'),
      season(2, 7, '2021-10-10'),
      season(3, 11, '2021-12-05'),
      season(4, 11, '2023-04-09'),
      season(5, 8, '2024-05-12'),
    ],
  }),
  [AOT_ID]: tmdbTv({
    title: 'Attack on Titan',
    originalTitle: '進撃の巨人',
    year: 2013,
    alternatives: [
      { iso_3166_1: 'JP', title: 'Shingeki no Kyojin', type: 'Romaji' },
      { iso_3166_1: 'JP', title: 'Shingeki no Kyojin The Final Season', type: 'Romaji' },
      { iso_3166_1: 'BR', title: 'Ataque dos Titãs', type: '' },
    ],
    seasons: [
      season(0, 37, '2013-07-07'),
      season(1, 25, '2013-04-07'),
      season(2, 12, '2017-04-01'),
      season(3, 22, '2018-07-23'),
      season(4, 28, '2020-12-07'),
    ],
  }),
  [BOKU_NO_HERO_ID]: tmdbTv({
    title: 'My Hero Academia',
    originalTitle: '僕のヒーローアカデミア',
    year: 2016,
    alternatives: [{ iso_3166_1: 'JP', title: 'Boku no Hero Academia', type: 'Romaji' }],
    seasons: [
      season(0, 19, '2017-04-04'),
      season(1, 13, '2016-04-03'),
      season(2, 25, '2017-04-01'),
    ],
  }),
  [NARUTO_ID]: tmdbTv({
    title: 'Naruto',
    originalTitle: 'ナルト',
    year: 2002,
    alternatives: [{ iso_3166_1: 'JP', title: 'Naruto', type: 'Romaji' }],
    seasons: [
      season(0, 2, '2002-12-21'),
      season(1, 52, '2002-10-03'),
      season(2, 52, null),
      season(3, 54, null),
      season(4, 62, null),
    ],
  }),
  [BLEACH_ID]: tmdbTv({
    title: 'Bleach',
    originalTitle: 'BLEACH',
    year: 2004,
    alternatives: [{ iso_3166_1: 'JP', title: 'Bleach', type: 'Romaji' }],
    seasons: [
      season(0, 4, '2004-12-18'),
      season(1, 366, '2004-10-05'),
      season(2, 50, '2022-10-11'),
    ],
  }),
  [KOORI_ID]: tmdbTv({
    title: 'Koori no Jouheki 2nd Season',
    originalTitle: '氷の城壁 2nd Season',
    year: 2026,
    alternatives: [{ iso_3166_1: 'JP', title: 'Koori no Jouheki 2nd Season', type: 'Romaji' }],
    seasons: [season(1, 8, '2026-01-01')],
  }),
  [TITANIC_ID]: tmdbMovie({ title: 'Titanic', originalTitle: 'Titanic', year: 1997 }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('superanimes-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('superanimes', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('superanimes', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('superanimes', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.prism) {
  const calls = [];
  const errors = [];
  const warnings = [];
  const context = {
    module: { exports: {} },
    URL: AppURL,
    URLSearchParams,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    TMDB_API_KEY: 'chave-ficticia',
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
  vm.runInNewContext(bundle, context);
  return { exports: context.module.exports, calls, errors, warnings };
}

function asResponse(value) {
  if (value === undefined) throw new Error('resposta indefinida');
  if (typeof value === 'string') return { body: value };
  if (value !== null && typeof value === 'object' && ('status' in value || 'body' in value)) return value;
  return { body: value };
}

function season(number, episodeCount, airDate) {
  return { season_number: number, name: `Temporada ${number}`, episode_count: episodeCount, air_date: airDate };
}

function tmdbMovie({ title, originalTitle, year, alternatives = [] }) {
  return {
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: { titles: alternatives },
  };
}

function tmdbTv({ title, originalTitle, year, alternatives = [], seasons = [] }) {
  return {
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: { results: alternatives },
    seasons,
  };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const data = TMDB_BY_ID[parts[3]];
  if (data === undefined) return { status: 404, body: { status_message: 'Not found' } };
  return data;
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'api.animestvs.org') {
      throw new Error(`Host inesperado: ${url.hostname}${url.pathname}`);
    }
    if (url.pathname === '/animes') {
      return asResponse(options.catalog === undefined ? FIXTURE.catalog : options.catalog());
    }
    if (url.pathname === '/episodios-dublados') {
      return asResponse(options.dubbed === undefined ? FIXTURE.dubbed : options.dubbed());
    }
    if (url.pathname === '/episodios-legendados') {
      return asResponse(options.subbed === undefined ? FIXTURE.subbed : options.subbed());
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function rowOf(list, anime, episodio) {
  const row = list.find((item) => item.anime === anime && item.episodio === episodio);
  assert.ok(row, `fixture ausente: ${anime} ${episodio}`);
  return row;
}

function byLanguage(streams) {
  const map = new Map();
  for (const stream of streams) map.set(stream.language, stream);
  return map;
}

function assertStream(stream, expected) {
  assert.equal(stream.url, expected.url);
  assert.equal(stream.quality, expected.quality);
  assert.equal(stream.language, expected.language);
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.provider, 'AnimesTVS');
  assert.match(stream.url, /^https:\/\//);
  assert.ok(LANGUAGE_VALUES.includes(stream.language), `idioma fora do enum: ${stream.language}`);
  assert.match(stream.title, /Super Animes/);
}

test('carrega o pacote sem rede e não usa APIs proibidas', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.deepEqual(Object.keys(runtime.exports), ['getStreams']);
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  for (const code of [codes.base, codes.gdrive, codes.prism]) {
    assert.doesNotMatch(code, /\basync\s+function\b|\bawait\s/);
    assert.doesNotMatch(code, /Promise\.allSettled|AbortController|setTimeout|setInterval|require\(['"]node:|from ['"]node:/);
  }
});

test('valida a entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    [DEMON_SLAYER_ID, 'anime', null, null],
    [DEMON_SLAYER_ID, 'tv', null, 1],
    [DEMON_SLAYER_ID, 'tv', 1, 0],
    [DEMON_SLAYER_ID, 'tv', 1, 1.5],
    [DEMON_SLAYER_ID, 'tv', 0, 1],
  ];
  for (const args of invalid) assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  assert.ok(runtime.errors.every((message) => message.startsWith('[Super Animes]')));
});

test('resolve filme dublado e legendado com a qualidade do diretório', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Akira', 'Filme').link_video,
    quality: '720p',
    language: 'Legendado',
  });
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Akira (Dublado)', 'Filme').link_video,
    quality: '720p',
    language: 'Dublado',
  });
  assert.match(languages.get('Dublado').name, /Akira/);
  assert.match(languages.get('Dublado').name, /720p/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('filme com diretório like fica Desconhecida e o duplicado é deduplicado', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(CHIHIRO_ID, 'movie', null, null);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Sen to Chihiro no Kamikakushi (Dublado)', 'Filme').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Sen to Chihiro no Kamikakushi', 'Filme').link_video,
    quality: 'Desconhecida',
    language: 'Legendado',
  });
  assert.equal(streams.filter((stream) => stream.language === 'Dublado').length, 1);
  assert.deepEqual(runtime.errors, []);
});

test('filme iphoneb fica 420p e o título do ano correto é usado', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(MUGEN_TRAIN_ID, 'movie', null, null);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Kimetsu no Yaiba Movie: Mugen Ressha-hen (Dublado)', 'Filme').link_video,
    quality: '420p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Kimetsu no Yaiba Movie: Mugen Ressha-hen', 'Filme').link_video,
    quality: '1080p',
    language: 'Legendado',
  });
  assert.match(languages.get('Legendado').title, /2020/);
});

test('filme sem correspondência e catálogo vazio devolvem lista vazia', async () => {
  const absent = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await absent.exports.getStreams(TITANIC_ID, 'movie', null, null)), []);
  assert.deepEqual(absent.errors, []);

  const empty = makeRuntime(makeRoute({ catalog: () => FIXTURE.catalogEmpty }));
  assert.deepEqual(Array.from(await empty.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.deepEqual(empty.errors, []);
});

test('resolve série na primeira temporada pelos dois áudios', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 1, 1);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Kimetsu no Yaiba (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Kimetsu no Yaiba', 'Episódio 001').link_video,
    quality: '720p',
    language: 'Legendado',
  });
  assert.match(languages.get('Dublado').title, /Demon Slayer/);
  assert.match(languages.get('Dublado').title, /T01E01/);
});

test('resolve temporada pelo romaji específico', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 3, 1);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Kimetsu no Yaiba 2: Yuukaku-hen (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Kimetsu no Yaiba 2: Yuukaku-hen', 'Episódio 001').link_video,
    quality: '720p',
    language: 'Legendado',
  });
  assert.match(languages.get('Dublado').title, /T03E01/);
});

test('resolve temporada por marcador explícito no título', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 2, 1);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Shingeki no Kyojin Season 2 (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Shingeki no Kyojin Season 2', 'Episódio 001').link_video,
    quality: '720p',
    language: 'Legendado',
  });
});

test('resolve parte da temporada pela numeração acumulada', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(AOT_ID, 'tv', 3, 13);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Shingeki no Kyojin Season 3 Part 2 (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Shingeki no Kyojin Season 3 Part 2', 'Episódio 001').link_video,
    quality: '720p',
    language: 'Legendado',
  });
});

test('resolve temporada final pelo romaji de arco e pela parte', async () => {
  const runtime = makeRuntime(makeRoute());
  const first = await runtime.exports.getStreams(AOT_ID, 'tv', 4, 1);
  assert.equal(first.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(
    byLanguage(first).get('Dublado').url,
    rowOf(FIXTURE.dubbed, 'Shingeki no Kyojin: The Final Season (Dublado)', 'Episódio 001').link_video,
  );

  const later = makeRuntime(makeRoute());
  const streams = await later.exports.getStreams(AOT_ID, 'tv', 4, 17);
  assert.equal(streams.length, 2, JSON.stringify({ errors: later.errors, warnings: later.warnings }));
  assertStream(byLanguage(streams).get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Shingeki no Kyojin: The Final Season Part 2 (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(byLanguage(streams).get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Shingeki no Kyojin: The Final Season Part 2', 'Episódio 001').link_video,
    quality: '720p',
    language: 'Legendado',
  });
});

test('resolve série inteira pela numeração absoluta', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 2, 1);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  const languages = byLanguage(streams);
  assertStream(languages.get('Dublado'), {
    url: rowOf(FIXTURE.dubbed, 'Naruto (Dublado)', 'Episódio 053').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assertStream(languages.get('Legendado'), {
    url: rowOf(FIXTURE.subbed, 'Naruto', 'Episódio 053').link_video,
    quality: '1080p',
    language: 'Legendado',
  });
});

test('resolve temporada com número no fim e sufixo de áudio minúsculo', async () => {
  const boku = makeRuntime(makeRoute());
  const bokuStreams = await boku.exports.getStreams(BOKU_NO_HERO_ID, 'tv', 2, 1);
  assert.equal(bokuStreams.length, 2, JSON.stringify({ errors: boku.errors, warnings: boku.warnings }));
  assert.equal(
    byLanguage(bokuStreams).get('Dublado').url,
    rowOf(FIXTURE.dubbed, 'Boku no Hero Academia 2 (Dublado)', 'Episódio 001').link_video,
  );

  const koori = makeRuntime(makeRoute());
  const kooriStreams = await koori.exports.getStreams(KOORI_ID, 'tv', 1, 1);
  assert.equal(kooriStreams.length, 2, JSON.stringify({ errors: koori.errors, warnings: koori.warnings }));
  const languages = byLanguage(kooriStreams);
  assert.equal(languages.get('Dublado').quality, '1080p');
  assert.equal(languages.get('Legendado').quality, '720p');
});

test('episódio ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 1, 10)), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('um áudio ausente preserva o outro', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(BLEACH_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assertStream(streams[0], {
    url: rowOf(FIXTURE.dubbed, 'Bleach (Dublado)', 'Episódio 001').link_video,
    quality: '1080p',
    language: 'Dublado',
  });
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('falha de uma lista de episódios preserva o outro áudio', async () => {
  const runtime = makeRuntime(makeRoute({ subbed: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção Legendado/);
  assert.match(runtime.warnings[0], /HTTP 500/);
  assert.deepEqual(runtime.errors, []);
});

test('falha das duas listas de episódios sobe como erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({
    dubbed: () => ({ status: 500, body: 'erro' }),
    subbed: () => ({ status: 503, body: 'erro' }),
  }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Super Animes\]/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
  assert.match(runtime.errors[0], /Dublado Kimetsu no Yaiba/);
  assert.match(runtime.errors[0], /Legendado Kimetsu no Yaiba/);
  assert.equal(runtime.warnings.length, 2);
});

test('catálogo com HTTP fora de 2xx, fora do esquema ou não JSON é erro', async () => {
  const httpError = makeRuntime(makeRoute({ catalog: () => ({ status: 500, body: 'erro' }) }));
  assert.deepEqual(Array.from(await httpError.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.match(httpError.errors[0], /^\[Super Animes\]/);
  assert.match(httpError.errors[0], /HTTP 500/);

  const notArray = makeRuntime(makeRoute({ catalog: () => FIXTURE.catalogNotArray }));
  assert.deepEqual(Array.from(await notArray.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.match(notArray.errors[0], /catálogo fora do esquema/);

  const invalidJson = makeRuntime(makeRoute({ catalog: () => FIXTURE.notJson }));
  assert.deepEqual(Array.from(await invalidJson.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.match(invalidJson.errors[0], /não é JSON válido/);
});

test('lista de episódios fora do esquema é falha isolada do áudio', async () => {
  const runtime = makeRuntime(makeRoute({ dubbed: () => FIXTURE.episodesNotArray }));
  const streams = await runtime.exports.getStreams(DEMON_SLAYER_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção Dublado/);
  assert.match(runtime.warnings[0], /lista de episódios Dublado fora do esquema/);
});

test('linha com link_video inválido é falha da opção', async () => {
  const broken = FIXTURE.dubbed.map((row) => (
    row.anime === 'Akira (Dublado)' && row.episodio === 'Filme' ? { ...row, link_video: 'nao-e-url' } : row
  ));
  const runtime = makeRuntime(makeRoute({ dubbed: () => broken }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(streams[0].language, 'Legendado');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção Dublado/);
  assert.match(runtime.warnings[0], /link_video inválido/);
});
