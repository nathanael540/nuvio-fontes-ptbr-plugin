const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'amyflix');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const searchPage = read('search.html');
const searchEmpty = read('search-empty.html');
const searchMalformed = read('search-malformed.html');
const searchDuplicate = read('search-duplicate.html');
const seriesPage = read('series.html');
const seriesMalformed = read('series-malformed.html');
const filmPage = read('film.html');
const filmMalformed = read('film-malformed.html');
const filmUnsupported = read('film-unsupported.html');
const filmOnlyRumble = read('film-only-rumble.html');
const filmTitleMismatch = read('film-title-mismatch.html');
const episodePage = read('episode.html');
const episodeMp4 = read('episode-mp4.html');
const ajaxJwplayerHls = readJson('ajax-jwplayer-hls.json');
const ajaxJwplayerMp4 = readJson('ajax-jwplayer-mp4.json');
const ajaxRumble = readJson('ajax-rumble.json');
const ajaxVidmoly = readJson('ajax-vidmoly.json');
const ajaxEmpty = readJson('ajax-empty.json');
const ajaxInvalid = read('ajax-invalid.txt');
const rumbleEmbed = read('rumble-embed.html');
const rumbleNoHls = read('rumble-no-hls.html');

const TV_ID = '900001';
const MOVIE_ID = '900002';
const ABSENT_ID = '999999';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({
    title: 'Amor que Machuca',
    originalTitle: 'Love Me to Hurt Me',
    year: 2026,
    alternativeTitles: ['Amor que Machuca'],
  }),
  [MOVIE_ID]: tmdbMovie({
    title: 'Ammonite',
    originalTitle: 'Ammonite',
    year: 2020,
    alternativeTitles: [],
  }),
  [ABSENT_ID]: tmdbMovie({
    title: 'Título Inexistente',
    originalTitle: 'Missing Title',
    year: 2020,
    alternativeTitles: [],
  }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('amyflix-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('amyflix', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('amyflix', { outDir, formatter: 'prism' }), 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

class AppURL extends URL {
  get searchParams() {
    return new URLSearchParams(this.search);
  }
}

function makeRuntime(route = () => { throw new Error('fetch inesperado'); }, bundle = codes.gdrive) {
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
      if (name === 'cheerio-without-node-native') return require('./support/basic-html.js');
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

function tmdbMovie({ title, originalTitle, year, alternativeTitles }) {
  return {
    id: 1,
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 18 }],
    original_language: 'en',
    origin_country: ['US'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      titles: alternativeTitles.map((entry) => ({ iso_3166_1: 'BR', title: entry, type: '' })),
    },
  };
}

function tmdbTv({ title, originalTitle, year, alternativeTitles }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 18 }],
    original_language: 'th',
    origin_country: ['TH'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      results: alternativeTitles.map((entry) => ({ iso_3166_1: 'BR', title: entry, type: '' })),
    },
  };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const mediaType = parts[2];
  const id = parts[3];
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  return mediaType === 'movie' || mediaType === 'tv' ? data : { status: 404, body: { status_message: 'Not found' } };
}

function defaultAjax(body) {
  const params = new URLSearchParams(body);
  const nume = params.get('nume');
  const type = params.get('type');
  if (type === 'movie') {
    if (nume === '1') return { embed_url: 'https://drive.google.com/file/d/placeholder/preview', type: 'iframe' };
    return ajaxRumble;
  }
  if (nume === '1') return ajaxVidmoly;
  if (nume === '2') return ajaxJwplayerMp4;
  if (nume === '3') return ajaxJwplayerHls;
  return ajaxRumble;
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname === 'rumble.com') {
      return asResponse(options.rumble === undefined ? rumbleEmbed : options.rumble);
    }
    if (url.hostname !== 'amyflix.net') throw new Error(`Host inesperado: ${url.hostname}`);

    if (url.pathname === '/') {
      if (options.search) return asResponse(options.search(url.searchParams.get('s')));
      return asResponse(searchPage);
    }
    if (url.pathname === '/wp-admin/admin-ajax.php') {
      return asResponse(options.ajax === undefined ? defaultAjax(init.body) : options.ajax(init));
    }
    if (url.pathname === '/serie/amor-que-machuca-legendado/') {
      return asResponse(options.series === undefined ? seriesPage : options.series);
    }
    if (url.pathname === '/episodio/amor-que-machuca-episodio-1-legendado/') {
      return asResponse(options.episodeMp4 === undefined ? episodeMp4 : options.episodeMp4);
    }
    if (url.pathname === '/episodio/amor-que-machuca-episodio-2-legendado/') {
      return asResponse(options.episode === undefined ? episodePage : options.episode);
    }
    if (url.pathname === '/filme/ammonite-legendado/') {
      return asResponse(options.film === undefined ? filmPage : options.film);
    }
    return { status: 404, body: 'not found' };
  };
}

test('carrega o pacote sem rede e não usa APIs proibidas', () => {
  let fetchCalled = false;
  const runtime = makeRuntime(async () => {
    fetchCalled = true;
    return { body: 'ok' };
  });
  assert.equal(typeof runtime.exports.getStreams, 'function');
  assert.equal(fetchCalled, false);
  assert.doesNotMatch(codes.gdrive, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
  assert.doesNotMatch(codes.prism, /Promise\.allSettled|AbortController|setTimeout|require\(['"]node:|from ['"]node:/);
});

test('valida a entrada antes de qualquer requisição', async () => {
  const runtime = makeRuntime(makeRoute());
  const invalid = [
    ['abc', 'movie', null, null],
    ['0', 'movie', null, null],
    ['-1', 'movie', null, null],
    [TV_ID, 'serie', null, null],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', 1, 1.5],
  ];
  for (const args of invalid) assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
});

test('série resolve jwplayer HLS, jwplayer MP4 e Rumble pelo par temporada/episódio', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(streams.length, 3, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));

  const rumble = streams.find((stream) => stream.provider === 'Rumble');
  assert.equal(rumble.url, 'https://rumble.com/hls-vod/placeholder/playlist.m3u8');
  assert.equal(rumble.type, 'hls');
  assert.equal(rumble.quality, '1080p');
  assert.equal(rumble.language, 'Legendado');
  assert.equal(rumble.headers, undefined);
  assert.match(rumble.title, /Amor que Machuca/);
  assert.match(rumble.title, /T01E02/);

  const jwplayer = streams.filter((stream) => stream.provider === 'JWPlayer');
  assert.equal(jwplayer.length, 2);
  assert.ok(jwplayer.some((stream) => stream.type === 'hls' && stream.url.includes('playlist.m3u8?key=placeholder-key')));
  assert.ok(jwplayer.some((stream) => stream.type === 'mp4' && stream.url === 'https://cdn.example.test/video/episode-2.mp4'));
  assert.ok(streams.every((stream) => stream.language === 'Legendado'));
  assert.ok(streams.every((stream) => stream.headers === undefined));
  assert.ok(streams.every((stream) => LANGUAGE_VALUES.includes(stream.language)));
  assert.deepEqual(runtime.errors, []);
});

test('episódio S01E01 usa a URL publicada e devolve MP4 sem qualidade declarada', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.url, 'https://cdn.example.test/video/episode-2.mp4');
  assert.equal(stream.provider, 'JWPlayer');
  assert.equal(stream.type, 'mp4');
  assert.equal(stream.quality, 'Desconhecida');
  assert.equal(stream.language, 'Legendado');
  assert.match(stream.title, /T01E01/);
  assert.equal(stream.headers, undefined);
  assert.deepEqual(runtime.errors, []);
});

test('filme resolve o embed Rumble e descarta Google Drive por triagem', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 1);
  const [stream] = streams;
  assert.equal(stream.provider, 'Rumble');
  assert.equal(stream.url, 'https://rumble.com/hls-vod/placeholder/playlist.m3u8');
  assert.equal(stream.quality, '1080p');
  assert.equal(stream.language, 'Legendado');
  assert.match(stream.title, /Ammonite/);
  assert.doesNotMatch(stream.title, /T\d+E\d+/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('página só com hosts fora do contrato devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmUnsupported, ajax: (init) => {
    const nume = new URLSearchParams(init.body).get('nume');
    return nume === '1'
      ? { embed_url: 'https://drive.google.com/file/d/placeholder/preview', type: 'iframe' }
      : { embed_url: 'https://ok.ru/videoembed/placeholder', type: 'iframe' };
  } }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('embed_url vazio descarta a opção e sobe erro quando é a única', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmOnlyRumble, ajax: () => ajaxEmpty }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
  assert.match(runtime.warnings[0], /embed_url vazio/);
});

test('JSON inválido no AJAX descarta a opção e sobe erro quando é a única', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmOnlyRumble, ajax: () => ajaxInvalid }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
});

test('Rumble sem u.hls.url falha isolado e sobe erro quando é a única opção', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmOnlyRumble, ajax: () => ajaxRumble, rumble: rumbleNoHls }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
  assert.match(runtime.warnings[0], /u\.hls\.url/);
});

test('busca vazia e título ausente devolvem lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchEmpty }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(ABSENT_ID, 'movie', null, null)), []);
  assert.deepEqual(runtime.errors, []);
});

test('busca malformada é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
});

test('dois candidatos compatíveis sem desempate são ausência sem abrir a ficha', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => searchDuplicate }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.calls.some((call) => call.url.includes('/serie/')), false);
});

test('título da ficha divergente descarta o candidato sem consultar o player', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmTitleMismatch }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.calls.some((call) => call.url.includes('/wp-admin/admin-ajax.php')), false);
});

test('ficha de série sem ul.episodios é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ series: seriesMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
});

test('ficha de filme sem opções é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ film: filmMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AmyFlix\]/);
});

test('temporada ausente devolve lista vazia sem consultar o episódio', async () => {
  const runtime = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 2, 1)), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.calls.some((call) => call.url.includes('/episodio/')), false);
});
