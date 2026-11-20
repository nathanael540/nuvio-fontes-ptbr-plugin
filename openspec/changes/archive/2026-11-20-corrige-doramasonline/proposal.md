# Proposal

## Why

A rodada de 20/11/2026 classificou o Doramas Online como Parcial: filmes 0/5, séries 3/5 e uma falha. A investigação separou os casos e mostrou que não houve regressão do provedor: três dos seis casos vazios existem na fonte com título decorado no formato `Título original (Título PT-BR)` e são rejeitados pelo limiar de semelhança; três não estão no acervo; a falha de Itaewon é o player interno quebrado na própria fonte. A correção sustentada é reconhecer o formato decorado sem afrouxar ano, tipo ou limiar.

## What Changes

1. Registrar o diagnóstico da rodada `prism/all/all/all` e do artefato `test/artifacts/online/2026-11-20T13-20-58-691Z-doramasonline-20261120-8b7d/result.json`, confrontando-o com o código, os testes e a spec local.
2. Alterar `src/doramasonline/catalog.js` para pontuar variantes do título do cartão e da ficha: o título completo, cada segmento entre parênteses e o título sem os parênteses. O limiar de 0,85, o tipo de caminho e a igualdade de ano continuam obrigatórios.
3. Adicionar fixtures reais sanitizadas e testes Node para `Round 6 (Squid Game)`, `Wall to Wall (Meus 84 m²)` e `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)`, incluindo um caso de ano divergente na variante decorada e a preservação da rejeição de `The Glory` por ano.
4. Manter intactos os players, o isolamento de opções, o contrato dos streams, o manifest, o status e `providers.md`.
5. Revalidar online com `prism/all/all/all` e critérios explícitos: `Se Esse Amor Desaparecesse Hoje` e `Round 6` resolvidos; `Meus 84 m²` segue vazio porque só publica `png.strp2p.com`, em manutenção; `Ditto`, `The Fable` e `A Vilã` seguem ausentes; Itaewon segue falha externa.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `doramasonline-provider`: a confirmação de identidade passa a considerar o formato `Título original (Título PT-BR)` e `Título PT-BR (Título original)`, preservando ano, tipo e limiar de semelhança.

## Impact

1. `src/doramasonline/catalog.js`, `test/doramasonline.test.js` e `test/fixtures/doramasonline/`.
2. `providers/doramasonline.js`, `gdrive/providers/doramasonline.js`, `prism/providers/doramasonline.js` e manifests gerados ao publicar; esta change não executa o build compartilhado.
3. Nenhuma mudança em `src/_blocks/`, `src/manifest.json`, `providers.md`, status ou players.
