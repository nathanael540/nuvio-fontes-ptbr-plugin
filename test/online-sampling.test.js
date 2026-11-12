const test = require('node:test');
const assert = require('node:assert/strict');

let sampleModule;

test.before(async () => {
  sampleModule = await import('./online/lib/sample.mjs');
});

function titles(count, tag = null) {
  return Array.from({ length: count }, (_, index) => ({
    tmdbId: String(100 + index),
    title: `Título ${index + 1}`,
    year: 2000 + index,
    tags: tag && index < 5 ? [tag] : [],
    ...(tag === 'tv' ? { season: 1, episode: 1 } : {}),
  }));
}

function selection(seed, extra = {}) {
  return sampleModule.selectSample({
    providerId: 'provedor-teste',
    mediaType: 'movie',
    titles: titles(20),
    exclusiveTag: null,
    seed,
    ...extra,
  });
}

test('mesma semente, catálogo e perfil selecionam os mesmos títulos e coordenadas', () => {
  const first = selection('semente-fixa');
  const second = selection('semente-fixa');
  assert.deepEqual(first.titles, second.titles);
  assert.equal(first.algorithm, 'sha256-fisher-yates-v1');
  assert.equal(first.titles.length, 5);
});

test('sementes diferentes produzem seleções diferentes', () => {
  assert.notDeepEqual(selection('semente-a').titles, selection('semente-b').titles);
});

test('seleção não repõe candidatos e devolve cinco IDs distintos', () => {
  const result = selection('sem-reposicao');
  assert.equal(new Set(result.titles.map((title) => title.tmdbId)).size, 5);
  assert.equal(result.candidates, 20);
});

test('catálogo com menos de cinco elegíveis falha sem reduzir a amostra', () => {
  const catalog = titles(20, 'anime');
  const onlyFour = catalog.slice(0, 4);
  assert.throws(
    () => sampleModule.selectSample({
      providerId: 'provedor-teste',
      mediaType: 'movie',
      titles: onlyFour,
      exclusiveTag: 'anime',
      seed: 'x',
    }),
    /amostra insuficiente para "provedor-teste" em movie: 4 elegíveis com a tag "anime"; mínimo 5/,
  );
});

test('filtro exclusivo permanece no nicho e não é ampliado para completar a amostra', () => {
  const catalog = titles(20, 'anime');
  const result = sampleModule.selectSample({
    providerId: 'provedor-teste',
    mediaType: 'movie',
    titles: catalog,
    exclusiveTag: 'anime',
    seed: 'nicho',
  });
  assert.equal(result.candidates, 5);
  assert.ok(result.titles.every((title) => title.tags.includes('anime')));
});

test('provedor somente tv monta apenas a amostra de tv', () => {
  const provider = { id: 'so-tv', supportedTypes: ['tv'] };
  const catalogs = {
    movie: { titles: titles(20) },
    tv: { titles: titles(20).map((title) => ({ ...title, season: 2, episode: 3 })) },
  };
  const result = sampleModule.buildSelection({ provider, catalogs, exclusiveTag: null, seed: 'tv' });
  assert.deepEqual(Object.keys(result.types), ['tv']);
  assert.equal(result.types.tv.titles.length, 5);
  assert.ok(result.types.tv.titles.every((title) => title.season === 2 && title.episode === 3));
});

test('semente vazia é rejeitada explicitamente', () => {
  assert.throws(() => selection('  '), /semente vazia/);
});
