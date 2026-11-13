const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'animefire');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const searchExact = readJson('search-exact.json');
const searchEmpty = readJson('search-empty.json');
const searchPage1 = readJson('search-page-1.json');
const searchPage2 = readJson('search-page-2.json');
const searchMovie = readJson('search-movie.json');
const searchSelection = readJson('search-selection.json');
const searchOffline = readJson('search-offline.json');
const sheetTv = readJson('sheet-tv.json');
const sheetMovie = readJson('sheet-movie.json');
const sheetConflictingType = readJson('sheet-conflicting-type.json');
const sheetMovieEmpty = readJson('sheet-movie-empty.json');
const sheetMovieMultiple = readJson('sheet-movie-multiple.json');
const sheetSelection = readJson('sheet-selection.json');
const sheetOffline = readJson('sheet-offline.json');
const sheetPage2 = readJson('sheet-page-2.json');
const sheetInvalid = readJson('sheet-invalid.json');
const episodeDual = readJson('episode-dual.json');
const episodeOffline = readJson('episode-offline.json');
const episodeMissingUrl = readJson('episode-missing-url.json');
const episodeAllOffline = readJson('episode-all-offline.json');
const episodeInvalid = readJson('episode-invalid.json');
const episodeNaruto = readJson('episode-naruto.json');
const episodeMovie = readJson('episode-movie.json');
const episodePage2 = readJson('episode-page-2.json');

const NARUTO_ID = '46260';
const MOVIE_ID = '635302';
const TOMB_ID = '999001';
const ATTACK_ID = '1429';
const KAI_MOVIE_ID = '810693';
const CONFLICT_ID = '635303';
const ABSENT_ID = '111111';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const TMDB_BY_ID = {
  [NARUTO_ID]: tmdbTv({ title: 'Naruto', originalTitle: 'Naruto', year: 2002 }),
  [MOVIE_ID]: tmdbMovie({
    title: 'Demon Slayer: Mugen Train - O Filme',
    originalTitle: 'Kimetsu no Yaiba: Mugen Ressha-hen',
    year: 2020,
  }),
  [TOMB_ID]: tmdbTv({ title: 'Tomb Raider King', originalTitle: 'Dogul Wang', year: 2026 }),
  [ATTACK_ID]: tmdbTv({ title: 'Attack on Titan', originalTitle: 'Shingeki no Kyojin', year: 2013 }),
  [KAI_MOVIE_ID]: tmdbMovie({
    title: 'Jujutsu Kaisen 0: O Filme',
    originalTitle: 'Gekijouban Jujutsu Kaisen 0',
    year: 2021,
    alternativeTitles: ['Kai'],
  }),
  [CONFLICT_ID]: tmdbTv({
    title: 'Demon Slayer: Mugen Train - O Filme',
    originalTitle: 'Kimetsu no Yaiba: Mugen Ressha-hen',
    year: 2020,
  }),
  [ABSENT_ID]: tmdbMovie({ title: 'Título Inexistente', originalTitle: 'Missing Title', year: 2020 }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('animefire-test-');
  try {
    codes.gdrive = fs.readFileSync(await buildProvider('animefire', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('animefire', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbMovie({ title, originalTitle, year, alternativeTitles = [] }) {
  return {
    id: 1,
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      titles: alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
    },
  };
}

function tmdbTv({ title, originalTitle, year, alternativeTitles = [] }) {
  return {
    id: 1,
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      results: alternativeTitles.map((alternative) => ({ iso_3166_1: 'BR', title: alternative })),
    },
  };
}

function defaultTmdb(url) {
  const [, , mediaType, id] = url.pathname.split('/');
  const data = TMDB_BY_ID[id];
  if (!data) return { status: 404, body: { status_message: 'Not found' } };
  if (mediaType === 'movie') return data;
  return data;
}

function searchFor(query, page) {
  if (query === 'Naruto') return page === '1' ? searchExact : searchEmpty;
  if (query === 'Demon Slayer: Mugen Train - O Filme' || query === 'Kimetsu no Yaiba: Mugen Ressha-hen') return searchMovie;
  if (query === 'Tomb Raider King' || query === 'Dogul Wang') return searchSelection;
  if (query === 'Attack on Titan' || query === 'Shingeki no Kyojin') return searchOffline;
  if (query === 'Jujutsu Kaisen 0: O Filme' || query === 'Jujutsu Kaisen 0' || query === 'Gekijouban Jujutsu Kaisen 0') return searchEmpty;
  if (query === 'Kai') return page === '1' ? searchPage1 : searchPage2;
  return searchEmpty;
}

function sheetFor(id) {
  if (id === 'eU7t5IvcNKU') return sheetTv;
  if (id === 'Vun_q2SBG5G') return sheetMovie;
  if (id === 'OZLtRqzPHBm') return sheetSelection;
  if (id === 'xtLcr_tF4Tv') return sheetOffline;
  if (id === 'YcbuCUMNN1G') return sheetPage2;
  return { status: 404, body: { message: 'Anime não encontrado' } };
}

function episodeFor(id) {
  if (id === '3yBBx4G2tnw') return episodeDual;
  if (id === '3R-N-u7fqxN') return episodeOffline;
  if (id === '1g-56fcNMDP') return episodePage2;
  if (id === 'aRqrnG1yOCE') return episodeMovie;
  if (['WCrJufyJmQn', '5y0jBDHTS7V', 'uRXCchzMB9k', 'f_SJ-68YN3p'].includes(id)) return episodeNaruto;
  return { status: 404, body: { message: 'Episódio não encontrado' } };
}

function makeRoute(options = {}) {
  return async (url) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'api.animefire.one') throw new Error(`Host inesperado: ${url.hostname}`);
    if (url.pathname === '/animes/pesquisar') {
      if (options.search) return asResponse(options.search(url));
      return asResponse(searchFor(url.searchParams.get('q'), url.searchParams.get('page')));
    }
    if (url.pathname.startsWith('/anime/')) {
      const id = decodeURIComponent(url.pathname.slice('/anime/'.length));
      if (options.anime) return asResponse(options.anime(id, url));
      return asResponse(sheetFor(id));
    }
    if (url.pathname.startsWith('/episode/')) {
      const id = decodeURIComponent(url.pathname.slice('/episode/'.length));
      if (options.episode) return asResponse(options.episode(id, url));
      return asResponse(episodeFor(id));
    }
    throw new Error(`Rota inesperada: ${url.pathname}`);
  };
}

function callsTo(calls, pathname) {
  return calls.filter((call) => new URL(call.url).pathname === pathname);
}

function episodeCalls(calls) {
  return calls.filter((call) => new URL(call.url).pathname.startsWith('/episode/'));
}

function withQualities(qualities) {
  return {
    data: {
      streams: [{
        audio: 'dublado',
        is_mtl: false,
        is_offline: false,
        url: 'https://cdn.example.test/animefire/quality/master.m3u8',
        qualities,
      }],
    },
  };
}

test('1.1 e 1.5 carrega o pacote sem rede e expõe getStreams', () => {
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

test('1.1 JSON fora do esquema na busca é erro de estrutura, não ausência', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => readJson('search-invalid.json') }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeFire\] Falha em tv 46260: Busca fora do esquema/);
  assert.match(runtime.errors[0], /meta\.last_page/);
  assert.equal(callsTo(runtime.calls, '/anime/eU7t5IvcNKU').length, 0);
});

test('1.3 título ausente devolve lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(ABSENT_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(callsTo(runtime.calls, '/animes/pesquisar').length >= 2);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('1.3 resultado exato em página posterior é confirmado', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(KAI_MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '1080p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    'https://cdn.example.test/animefire/21/master.m3u8',
    'https://cdn.example.test/animefire/22/master.m3u8',
  ]);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);

  const kaiCalls = callsTo(runtime.calls, '/animes/pesquisar')
    .map((call) => new URL(call.url))
    .filter((url) => url.searchParams.get('q') === 'Kai');
  assert.deepEqual(kaiCalls.map((url) => url.searchParams.get('page')), ['1', '2']);
  assert.equal(callsTo(runtime.calls, '/anime/YcbuCUMNN1G').length, 1);
  assert.equal(episodeCalls(runtime.calls).length, 1);
  assert.deepEqual(runtime.errors, []);
});

test('1.3 tipo conflitante é descartado e termina em ausência', async () => {
  const runtime = makeRuntime(makeRoute({ anime: () => sheetConflictingType }));
  const streams = await runtime.exports.getStreams(CONFLICT_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(callsTo(runtime.calls, '/anime/Vun_q2SBG5G').length >= 1);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('1.3 ausência da chave do TMDB termina em lista vazia com log', async () => {
  const runtime = makeRuntime(makeRoute(), codes.gdrive, { apiKey: null });
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeFire\] Falha em tv 46260: TMDB_API_KEY indisponível/);
  assert.equal(runtime.calls.length, 0);
});

test('1.4 seleciona episódio pelo par temporada e número', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', 1, 12);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '1080p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.equal(episodeCalls(runtime.calls).length, 1);
  assert.equal(new URL(episodeCalls(runtime.calls)[0].url).pathname, '/episode/3yBBx4G2tnw');
  assert.equal(callsTo(runtime.calls, '/anime/OZLtRqzPHBm').length, 1);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('1.4 temporada ou episódio ausente devolve lista vazia', async () => {
  for (const [season, episode] of [[9, 1], [1, 13]]) {
    const runtime = makeRuntime(makeRoute());
    const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', season, episode);
    assert.deepEqual(Array.from(streams), [], `S${season}E${episode}`);
    assert.deepEqual(runtime.errors, [], `S${season}E${episode}`);
    assert.equal(episodeCalls(runtime.calls).length, 0, `S${season}E${episode}`);
  }
});

test('1.4 filme usa a entrada única da ficha', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['720p', '720p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.equal(callsTo(runtime.calls, '/anime/Vun_q2SBG5G').length, 1);
  assert.equal(new URL(episodeCalls(runtime.calls)[0].url).pathname, '/episode/aRqrnG1yOCE');
  assert.match(streams[0].title, /🎬 Demon Slayer: Mugen Train - O Filme \(2020\)/);
  assert.doesNotMatch(streams[0].title, /T\d+E\d+/);
});

test('1.4 filme sem entrada devolve lista vazia', async () => {
  const runtime = makeRuntime(makeRoute({ anime: () => sheetMovieEmpty }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('2.1 uma opção falha e a outra resolve com aviso', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeMissingUrl }));
  const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', 1, 12);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[0].url, 'https://cdn.example.test/animefire/1/master.m3u8');
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /^\[AnimeFire\] Opção legendado descartada: URL ausente/);
  assert.deepEqual(runtime.errors, []);
});

test('2.1 todas as opções falham e o erro agregado sobe', async () => {
  const bothMissing = JSON.parse(JSON.stringify(episodeDual));
  for (const stream of bothMissing.data.streams) stream.url = null;
  const runtime = makeRuntime(makeRoute({ episode: () => bothMissing }));
  const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', 1, 12);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.warnings.length, 2);
  assert.match(runtime.warnings[0], /Opção dublado descartada: URL ausente/);
  assert.match(runtime.warnings[1], /Opção legendado descartada: URL ausente/);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream: dublado: URL ausente na opção dublado; legendado: URL ausente na opção legendado/);
});

test('2.1 todas as opções offline devolvem lista vazia sem aviso', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeAllOffline }));
  const streams = await runtime.exports.getStreams(ATTACK_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 streams saem no contrato, com headers e detalhes de formatação', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', 1, 12);

  const [dubbed, subtitled] = streams;
  assert.equal(dubbed.url, 'https://cdn.example.test/animefire/1/master.m3u8');
  assert.equal(dubbed.quality, '1080p');
  assert.equal(dubbed.language, 'Dublado');
  assert.equal(subtitled.language, 'Legendado');
  assert.deepEqual(Array.from(dubbed.headers && Object.keys(dubbed.headers)), ['User-Agent', 'Referer', 'Origin']);
  assert.equal(dubbed.headers.Referer, 'https://animefire.one/');
  assert.equal(dubbed.headers.Origin, 'https://animefire.one');
  assert.equal(dubbed.provider, 'AnimeFire');
  assert.equal(dubbed.type, 'hls');
  assert.match(dubbed.name, /^AnimeFire 1080p\n/);
  assert.match(dubbed.title, /🗣️ Dublado/);
  assert.match(dubbed.title, /ℹ️ Reprodução adaptativa/);
  assert.equal(dubbed.format, undefined);
  assert.equal(dubbed.size, undefined);
  assert.equal(dubbed.subtitles, undefined);
  assert.equal(dubbed.infoHash, undefined);
  assert.equal(dubbed.seeders, undefined);
  assert.equal(dubbed.peers, undefined);
  for (const stream of streams) assert.ok(LANGUAGE_VALUES.includes(stream.language));
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('2.2 template Prism mantém os mesmos campos com apresentação própria', async () => {
  const runtime = makeRuntime(makeRoute(), codes.prism);
  const streams = await runtime.exports.getStreams(TOMB_ID, 'tv', 1, 12);

  assert.equal(streams.length, 2);
  assert.match(streams[0].name, /^🚀 FHD 1080p\n/);
  assert.match(streams[0].title, /🎬 Tomb Raider King \(2026\) T01E12/);
  assert.match(streams[0].title, /🗣️ Dublado/);
  assert.equal(streams[0].language, 'Dublado');
  assert.equal(streams[1].language, 'Legendado');
});

test('2.3 maior qualidade declarada e ausência de resolução', async () => {
  const withTomb = makeRuntime(makeRoute());
  const tombStreams = await withTomb.exports.getStreams(TOMB_ID, 'tv', 1, 12);
  assert.deepEqual(Array.from(tombStreams, (stream) => stream.quality), ['1080p', '1080p']);

  const x264 = makeRuntime(makeRoute({ episode: () => withQualities(['720p-x264']) }));
  const x264Streams = await x264.exports.getStreams(TOMB_ID, 'tv', 1, 12);
  assert.equal(x264Streams.length, 1);
  assert.equal(x264Streams[0].quality, '720p');

  const empty = makeRuntime(makeRoute({ episode: () => withQualities([]) }));
  const emptyStreams = await empty.exports.getStreams(TOMB_ID, 'tv', 1, 12);
  assert.equal(emptyStreams.length, 1);
  assert.equal(emptyStreams[0].quality, 'Desconhecida');
});

test('2.4 busca fora de 2xx vira erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 500, body: 'erro' }) }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[AnimeFire\] Falha em tv 46260: HTTP 500 em https:\/\/api\.animefire\.one/);
});

test('2.4 JSON inválido na busca vira erro registrado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => 'não é json' }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Resposta não é JSON válido/);
});

test('2.4 ficha fora do esquema é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ anime: () => sheetInvalid }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Ficha fora do esquema/);
  assert.match(runtime.errors[0], /episodes/);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('2.4 streams ausente é erro de estrutura do episódio', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => ({ data: {} }) }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Episódio fora do esquema/);
  assert.match(runtime.errors[0], /streams/);
});

test('2.4 lista de streams fora de array é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ episode: () => episodeInvalid }));
  const streams = await runtime.exports.getStreams(NARUTO_ID, 'tv', 1, 1);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Episódio fora do esquema/);
  assert.match(runtime.errors[0], /streams/);
});

test('2.4 filme com mais de uma entrada é erro de estrutura', async () => {
  const runtime = makeRuntime(makeRoute({ anime: () => sheetMovieMultiple }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);

  assert.deepEqual(Array.from(streams), []);
  assert.match(runtime.errors[0], /Ficha de filme com 2 entradas de episódio/);
  assert.equal(episodeCalls(runtime.calls).length, 0);
});

test('3.1 manifest declara o AnimeFire com os campos do contrato', () => {
  const entry = manifest.scrapers.find((scraper) => scraper.id === 'animefire');
  assert.ok(entry);
  assert.equal(entry.name, 'AnimeFire');
  assert.equal(entry.version, '1.0.0');
  assert.equal(entry.author, 'nathanael540');
  assert.deepEqual(entry.supportedTypes, ['movie', 'tv']);
  assert.deepEqual(entry.formats, ['m3u8']);
  assert.deepEqual(entry.contentLanguage, ['pt']);
  assert.equal(entry.filename, 'providers/animefire.js');
  assert.equal(new URL(entry.logo).protocol, 'https:');
  assert.match(entry.description, /anime/i);
  assert.match(entry.description, /dublados?|legendados?/i);
});

test('1.2 fixtures reais sanitizadas sem URL assinada, token ou cookie', () => {
  const expected = [
    'search-exact.json',
    'search-empty.json',
    'search-page-1.json',
    'search-page-2.json',
    'sheet-tv.json',
    'sheet-movie.json',
    'sheet-conflicting-type.json',
    'episode-dual.json',
    'episode-offline.json',
    'episode-missing-url.json',
    'episode-all-offline.json',
    'episode-invalid.json',
    'sheet-movie-empty.json',
    'sheet-movie-multiple.json',
    'sheet-invalid.json',
  ];
  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(FIXTURES, name)), name);
  }

  for (const name of fs.readdirSync(FIXTURES)) {
    const content = read(name);
    assert.doesNotMatch(content, /Policy=|Signature=|Key-Pair-Id=|token=|cookie/i, name);
    assert.doesNotMatch(content, /\b[a-f0-9]{32,}\b/i, name);
    for (const match of content.matchAll(/https:\/\/([^/"\s]+)/g)) {
      assert.match(match[1], /(^|\.)example\.test$/, `${name}: ${match[1]}`);
    }
  }
});
