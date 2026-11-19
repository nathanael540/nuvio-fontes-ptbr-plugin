# Proposal

## Why

A fonte `animetr.co` foi sugerida como novo provedor, mas a investigação de 19/11/2026 mostrou que ela publica anime e donghua apenas com legendas e dublagem em turco, fora do escopo PT-BR do repositório. Sem o registro padronizado, a mesma fonte tende a ser reavaliada por outros contribuidores e agentes, repetindo o mesmo descarte.

## What Changes

1. Registrar `animetr.co` em `rejected-providers.md` na categoria `Escopo ou duplicidade`, com data `2026-11-19`, domínios investigados, motivo, evidência e critério de reavaliação.
2. Adicionar a linha correspondente à tabela resumo e a seção `## AnimeTR` com os seis campos obrigatórios.
3. Não criar provedor, não alterar `manifest.json`, `providers.md`, `src/`, `build.js` ou pacotes gerados.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `rejected-providers-registry`: acrescenta o registro do AnimeTR como fonte rejeitada por escopo, mantendo as regras de estrutura, categorias, sanitização e separação do manifest.

## Impact

1. Documentação: `rejected-providers.md` (tabela resumo e nova seção).
2. Specs: delta da capability `rejected-providers-registry`.
3. Testes: `test/rejected-providers.test.js` já valida formato, categoria, campos obrigatórios, conflito com `manifest.json` e sanitização; nenhuma alteração de código de teste é necessária.
4. Código de provedores, manifests e pacotes gerados: sem alteração.
