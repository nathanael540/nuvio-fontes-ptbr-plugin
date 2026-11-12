const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

let documentModule;
let catalogModule;

test.before(async () => {
  documentModule = await import('./online/lib/providers-document.mjs');
  catalogModule = await import('./online/lib/catalog.mjs');
});

function context() {
  const catalogs = catalogModule.loadCatalogs(ROOT);
  const profiles = catalogModule.loadProfiles(ROOT, { manifest, catalogs });
  return { catalogs, profiles };
}

test('providers.md lista exatamente os provedores do manifest e reconcilia tabela com a última rodada', () => {
  const data = context();
  const markdown = fs.readFileSync(path.join(ROOT, 'providers.md'), 'utf8');
  const result = documentModule.validateProvidersDocument({ markdown, manifest, ...data });
  assert.deepEqual(result.rows.map((row) => row.id).sort(), manifest.scrapers.map((scraper) => scraper.id).sort());
  for (const scraper of manifest.scrapers) {
    const expected = scraper.enabled === false ? 'Desativado' : result.statuses[scraper.id];
    assert.equal(expected, result.statuses[scraper.id]);
    const row = result.rows.find((item) => item.id === scraper.id);
    assert.match(row.statusDisplay, /^(🟢|🔵|🔴|🟠|⚫) /u);
    assert.match(row.lastCell, /^(\d{4}-\d{2}-\d{2}|—)$/);
  }
});

test('status atuais não usam aprovação offline, contagem Node nem hash', () => {
  const markdown = fs.readFileSync(path.join(ROOT, 'providers.md'), 'utf8');
  assert.doesNotMatch(markdown, /\bNode\s+\d+\/\d+/);
  assert.doesNotMatch(markdown, /sem fixtures reais|cobertura offline|testes Node passando/i);
  assert.doesNotMatch(markdown, /\b[a-f0-9]{64}\b/i);
});

test('documento temporário válido sem rodada online é Não verificado', () => {
  assert.doesNotThrow(() => documentModule.validateProvidersDocument({ markdown: TEMP_DOC, ...tempContext() }));
});

test('documento temporário com status divergente é rejeitado', () => {
  const markdown = TEMP_DOC.replaceAll('🟠 Não verificado', '🟢 Estável');
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown, ...tempContext() }),
    /status de "betor" na tabela é "🟢 Estável", esperado "🟠 Não verificado"/,
  );
});

test('documento temporário com seção divergente é rejeitado', () => {
  const markdown = TEMP_DOC.replace('**Status: 🟠 Não verificado.**', '**Status: 🟢 Estável.**');
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown, ...tempContext() }),
    /seção de "betor" declara "Estável", esperado "Não verificado"/,
  );
});

test('rodada simulada de outra versão não herda aprovação e mantém a data do último teste', () => {
  const cases = caseLines();
  const block = `\n<!-- online-verification:start -->\n### Verificações online\n\n1. **2026-11-12T10:00:00.000Z** · ID \`run-simulada\` · **Estável** · pacote 9.9.9 · perfil \`generalista\` · catálogos \`movie@1\`, \`tv@1\` · semente \`seed\` · algoritmo \`sha256-fisher-yates-v1\`\n${cases}\n<!-- online-verification:end -->\n`;
  const markdown = TEMP_DOC
    .replace('| 🟠 Não verificado | — |', '| 🟠 Não verificado | 2026-11-12 |')
    .replace('**Status: 🟠 Não verificado.**', `**Status: 🟠 Não verificado.**\n${block}`);
  const result = documentModule.validateProvidersDocument({ markdown, ...tempContext() });
  assert.equal(result.statuses.betor, 'Não verificado');
  assert.equal(result.history.get('betor').length, 1);
});

test('histórico de provedor desativado permanece válido e o status atual é Desativado', () => {
  const cases = caseLines();
  const block = `\n<!-- online-verification:start -->\n### Verificações online\n\n1. **2026-11-12T10:00:00.000Z** · ID \`run-antiga\` · **Estável** · pacote 1.0.0 · perfil \`generalista\` · catálogos \`movie@1\`, \`tv@1\` · semente \`seed\` · algoritmo \`sha256-fisher-yates-v1\`\n${cases}\n<!-- online-verification:end -->\n`;
  const markdown = TEMP_DOC
    .replace('| 🟠 Não verificado | — |', '| ⚫ Desativado | 2026-11-12 |')
    .replace('**Status: 🟠 Não verificado.**', `**Status: ⚫ Desativado.**\n${block}`);
  const ctx = tempContext();
  ctx.manifest.scrapers[0].enabled = false;
  const result = documentModule.validateProvidersDocument({ markdown, ...ctx });
  assert.equal(result.statuses.betor, 'Desativado');
});

test('URL, credencial ou hash no resumo público é rejeitado', () => {
  const url = TEMP_DOC.replace('**Status: 🟠 Não verificado.**', '**Status: 🟠 Não verificado.**\n\nhttps://exemplo.test/x?token=segredo');
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown: url, ...tempContext() }),
    /URL, credencial ou hash não permitido/,
  );
  const hash = TEMP_DOC.replace('**Status: 🟠 Não verificado.**', `**Status: 🟠 Não verificado.**\n\n${'a'.repeat(64)}`);
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown: hash, ...tempContext() }),
    /URL, credencial ou hash não permitido/,
  );
});

test('bloco de verificação duplicado é rejeitado', () => {
  const block = '\n<!-- online-verification:start -->\n<!-- online-verification:end -->\n';
  const markdown = TEMP_DOC.replace('**Status: 🟠 Não verificado.**', `**Status: 🟠 Não verificado.**\n${block}${block}`);
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown, ...tempContext() }),
    /mais de um bloco de verificação/,
  );
});

test('duas rodadas no mesmo bloco são rejeitadas', () => {
  const cases = caseLines();
  const round = `1. **2026-11-12T10:00:00.000Z** · ID \`run-1\` · **Estável** · pacote 1.0.0 · perfil \`generalista\` · catálogos \`movie@1\`, \`tv@1\` · semente \`seed\` · algoritmo \`sha256-fisher-yates-v1\`\n${cases}`;
  const block = `\n<!-- online-verification:start -->\n### Verificações online\n\n${round}\n2. **2026-11-12T11:00:00.000Z** · ID \`run-2\` · **Estável** · pacote 1.0.0 · perfil \`generalista\` · catálogos \`movie@1\`, \`tv@1\` · semente \`seed\` · algoritmo \`sha256-fisher-yates-v1\`\n${cases}\n<!-- online-verification:end -->\n`;
  const markdown = TEMP_DOC
    .replace('| 🟠 Não verificado | — |', '| 🟢 Estável | 2026-11-12 |')
    .replace('**Status: 🟠 Não verificado.**', `**Status: 🟢 Estável.**\n${block}`);
  assert.throws(
    () => documentModule.validateProvidersDocument({ markdown, ...tempContext() }),
    /tem 2 rodadas; mantenha apenas a última/,
  );
});

const TEMP_DOC = `# Provedores

| Provedor | ID | Tipos | Formato | Status | Última verificação |
| --- | --- | --- | --- | --- | --- |
| [BeTor](#betor) | \`betor\` | filme, série | magnet | 🟠 Não verificado | — |

## BeTor

**Status: 🟠 Não verificado.**
`;

function caseLines() {
  return [
    ...Array.from({ length: 5 }, (_, index) => `   ${index + 1}. \`movie\` \`${600 + index}\` · Filme ${index} (2000) · **Resolvido** · 1/1 streams aproveitáveis`),
    ...Array.from({ length: 5 }, (_, index) => `   ${index + 6}. \`tv\` \`${700 + index}\` · Série ${index} (2001) · S01E01 · **Resolvido** · 1/1 streams aproveitáveis`),
  ].join('\n');
}

function tempContext() {
  return {
    manifest: {
      scrapers: [{
        id: 'betor',
        name: 'BeTor',
        version: '1.0.0',
        enabled: true,
        supportedTypes: ['movie', 'tv'],
        filename: 'providers/betor.js',
      }],
    },
    catalogs: {
      movie: { mediaType: 'movie', revision: '1', curatedAt: '2026-11-12', titles: [] },
      tv: { mediaType: 'tv', revision: '1', curatedAt: '2026-11-12', titles: [] },
    },
    profiles: { schemaVersion: 1, revision: '1', curatedAt: '2026-11-12', providers: {} },
  };
}
