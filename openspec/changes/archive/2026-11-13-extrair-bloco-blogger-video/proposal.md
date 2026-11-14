# Proposal

## Why

O AniTube já extrai os MP4 progressivos de `streamingData.formats` do HTML do Blogger em `src/anitube/players.js`. O AnimeQ e o Animes Online Blue precisam da mesma extração: o primeiro para o iframe do Blogger por episódio e o segundo para o `playerUrl` do Blogger devolvido pela API de episódio. Copiar a função nos dois provedores criaria três implementações divergentes do mesmo contrato e contrariaria a regra de blocos do repositório.

A extração é local, sem rede, sem cheerio e sem APIs do Node: recebe o HTML do player e devolve os formatos progressivos com URL e rótulo de qualidade. O comportamento observado no AniTube é a referência; a mudança apenas o move para um bloco testado e faz o AniTube consumi-lo.

## What Changes

1. Criar `src/_blocks/blogger-video/index.mjs` com `extractBloggerFormats(html)` e auxiliares privados, movendo a implementação de `src/anitube/players.js`.
2. Criar `test/blocks/blogger-video/index.test.mjs` com casos controlados e sem rede: `streamingData` em string escapada, em objeto, com entidades HTML, sem `formats`, JSON inválido, sem MP4 e com URL fora de HTTP(S).
3. Refatorar `src/anitube/players.js` para importar `extractBloggerFormats` do bloco e remover apenas as funções movidas; `sanitizeMessage`, `readBloggerIframe`, `readFhdSource` e a resolução dos players continuam no provedor.
4. Atualizar `src/_blocks/index.md` com a linha do `blogger-video` (para que serve, quando usar, dependências e consumidores).
5. Reconstruir o AniTube (`node build.js anitube`) e confirmar que o pacote publicado e os testes do provedor continuam iguais.
6. Não criar provedor, não alterar `manifest.json` e não executar verificação online: o bloco é infraestrutura coberta por teste unitário e pela suíte do AniTube.

## Capabilities

### New Capabilities

- `blogger-video`: extração local dos MP4 progressivos publicados em `streamingData.formats` no HTML do player do Blogger.

### Modified Capabilities

Nenhuma. O comportamento do AniTube é preservado; a mudança só move código para um bloco.

## Impact

1. Código: `src/_blocks/blogger-video/index.mjs` (novo), `src/anitube/players.js` (importa o bloco) e `src/_blocks/index.md`.
2. Saída gerada: `providers/anitube.js`, `gdrive/providers/anitube.js` e `prism/providers/anitube.js`, somente pelo build.
3. Testes: `test/blocks/blogger-video/index.test.mjs` (novo) e `test/anitube.test.js` (reexecução sem mudança de expectativa).
4. Sem alteração de manifest, versão de provedor, dependência, serviço externo ou contrato do app.
5. Consumidores previstos: `src/anitube/players.js`, `src/animeq/` e `src/animesonlineblue/` (as duas últimas em suas próprias changes).
