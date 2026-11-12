const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BLOCKS_DIR = path.join(__dirname, '..', 'src', '_blocks');
const BLOCK_TESTS_DIR = path.join(__dirname, 'blocks');

const blockDirs = fs
  .readdirSync(BLOCKS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const testDirs = fs
  .readdirSync(BLOCK_TESTS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

// Linhas da tabela do catálogo: | `nome-do-bloco` | ... |
const catalogedBlocks = [
  ...fs.readFileSync(path.join(BLOCKS_DIR, 'index.md'), 'utf-8').matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm),
]
  .map((match) => match[1])
  .sort();

test('catálogo src/_blocks/index.md lista exatamente os blocos existentes', () => {
  assert.deepEqual(catalogedBlocks, blockDirs);
});

test('test/blocks contém exatamente uma suíte por bloco, sem cópias em src/', () => {
  assert.deepEqual(testDirs, blockDirs);
  for (const block of blockDirs) {
    assert.equal(fs.existsSync(path.join(BLOCKS_DIR, block, 'index.test.mjs')), false, `${block}/index.test.mjs ainda existe em src/`);
    assert.ok(fs.existsSync(path.join(BLOCK_TESTS_DIR, block, 'index.test.mjs')), `test/blocks/${block}/index.test.mjs não encontrado`);
  }
});

for (const block of blockDirs) {
  test(`bloco "${block}" segue a estrutura padrão`, () => {
    assert.match(block, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'nome deve ser kebab-case');
    assert.ok(fs.existsSync(path.join(BLOCKS_DIR, block, 'index.mjs')), `${block}/index.mjs não encontrado`);
  });
}
