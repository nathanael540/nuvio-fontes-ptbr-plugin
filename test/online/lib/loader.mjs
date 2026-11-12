/**
 * Carregador do pacote publicado em contexto isolado por caso.
 *
 * O pacote executado é o arquivo CommonJS gerado em `providers/<id>.js`. O SHA-256 é calculado sobre
 * os mesmos bytes entregues ao motor, e `require` aceita somente os módulos externos reais do app.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);

const ALLOWED_MODULES = {
  'cheerio-without-node-native': 'cheerio-without-node-native',
  cheerio: 'cheerio-without-node-native',
  'react-native-cheerio': 'cheerio-without-node-native',
  'crypto-js': 'crypto-js',
};

/**
 * Localiza o pacote do provedor pelo manifest e calcula seu hash.
 *
 * @param {{ rootDir: string, manifest: object, providerId: string }} options - Raiz, manifest e ID.
 * @returns {{ provider: object, file: string, code: string, packageHash: string }} Pacote pronto para executar.
 * @throws {Error} Se o provedor não existir no manifest ou o arquivo gerado estiver ausente.
 * @example
 * const pkg = resolveProviderPackage({ rootDir, manifest, providerId: 'betor' });
 * // pkg.packageHash tem 64 caracteres hexadecimais
 */
export function resolveProviderPackage({ rootDir, manifest, providerId }) {
  const provider = manifest.scrapers.find((scraper) => scraper.id === providerId);
  if (!provider) {
    throw new Error(`provedor "${providerId}" não está no manifest`);
  }
  const expectedFilename = `providers/${providerId}.js`;
  if (provider.filename !== expectedFilename) {
    throw new Error(`manifest de "${providerId}" aponta para "${provider.filename}"; esperado "${expectedFilename}"`);
  }
  const file = path.join(rootDir, expectedFilename);
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    throw new Error(`pacote ausente: ${file} (rode node build.js ${providerId}): ${error.message}`, { cause: error });
  }
  const code = bytes.toString('utf8');
  return { provider, file, code, packageHash: sha256(code) };
}

/**
 * Cria um `require` limitado aos módulos externos reais do app.
 *
 * @returns {(name: string) => unknown} Require do contexto.
 * @example
 * const requireModule = createModuleRequire();
 * requireModule('cheerio'); // carrega cheerio-without-node-native
 */
export function createModuleRequire() {
  return (name) => {
    const realName = ALLOWED_MODULES[name];
    if (!realName) {
      throw new Error(`módulo externo não permitido no caminho online: "${name}"`);
    }
    return nodeRequire(realName);
  };
}

/**
 * Executa o pacote CommonJS em um contexto isolado e devolve `getStreams`.
 *
 * @param {{ code: string, filename?: string, expectedHash?: string, globals?: object }} options - Código, nome do arquivo, hash esperado e globais adicionais.
 * @returns {{ getStreams: Function, packageHash: string, exports: object }} Módulo carregado.
 * @throws {Error} Se o hash divergir, o carregamento falhar ou o pacote não exportar `getStreams`.
 * @example
 * const loaded = loadProviderModule({ code, expectedHash: pkg.packageHash, globals: { fetch } });
 * await loaded.getStreams('603', 'movie', null, null);
 */
export function loadProviderModule({ code, filename = 'provider.js', expectedHash, globals = {} }) {
  if (typeof code !== 'string') throw new Error('código do pacote deve ser texto');
  const packageHash = sha256(code);
  if (expectedHash !== undefined && expectedHash !== packageHash) {
    throw new Error(`hash do pacote diverge: esperado ${expectedHash}, executado ${packageHash}`);
  }

  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: createModuleRequire(),
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    atob,
    btoa,
    ...globals,
  });
  vm.runInContext(code, context, { filename });
  if (typeof module.exports.getStreams !== 'function') {
    throw new Error('pacote não exporta getStreams');
  }
  return { getStreams: module.exports.getStreams, packageHash, exports: module.exports };
}

/**
 * Calcula SHA-256 de um texto em hexadecimal.
 *
 * @param {string} value - Conteúdo.
 * @returns {string} Hash hexadecimal de 64 caracteres.
 * @example
 * sha256('abc');
 * // 'ba7816bf...'
 */
export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
