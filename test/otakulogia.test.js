const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildProvider } = require('../build.js');
const { createTempDir } = require('./support/temp-dir');

const FIXTURES = path.join(__dirname, 'fixtures', 'otakulogia');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));

const TV_ID = '85937';
const MOVIE_ID = '149';
const LANGUAGE_VALUES = ['Dublado', 'Dublado (Não PT-BR?)', 'Legendado', 'Legendado (Não PT-BR?)', 'Gringo', 'Idioma Desconhecido'];

const FIXTURE = {
  searchMatch: readJson('search-match.json'),
  searchNameEn: readJson('search-name-en.json'),
  searchTwo: readJson('search-two.json'),
  searchFive: readJson('search-five.json'),
  searchAkira: readJson('search-akira.json'),
  searchEmpty: readJson('search-empty.json'),
  searchNull: readJson('search-null.json'),
  searchMalformed: readJson('search-malformed.json'),
  searchErrors: readJson('search-errors.json'),
  searchNoData: readJson('search-no-data.json'),
  notJson: read('not-json.txt'),
  detailSeries: readJson('detail-series.json'),
  detailSeriesOrder: readJson('detail-series-order.json'),
  detailSeriesEp01: readJson('detail-series-ep01.json'),
  detailSeriesGap: readJson('detail-series-gap.json'),
  detailSeriesUnnumbered: readJson('detail-series-unnumbered.json'),
  detailSeriesZeroPipe: readJson('detail-series-zero-pipe.json'),
  detailSeasonMissing: readJson('detail-season-missing.json'),
  detailSeasonNonstandard: readJson('detail-season-nonstandard.json'),
  detailMovieFilme: readJson('detail-movie-filme.json'),
  detailMovieOneFilme: readJson('detail-movie-one-filme.json'),
  detailMovieSingle: readJson('detail-movie-single.json'),
  detailMovieTwoSingle: readJson('detail-movie-two-single.json'),
  detailQuality: readJson('detail-quality.json'),
  detailNoUrl: readJson('detail-no-url.json'),
  detailNull: readJson('detail-null.json'),
  detailMalformed: readJson('detail-malformed.json'),
};

const TMDB_BY_ID = {
  [TV_ID]: tmdbTv({
    title: 'Demon Slayer',
    originalTitle: 'Kimetsu no Yaiba',
    year: 2019,
    alternatives: ['Caçadores de Demônios'],
    romaji: ['Kimetsu no Yaiba'],
  }),
  [MOVIE_ID]: tmdbMovie({ title: 'Akira', originalTitle: 'Akira', year: 1988 }),
};

let codes = {};

test.before(async () => {
  const outDir = createTempDir('otakulogia-test-');
  try {
    codes.base = fs.readFileSync(await buildProvider('otakulogia', { outDir }), 'utf8');
    codes.gdrive = fs.readFileSync(await buildProvider('otakulogia', { outDir, formatter: 'gdrive' }), 'utf8');
    codes.prism = fs.readFileSync(await buildProvider('otakulogia', { outDir, formatter: 'prism' }), 'utf8');
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

function tmdbMovie({ title, originalTitle, year, alternatives = [], romaji = [] }) {
  return {
    title,
    original_title: originalTitle,
    release_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      titles: [
        ...alternatives.map((alternative) => ({ iso_3166_1: 'BR', title: alternative, type: '' })),
        ...romaji.map((titleRomaji) => ({ iso_3166_1: 'US', title: titleRomaji, type: 'Romaji' })),
      ],
    },
  };
}

function tmdbTv({ title, originalTitle, year, alternatives = [], romaji = [] }) {
  return {
    name: title,
    original_name: originalTitle,
    first_air_date: `${year}-01-01`,
    genres: [{ id: 16 }],
    original_language: 'ja',
    origin_country: ['JP'],
    external_ids: { imdb_id: 'tt0000001' },
    alternative_titles: {
      results: [
        ...alternatives.map((alternative) => ({ iso_3166_1: 'BR', title: alternative, type: '' })),
        ...romaji.map((titleRomaji) => ({ iso_3166_1: 'US', title: titleRomaji, type: 'Romaji' })),
      ],
    },
  };
}

function defaultTmdb(url) {
  const parts = url.pathname.split('/');
  const data = TMDB_BY_ID[parts[3]];
  if (data === undefined) return { status: 404, body: { status_message: 'Not found' } };
  return data;
}

function makeRoute(options = {}) {
  return async (url, init) => {
    if (url.hostname === 'api.themoviedb.org') {
      return asResponse(options.tmdb === undefined ? defaultTmdb(url) : options.tmdb(url));
    }
    if (url.hostname !== 'api.otakulogia.com' || url.pathname !== '/graphql') {
      throw new Error(`Host inesperado: ${url.hostname}${url.pathname}`);
    }
    const payload = JSON.parse(String(init.body));
    if (payload.query.startsWith('query SearchAnimes')) {
      const term = payload.variables.input.query;
      if (options.search) return asResponse(options.search(term, payload));
      return asResponse(term === 'Demon Slayer' ? FIXTURE.searchMatch : FIXTURE.searchEmpty);
    }
    if (payload.query.startsWith('query AnimeCatalogDetail')) {
      const upstreamCid = payload.variables.upstreamCid;
      if (options.detail) return asResponse(options.detail(upstreamCid, payload));
      return asResponse(FIXTURE.detailSeries);
    }
    throw new Error(`query inesperada: ${payload.query.slice(0, 40)}`);
  };
}

function searchCalls(runtime) {
  return runtime.calls
    .filter((call) => new URL(call.url).hostname === 'api.otakulogia.com')
    .map((call) => JSON.parse(String(call.init.body)))
    .filter((payload) => payload.query.startsWith('query SearchAnimes'));
}

function detailCids(runtime) {
  return runtime.calls
    .filter((call) => new URL(call.url).hostname === 'api.otakulogia.com')
    .map((call) => JSON.parse(String(call.init.body)))
    .filter((payload) => payload.query.startsWith('query AnimeCatalogDetail'))
    .map((payload) => payload.variables.upstreamCid);
}

function assertUserAgentOnly(stream) {
  assert.deepEqual(Object.keys(stream.headers), ['User-Agent']);
  assert.match(stream.headers['User-Agent'], /^Mozilla\/5\.0/);
}

function assertStream(stream, expected) {
  assert.equal(stream.url, expected.url);
  if (expected.quality !== undefined) assert.equal(stream.quality, expected.quality);
  if (expected.language !== undefined) assert.equal(stream.language, expected.language);
  assert.equal(stream.type, 'mp4');
  assert.ok(LANGUAGE_VALUES.includes(stream.language), `idioma fora do enum: ${stream.language}`);
  assertUserAgentOnly(stream);
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
    ['abc', 'movie', null, null],
    [TV_ID, 'anime', null, null],
    [TV_ID, 'tv', null, 1],
    [TV_ID, 'tv', 1, 0],
    [TV_ID, 'tv', 1, 1.5],
    [TV_ID, 'tv', 0, 1],
  ];
  for (const args of invalid) assert.deepEqual(Array.from(await runtime.exports.getStreams(...args)), []);
  assert.equal(runtime.calls.length, 0);
  assert.equal(runtime.errors.length, invalid.length);
  assert.ok(runtime.errors.every((message) => message.startsWith('[Otakulogia]')));
});

test('resolve episódio da segunda temporada pelo nome e usa LEG da temporada', async () => {
  const runtime = makeRuntime(makeRoute());
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 2, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assertStream(streams[0], {
    url: 'https://cdn.example/demon-slayer/s2/1.mp4',
    quality: 'Desconhecida',
    language: 'Legendado',
  });
  assert.match(streams[0].name, /Desconhecida/);
  assert.match(streams[0].title, /Demon Slayer/);
  assert.match(streams[0].title, /T02E01/);
  assert.match(streams[0].title, /Otakulogia/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('temporada com zero à esquerda e pipe usa o número pedido', async () => {
  const route = { detail: () => FIXTURE.detailSeriesZeroPipe };
  const first = makeRuntime(makeRoute(route));
  const firstStreams = await first.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(firstStreams.length, 1);
  assert.equal(firstStreams[0].url, 'https://cdn.example/zero-pipe/s1/1.mp4');
  assert.equal(firstStreams[0].language, 'Dublado');

  const second = makeRuntime(makeRoute(route));
  const secondStreams = await second.exports.getStreams(TV_ID, 'tv', 2, 1);
  assert.equal(secondStreams.length, 1);
  assert.equal(secondStreams[0].url, 'https://cdn.example/zero-pipe/s2/1.mp4');
  assert.equal(secondStreams[0].language, 'Legendado');
});

test('temporada ausente e nome fora do padrão devolvem lista vazia', async () => {
  const missing = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeasonMissing }));
  assert.deepEqual(Array.from(await missing.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(missing.errors, []);

  const nonstandard = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeasonNonstandard }));
  assert.deepEqual(Array.from(await nonstandard.exports.getStreams(TV_ID, 'tv', 2, 1)), []);
  assert.deepEqual(nonstandard.errors, []);

  const absent = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await absent.exports.getStreams(TV_ID, 'tv', 3, 1)), []);
  assert.deepEqual(absent.errors, []);
});

test('episódios fora de ordem são ordenados pela URL', async () => {
  const runtime = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeriesOrder }));
  const second = await runtime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(second.length, 1);
  assert.equal(second[0].url, 'https://cdn.example/order/2.mp4');
  assert.equal(second[0].language, 'Dublado');

  const third = await runtime.exports.getStreams(TV_ID, 'tv', 1, 3);
  assert.equal(third.length, 1);
  assert.equal(third[0].url, 'https://cdn.example/order/3.mp4');

  const fourth = await runtime.exports.getStreams(TV_ID, 'tv', 1, 4);
  assert.deepEqual(Array.from(fourth), []);
});

test('ep01.mp4 e episodeNumber repetido usam a numeração da URL', async () => {
  const runtime = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeriesEp01 }));
  const fifth = await runtime.exports.getStreams(TV_ID, 'tv', 1, 5);
  assert.equal(fifth.length, 1);
  assert.equal(fifth[0].url, 'https://cdn.example/ep/ep05.mp4');
  assert.equal(fifth[0].language, 'Dublado');

  const sixth = await runtime.exports.getStreams(TV_ID, 'tv', 1, 6);
  assert.deepEqual(Array.from(sixth), []);
});

test('URL com buraco e URL sem número devolvem ausência', async () => {
  const gap = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeriesGap }));
  assert.deepEqual(Array.from(await gap.exports.getStreams(TV_ID, 'tv', 1, 3)), []);
  assert.deepEqual(gap.errors, []);

  const unnumbered = makeRuntime(makeRoute({ detail: () => FIXTURE.detailSeriesUnnumbered }));
  assert.deepEqual(Array.from(await unnumbered.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(unnumbered.errors, []);
});

test('filme com uma linha Filme ignora as coordenadas do pedido', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchAkira,
    detail: () => FIXTURE.detailMovieOneFilme,
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', 99, 99);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assertStream(streams[0], {
    url: 'https://cdn.example/movie/akira-one.mp4',
    quality: 'Desconhecida',
    language: 'Dublado',
  });
  assert.match(streams[0].title, /Akira/);
  assert.match(streams[0].title, /1988/);
  assert.doesNotMatch(streams[0].title, /T\d{2}E\d{2}/);
  assert.deepEqual(runtime.errors, []);
});

test('filme com várias linhas Filme deduplica e ordena por qualidade', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchAkira,
    detail: () => FIXTURE.detailMovieFilme,
  }));
  const streams = await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 2, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.deepEqual(Array.from(streams, (stream) => stream.url), [
    'https://cdn.example/movie/akira-fhd.mp4',
    'https://cdn.example/movie/akira-sd.mp4',
  ]);
  assert.deepEqual(Array.from(streams, (stream) => stream.quality), ['1080p', '480p']);
  assert.deepEqual(Array.from(streams, (stream) => stream.language), ['Dublado', 'Legendado']);
  assert.ok(streams.every((stream) => stream.url !== 'https://cdn.example/movie/akira-sd-unused.mp4'));
  assert.equal(streams.filter((stream) => stream.url === 'https://cdn.example/movie/akira-fhd.mp4').length, 1);
  for (const stream of streams) assertUserAgentOnly(stream);
});

test('filme em temporada de episódio único e ambiguidade', async () => {
  const single = makeRuntime(makeRoute({
    search: () => FIXTURE.searchAkira,
    detail: () => FIXTURE.detailMovieSingle,
  }));
  const streams = await single.exports.getStreams(MOVIE_ID, 'movie', null, null);
  assert.equal(streams.length, 1);
  assertStream(streams[0], {
    url: 'https://cdn.example/akira/akira-dublado.mp4',
    quality: 'Desconhecida',
    language: 'Legendado',
  });
  assert.deepEqual(single.errors, []);

  const ambiguous = makeRuntime(makeRoute({
    search: () => FIXTURE.searchAkira,
    detail: () => FIXTURE.detailMovieTwoSingle,
  }));
  assert.deepEqual(Array.from(await ambiguous.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.deepEqual(ambiguous.errors, []);
});

test('qualidade e idioma seguem os campos declarados', async () => {
  const runtime = makeRuntime(makeRoute({ detail: () => FIXTURE.detailQuality }));

  const fhd = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(fhd.length, 1);
  assertStream(fhd[0], {
    url: 'https://cdn.example/quality/main-1.mp4',
    quality: 'Desconhecida',
    language: 'Dublado',
  });

  const equal = await runtime.exports.getStreams(TV_ID, 'tv', 1, 2);
  assert.equal(equal[0].quality, '1080p');
  assert.equal(equal[0].language, 'Legendado');

  const sd = await runtime.exports.getStreams(TV_ID, 'tv', 1, 3);
  assert.equal(sd[0].quality, '480p');
  assert.equal(sd[0].language, 'Idioma Desconhecido');

  const main = await runtime.exports.getStreams(TV_ID, 'tv', 1, 4);
  assert.equal(main[0].quality, 'Desconhecida');
  assert.equal(main[0].language, 'Idioma Desconhecido');
  assert.deepEqual(runtime.errors, []);
});

test('opção sem URL válida é falha com aviso, não ausência', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchAkira,
    detail: () => FIXTURE.detailNoUrl,
  }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Otakulogia\]/);
  assert.match(runtime.errors[0], /Nenhuma opção produziu stream/);
  assert.match(runtime.errors[0], /sem URL HTTP\(S\) válida/);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção 401/);
});

test('um detalhe falhando entre dois preserva o stream do válido', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchTwo,
    detail: (upstreamCid) => (upstreamCid === 201 ? FIXTURE.detailSeries : { status: 500, body: 'erro' }),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(streams[0].url, 'https://cdn.example/demon-slayer/s1/1.mp4');
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Opção 202 descartada: HTTP 500/);
});

test('todos os detalhes falhando sobem como erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchTwo,
    detail: () => ({ status: 503, body: 'indisponível' }),
  }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Otakulogia\]/);
  assert.match(runtime.errors[0], /Opção 201/);
  assert.match(runtime.errors[0], /Opção 202/);
  assert.equal(runtime.warnings.length, 2);
});

test('todos os detalhes nulos devolvem lista vazia sem erro', async () => {
  const runtime = makeRuntime(makeRoute({
    search: () => FIXTURE.searchTwo,
    detail: () => FIXTURE.detailNull,
  }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('no máximo três candidatos confirmados vão para o detalhe', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => FIXTURE.searchFive }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.deepEqual(detailCids(runtime), [201, 202, 203]);
  assert.equal(streams.length, 1, 'as três respostas apontam para a mesma URL');
  assert.deepEqual(runtime.errors, []);
});

test('busca em paralelo para no primeiro termo, deduplica termos e envia os cabeçalhos do site', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (term) => (term === 'Demon Slayer' ? FIXTURE.searchMatch : term === 'Kimetsu no Yaiba' ? FIXTURE.searchTwo : FIXTURE.searchMatch),
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.deepEqual(searchCalls(runtime).map((payload) => payload.variables.input.query), [
    'Demon Slayer',
    'Kimetsu no Yaiba',
    'Caçadores de Demônios',
  ]);
  assert.deepEqual(detailCids(runtime), [201], 'o termo posterior não pode abrir o detalhe');
  for (const call of runtime.calls.filter((item) => new URL(item.url).hostname === 'api.otakulogia.com')) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers.Origin, 'https://otakulogia.com');
    assert.equal(call.init.headers.Referer, 'https://otakulogia.com/');
    assert.equal(call.init.headers['Content-Type'], 'application/json');
  }
  const [firstSearch] = searchCalls(runtime);
  assert.equal(firstSearch.variables.input.limit, 12);
  assert.match(firstSearch.query, /query SearchAnimes/);
  assert.deepEqual(runtime.errors, []);
  assert.deepEqual(runtime.warnings, []);
});

test('falha de um termo com correspondência em outro continua, com aviso', async () => {
  const runtime = makeRuntime(makeRoute({
    search: (term) => {
      if (term === 'Demon Slayer') return { status: 500, body: 'erro' };
      if (term === 'Kimetsu no Yaiba') return FIXTURE.searchNameEn;
      return FIXTURE.searchEmpty;
    },
  }));
  const streams = await runtime.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1, JSON.stringify({ errors: runtime.errors, warnings: runtime.warnings }));
  assert.equal(streams[0].url, 'https://cdn.example/demon-slayer/s1/1.mp4');
  assert.deepEqual(detailCids(runtime), [301]);
  assert.deepEqual(runtime.errors, []);
  assert.equal(runtime.warnings.length, 1);
  assert.match(runtime.warnings[0], /Busca "Demon Slayer" descartada: HTTP 500/);
});

test('todas as buscas falhando sobem como erro agregado', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => ({ status: 429, body: 'limite' }) }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.equal(runtime.errors.length, 1);
  assert.match(runtime.errors[0], /^\[Otakulogia\]/);
  assert.match(runtime.errors[0], /Nenhuma busca confirmou o título/);
  assert.match(runtime.errors[0], /HTTP 429/);
});

test('errors GraphQL e data ausente são erros de estrutura', async () => {
  const graphqlErrors = makeRuntime(makeRoute({ search: () => FIXTURE.searchErrors }));
  assert.deepEqual(Array.from(await graphqlErrors.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(graphqlErrors.errors[0], /GraphQL retornou erros: Cannot query field/);

  const noData = makeRuntime(makeRoute({ search: () => FIXTURE.searchNoData }));
  assert.deepEqual(Array.from(await noData.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(noData.errors[0], /resposta GraphQL sem data/);
});

test('corpo não JSON é erro de leitura', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => FIXTURE.notJson }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(runtime.errors[0], /^\[Otakulogia\]/);
  assert.match(runtime.errors[0], /não é JSON válido/);
});

test('busca vazia, busca nula e ausência de correspondência devolvem lista vazia', async () => {
  const empty = makeRuntime(makeRoute({ search: () => FIXTURE.searchEmpty }));
  assert.deepEqual(Array.from(await empty.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(empty.errors, []);

  const nil = makeRuntime(makeRoute({ search: () => FIXTURE.searchNull }));
  assert.deepEqual(Array.from(await nil.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(nil.errors, []);

  const noMatch = makeRuntime(makeRoute());
  assert.deepEqual(Array.from(await noMatch.exports.getStreams(MOVIE_ID, 'movie', null, null)), []);
  assert.deepEqual(noMatch.errors, []);
});

test('busca fora do esquema é erro estrutural', async () => {
  const runtime = makeRuntime(makeRoute({ search: () => FIXTURE.searchMalformed }));
  assert.deepEqual(Array.from(await runtime.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(runtime.errors[0], /searchAnimes\.items fora do esquema/);
  assert.deepEqual(runtime.warnings, []);
});

test('detalhe fora do esquema é falha isolada do candidato', async () => {
  const seasons = makeRuntime(makeRoute({ detail: () => FIXTURE.detailMalformed }));
  assert.deepEqual(Array.from(await seasons.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(seasons.errors[0], /animeCatalogDetail\.seasons fora do esquema/);
  assert.equal(seasons.warnings.length, 1);
  assert.match(seasons.warnings[0], /Opção 201/);

  const episodes = makeRuntime(makeRoute({ detail: () => ({ data: { animeCatalogDetail: { seasons: [], episodes: {} } } }) }));
  assert.deepEqual(Array.from(await episodes.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.match(episodes.errors[0], /animeCatalogDetail\.episodes fora do esquema/);
});

test('tolerância de um ano confirma e ano fora da tolerância descarta', async () => {
  const itemWithYear = (year) => ({
    data: {
      searchAnimes: {
        total: 1,
        items: [{ id: 'anime-501', upstreamCid: 501, name: 'Demon Slayer', slug: 'demon-slayer', nameEn: 'Demon Slayer', year, audioMix: 'DUB' }],
      },
    },
  });

  const within = makeRuntime(makeRoute({ search: () => itemWithYear(2020) }));
  const streams = await within.exports.getStreams(TV_ID, 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.deepEqual(detailCids(within), [501]);

  const outside = makeRuntime(makeRoute({ search: () => itemWithYear(2025) }));
  assert.deepEqual(Array.from(await outside.exports.getStreams(TV_ID, 'tv', 1, 1)), []);
  assert.deepEqual(outside.errors, []);
  assert.deepEqual(detailCids(outside), []);
});
