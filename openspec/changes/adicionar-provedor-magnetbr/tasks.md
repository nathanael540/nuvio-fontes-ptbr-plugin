# Tasks

## 1. Estrutura, manifest e catálogo

- [ ] 1.1 Criar `src/magnetbr/index.js` com `PROVIDER_NAME = 'MagnetBR'`, validação de entrada, `sortByQuality` e a única captura de erro com `console.error('[MagnetBR] ...')`; verificar que `npm run lint` aceita o arquivo e que o carregamento do pacote não faz requisição.
- [ ] 1.2 Criar `src/magnetbr/extractor.js` como esqueleto com JSDoc, sem rede no carregamento; verificar que `node build.js magnetbr` gera `providers/magnetbr.js` e as duas variantes sem erro.
- [ ] 1.3 Adicionar a entrada `magnetbr` ao `manifest.json` com `movie` e `tv`, `formats: ["magnet"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS; verificar que `node --test test/manifest.test.js` passa.
- [ ] 1.4 Adicionar a linha e a seção `MagnetBR` em `providers.md` com status `🟠 Não verificado` e data `—`; verificar que `node --test test/providers-catalog.test.js` passa.
- [ ] 1.5 Confirmar que `node build.js magnetbr` gera `gdrive/providers/magnetbr.js`, `prism/providers/magnetbr.js` e as entradas nos `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams`.

## 2. Consulta e validação da resposta

- [ ] 2.1 Implementar a consulta a `https://magnetbr.flixbr.online/indexers/db` com `fetchJson` no perfil `api`, `q`, `season` e `ep`, exigindo `results` como lista e `count` como inteiro não negativo; verificar com testes de resposta válida, HTTP 503, JSON inválido e estrutura sem `results`.
- [ ] 2.2 Implementar as tentativas por IMDb, título PT-BR, título original e alternativos, sem repetir termo, parando no primeiro candidato aceito e interrompendo a busca em erro; verificar com testes de IMDb encontrado, fallback por título, resposta vazia válida e erro sem fallback.
- [ ] 2.3 Implementar a consulta exata (`season` + `ep`) e a consulta da temporada (`season`) em série, unindo os resultados por `info_hash`; verificar com testes de episódio avulso, pacote apenas na consulta da temporada e hash repetido.
- [ ] 2.4 Atualizar `docs/provider-investigation.md` §3.6 com a variação do indexador JSON por IMDb + temporada/episódio, `count`/`results`/`queued`, página única e consulta de pacote; verificar que as referências apontam para arquivos existentes e que o texto distingue método em uso, bloco disponível e hipótese.

## 3. Triagem de identidade

- [ ] 3.1 Implementar a comparação de IMDb normalizado, a compatibilidade de `category` com o tipo pedido, a evidência de título por `titleSimilarity`/título contido e a checagem de ano em filme; verificar com testes de IMDb divergente, item sem IMDb, tipo incompatível e ano incompatível.
- [ ] 3.2 Implementar o descarte de coleção de filmes com `isCollectionTitle`; verificar com testes de trilogia, coleção e release individual.
- [ ] 3.3 Implementar a triagem de série com `episodeTarget` e `seasonNumbers`, rejeitando episódio divergente, temporada divergente e temporadas conflitantes; verificar com testes de `S01E02` contra `S01E01`, `S02` contra `S01` e `Season.1.S05`.
- [ ] 3.4 Implementar a aceitação de item sem coordenadas explícitas somente com IMDb igual, título compatível e ano da temporada a no máximo um ano de `media.seasons`; verificar com testes de item aceito e do falso positivo `One.Piece.S01E01.2023` contra a temporada 1 de 1999.
- [ ] 3.5 Verificar que todo descarte de triagem usa `console.log` e não gera `console.warn` nem stream; verificar com o caso de todos os itens triados devolvendo lista vazia sem aviso.

## 4. Streams de episódio avulso

- [ ] 4.1 Implementar `readMagnet` sobre `magnet_link`/`magnet`, conversão BTIH base32 para 40 hexadecimais, `infoHash` igual ao hash e trackers públicos quando ausentes; verificar com testes de magnet hexadecimal, base32 e link sem `tr=`.
- [ ] 4.2 Implementar tamanho por `humanSize`, normalização de vírgula, fallback para `size_bytes` apenas acima de 1 MiB e omissão de `30 B`/`175 B`; verificar com testes de `2,8 GB`, `2.5 GB`, `30 B` e `size_bytes` corrompido.
- [ ] 4.3 Implementar a classificação de idioma por `audio_tags` e `legend`, com `normalizeLanguage`/`languageFromTexts`, sem usar `title`/`title_processed` como prova de região; verificar com testes de português, inglês com legenda PT, inglês sem legenda, `[Brazilian]` sem áudio PT e ausência de evidência.
- [ ] 4.4 Implementar `discoverQuality`, `seeders`/`peers` a partir de `seed_count`/`leech_count` (preservando zero) e `provider` a partir de `scraper_source`; verificar com testes de `1080p`, `4k`, contagem zero e catálogo de origem.
- [ ] 4.5 Montar cada stream com `buildStream`, `format` (`FORMATTER.AUTO`, `addon: 'MagnetBR'`, título, ano, temporada, episódio, arquivo), sem `name`/`title`, deduplicando por URL e ordenando por qualidade; verificar com testes de campos proibidos, duplicata, ordem e variantes gdrive/prism.
- [ ] 4.6 Isolar falha de magnet ou de montagem com `console.warn`, preservando as demais opções; verificar com um item inválido entre válidos, todos inválidos com erro agregado e todos triados com lista vazia.

## 5. Pacotes de temporada

- [ ] 5.1 Classificar como pacote o item da consulta de temporada sem episódio único, ou com faixa de episódios, e deduplicar por hash mantendo a maior contagem de seeders; verificar com testes de pacote `S01`, item sem marcador e hashes repetidos.
- [ ] 5.2 Resolver o pacote com `fetchTorrentFiles` e `findEpisodeFile` (`seasonPack: true`) e montar `torrent://<hash>/<índice>` com `buildTorrentFileUrl` somente com exatamente um arquivo correspondente; verificar com `.torrent` em memória de arquivo único.
- [ ] 5.3 Preencher `format.filename`, `format.folderName` e `format.folderSize`, usando o tamanho do arquivo no `size`; verificar com pacote cujo arquivo tem tamanho diferente do pacote.
- [ ] 5.4 Descartar pacote sem o episódio e pacote ambíguo por triagem, sem escolher o primeiro vídeo; verificar com testes de lista sem `S01E01` e de dois arquivos `S01E01`.
- [ ] 5.5 Tratar falha do cache de torrents como descarte isolado com aviso, mantendo as demais opções, e subir o erro agregado quando nada resolver; verificar com HTTP 500 no itorrents e com um pacote falhando ao lado de um episódio avulso válido.
- [ ] 5.6 Garantir que o stream de episódio avulso prevaleça sobre o pacote do mesmo hash e que o pacote não seja baixado nesse caso; verificar com o mesmo hash nas duas consultas e nenhuma requisição ao cache.

## 6. Fronteira, ausência e logs

- [ ] 6.1 Validar `tmdbId`, `mediaType`, temporada/episódio em série e `TMDB_API_KEY` antes de qualquer requisição, chamando `getMediaInfo` antes da fonte; verificar com testes de ID inválido, tipo inválido, série sem coordenadas e chave ausente, todos com zero requisições.
- [ ] 6.2 Tratar `count: 0` com `queued: true` como ausência e manter busca, TMDB e estrutura inválida como etapas fatais; verificar com testes separados de ausência sem erro e HTTP 503/JSON inválido com `[]` na fronteira e log `[MagnetBR]`.
- [ ] 6.3 Sanitizar mensagens de log, removendo chave do TMDB, query de URL e magnet completo; verificar que os logs e avisos do teste não contêm esses valores.
- [ ] 6.4 Confirmar que o provedor não impõe timeout, cache, retentativa por lentidão ou paginação; verificar por inspeção do código e pelo lint, sem `setTimeout`/`setInterval` em `src/magnetbr/`.

## 7. Integração, documentação e verificação online

- [ ] 7.1 Rodar `npm run lint`, `npm test` e `node build.js magnetbr`; verificar que a suíte completa passa, que os arquivos gerados foram atualizados e que `providers/magnetbr.js` não contém `async`/`await`.
- [ ] 7.2 Conferir `README.md`, `docs/arch.md` e `src/_blocks/index.md`; não alterar se nenhuma regra global, convenção ou bloco mudou, e registrar a conferência no `design.md` apenas se houver alteração.
- [ ] 7.3 Rodar `npm run test:online -- --provider magnetbr --record` com `TMDB_API_KEY` apenas no ambiente; verificar o resultado por tipo e a seção atualizada em `providers.md`.
- [ ] 7.4 Se a rodada for inconclusiva ou falhar, registrar o motivo saneado em `providers.md` e manter o status `🟠 Não verificado`, sem declarar funcionamento.
- [ ] 7.5 Atualizar a seção `Validation` do `design.md` com os resultados reais de lint, testes, build e rodada online, incluindo o que ficou fora (anime sem marcador, página única, reprodução no aparelho); verificar que os números e status batem com `providers.md`.

## Workflow follow-up

- Arquivar a mudança após a revisão e a rodada online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e a spec principal `magnetbr-provider`.
- Se a rodada online revelar um método novo ou uma variação relevante, abrir uma mudança própria com fixture e evidência, sem ampliar esta.
