const fs = require('node:fs');
const path = require('node:path');

// Temporários de testes Node ficam sob a raiz de artefatos, ignorada pelo Git e pelo lint.
const NODE_ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts', 'node');

/**
 * Cria um diretório temporário exclusivo dentro de test/artifacts/node/.
 * @param {string} prefix - Prefixo do nome do diretório.
 * @returns {string} Caminho absoluto do diretório criado.
 */
function createTempDir(prefix = 'test-') {
  fs.mkdirSync(NODE_ARTIFACTS_DIR, { recursive: true });
  return fs.mkdtempSync(path.join(NODE_ARTIFACTS_DIR, prefix));
}

module.exports = { NODE_ARTIFACTS_DIR, createTempDir };
