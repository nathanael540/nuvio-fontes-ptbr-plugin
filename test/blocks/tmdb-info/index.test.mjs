import test from 'node:test';
import assert from 'node:assert/strict';

import { getMediaInfo } from '../../../src/_blocks/tmdb-info/index.mjs';

const API_KEY = 'chave-de-teste';

const MOVIE = {
  id: 693134,
  title: 'Duna: Parte Dois',
  original_title: 'Dune: Part Two',
  release_date: '2024-02-27',
  original_language: 'en',
  origin_country: ['US'],
  genres: [{ id: 878, name: 'Ficção científica' }],
  external_ids: { imdb_id: 'tt15239678' },
  alternative_titles: {
    titles: [
      { iso_3166_1: 'BR', title: 'Duna 2' },
      { iso_3166_1: 'BR', title: 'Duna 2' },
      { iso_3166_1: 'BR', title: 'Duna: Parte Dois' },
      { iso_3166_1: 'PT', title: 'Dune: Parte Dois' },
    ],
  },
};

const SERIES = {
  id: 1396,
  name: 'Breaking Bad: A Química do Mal',
  original_name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  original_language: 'en',
  origin_country: ['US'],
  genres: [{ id: 18, name: 'Drama' }],
  external_ids: { imdb_id: 'tt0903747' },
  alternative_titles: { results: [] },
  seasons: [
    { season_number: 0, episode_count: 2, name: 'Especiais', air_date: '2009-02-17' },
    { season_number: 1, episode_count: 7, name: 'Temporada 1', air_date: '2008-01-20' },
    { season_number: 2, episode_count: 13, name: 'Temporada 2', air_date: '2009-03-08' },
  ],
};

/**
 * Substitui fetch e TMDB_API_KEY durante um teste e restaura ao final.
 * @returns {{ urls: string[] }} URLs requisitadas.
 */
function mockTmdb(t, options) {
  const { body, status = 200 } = options;
  // `apiKey: undefined` simula o app sem chave; por isso não usamos valor padrão na desestruturação.
  const apiKey = 'apiKey' in options ? options.apiKey : API_KEY;
  const original = { fetch: globalThis.fetch, key: globalThis.TMDB_API_KEY };
  const calls = { urls: [] };
  globalThis.TMDB_API_KEY = apiKey;
  globalThis.fetch = async (url) => {
    calls.urls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  t.after(() => {
    globalThis.fetch = original.fetch;
    globalThis.TMDB_API_KEY = original.key;
  });
  return calls;
}

test('filme: retorna dados em pt-BR com uma única requisição', async (t) => {
  const calls = mockTmdb(t, { body: MOVIE });

  const info = await getMediaInfo({ tmdbId: '693134', mediaType: 'movie' });

  assert.deepEqual(info, {
    tmdbId: '693134',
    mediaType: 'movie',
    kind: 'movie',
    title: 'Duna: Parte Dois',
    originalTitle: 'Dune: Part Two',
    year: 2024,
    imdbId: 'tt15239678',
    alternativeTitles: ['Duna 2'],
    originalLanguage: 'en',
    originCountries: ['US'],
    genreIds: [878],
    seasons: [],
  });
  assert.equal(calls.urls.length, 1);
  assert.equal(
    calls.urls[0],
    'https://api.themoviedb.org/3/movie/693134?api_key=chave-de-teste&language=pt-BR&append_to_response=external_ids,alternative_titles',
  );
});

test('série: usa os campos de TV e aceita ID numérico', async (t) => {
  const calls = mockTmdb(t, { body: SERIES });

  const info = await getMediaInfo({ tmdbId: 1396, mediaType: 'tv' });

  assert.equal(info.kind, 'series');
  assert.equal(info.title, 'Breaking Bad: A Química do Mal');
  assert.equal(info.originalTitle, 'Breaking Bad');
  assert.equal(info.year, 2008);
  assert.deepEqual(info.alternativeTitles, []);
  assert.deepEqual(info.seasons, [
    { number: 0, episodeCount: 2, name: 'Especiais', airDate: '2009-02-17' },
    { number: 1, episodeCount: 7, name: 'Temporada 1', airDate: '2008-01-20' },
    { number: 2, episodeCount: 13, name: 'Temporada 2', airDate: '2009-03-08' },
  ]);
  assert.match(calls.urls[0], /\/3\/tv\/1396\?/);
});

test('série sem seasons no corpo devolve lista vazia', async (t) => {
  mockTmdb(t, { body: { ...SERIES, seasons: undefined } });

  const info = await getMediaInfo({ tmdbId: 1396, mediaType: 'tv' });

  assert.deepEqual(info.seasons, []);
});

test('temporada sem air_date devolve null no campo', async (t) => {
  mockTmdb(t, {
    body: {
      ...SERIES,
      seasons: [{ season_number: 1, episode_count: 7, name: 'Temporada 1', air_date: '' }],
    },
  });

  const info = await getMediaInfo({ tmdbId: 1396, mediaType: 'tv' });

  assert.deepEqual(info.seasons, [{ number: 1, episodeCount: 7, name: 'Temporada 1', airDate: null }]);
});

const KIND_CASES = [
  { label: 'série japonesa de animação é anime', mediaType: 'tv', body: { ...SERIES, original_language: 'ja', genres: [{ id: 16 }] }, kind: 'anime' },
  { label: 'filme japonês de animação é anime', mediaType: 'movie', body: { ...MOVIE, original_language: 'ja', genres: [{ id: 16 }] }, kind: 'anime' },
  { label: 'série coreana que não é animação é dorama', mediaType: 'tv', body: { ...SERIES, original_language: 'ko' }, kind: 'dorama' },
  { label: 'filme coreano continua sendo filme', mediaType: 'movie', body: { ...MOVIE, original_language: 'ko' }, kind: 'movie' },
  { label: 'série americana de animação é série', mediaType: 'tv', body: { ...SERIES, genres: [{ id: 16 }] }, kind: 'series' },
];

for (const { label, mediaType, body, kind } of KIND_CASES) {
  test(`classificação: ${label}`, async (t) => {
    mockTmdb(t, { body });
    assert.equal((await getMediaInfo({ tmdbId: '1', mediaType })).kind, kind);
  });
}

test('sem data de lançamento ou IMDb, retorna null nesses campos', async (t) => {
  mockTmdb(t, { body: { ...MOVIE, release_date: '', external_ids: { imdb_id: null } } });

  const info = await getMediaInfo({ tmdbId: '693134', mediaType: 'movie' });

  assert.equal(info.year, null);
  assert.equal(info.imdbId, null);
});

test('lança erro quando o app não fornece TMDB_API_KEY, sem requisitar', async (t) => {
  const calls = mockTmdb(t, { body: MOVIE, apiKey: undefined });

  await assert.rejects(getMediaInfo({ tmdbId: '693134', mediaType: 'movie' }), /TMDB_API_KEY indisponível/);
  assert.equal(calls.urls.length, 0);
});

test('lança erro para tmdbId não numérico e mediaType inválido', async (t) => {
  const calls = mockTmdb(t, { body: MOVIE });

  await assert.rejects(getMediaInfo({ tmdbId: 'tt15239678', mediaType: 'movie' }), /tmdbId inválido: "tt15239678"/);
  await assert.rejects(getMediaInfo({ tmdbId: undefined, mediaType: 'movie' }), /tmdbId inválido/);
  await assert.rejects(getMediaInfo({ tmdbId: '693134', mediaType: 'anime' }), /mediaType inválido: "anime"/);
  assert.equal(calls.urls.length, 0);
});

test('lança erro com o status HTTP, sem expor a chave', async (t) => {
  mockTmdb(t, { body: { status_message: 'not found' }, status: 404 });

  await assert.rejects(getMediaInfo({ tmdbId: '1', mediaType: 'movie' }), (error) => {
    assert.match(error.message, /TMDB respondeu HTTP 404 para movie 1/);
    assert.doesNotMatch(error.message, new RegExp(API_KEY));
    return true;
  });
});

const MISSING_FIELD_CASES = [
  { field: 'title', error: /não retornou título/ },
  { field: 'external_ids', error: /não retornou external_ids/ },
  { field: 'alternative_titles', error: /não retornou alternative_titles/ },
];

for (const { field, error } of MISSING_FIELD_CASES) {
  test(`lança erro quando a resposta não tem ${field}`, async (t) => {
    mockTmdb(t, { body: { ...MOVIE, [field]: undefined } });
    await assert.rejects(getMediaInfo({ tmdbId: '693134', mediaType: 'movie' }), error);
  });
}
