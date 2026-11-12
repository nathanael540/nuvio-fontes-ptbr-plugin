#!/usr/bin/env node
/**
 * Servidor HTTP local para testar o repositório nos apps Nuvio.
 * Serve apenas manifest.json e providers/*.js, na raiz e na pasta de cada formato de formatação
 * (<formato>/manifest.json e <formato>/providers/*.js).
 *
 * Uso: npm start  (porta padrão 3000; sobrescreva com PORT=xxxx)
 */

const http = require('http');
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
  createServer,
  main,
  resolveFile,
};
