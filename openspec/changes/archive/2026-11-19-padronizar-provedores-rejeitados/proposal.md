# Proposal

## Why

Investigações descartadas ou provedores removidos ficam dispersos no histórico do Git ou em changes arquivadas, dificultando saber o que já foi testado, quando foi rejeitado e por qual motivo. Sem um registro padronizado, agentes e contribuidores repetem análises em fontes já descartadas pelos mesmos bloqueios.

## What Changes

1. Definir regras de padronização e manutenção para o registro de provedores investigados e rejeitados em `AGENTS.md`, `docs/provider-investigation.md`, `docs/tests.md` e `README.md`.
2. Criar o catálogo versionado `rejected-providers.md` na raiz do repositório, espelhando a organização de `providers.md`, com tabela resumo e uma seção estruturada por provedor contendo data (`AAAA-MM-DD`), categoria, domínios investigados, motivo, evidência e critério de reavaliação.
3. Registrar no documento inicial os itens descartados já evidenciados no histórico do repositório (`TorrentFilmesX` e `Raflix`).
4. Adicionar uma suíte offline em `test/rejected-providers.test.js` para validar formato, campos obrigatórios, unicidade, ausência de conflito com `manifest.json` e ausência de dados sensíveis em `rejected-providers.md`.

## Capabilities

### New Capabilities

1. `rejected-providers-registry`: formato padronizado, regras de atualização, restrições de sanitização e validação automática do catálogo de provedores investigados e rejeitados.

### Modified Capabilities

Nenhuma.

## Impact

1. Documentação: novos artefatos `rejected-providers.md`, atualização de `AGENTS.md`, `docs/provider-investigation.md`, `docs/tests.md` e `README.md`.
2. Testes: nova suíte offline `test/rejected-providers.test.js` executada junto com `npm test`.
3. Código de provedores e manifests: nenhuma alteração em `src/`, `manifest.json`, `build.js` ou pacotes gerados.
