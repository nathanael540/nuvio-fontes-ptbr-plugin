const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// providers.md é a fonte do status dos provedores e deve espelhar o manifest.
const ROOT = path.join(__dirname, '..');
const STATUSES = ['Estável', 'Parcial', 'Instável', 'Desativado'];

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const catalog = fs.readFileSync(path.join(ROOT, 'providers.md'), 'utf-8');

// Linhas da tabela do catálogo: | [Nome](#ancora) | `id` | tipos | formato | status | validação |
const rows = [...catalog.matchAll(/^\|\s*\[([^\]]+)\]\(#[^)]+\)\s*\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|[^|]*\|\s*$/gm)]
  .map(([, name, id, status]) => ({ name, id, status }));

test('providers.md lista exatamente os provedores do manifest', () => {
  assert.deepEqual(rows.map((row) => row.id).sort(), manifest.scrapers.map((scraper) => scraper.id).sort());
});

for (const scraper of manifest.scrapers) {
  test(`providers.md: "${scraper.id}" tem status válido, coerente com enabled, e seção própria`, () => {
    const row = rows.find((item) => item.id === scraper.id);
    assert.ok(row, `${scraper.id} ausente do catálogo`);
    assert.ok(STATUSES.includes(row.status), `status "${row.status}" fora de ${STATUSES.join(', ')}`);
    assert.equal(row.status === 'Desativado', scraper.enabled === false, 'Desativado deve corresponder a enabled: false');
    assert.equal(row.name, scraper.name, 'nome do catálogo diferente do manifest');
    assert.match(catalog, new RegExp(`^## ${row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `seção "## ${row.name}" ausente`);
    assert.match(catalog, new RegExp(`\\*\\*Status: ${row.status}\\.\\*\\*`), `seção sem "**Status: ${row.status}.**"`);
  });
}
