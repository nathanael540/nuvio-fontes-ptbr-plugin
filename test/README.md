# Testes — comandos

Comandos e operação da infraestrutura de testes. Todos os testes rodam em Node, sem o app Nuvio instalado e sem internet. Os tipos de teste, regras e limites estão em [docs/tests.md](../docs/tests.md).

## Estrutura

1. `test/*.test.js`: suítes de provedores, manifest, catálogos, build e servidor.
2. `test/blocks/<bloco>/index.test.mjs`: uma suíte por bloco de `src/_blocks/`.
3. `test/fixtures/<fonte>/`: respostas gravadas das fontes (HTML, JSON, playlists).
4. `test/support/`: utilitários dos testes (`temp-dir.js`, `basic-html.js`).
5. `test/server.js`: servidor HTTP local de manifests e pacotes.
6. `test/artifacts/`: saídas geradas (temporários Node em `test/artifacts/node/`), ignorada pelo Git.

## Comandos

1. Instalar dependências: `npm install` (Node.js `^22.22.2 || >=24.15.0`).
2. Lint: `npm run lint`.
3. Todos os testes: `npm test`.
4. Uma suíte: `node --test test/<id>.test.js` ou `node --test test/blocks/<bloco>/index.test.mjs`.
5. Build de um provedor: `node build.js <id>`; de todos: `npm run build`.

## Servidor local

1. `npm start` serve por HTTP local, na porta 3000 (`PORT=xxxx` para trocar), somente:
   1. `/manifest.json` e `/providers/<id>.js`;
   2. `/<formato>/manifest.json` e `/<formato>/providers/<id>.js` para cada formato (`gdrive`, `prism`).
2. Outras rotas respondem 404. O endereço na rede local aparece no terminal.
3. O servidor entrega os arquivos gerados; rode o build antes. Ele não faz parte dos testes.
