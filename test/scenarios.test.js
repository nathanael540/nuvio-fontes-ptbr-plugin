const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTempDir } = require('./support/temp-dir');

let scenarios;

test.before(async () => {
  scenarios = await import('./scenarios/index.mjs');
});

function movieCase(overrides = {}) {
  return {
    id: '1-filme',
    title: 'Duna',
    tmdbId: '438631',
    imdbId: 'tt1160419',
    type: 'movie',
    season: null,
    episode: null,
    delivery: 'p2p',
    expectedResult: 'streams',
    seasonPack: false,
    option: { selection: 'first', rowPattern: null },
    screenshot: 'mobile-filme',
    ...overrides,
  };
}

function seriesCase(overrides = {}) {
  return movieCase({
    id: '2-serie',
    title: 'Breaking Bad',
    tmdbId: '1396',
    imdbId: 'tt0903747',
    type: 'tv',
    season: 2,
    episode: 3,
    ...overrides,
  });
}

test('arquivo de cenário válido é carregado e normalizado', (t) => {
  const dir = createTempDir('scenarios-load-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'betor.json'),
    JSON.stringify({
      provider: 'betor',
      providerName: 'BeTor',
      cases: [movieCase()],
    }),
  );

  const loaded = scenarios.loadProviderScenario('betor', { scenariosDir: dir });
  assert.equal(loaded.provider, 'betor');
  assert.equal(loaded.providerName, 'BeTor');
  assert.equal(loaded.cases.length, 1);
  assert.equal(loaded.cases[0].tmdbId, '438631');
  assert.ok(Object.isFrozen(loaded.cases[0]));
});

test('validação rejeita campos e combinações inválidas', () => {
  assert.throws(() => scenarios.validateScenarioCase({ ...movieCase(), extra: 1 }), /campos desconhecidos/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ id: '1 Filme' })), /id inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ tmdbId: 'abc' })), /tmdbId inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ imdbId: '123' })), /imdbId inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ season: 1 })), /filme não aceita season/);
  assert.throws(() => scenarios.validateScenarioCase(seriesCase({ episode: null })), /série exige season e episode/);
  assert.throws(() => scenarios.validateScenarioCase(seriesCase({ season: 0 })), /season inválido/);
  const missingTitle = movieCase();
  delete missingTitle.title;
  assert.throws(() => scenarios.validateScenarioCase(missingTitle), /title é obrigatório/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ title: undefined })), /exige title/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ expectedResult: 'qualquer' })), /expectedResult inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ delivery: 'ftp' })), /delivery inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ delivery: null })), /delivery inválido/);
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ option: null })), /exige option/);
  assert.throws(
    () => scenarios.validateScenarioCase(movieCase({ option: { selection: 'primeira', rowPattern: null } })),
    /option.selection inválida/,
  );
  assert.throws(
    () => scenarios.validateScenarioCase(movieCase({ option: { selection: 'rowPattern', rowPattern: ' ' } })),
    /option.rowPattern/,
  );
  assert.throws(
    () => scenarios.validateScenarioCase(movieCase({ seasonPack: 'nao' })),
    /seasonPack deve ser booleano/,
  );
  assert.throws(() => scenarios.validateScenarioCase(movieCase({ seasonPack: true })), /seasonPack só vale/);

  const empty = movieCase({
    id: '3-ausencia',
    title: null,
    delivery: null,
    expectedResult: 'empty',
    option: null,
    screenshot: 'mobile-ausencia',
  });
  assert.equal(scenarios.validateScenarioCase(empty).expectedResult, 'empty');
  assert.throws(
    () => scenarios.validateScenarioCase({ ...empty, delivery: 'http' }),
    /empty não aceita delivery/,
  );
  assert.throws(
    () => scenarios.validateScenarioCase({ ...empty, option: { selection: 'first', rowPattern: null } }),
    /empty não aceita option/,
  );
});

test('carregamento rejeita provider divergente, id repetido e JSON inválido', (t) => {
  const dir = createTempDir('scenarios-invalid-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(dir, 'betor.json'), JSON.stringify({ provider: 'outro', providerName: 'BeTor', cases: [movieCase()] }));
  assert.throws(() => scenarios.loadProviderScenario('betor', { scenariosDir: dir }), /provider divergente/);

  fs.writeFileSync(
    path.join(dir, 'betor.json'),
    JSON.stringify({ provider: 'betor', providerName: 'BeTor', cases: [movieCase(), movieCase()] }),
  );
  assert.throws(() => scenarios.loadProviderScenario('betor', { scenariosDir: dir }), /repete o id/);

  fs.writeFileSync(path.join(dir, 'betor.json'), '{ nao e json');
  assert.throws(() => scenarios.loadProviderScenario('betor', { scenariosDir: dir }), /não é JSON válido/);

  assert.throws(() => scenarios.loadProviderScenario('inexistente', { scenariosDir: dir }), /não encontrado/);
});

test('overrides aceitam número ou texto e mantêm o mesmo caso resolvido', () => {
  const base = scenarios.validateScenarioCase(seriesCase());
  const fromString = scenarios.resolveScenario(base, { season: '2', episode: '3', tmdbId: '1396' });
  const fromNumber = scenarios.resolveScenario(base, { season: 2, episode: 3, tmdbId: 1396 });

  assert.deepEqual(fromString, fromNumber);
  assert.equal(typeof fromString.season, 'number');
  assert.equal(typeof fromString.episode, 'number');
  assert.equal(typeof fromString.tmdbId, 'string');
  assert.equal(fromString.selectedOption, 'default_first_matching_row');

  const withPattern = scenarios.resolveScenario(base, { rowPattern: 'BeTor .*P2P.*pacote.*' });
  assert.equal(withPattern.option.selection, 'rowPattern');
  assert.equal(withPattern.option.rowPattern, 'BeTor .*P2P.*pacote.*');
  assert.equal(withPattern.selectedOption, 'BeTor .*P2P.*pacote.*');
  assert.equal(base.option.selection, 'first');
  assert.equal(base.selectedOption, undefined);

  const withLabel = scenarios.resolveScenario(base, { selectedOption: 'opção escolhida' });
  assert.equal(withLabel.selectedOption, 'opção escolhida');
  assert.equal(withLabel.option.selection, 'first');
});

test('overrides inválidos são rejeitados antes da navegação', () => {
  const base = scenarios.validateScenarioCase(seriesCase());
  assert.throws(() => scenarios.resolveScenario(base, { season: '2.5' }), /season inválido/);
  assert.throws(() => scenarios.resolveScenario(base, { season: 0 }), /season inválido/);
  assert.throws(() => scenarios.resolveScenario(base, { delivery: 'ftp' }), /delivery inválido/);
  assert.throws(() => scenarios.resolveScenario(base, { unknown: 1 }), /overrides de cenário desconhecidos/);
  assert.throws(() => scenarios.resolveScenario(base, { mediaType: 'anime' }), /type inválido/);
  assert.throws(() => scenarios.resolveScenario(base, { mediaType: 'movie', season: 1 }), /filme não aceitam season/);

  const empty = scenarios.validateScenarioCase(
    movieCase({
      id: '3-ausencia',
      title: null,
      delivery: null,
      expectedResult: 'empty',
      option: null,
    }),
  );
  assert.throws(() => scenarios.resolveScenario(empty, { rowPattern: 'qualquer' }), /empty não aceita rowPattern/);
  assert.throws(() => scenarios.resolveScenario(empty, { delivery: 'http' }), /empty não aceita delivery/);
});
