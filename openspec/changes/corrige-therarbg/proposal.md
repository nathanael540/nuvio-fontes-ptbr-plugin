# Proposal

## Why

A rodada online de 20/11/2026 não encontrou streams utilizáveis em dez pedidos e registrou dois erros HTTP 404. A evidência sanitizada não identifica o serviço responsável nem explica os oito resultados vazios, portanto não comprova uma correção específica.

## What Changes

1. Investigar os pedidos afetados e distinguir ausência comprovada de falha técnica antes de alterar o provedor.
2. Corrigir somente divergências demonstradas por respostas públicas, preservando as verificações de identidade, idioma e arquivo.
3. Acrescentar regressões offline e revalidar o pacote online; manter o bloqueio se não houver solução comprovada.

## Capabilities

### New Capabilities

1. `therarbg-provider`: resolução de torrents com identidade e faixas verificadas, distinguindo ausência de falha.

### Modified Capabilities

1. Nenhuma.

## Impact

1. Potencialmente `src/therarbg/`, `test/therarbg.test.js`, fixtures, pacotes gerados e `providers.md`.
2. A validação depende das interfaces públicas do TMDB, TheRARBG, Verifile e, para pacotes, do cache de torrents.
