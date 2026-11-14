# Tasks

## 1. Busca e identidade

- [x] 1.1 Criar `src/anibunker/search.js` com `POST /php/search.php` (`form: { query }`, perfil `api`), leitura do corpo JSON mesmo com `text/html`, validação de lista e extração de `name`/`url`; verificar com `node --test test/anibunker.test.js` os casos de resultado, lista vazia e JSON inválido.
- [x] 1.2 Registrar fixtures reais sanitizadas em `test/fixtures/anibunker/` para busca com resultado, busca vazia, página de série com duas faixas, página de filme e JSON inválido; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [x] 1.3 Implementar em `src/anibunker/extractor.js` a lista de consultas (título PT-BR, original, alternativos e romaji), o uso de `findBestMatch`/`titleSimilarity` e a confirmação por `h1`, ano, `Formato` e temporada; verificar com testes de filme, série, temporada posterior, resultado ambíguo e ausência de chave do TMDB.
- [x] 1.4 Implementar a recusa de `mediaType` inválido e a validação de temporada/episódio; verificar que `movie` não faz requisição e que série sem coordenadas válidas falha antes da rede.

## 2. Episódio e áudio

- [x] 2.1 Ler a contagem `N legendado e M dublado` da página do anime e montar as URLs `<slug>-episodio-<n>-<audio>` para as faixas viáveis; verificar com testes de duas faixas, uma faixa e contagem insuficiente para o episódio.
- [x] 2.2 Implementar a seleção de filme como `episode = 1` e a de série pelo número pedido; verificar com testes de filme dublado, filme legendado, série S01E01 e episódio inexistente.
- [x] 2.3 Tratar HTTP 404 de faixa como ausência e página 2xx sem `data-video-id`/players como falha da opção, com aviso; verificar com testes de faixa ausente, página sem players e ambas as faixas falhando.

## 3. Players e mídia

- [x] 3.1 Implementar a leitura de `data-video-id`/`data-player-id` e a chamada `POST /php/loader.php` com `player_id` e `video_id`, exigindo `success:true` e `url`; verificar com fixtures de sucesso, `success:false` e JSON inválido.
- [x] 3.2 Resolver `token` com prefixo `AD6v5d`, extrair `streamingData.formats` do HTML do Blogger, desescapar as URLs e mapear itags 18/22/37/59; verificar com fixtures de itags 18 e 22, itag desconhecido e página sem `streamingData`.
- [x] 3.3 Resolver `url_drive` como MP4 direto, `url_hd*` como MP4/HLS pelo caminho, `sendvid` pelo `<source type="video/mp4">` e descartar `url_mega`; verificar com testes de cada player, embed sem `<source>` e player desconhecido.
- [x] 3.4 Isolar cada player com `console.warn('[AniBunker] ...')` e lançar erro agregado quando todos falharem; verificar com testes de um player falhando e de todos falhando.

## 4. Streams e entrada

- [x] 4.1 Montar cada stream com `buildStream`, `format` (`FORMATTER.AUTO`, `addon: 'AniBunker'`, título, ano, temporada, episódio), `provider`, `type`, `language`, `qualityHints` e `headers` do Blogger; verificar os campos `name`, `title`, `quality`, `language` e `headers` nos formatos publicados.
- [x] 4.2 Criar `src/anibunker/index.js` com o nome `AniBunker`, captura única de erros, log `[AniBunker]` e `sortByQuality`; verificar que o pacote exporta `getStreams` e que uma falha de busca termina em `[]` com o log esperado.
- [x] 4.3 Cobrir deduplicação por URL, stream de qualidade desconhecida e ausência total de mídia; verificar com testes de URLs repetidas, Drive sem resolução e lista vazia.

## 5. Build, manifest e documentação

- [x] 5.1 Adicionar a entrada `anibunker` ao `manifest.json` com nome `AniBunker`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `pt` e logo HTTPS; verificar com `node build.js anibunker` e com `node --test test/manifest.test.js`.
- [x] 5.2 Conferir `providers/anibunker.js`, `gdrive/providers/anibunker.js`, `prism/providers/anibunker.js` e os `<formato>/manifest.json`; verificar que o build termina sem erro e que os três arquivos exportam `getStreams`.
- [x] 5.3 Adicionar o perfil `anibunker` com `exclusiveTag: "anime"` em `test/online/profiles.json`, atualizando `revision` e `curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [x] 5.4 Adicionar a linha e a seção `## AniBunker` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [x] 5.5 Atualizar `docs/provider-investigation.md` com o método “busca PHP + carregador de players + token do Blogger”, citando `src/anibunker/`, os testes e a spec; verificar que a seção descreve os limites observados e os paths usados.

## 6. Verificação final

- [x] 6.1 Rodar `npm run lint`, `npm test` e `node build.js anibunker`; verificar que a suíte completa e o build terminam sem falhas.
- [x] 6.2 Executar `npm run test:online -- --provider anibunker` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md`.
- [x] 6.3 Ajustar o status de `providers.md` conforme `docs/tests.md` e registrar os limites de temporadas divididas e players externos; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/anibunker-provider/spec.md`.
