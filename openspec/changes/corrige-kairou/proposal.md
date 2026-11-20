# Proposal

## Why

A rodada de 20/11/2026 falhou nos dez títulos do Kairou com HTTP 404 porque a rota GET de extração foi removida. A interface pública atual do site usa `POST /api/extract` com corpo JSON; a chamada síncrona devolve streams e mídia reproduzível sem conta, chave ou contorno.

## What Changes

1. Substituir a consulta GET removida por `POST /api/extract` com `target`, título, título original e marcação de anime.
2. Adaptar o envelope e os campos da resposta atual, preservando a distinção entre falha e ausência e o descarte de 4K.
3. Cobrir regressões offline com fixtures sanitizadas e revalidar o pacote final online.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

1. `kairou-provider`: consultar interface pública comprovada em vez da rota específica indisponível, sem presumir seu contrato.

## Impact

1. Alterações em `src/kairou/`, testes, fixtures, pacotes gerados, `providers.md` e `docs/provider-investigation.md`.
2. Nenhuma dependência ou mecanismo de acesso novo foi adicionado.
