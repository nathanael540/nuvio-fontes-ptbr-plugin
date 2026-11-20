# Proposal

## Why

A rodada de 20/11/2026 classificou o AniTube como Instável, sem streams utilizáveis em cinco filmes e cinco séries. Rejeições em `api.anivideo.net` e respostas HTTP 403 no Player 1 não demonstram uma correção.

## What Changes

1. Investigar a estrutura pública das opções e identificar mídia utilizável sem contornar controles de acesso.
2. Somente após comprovar solução compatível, adaptar a resolução e acrescentar regressões com fixtures reais sanitizadas.
3. Revalidar o pacote final online; sem solução comprovada, manter a mudança bloqueada e registrar próximos passos verificáveis.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

1. `anitube-provider`: reconhecer opção adicional de mídia comprovada, preservando o isolamento dos players.

## Impact

1. Alterações em `src/anitube/players.js`, testes, fixtures, pacotes gerados, `providers.md` e `docs/provider-investigation.md`.
2. Não se propõem dependências, credenciais ou bypass. A implementação foi desbloqueada pela evidência de 2026-11-20: a fonte exige apenas o contexto público de iframe, sem conta, chave, cookie ou serviço de bypass.
