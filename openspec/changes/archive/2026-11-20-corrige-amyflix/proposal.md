# Proposal

## Why

A rodada generalista de 20/11/2026 classificou AmyFlix como Instável, mas não demonstrou defeito no provedor nem exercício do acervo GL. O diagnóstico direcionado confirmou que o acervo existe, que o caminho de série funciona e que o embed Rumble deixou de ser JSON estrito: a página publica `loaded:v()` e a qualidade em `ua.tar`, então o provedor descarta a única opção suportada de alguns títulos.

## What Changes

1. Elaborar um catálogo de filmes e séries GL (Girls’ Love) da AmyFlix para diagnóstico, mesmo se nenhum defeito for reproduzido; não é uma seção de navegação no Nuvio.
2. Selecionar do catálogo amostras verificadas de filme e série para investigar se o pacote resolve os títulos e em que etapa eventual divergência ocorre.
3. Corrigir o defeito reproduzido no embed Rumble: aceitar a propriedade JavaScript `loaded:<função>()` ao ler `p.f["<id>"]` e ler a qualidade em `ua.tar`.
4. Acrescentar fixture real sanitizada e teste que falha antes da correção e passa depois, sem alterar o contrato dos streams.
5. Distinguir diagnóstico direcionado da rodada oficial `prism/all/all/all`, sujeita ao perfil e aos critérios vigentes.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

`amyflix-catalog`: a resolução de `rumble.com/embed/<id>` passa a tolerar a propriedade JavaScript `loaded:<função>()` e a ler a qualidade em `ua.tar`, conforme a resposta observada da fonte.

## Impact

1. Código: `src/amyflix/embeds.js` e versão do provedor em `src/manifest.json`.
2. Testes: `test/amyflix.test.js` e `test/fixtures/amyflix/rumble-embed.html`.
3. Catálogo e diagnóstico: `openspec/changes/corrige-amyflix/catalog.md` e `design.md`.
4. Evidência oficial: `providers.md` e relatório online; o diagnóstico direcionado não substitui a rodada oficial nem promove status.
5. Sem nova dependência ou alteração do contrato público dos streams.
