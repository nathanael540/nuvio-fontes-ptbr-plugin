const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const MAESTRO_PROVIDERS_DIR = path.join(__dirname, 'maestro', 'providers');

let scenarios;
let generator;

test.before(async () => {
  scenarios = await import('./scenarios/index.mjs');
  generator = await import('./maestro/generate-flow.mjs');
});

function parseFlowEnv(text) {
  const env = {};
  for (const match of text.matchAll(/^\s+([A-Z_]+):\s*"([^"]*)"\s*$/gm)) env[match[1]] = match[2];
  return env;
}

test('inventário: 14 provedores do manifest têm cenário e fluxo gerado, sem fluxos legados por provedor', () => {
  const providers = scenarios.listScenarioProviders();
  const manifestProviders = MANIFEST.scrapers.map((scraper) => scraper.id).sort();
  assert.equal(providers.length, 14);
  assert.deepEqual(providers, manifestProviders);

  let totalCases = 0;
  for (const provider of providers) {
    const definition = scenarios.loadProviderScenario(provider);
    totalCases += definition.cases.length;

    for (const legacy of ['mobile', 'tv']) {
      assert.equal(
        fs.existsSync(path.join(MAESTRO_PROVIDERS_DIR, provider, legacy)),
        false,
        `${provider}: fluxo legado ${legacy} ainda existe`,
      );
    }
  }
  assert.equal(totalCases, 61);
});

test('cenário resolvido e fluxo gerado declaram os mesmos metadados', () => {
  for (const provider of scenarios.listScenarioProviders()) {
    const definition = scenarios.loadProviderScenario(provider);
    for (const scenario of definition.cases) {
      const resolved = scenarios.resolveScenario(scenario);
      const env = parseFlowEnv(generator.renderScenarioFlow({ provider, providerName: definition.providerName, scenario: resolved, formatter: 'prism' }));
      assert.equal(env.FORMAT, 'prism', `${provider}/${scenario.id}: FORMAT`);
      assert.equal(env.TEMPLATE, 'prism', `${provider}/${scenario.id}: TEMPLATE`);
      assert.equal(env.PROVIDER_NAME, definition.providerName, `${provider}/${scenario.id}: PROVIDER_NAME`);
      assert.equal(env.TMDB_ID, resolved.tmdbId, `${provider}/${scenario.id}: TMDB_ID`);
      assert.equal(env.TYPE, resolved.type === 'tv' ? 'series' : resolved.type, `${provider}/${scenario.id}: TYPE`);
      assert.equal(env.TITLE ?? null, resolved.title, `${provider}/${scenario.id}: TITLE`);
      assert.equal(env.SEASON ? Number(env.SEASON) : null, resolved.season, `${provider}/${scenario.id}: SEASON`);
      assert.equal(env.EPISODE ? Number(env.EPISODE) : null, resolved.episode, `${provider}/${scenario.id}: EPISODE`);
      assert.equal(
        env.EXPECTED_DELIVERY ? env.EXPECTED_DELIVERY.toLowerCase() : null,
        resolved.delivery,
        `${provider}/${scenario.id}: EXPECTED_DELIVERY`,
      );
      assert.equal(env.ROW_PATTERN ?? null, resolved.option?.rowPattern ?? null, `${provider}/${scenario.id}: ROW_PATTERN`);
      assert.equal(env.SCREENSHOT_NAME, resolved.screenshot, `${provider}/${scenario.id}: SCREENSHOT_NAME`);
    }
  }
});
