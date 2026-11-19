# Tasks

## 1. Estrutura, manifest e build

- [x] 1.1 Criar `src/animeshd/index.js` com `PROVIDER_NAME = 'AnimesHD'`, validação de `tmdbId`/`mediaType`/temporada/episódio, recusa de `movie`, `sortByQuality` e a única captura de erro com `console.error('[AnimesHD] ...')`.
- [x] 1.2 Criar `src/animeshd/site.js`, `src/animeshd/catalog.js`, `src/animeshd/episode.js`, `src/animeshd/players.js` e `src/animeshd/extractor.js` com JSDoc, sem rede no carregamento.
- [x] 1.3 Adicionar a entrada `animeshd` ao `manifest.json` com `tv`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS.
- [x] 1.4 Rodar `node build.js animeshd` e conferir `providers/animeshd.js`, `gdrive/providers/animeshd.js`, `prism/providers/animeshd.js` e os `<formato>/manifest.json`.

## 2. Busca e identidade

- [x] 2.1 Implementar `buildSearchUrl`, `loadHtml`, `textOf`, `parseSourceDate`, `readYear` e `sanitizeMessage` em `site.js`.
- [x] 2.2 Implementar `buildSearchTerms` com romaji geral, PT-BR, original, alternativas e romaji com temporada, deduplicando por `normalizeText`.
- [x] 2.3 Implementar `parseSearchResults` com `div.result-item`, `div.title a` e `span.year`, tratando `body.search-no-results` como ausência e layout divergente como erro.
- [x] 2.4 Implementar `cleanCatalogTitle` e `titleVariants` para remover sufixos de catálogo e comparar o `h1` inteiro, o texto antes dos parênteses e cada grupo entre parênteses.
- [x] 2.5 Implementar `findCandidate` com acúmulo por URL, no máximo quatro fichas priorizadas por similaridade, confirmação de título e ano, 404 pulado e 403/5xx fatal.

## 3. Temporada, episódio e opções

- [x] 3.1 Implementar `selectEpisode` com leitura de `div.se-c`, `span.se-t`, data do primeiro `span.date` e contagem de `li`.
- [x] 3.2 Implementar a escolha da temporada por `airDate` do TMDB com tolerância de um dia, desempate por contagem, temporada 1 única e número exato com a mesma contagem.
- [x] 3.3 Implementar a seleção do episódio pelo segundo número de `div.numerando`, exigindo o primeiro número da temporada e usando o `href` publicado.
- [x] 3.4 Implementar `fetchOptions` com `li.dooplay_player_option`, `data-post`/`data-nume`/`data-type`, rótulo de `span.title`, `data-nume` não numérico ignorado e 404 como ausência.

## 4. Player e streams

- [x] 4.1 Implementar `resolvePlayerOption` com `POST /wp-admin/admin-ajax.php`, formulário `doo_player_ajax`, `Referer` da página, validação de `embed_url` e triagem de host fora do Blogger.
- [x] 4.2 Implementar a leitura do HTML do Blogger com `extractBloggerFormats` e o mesmo `User-Agent` da descoberta.
- [x] 4.3 Implementar a montagem com `buildStream` e `format`, `type` `mp4`, `provider` `Blogger`, `qualityHints`, idioma pelo rótulo e `headers` com `User-Agent`.
- [x] 4.4 Isolar cada opção com `console.warn`, agregar as falhas quando nada produzir stream e devolver `[]` quando todas forem triagem.
- [x] 4.5 Deduplicar pela URL exata e ordenar com `sortByQuality`.

## 5. Suíte offline

- [x] 5.1 Criar fixtures sanitizadas em `test/fixtures/animeshd/` para busca positiva, busca vazia, ficha de Demon Slayer, ficha agrupada, ficha sem temporadas, episódio com uma e duas opções, AJAX válido, AJAX sem embed, Blogger com formatos, Blogger sem `streamingData` e host não suportado.
- [x] 5.2 Criar `test/animeshd.test.js` cobrindo pacote sem rede, validação de entrada, filme recusado, busca romaji, resultado alheio, temporada desalinhada, temporada agrupada, temporada agrupada acima da 1, episódio ausente, ficha sem estrutura, opção única, duas opções, falha isolada, todas falhando, todas em triagem, `P1` sem idioma, deduplicação, ordenação e logs saneados.
- [x] 5.3 Executar `node --test test/animeshd.test.js` e conferir que a suíte não usa internet nem `TMDB_API_KEY` real.

## 6. Documentação e integração

- [x] 6.1 Adicionar `animeshd` a `test/online/profiles.json` com `exclusiveTag` `anime`.
- [x] 6.2 Adicionar a linha e a seção do `AnimesHD` em `providers.md` com status inicial `🟠 Não verificado` e data `—`.
- [x] 6.3 Adicionar a seção 3.40 em `docs/provider-investigation.md` com a busca HTML DooPlay, a temporada por data de estreia, a cadeia AJAX/Blogger, a ligação da URL ao `User-Agent` e os limites.
- [x] 6.4 Revisar `README.md`, `docs/arch.md` e `src/_blocks/index.md`: não alterar se nenhuma regra global, convenção ou bloco mudou.

## 7. Verificação final

- [x] 7.1 Rodar `npm run lint` e `npm test`; registrar o resultado.
- [x] 7.2 Rodar `node build.js animeshd` e conferir os três pacotes e os manifests de formato.
- [x] 7.3 Rodar `npm run test:online -- --provider animeshd` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada em `providers.md`.
- [x] 7.4 Preencher a seção `Validation` do `design.md` com os resultados reais e o que ficou fora.
- [x] 7.5 Arquivar a mudança somente se lint, testes, build e rodada online passarem; caso contrário, manter em `openspec/changes/add-animeshd/` e declarar o bloqueio.
