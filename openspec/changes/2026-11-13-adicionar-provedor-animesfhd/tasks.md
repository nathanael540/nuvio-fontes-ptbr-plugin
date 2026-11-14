# Tasks

## 1. Catálogo e identidade

- [ ] 1.1 Criar `src/animesfhd/catalog.js` com a leitura de `GET /api/home` e `GET /animes?page=<n>`, extração de `carousels[].items`, listas da home e cartões `a.card` (`h3.card__title`, `p.card__sub`), com deduplicação por `series_id`; verificar com `node --test test/animesfhd.test.js` os casos de carrossel, página 8, página vazia e HTML sem cartões.
- [ ] 1.2 Registrar fixtures reais sanitizadas em `test/fixtures/animesfhd/` para home, página de catálogo, ficha sazonal, versões, episódio dublado, episódio legendado, episódio de temporada agrupada, `sources` vazio, JSON inválido e página sem `EP.N`; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [ ] 1.3 Implementar em `src/animesfhd/extractor.js` a recusa de `movie` sem rede, a validação de temporada/episódio e a busca com `getMediaInfo` e `findBestMatch`/`titleSimilarity`; verificar com testes de filme recusado, título nos carrosséis, título na página 8 e título fora do teto.
- [ ] 1.4 Garantir que `/api/animes/pesquisar` nunca é chamada e que HTTP 401 não é tratado como ausência; verificar com um teste que simula a rota privada e confirma que o provedor usa somente home e catálogo.

## 2. Temporada, versão e episódio

- [ ] 2.1 Implementar o cálculo do episódio global do TMDB, ignorando a temporada 0, e a seleção da versão por faixa global e áudio; verificar com testes de S01E01, S03E01 (global 34 → versão 2 local 8) e episódio fora da faixa.
- [ ] 2.2 Abrir `GET /serie/<version.series_id>` e selecionar o cartão `EP.<local>`, sem usar posição nem `first_episode_id + n`; verificar com testes de EP.1, EP.8 e lista sem o rótulo pedido.
- [ ] 2.3 Tratar a versão sazonal 404 como ausência e a página 2xx sem `EP.N` como erro de estrutura; verificar com testes de 404, HTML alterado e lista vazia.
- [ ] 2.4 Resolver as duas faixas de áudio como opções independentes, tentando a outra quando a pedida não cobre o episódio; verificar com testes de dublado, legendado, apenas uma faixa e nenhuma faixa.

## 3. Mídia e streams

- [ ] 3.1 Implementar a leitura de `GET /api/episodes/<episode_id>`, a resolução da URL relativa contra `https://animesfhd.net` e a validação de `sources[]` como lista; verificar com fixtures de fonte dublada, legendada, lista vazia e JSON inválido.
- [ ] 3.2 Isolar cada fonte com `console.warn('[AnimesFHD] ...')`, devolver HLS com `type: 'hls'` e lançar erro agregado quando todas falharem; verificar com testes de uma fonte falhando e de todas falhando.
- [ ] 3.3 Classificar `language` por `dublado`/`legendado` e qualidade somente por `label`/URL já obtidos, preservando `Desconhecida` para `source_resolution: catalog`; verificar com testes de qualidade desconhecida e áudio fora do vocabulário.
- [ ] 3.4 Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'AnimesFHD'`, título, ano, temporada, episódio), sem `name`/`title`, sem sonda e sem cabeçalhos não comprovados; verificar os campos `name`, `title`, `quality`, `language` e `type` nos formatos publicados.

## 4. Entrada e erros

- [ ] 4.1 Criar `src/animesfhd/index.js` com o nome `AnimesFHD`, captura única de erros, log `[AnimesFHD]` e `sortByQuality`; verificar que o pacote exporta `getStreams` e que uma falha de catálogo termina em `[]` com o log esperado.
- [ ] 4.2 Cobrir ausência reconhecida de título, episódio e fonte, além de falha de rede na API de episódio; verificar com `node --test test/animesfhd.test.js` os casos negativos e os logs.

## 5. Build, manifest e documentação

- [ ] 5.1 Adicionar a entrada `animesfhd` ao `manifest.json` com nome `AnimesFHD`, versão `1.0.0`, autor `nathanael540`, tipo `tv`, formato `m3u8`, `contentLanguage` `pt` e logo HTTPS; verificar com `node build.js animesfhd` e com `node --test test/manifest.test.js`.
- [ ] 5.2 Conferir `providers/animesfhd.js`, `gdrive/providers/animesfhd.js`, `prism/providers/animesfhd.js` e os `<formato>/manifest.json`; verificar que o build termina sem erro e que os três arquivos exportam `getStreams`.
- [ ] 5.3 Adicionar o perfil `animesfhd` com `exclusiveTag: "anime"` em `test/online/profiles.json`, atualizando `revision` e `curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 5.4 Adicionar a linha e a seção `## AnimesFHD` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [ ] 5.5 Atualizar `docs/provider-investigation.md` com o método “catálogo HTML com versões sazonais e episódio global”, citando `src/animesfhd/`, os testes e a spec; verificar que a seção descreve o teto de 12 páginas, o mapeamento global e a ausência de qualidade declarada.

## 6. Verificação final

- [ ] 6.1 Rodar `npm run lint`, `npm test` e `node build.js animesfhd`; verificar que a suíte completa e o build terminam sem falhas.
- [ ] 6.2 Executar `npm run test:online -- --provider animesfhd` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md`.
- [ ] 6.3 Ajustar o status de `providers.md` conforme `docs/tests.md` e registrar a cobertura do teto de páginas e a qualidade desconhecida; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/animesfhd-provider/spec.md`.
