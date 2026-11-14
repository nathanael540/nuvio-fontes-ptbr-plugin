const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

let catalogModule;

test.before(async () => {
  catalogModule = await import('./online/lib/catalog.mjs');
});

function movieTitles(count, tagEvery = 0, tag = 'anime') {
  return Array.from({ length: count }, (_, index) => ({
    tmdbId: String(1000 + index),
    title: `Filme ${index + 1}`,
    year: 2000 + (index % 20),
    tags: tagEvery > 0 && index % tagEvery === 0 ? [tag] : [],
  }));
}

function tvTitles(count, tagEvery = 0, tag = 'anime') {
  return movieTitles(count, tagEvery, tag).map((title) => ({ ...title, season: 1, episode: 1 }));
}

function catalogOf(mediaType, titles, extra = {}) {
  return {
    schemaVersion: 1,
    mediaType,
    revision: 'teste-1',
    curatedAt: '2026-11-12',
    popularitySource: 'https://example.com/popularidade',
    verificationSource: 'https://example.com/referencia',
    titles,
    ...extra,
  };
}

function manifestOf(ids) {
  return {
    name: 'Teste',
    version: '0.1.0',
    scrapers: ids.map((id) => ({ id, supportedTypes: ['movie', 'tv'] })),
  };
}

function profilesOf(providers) {
  return { schemaVersion: 1, revision: 'teste-1', curatedAt: '2026-11-12', providers };
}

test('catálogos reais são válidos, não truncam e mantêm pelo menos 20 títulos', () => {
  const catalogs = catalogModule.loadCatalogs(ROOT);
  assert.ok(catalogs.movie.titles.length >= 20);
  assert.ok(catalogs.tv.titles.length >= 20);
  assert.equal(new Set(catalogs.movie.titles.map((title) => title.tmdbId)).size, catalogs.movie.titles.length);
  assert.equal(new Set(catalogs.tv.titles.map((title) => title.tmdbId)).size, catalogs.tv.titles.length);
  for (const title of catalogs.tv.titles) {
    assert.ok(Number.isInteger(title.season) && title.season > 0);
    assert.ok(Number.isInteger(title.episode) && title.episode > 0);
  }
  const profiles = catalogModule.loadProfiles(ROOT, {
    manifest: JSON.parse(require('node:fs').readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')),
    catalogs,
  });
  assert.deepEqual(profiles.providers, {
    animefire: { exclusiveTag: 'anime' },
    doramogo: { exclusiveTag: 'dorama' },
    dattebayo: { exclusiveTag: 'anime' },
    anitube: { exclusiveTag: 'anime' },
    oxeanimes: { exclusiveTag: 'anime' },
    animy: { exclusiveTag: 'anime' },
    anibunker: { exclusiveTag: 'anime' },
    animezey: { exclusiveTag: 'anime' },
    animesdigital: { exclusiveTag: 'anime' },
    animesfhd: { exclusiveTag: 'anime' },
    animesonlineblue: { exclusiveTag: 'anime' },
    animeq: { exclusiveTag: 'anime' },
  });
  assert.ok(catalogs.movie.titles.filter((title) => title.tags.includes('dorama')).length >= 5);
  assert.ok(catalogs.tv.titles.filter((title) => title.tags.includes('dorama')).length >= 5);
  assert.ok(catalogs.movie.titles.filter((title) => title.tags.includes('anime')).length >= 5);
  assert.ok(catalogs.tv.titles.filter((title) => title.tags.includes('anime')).length >= 5);
});

test('catálogo acima do mínimo é aceito sem truncamento', () => {
  const movie = catalogOf('movie', movieTitles(25));
  const tv = catalogOf('tv', tvTitles(30));
  assert.equal(catalogModule.validateCatalog(movie, { mediaType: 'movie' }).titles.length, 25);
  assert.equal(catalogModule.validateCatalog(tv, { mediaType: 'tv' }).titles.length, 30);
});

test('catálogo abaixo do mínimo é rejeitado sem atribuir falha ao provedor', () => {
  assert.throws(
    () => catalogModule.validateCatalog(catalogOf('movie', movieTitles(19))),
    /catálogo "movie" exige no mínimo 20 títulos distintos \(tem 19\)/,
  );
});

test('duplicação de ID no mesmo catálogo é rejeitada', () => {
  const titles = movieTitles(20);
  titles[19] = { ...titles[19], tmdbId: titles[0].tmdbId };
  assert.throws(() => catalogModule.validateCatalog(catalogOf('movie', titles)), /repete o tmdbId/);
});

test('coordenadas de episódio são válidas apenas para séries', () => {
  const movie = movieTitles(20);
  movie[0].season = 1;
  assert.throws(() => catalogModule.validateCatalog(catalogOf('movie', movie)), /filme e não aceita season\/episode/);

  const tv = tvTitles(20);
  tv[0].season = 0;
  assert.throws(() => catalogModule.validateCatalog(catalogOf('tv', tv)), /exige season positivo/);
  tv[0].season = 1;
  tv[0].episode = 0;
  assert.throws(() => catalogModule.validateCatalog(catalogOf('tv', tv)), /exige episode positivo/);
});

test('tag fora de kebab-case é rejeitada', () => {
  const movie = movieTitles(20);
  movie[0].tags = ['Anime'];
  assert.throws(() => catalogModule.validateCatalog(catalogOf('movie', movie)), /tag inválida/);
});

test('perfil com provedor desconhecido é rejeitado', () => {
  const context = { manifest: manifestOf(['dooplay']), catalogs: {
    movie: catalogOf('movie', movieTitles(20)),
    tv: catalogOf('tv', tvTitles(20)),
  } };
  assert.throws(
    () => catalogModule.validateProfiles(profilesOf({ fantasma: { exclusiveTag: null } }), context),
    /provedor desconhecido: "fantasma"/,
  );
});

test('perfil com tag desconhecida é rejeitado', () => {
  const context = { manifest: manifestOf(['dooplay']), catalogs: {
    movie: catalogOf('movie', movieTitles(20)),
    tv: catalogOf('tv', tvTitles(20)),
  } };
  assert.throws(
    () => catalogModule.validateProfiles(profilesOf({ dooplay: { exclusiveTag: 'novela' } }), context),
    /tag desconhecida: "novela"/,
  );
});

test('perfil exclusivo precisa de cinco elegíveis por tipo suportado', () => {
  const context = { manifest: manifestOf(['dooplay']), catalogs: {
    movie: catalogOf('movie', movieTitles(20, 4)),
    tv: catalogOf('tv', tvTitles(20, 0)),
  } };
  assert.throws(
    () => catalogModule.validateProfiles(profilesOf({ dooplay: { exclusiveTag: 'anime' } }), context),
    /só 0 títulos tv com a tag "anime"; mínimo 5/,
  );

  context.catalogs.tv = catalogOf('tv', tvTitles(20, 4));
  assert.deepEqual(catalogModule.resolveProfile(
    catalogModule.validateProfiles(profilesOf({ dooplay: { exclusiveTag: 'anime' } }), context),
    'dooplay',
  ), { exclusiveTag: 'anime' });
});

test('generalista usa todos os candidatos e exclusivo não recebe outro nicho', () => {
  const titles = [
    { tmdbId: '1', title: 'A', year: 2000, tags: ['anime'] },
    { tmdbId: '2', title: 'B', year: 2001, tags: [] },
    { tmdbId: '3', title: 'C', year: 2002, tags: ['dorama'] },
  ];
  assert.equal(catalogModule.filterTitles(titles, null).length, 3);
  assert.deepEqual(catalogModule.filterTitles(titles, 'anime').map((title) => title.tmdbId), ['1']);
  assert.deepEqual(catalogModule.filterTitles(titles, 'dorama').map((title) => title.tmdbId), ['3']);
});
