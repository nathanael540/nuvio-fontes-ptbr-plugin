# Tasks

## 1. Remover código e registro

- [x] 1.1 Remover a entrada `raflix` do `manifest.json` e apagar `src/raflix/`, `test/raflix.test.js` e `test/fixtures/raflix/`; verificar com `git grep -n -i raflix -- src test manifest.json` que não restam referências.
- [x] 1.2 Apagar `providers/raflix.js`, `gdrive/providers/raflix.js` e `prism/providers/raflix.js`, rodar `node build.js` e verificar com `node --test test/manifest.test.js` que os manifests de formato e os diretórios de provedores estão sincronizados sem o Raflix.

## 2. Atualizar documentação

- [x] 2.1 Remover a linha da tabela e a seção `## Raflix` de `providers.md`; verificar com `node --test test/providers-catalog.test.js` que a tabela continua reconciliada com o manifest.
- [x] 2.2 Remover o método 3.17 de `docs/provider-investigation.md`, renumerar o método seguinte para 3.17 e verificar com `git grep -n -i raflix -- providers.md docs` que não restam referências ao provedor.
- [x] 2.3 Conferir README, `docs/arch.md`, `docs/tests.md`, `test/README.md` e `src/_blocks/index.md`; verificar com `git grep -n -i raflix -- README.md docs test/README.md src/_blocks/index.md` que não há referência pendente.

## 3. Aposentar a spec e validar

- [x] 3.1 Manter a spec delta com os seis requisitos removidos e o marcador `retire_capabilities: true` no `.openspec.yaml`; verificar com `openspec validate remover-provedor-raflix`.
- [x] 3.2 Rodar `npm run lint` e `npm test` e confirmar que a suíte completa termina sem falhas, sem a suíte e as fixtures do Raflix.
- [x] 3.3 Conferir a árvore final e confirmar que restam apenas referências históricas em `openspec/changes/archive/` e `test/artifacts/` (ignorado pelo Git).

## Workflow follow-up

- Arquivar a mudança com `openspec archive remover-provedor-raflix --yes` e confirmar a remoção de `openspec/specs/raflix-provider/spec.md`.
- Verificar o resultado arquivado em `openspec/changes/archive/2026-11-12-remover-provedor-raflix/`.
