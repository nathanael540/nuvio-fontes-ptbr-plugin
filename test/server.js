#!/usr/bin/env node
/**
 * Servidor HTTP local para testar o repositório nos apps Nuvio.
 * Serve apenas manifest.json e providers/*.js, na raiz e na pasta de cada formato de formatação
 * (<formato>/manifest.json e <formato>/providers/*.js).
 *
 * Uso: npm start  (porta padrão 3000; sobrescreva com PORT=xxxx)
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadFormats } = require('../build.js');

const PORT = Number(process.env.PORT) || 3000;
// A raiz servida é o repositório, mesmo com o servidor em test/.
const ROOT = path.join(__dirname, '..');

const CONTENT_TYPES = { '.json': 'application/json', '.js': 'application/javascript' };

/**
 * Arquivo servido para o caminho pedido, ou null fora do permitido.
 * @param {string} urlPath - Caminho decodificado da URL.
 * @param {string[]} prefixes - "" (raiz) e "/<formato>" de cada formato.
 * @returns {string|null} Caminho absoluto do arquivo permitido.
 */
function resolveFile(urlPath, prefixes) {
  for (const prefix of prefixes) {
    const base = path.join(ROOT, prefix);
    if (urlPath === `${prefix}/manifest.json`) return path.join(base, 'manifest.json');

    const providersDir = path.join(base, 'providers');
    const filePath = path.join(ROOT, path.normalize(urlPath));
    if (filePath.startsWith(providersDir + path.sep) && path.dirname(filePath) === providersDir && filePath.endsWith('.js')) {
      return filePath;
    }
  }
  return null;
}

function lanAddress() {
  const ipv4 = Object.values(os.networkInterfaces())
    .flat()
    .find((iface) => iface.family === 'IPv4' && !iface.internal);
  return ipv4 ? ipv4.address : 'localhost';
}

/**
 * Cria o servidor HTTP estático sem abrir porta; o chamador decide quando escutar.
 * @param {string[]} prefixes - "" (raiz) e "/<formato>" de cada formato.
 * @returns {import('http').Server} Servidor HTTP ainda não iniciado.
 */
function createServer(prefixes) {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    console.log(`${req.method} ${urlPath}`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const filePath = req.method === 'GET' ? resolveFile(urlPath, prefixes) : null;
    if (!filePath) {
      res.writeHead(404).end('Não encontrado. Use /manifest.json, /providers/<id>.js, /<formato>/manifest.json ou /<formato>/providers/<id>.js');
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        const status = error.code === 'ENOENT' ? 404 : 500;
        res.writeHead(status).end(`Erro ao ler ${urlPath}: ${error.code}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] }).end(content);
    });
  });
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function validateSession(session) {
  if (!session || typeof session !== 'object') throw new Error('sessão isolada inválida');
  const { sessionId, provider, sessionDir, manifestPath, packagePath, manifestHash, packageHash } = session;
  if (
    typeof sessionId !== 'string' ||
    !/^[a-z0-9-]+$/.test(sessionId) ||
    typeof provider !== 'string' ||
    !/^[a-z0-9-]+$/.test(provider) ||
    typeof sessionDir !== 'string'
  ) {
    throw new Error('sessão isolada com provider, sessionId ou diretório inválido');
  }
  const expectedManifest = path.join(sessionDir, 'manifest.json');
  const expectedPackage = path.join(sessionDir, 'providers', `${provider}.js`);
  if (path.resolve(manifestPath) !== path.resolve(expectedManifest)) {
    throw new Error(`manifest da sessão fora do caminho esperado: ${manifestPath}`);
  }
  if (path.resolve(packagePath) !== path.resolve(expectedPackage)) {
    throw new Error(`pacote da sessão fora do caminho esperado: ${packagePath}`);
  }
  for (const file of [manifestPath, packagePath]) {
    if (!fs.existsSync(file)) throw new Error(`arquivo da sessão ausente: ${file}`);
  }
  if (sha256File(manifestPath) !== manifestHash) throw new Error(`hash do manifest da sessão diverge: ${manifestPath}`);
  if (sha256File(packagePath) !== packageHash) throw new Error(`hash do pacote da sessão diverge: ${packagePath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.scrapers) || manifest.scrapers.length !== 1) {
    throw new Error('manifest da sessão deve conter exatamente um provedor');
  }
  const scraper = manifest.scrapers[0];
  if (scraper.id !== provider || scraper.filename !== `providers/${provider}.js`) {
    throw new Error(`manifest da sessão não corresponde ao alvo ${provider}`);
  }
  return { ...session, manifest };
}

/**
 * Cria o servidor do modo isolado. Serve somente /manifest.json e o pacote do alvo da sessão
 * ativa, com Cache-Control: no-store e sem fallback para sessão anterior ou pacote vazio.
 * @returns {import('http').Server} Servidor com activateSession, deactivateSession e getActiveSession.
 */
function createIsolatedServer() {
  let active = null;
  let requests = [];

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const current = active;

    if (req.method !== 'GET') {
      res.writeHead(404).end('Modo isolado aceita apenas GET.');
      return;
    }
    if (!current) {
      res.writeHead(404).end('Nenhuma sessão isolada ativa. Prepare e ative uma sessão antes de atualizar o app.');
      return;
    }

    let filePath = null;
    if (urlPath === '/manifest.json') filePath = current.manifestPath;
    else if (urlPath === `/providers/${current.provider}.js`) filePath = current.packagePath;
    if (!filePath) {
      res.writeHead(404).end(`Fora da sessão ativa ${current.sessionId}: use /manifest.json ou /providers/${current.provider}.js`);
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        const status = error.code === 'ENOENT' ? 404 : 500;
        res.writeHead(status).end(`Erro ao ler ${urlPath}: ${error.code}`);
        return;
      }
      requests.push({
        at: new Date().toISOString(),
        path: urlPath,
        bytes: content.length,
        hash: crypto.createHash('sha256').update(content).digest('hex'),
      });
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(filePath)] }).end(content);
    });
  });

  server.activateSession = (session) => {
    if (active) {
      throw new Error(`sessão "${active.sessionId}" já está ativa; encerre antes de ativar outra`);
    }
    active = validateSession(session);
    requests = [];
    return active;
  };
  server.deactivateSession = () => {
    const previous = active;
    active = null;
    return previous;
  };
  server.getActiveSession = () => active;
  server.getRequests = () => requests.slice();
  server.on('close', () => {
    active = null;
  });
  return server;
}

async function main() {
  const formats = await loadFormats();
  const prefixes = [''].concat(formats.map((formatter) => `/${formatter}`));
  const server = createServer(prefixes);

  server.listen(PORT, () => {
    const base = `http://${lanAddress()}:${PORT}`;
    console.log(`\n🚀 Servidor:  ${base}/`);
    console.log(`📝 Manifest:  ${base}/manifest.json (formato sorteado)`);
    for (const formatter of formats) console.log(`📝 Manifest:  ${base}/${formatter}/manifest.json`);
    console.log('');
  });
  return server;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  CONTENT_TYPES,
  ROOT,
  createIsolatedServer,
  createServer,
  main,
  resolveFile,
  sha256File,
  validateSession,
};
