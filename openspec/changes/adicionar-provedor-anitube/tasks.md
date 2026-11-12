# Tasks

## 1. Metadados do TMDB para busca

- [ ] 1.1 Acrescentar `romajiTitles` (`{ title, season }`, filtrado por `type` com `romaji`/`romanized`) e `seasons` (`{ number, name, year, episodeCount }`) ao `MediaInfo` em `src/_blocks/tmdb-info/index.mjs`, sem requisição adicional ao TMDB; atualizar o JSDoc e verificar com `node --test test/blocks/tmdb-info/index.test.mjs`.
- [ ] 1.2 Atualizar os fixtures e as asserções do teste do bloco para cobrir romaji simples, `Season 2 Romaji`, `romanized`, temporada ausente e filme sem `seasons`; verificar os casos novos com `node --test test/blocks/tmdb-info/index.test.mjs`.
- [ ] 1.3 Atualizar a linha do `tmdb-info` em `src/_blocks/index.md` para o novo contrato; verificar com `node --test test/blocks-catalog.test.js`.
- [ ] 1.4 Rodar `npm test` depois da mudança do bloco e confirmar que os provedores consumidores do `tmdb-info` continuam passando sem alteração de comportamento.

## 2. Busca, títulos e confirmação de identidade

- [ ] 2.1 Criar `src/anitube/search.js` com a montagem das variantes de consulta (títulos do TMDB, romaji por temporada, sufixos numéricos, ordinais, temporada e romano), a limpeza das decorações do cartão e a leitura de temporada; verificar os casos puros em testes unitários no `test/anitube.test.js`.
- [ ] 2.2 Implementar a confirmação de identidade por título completo, alias entre parênteses, tipo filme/série, marcador de temporada e ano da ficha com tolerância de 1 ano; verificar com testes de `One Piece: Heroines` descartado, temporada 3 descartada em pedido de temporada 2 e ficha de ano conflitante descartada.
- [ ] 2.3 Adicionar fixtures reais sanitizadas de busca em `test/fixtures/anitube/` para `Shingeki no Kyojin`, `Kimetsu no Yaiba: Mugen Ressha-hen`, `Jujutsu Kaisen 2` e uma busca sem resultado; verificar a seleção de candidatos com `node --test test/anitube.test.js`.
- [ ] 2.4 Registrar em `docs/provider-investigation.md` o método de títulos romaji e temporada do TMDB, com referência ao código e aos testes e o limite de cobertura; conferir os caminhos citados no arquivo.

## 3. Fichas, episódios, filmes e players

- [ ] 3.1 Criar `src/anitube/pages.js` para reconhecer ficha de série, página agregadora de filme e ficha direta de filme; selecionar episódio pelo número declarado e entradas de filme pelo título; verificar os casos em testes com fixtures.
- [ ] 3.2 Criar `src/anitube/players.js` com o adaptador HLS do player FHD (parâmetro `d`, `sources.file` e rótulo) e o adaptador do Player 1 (redirecionamento para `api.anivideo.net`, iframe do Blogger e `streamingData.formats`); verificar a leitura de `720p HD`, `360p` e `720p` em fixtures.
- [ ] 3.3 Implementar a execução isolada das opções com `Promise.all` sobre promessas convertidas, aviso `[AniTube] Opção <rótulo> descartada: <causa>` e erro final somente quando nenhuma opção produzir stream; verificar com uma ficha de dois players, uma com falha isolada e uma sem player.
- [ ] 3.4 Adicionar fixtures de ficha de série, episódio com player FHD, episódio só com Player 1, filme agregado e filme direto; verificar a seleção e a resolução com `node --test test/anitube.test.js`.
- [ ] 3.5 Registrar em `docs/provider-investigation.md` os dois players e o limite dos segmentos HLS com extensão `.webp`, com referência ao código e aos testes; conferir os caminhos citados.

## 4. Extração e streams do provedor

- [ ] 4.1 Criar `src/anitube/extractor.js` para orquestrar a leitura do pedido, a obtenção do `MediaInfo`, a busca e confirmação, a seleção de episódio ou filme e a resolução das opções; verificar o fluxo completo com o pacote gerado.
- [ ] 4.2 Criar `src/anitube/index.js` com `PROVIDER_NAME = 'AniTube'`, captura única em `getStreams`, log `[AniTube]` e ordenação por qualidade; verificar que o pacote exporta `getStreams`.
- [ ] 4.3 Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` AniTube, título, ano, temporada e episódio), qualidade pelo rótulo do player, idioma pelo rótulo da fonte, `provider` pelo player e `type` pelo formato; verificar os campos em testes de filme dublado, episódio legendado e qualidade desconhecida.
- [ ] 4.4 Cobrir no `test/anitube.test.js` os casos de filme, episódio avulso, temporada posterior, episódio só com Player 1, filme agregado com dublado e legendado, ausência de título, ausência de episódio, spin-off e falha isolada de player; verificar todos com `node --test test/anitube.test.js`.

## 5. Manifesto, catálogo, perfil e build

- [ ] 5.1 Adicionar a entrada `anitube` ao `manifest.json` (versão `1.0.0`, `movie` e `tv`, `m3u8` e `mp4`, `contentLanguage` `pt`, favicon HTTPS e `filename` `providers/anitube.js`); verificar com `node --test test/manifest.test.js`.
- [ ] 5.2 Adicionar a linha e a seção do AniTube em `providers.md` com `🟠 Não verificado` e `—` na última verificação, sem bloco de rodada; verificar com `node --test test/providers-catalog.test.js`.
- [ ] 5.3 Adicionar `anitube: { exclusiveTag: "anime" }` em `test/online/profiles.json`, atualizar `revision` e `curatedAt`, e confirmar os cinco filmes e as seis séries elegíveis; verificar com `node --test test/online-catalog.test.js`.
- [ ] 5.4 Rodar `node build.js anitube` e confirmar a geração de `providers/anitube.js`, `gdrive/providers/anitube.js`, `prism/providers/anitube.js` e dos `<formato>/manifest.json`; verificar com `node --test test/build.test.js`.

## 6. Verificação integrada e evidência online

- [ ] 6.1 Rodar `npm run lint`, `npm test` e `node build.js anitube` com todos os casos de desenvolvimento passando; corrigir qualquer regressão antes de prosseguir.
- [ ] 6.2 Executar `npm run test:online -- --provider anitube` com `TMDB_API_KEY` apenas no ambiente, usando o perfil `anime`; registrar a última rodada em `providers.md` e ajustar o status conforme a evidência.
- [ ] 6.3 Repetir `npm test` e `node --test test/providers-catalog.test.js` depois do registro online para confirmar a consistência do catálogo e do status.
- [ ] 6.4 Revisar os artefatos e a documentação da mudança, mantendo as exclusões ou limitações declaradas no `design.md` e no resumo online.

## Workflow follow-up

- Arquivar a mudança depois da revisão do mantenedor, com a rodada online registrada ou com a exclusão explicitamente declarada.
- Verificar o resultado arquivado em `openspec/specs/anitube-provider/spec.md`.
