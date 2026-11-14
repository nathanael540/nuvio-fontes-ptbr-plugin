# Tasks

## 1. Bloco

- [x] 1.1 Criar `src/_blocks/blogger-video/index.mjs` com `extractBloggerFormats(html)` e helpers privados, movendo a implementação de `src/anitube/players.js`; JSDoc completo com `@param`, `@returns`, `@throws` e `@example`. Verificação: o arquivo importa sem erro e exporta somente `extractBloggerFormats`.
- [x] 1.2 Implementar a leitura das duas formas de `streamingData` (string escapada e objeto JSON), a decodificação de entidades HTML e a triagem de URL HTTP(S), preservando as mensagens de erro atuais. Verificação: os casos da spec passam em teste controlado.
- [x] 1.3 Garantir que o bloco não importa `cheerio`, `http`, módulos de provedor nem APIs do Node. Verificação: `npm run lint` passa e uma inspeção do arquivo não encontra `require`/`import` externo.

## 2. Testes do bloco

- [x] 2.1 Criar `test/blocks/blogger-video/index.test.mjs` com HTML controlado e sem rede para string escapada, objeto JSON, entidades HTML, `qualityLabel` ausente, URL fora de HTTP(S), `formats` ausente, JSON inválido e lista sem MP4. Verificação: `node --test test/blocks/blogger-video/index.test.mjs` passa.
- [x] 2.2 Cobrir a ordem dos formatos e a preservação da causa no erro de JSON inválido. Verificação: as asserções conferem a ordem e `error.cause`.

## 3. Refactor do AniTube

- [x] 3.1 Em `src/anitube/players.js`, importar `extractBloggerFormats` do bloco e remover as funções movidas (`readStreamingData`, `findStringEnd`, `findObjectEnd`, `decodeHtmlEntities` e o helper de URL usado só pela extração), mantendo `resolvePlayers`, `resolveFhd`, `resolvePlayer1`, `readBloggerIframe`, `readFhdSource`, `readFhdUrl`, `collectPlayers` e `sanitizeMessage`. Verificação: `node --test test/anitube.test.js` passa sem edição de expectativa.
- [x] 3.2 Confirmar que o `sanitizeMessage` continua no provedor e que o bloco não o importa. Verificação: inspeção dos imports e execução da suíte do AniTube.

## 4. Catálogo, build e validação

- [x] 4.1 Adicionar a linha `blogger-video` em `src/_blocks/index.md` com a finalidade, quando usar, dependências e consumidores (`anitube`, `animeq`, `animesonlineblue`). Verificação: `node --test test/blocks-catalog.test.js` passa.
- [x] 4.2 Rodar `node build.js anitube` e conferir `providers/anitube.js`, `gdrive/providers/anitube.js`, `prism/providers/anitube.js` e os manifests de formato. Verificação: o build termina com código 0 e cada pacote exporta `getStreams`.
- [x] 4.3 Rodar `npm run lint` e as suítes `test/blocks/blogger-video/index.test.mjs`, `test/anitube.test.js` e `test/blocks-catalog.test.js`. Verificação: todos terminam com código 0.
- [x] 4.4 Conferir que nenhum provedor, manifest ou versão de provedor foi alterado além do rebuild do AniTube. Verificação: `git diff --stat` mostra somente o bloco, o catálogo, o AniTube e as saídas geradas.

## 5. Workflow follow-up

- [x] 5.1 Arquivar a mudança depois da revisão e dos testes; a spec arquivada fica em `openspec/specs/blogger-video/spec.md`.
