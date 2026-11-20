# Proposal

## Why

A rodada `prism/all/all/all` de 20/11/2026 classificou o DooPlay PT-BR como Parcial (`movie 3/5`, `tv 0/5`). A investigação reproduziu um defeito no provedor: a expansão das opções usa a origem configurada, mas as fichas redirecionam para outro domínio; o `POST` no host antigo responde HTTP 400 e o título disponível é perdido. A correção recupera três dos sete casos negativos com conteúdo comprovado, sem alterar os positivos.

## What Changes

1. Expandir as opções DooPlay (REST e AJAX) na origem final da ficha confirmada, não na origem configurada; o `Referer` e o formulário continuam os mesmos.
2. Remover `hypetvflix.one` das origens ativas, porque a home e a busca responderam HTTP 404 em 20/11/2026; manter as origens que redirecionam e a origem bloqueada por Cloudflare como falha externa, sem bypass.
3. Acrescentar testes offline de regressão para expansão após redirect, ausência de redirect, falha isolada e preservação dos filmes e episódios que já funcionam.
4. Registrar no `design.md` a evidência pontual, os limites (cadeia compartilhada do plenoflu, player `embedplayabyss.top` e layout de série do `startrekfilms.net`) e os critérios de revalidação online.
5. Atualizar `docs/provider-investigation.md` com a variação de expansão no domínio final e reconstruir o pacote na implementação.

## Capabilities

### New Capabilities

- `dooplay-provider`: busca e confirmação nas origens DooPlay, seleção de episódio, expansão das opções no domínio final da ficha, distinção entre ausência e falha externa e preservação do contrato de stream.

### Modified Capabilities

Nenhuma. O provedor não tinha spec própria; o comportamento atual passa a ser descrito pela capability nova, com a correção incorporada.

## Impact

1. Código: `src/dooplay/players.js`, `src/dooplay/sources.js` e pacotes gerados; sem bump de versão, porque a identidade online inclui o hash do pacote.
2. Testes: `test/dooplay.test.js` e a expectativa da lista de origens; sem dependência nova.
3. Documentação: `docs/provider-investigation.md`; `providers.md` só muda com uma rodada oficial registrada, depois da implementação.
4. Sem mudança de contrato, de status nesta proposta ou de origem de mídia; o status continua Parcial até a revalidação online.
