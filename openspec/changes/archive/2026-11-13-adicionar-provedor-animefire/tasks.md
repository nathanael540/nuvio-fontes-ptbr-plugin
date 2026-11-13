# Tasks

## 1. Catálogo e confirmação de identidade

- [x] 1.1 Criar `src/animefire/api.js` com a leitura de `GET /animes/pesquisar`, `/anime/<id>` e `/episode/<id>` via `fetchJson`, validando `data`, `meta.last_page`, `titles`, `format` e `episodes`; verificar com `node build.js animefire` e com testes que rejeitam JSON fora do esquema.
- [x] 1.2 Registrar fixtures reais sanitizadas em `test/fixtures/animefire/` para busca com resultado exato, busca sem resultado, busca em página posterior, ficha de série, ficha de filme, ficha de tipo conflitante, episódio com dublado e legendado, episódio com opção offline, episódio com URL ausente e estrutura inválida; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [x] 1.3 Implementar em `src/animefire/extractor.js` a busca por título PT-BR, original e alternativos, a paginação e o `findBestMatch` com ano; aceitar somente ficha cujo `format` corresponda ao tipo pedido; verificar com `node --test test/animefire.test.js` os casos de título ausente, resultado exato em página posterior, tipo conflitante e ausência de chave do TMDB.
- [x] 1.4 Implementar a validação de `season`/`episode`, a seleção por `season`/`number` e a escolha da entrada única de filme, devolvendo lista vazia para temporada ou episódio ausente; verificar com testes de série, filme, temporada não publicada e filme sem entrada.
- [x] 1.5 Criar `src/animefire/index.js` com o nome `AnimeFire`, captura única de erros, log `[AnimeFire]` e `sortByQuality`; verificar que o pacote exporta `getStreams` e que uma falha de busca termina em lista vazia com o log esperado.

## 2. Resolução da mídia e contrato dos streams

- [x] 2.1 Resolver `data.streams` como opções independentes: descartar `is_offline`, tratar URL ausente como falha isolada, usar `Promise.all` sobre resultados já convertidos e lançar erro com as causas quando nenhuma opção produzir stream; verificar com testes de uma opção falhando, todas falhando e todas offline.
- [x] 2.2 Montar cada stream com `buildStream`, `type: 'hls'`, `provider: 'AnimeFire'`, `language` de `dublado`/`legendado`, `headers` de reprodução e `format` com título, ano, temporada, episódio e `message: 'Reprodução adaptativa'`; verificar os campos `name`, `title`, `quality`, `language` e `headers` nos formatos publicados.
- [x] 2.3 Calcular a maior qualidade de `qualities` sem baixar a playlist, omitindo o campo quando não houver resolução reconhecível; verificar com testes de `480p,720p,1080p`, `720p-x264` e lista vazia.
- [x] 2.4 Cobrir a ausência reconhecida e os erros de estrutura de `getStreams` em `test/animefire.test.js`, incluindo busca não-2xx, JSON inválido, `streams` ausente e filme com mais de uma entrada; verificar com `node --test test/animefire.test.js`.

## 3. Build, manifest e publicação

- [x] 3.1 Adicionar a entrada `animefire` ao `manifest.json` com nome `AnimeFire`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formato `m3u8`, idioma `pt` e logo HTTPS; verificar com `node -e` que os campos obrigatórios e o `filename` estão corretos e com `node build.js animefire`.
- [x] 3.2 Conferir os arquivos gerados `providers/animefire.js`, `gdrive/providers/animefire.js`, `prism/providers/animefire.js` e os `<formato>/manifest.json`; verificar que o build termina sem erro e que os três arquivos exportam `getStreams`.
- [x] 3.3 Adicionar o perfil `animefire` com `exclusiveTag: "anime"` em `test/online/profiles.json`, atualizando `revision` e `curatedAt`; verificar com `node --test test/online-catalog.test.js` e com a validação de perfis.
- [x] 3.4 Adicionar a linha e a seção `## AnimeFire` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.

## 4. Documentação do método

- [x] 4.1 Atualizar `docs/provider-investigation.md` com o método “API pública de catálogo de SPA”, registrando a descoberta do `apiUrl` no bundle, os caminhos de busca/ficha/episódio, a paginação, a confirmação de tipo e os limites de retenção; verificar que a seção cita `src/animefire/`, os testes e a spec.
- [x] 4.2 Rodar `npm run lint` e `npm test` e corrigir qualquer falha de estilo, JSDoc, fixture ou contrato introduzida pelos grupos anteriores; verificar que a suíte completa termina sem falhas.

## 5. Verificação online

- [x] 5.1 Executar `npm run test:online -- --provider animefire` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar o relatório em `test/artifacts/online/` e registrar a rodada em `providers.md` conforme `docs/tests.md`.
- [x] 5.2 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar os limites de retenção de mídia observados; verificar com `node --test test/providers-catalog.test.js` e com a leitura do bloco final.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/animefire-provider/spec.md`.
