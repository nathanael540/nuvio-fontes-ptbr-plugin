# Tasks

## 1. Catálogo e confirmação de identidade

- [ ] 1.1 Criar `src/animesdigital/catalog.js` com a busca `GET /?s=<termo>` via `fetchPage`, seguindo o redirecionamento para `/pesquisa/<termo>/`, e leitura dos cartões `div.itemA, div.itemE` com `a[href]` e `attr('title')`; verificar com fixture de busca com resultado e de busca vazia.
- [ ] 1.2 Montar as variantes de busca com `getMediaInfo` (título PT-BR, original, alternativos e romaji), deduplicadas por `normalizeText`, e parar na primeira que confirmar candidato; verificar com teste de título PT-BR ausente e romaji presente.
- [ ] 1.3 Implementar a limpeza do título (`Assistir`, `– Todos os Episódios`, `Online`, `Completo`, `Dublado`, `Legendado`, `Filme`, marcadores de temporada) e a confirmação com `findBestMatch` e ano de `div.info` (`Ano`) com tolerância de 1; verificar com testes de ano divergente, candidato sem ano e dois candidatos compatíveis (lista vazia).
- [ ] 1.4 Implementar a distinção entre série (`div.item_ep`) e filme (um único link `/video/a/<id>`), recusando página ambígua; verificar com fixtures de série e de filme.

## 2. Temporada, episódio e player

- [ ] 2.1 Selecionar o episódio pelo número de `div.title_anime` (`Episódio\s+0*(\d+)`) dentro de `div.item_ep` e usar o `href` `/video/a/<id>` do cartão; verificar com teste de lista fora de ordem e de episódio ausente.
- [ ] 2.2 Aceitar a temporada 1 sem marcador e exigir `Temporada N`, `Season N` ou sufixo numérico para temporadas maiores; verificar com testes de temporada 1, temporada 2 declarada e temporada 2 não declarada (lista vazia).
- [ ] 2.3 Ler `iframe[src*="api.anivideo.net/videohls.php"]`, extrair o parâmetro `d` e validar `http(s)`; verificar com fixtures de iframe válido, `d` vazio e `d` fora de `http(s)`.
- [ ] 2.4 Ignorar o iframe `aHR0...` e o `bg.mp4` de fundo; verificar que a página com apenas esse iframe devolve lista vazia sem erro.
- [ ] 2.5 Criar `src/animesdigital/index.js` com captura única, log `[AnimesDigital]` e `sortByQuality`; verificar que o pacote exporta `getStreams` e que uma falha de busca termina em lista vazia com o log esperado.

## 3. Contrato dos streams

- [ ] 3.1 Montar cada stream com `buildStream`, `type: 'hls'`, `provider: 'Anivideo'` e `format` com título, ano, temporada e episódio; verificar `url`, `type`, `provider`, `quality` e `language` nos três formatos publicados.
- [ ] 3.2 Aplicar idioma somente quando o título declarar `Dublado`/`Legendado`, omitindo o campo nos demais casos; verificar que a descoberta local devolve um dos seis valores do enum e que nenhum stream é classificado como PT-BR sem evidência.
- [ ] 3.3 Omitir `headers` e `quality` quando não houver evidência; verificar que o stream preservado sai com `Desconhecida` e sem `headers`.
- [ ] 3.4 Tratar cada iframe Anivideo como opção independente: descartar a falha com `console.warn('[AnimesDigital] Opção <rótulo> descartada: <causa>')`, preservar as demais e subir erro agregado quando todas falharem; verificar com testes de uma opção falhando e de todas falhando.

## 4. Testes offline

- [ ] 4.1 Registrar fixtures reais sanitizadas em `test/fixtures/animesdigital/`: busca com resultado, busca vazia, detalhe de série, detalhe de filme, episódio com Anivideo, episódio só com `bg.mp4` e página sem player; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [ ] 4.2 Criar `test/animesdigital.test.js` cobrindo filme, episódio avulso, temporada não declarada, ausência e falha estrutural, executando o pacote gerado com `fetch` simulado; verificar com `node --test test/animesdigital.test.js`.

## 5. Build, manifest e publicação

- [ ] 5.1 Adicionar a entrada `animesdigital` ao `manifest.json` com nome `AnimesDigital`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formato `m3u8`, idioma `pt` e logo HTTPS; verificar com `node -e` que os campos obrigatórios e o `filename` estão corretos e com `node build.js animesdigital`.
- [ ] 5.2 Conferir `providers/animesdigital.js`, `gdrive/providers/animesdigital.js`, `prism/providers/animesdigital.js` e os `<formato>/manifest.json`; verificar que os três arquivos exportam `getStreams`.
- [ ] 5.3 Adicionar a entrada `animesdigital` ao perfil `anime` em `test/online/profiles.json`, atualizando `revision` e `curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 5.4 Adicionar a linha e a seção `## AnimesDigital` em `providers.md` com status `🟠 Não verificado`; verificar com `node --test test/providers-catalog.test.js`.

## 6. Documentação e verificação online

- [ ] 6.1 Atualizar `docs/provider-investigation.md` com o método do player Anivideo em iframe, o parâmetro `d` e o limite de temporadas por arco; verificar que a seção cita `src/animesdigital/`, o teste e a spec.
- [ ] 6.2 Rodar `npm run lint`, `npm test` e `node build.js animesdigital`; corrigir qualquer falha introduzida.
- [ ] 6.3 Executar `npm run test:online -- --provider animesdigital` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; registrar a rodada em `providers.md` conforme `docs/tests.md`.
- [ ] 6.4 Ajustar o status conforme o resultado e registrar como limitação qualquer temporada ou título sem resolução; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/animesdigital-provider/spec.md`.
