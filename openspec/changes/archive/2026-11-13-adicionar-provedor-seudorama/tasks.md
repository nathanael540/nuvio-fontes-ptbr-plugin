# Tasks

## 1. Fixtures e API

- [x] 1.1 Criar fixtures reais sanitizadas em `test/fixtures/seudorama/` para: API `success: true` com `videoUrl` fictício de `blogger.com`, API `success: false`, API HTTP 500, JSON inválido, Blogger com `itag` 18/22, Blogger com `sabr` sem `itag`, Blogger sem URL, Blogger com URL duplicada e Blogger com `itag` 37; usar `https://rr1---sn-example.googlevideo.com/videoplayback?itag=22` como placeholder e conferir que nenhuma URL assinada, IP ou token ficou no repositório.
- [x] 1.2 Implementar em `src/seudorama/api.js` a validação de `tv`, a normalização de temporada/episódio, a URL com `URLSearchParams` e a consulta com `fetchJson`, `User-Agent` e `Accept`; verificar com testes de S01E01, S02E01, `success: false`, filme sem `fetch`, HTTP 500 e JSON inválido.
- [x] 1.3 Implementar a leitura de `success`/`videoUrl`, a exigência de host `blogger.com` e a distinção entre ausência reconhecida e erro de estrutura; verificar com testes de `videoUrl` ausente, host diferente e `success` não booleano.

## 2. Blogger e extração

- [x] 2.1 Implementar em `src/seudorama/blogger.js` o desescape na ordem `\uXXXX` → `\/` → `&quot;` → `&amp;` e a extração de URLs `googlevideo.com/videoplayback` até o delimitador; verificar com testes de HTML com `itag` 18/22, `sabr` sem `itag`, URL sem `itag`, URL duplicada e entidade `&amp;` no meio da query.
- [x] 2.2 Implementar o mapa `itag` 18/43 → 360p, 22 → 720p, 37 → 1080p, a deduplicação por URL e a ordenação por qualidade; verificar com testes de duas qualidades, `itag` 37, `itag` desconhecido e URL repetida.
- [x] 2.3 Garantir que nenhuma URL extraída seja logada, cacheada ou escrita em fixture; verificar que o `console.warn`/`console.error` não recebe a URL do Google Video.

## 3. Streams e contrato

- [x] 3.1 Montar cada stream com `buildStream`, `type: 'mp4'`, `provider: 'SeuDorama'`, `quality` pelo `itag`, `headers: { 'User-Agent': <mesmo UA> }`, `language: LANGUAGE.UNKNOWN` e `format` com título, ano, temporada e episódio; verificar nos três templates os campos `name`, `title`, `quality`, `language` e `headers`.
- [x] 3.2 Garantir que o stream não tenha `name`, `title`, `size` ou `subtitles` sem dados da fonte; verificar com teste de página sem legenda e sem tamanho.
- [x] 3.3 Criar `src/seudorama/index.js` com validação de entrada, log `[SeuDorama]`, captura única de erros e `sortByQuality`; verificar com `node --test test/seudorama.test.js` e com o pacote exportando `getStreams`.

## 4. Manifest, verificação online e documentação

- [x] 4.1 Adicionar a entrada `seudorama` ao `manifest.json` com nome `SeuDorama`, versão `1.0.0`, autor `nathanael540`, tipos `["tv"]`, formatos `["mp4"]`, `contentLanguage` `["pt"]` e logo `https://www.google.com/s2/favicons?domain=meusdoramas.club&sz=128`; verificar com `node build.js seudorama`.
- [x] 4.2 Adicionar `"seudorama": { "exclusiveTag": "dorama" }` em `test/online/profiles.json` e atualizar `revision`/`curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [x] 4.3 Adicionar a linha e a seção `## SeuDorama` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [x] 4.4 Atualizar `docs/provider-investigation.md` com “API por TMDB com página Blogger e MP4 do Google Video”, citando `src/seudorama/`, os testes e a spec; registrar o desescape, o `itag`, o descarte de `sabr` e a exigência de `User-Agent`.

## 5. Integração e evidência online

- [x] 5.1 Rodar `npm run lint`, `npm test` e `node build.js seudorama`; verificar que não há falha e que os arquivos gerados foram atualizados.
- [x] 5.2 Executar `npm run test:online -- --provider seudorama` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md`.
- [x] 5.3 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar no design a limitação de idioma desconhecido se ela persistir; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/seudorama-provider/spec.md`.
