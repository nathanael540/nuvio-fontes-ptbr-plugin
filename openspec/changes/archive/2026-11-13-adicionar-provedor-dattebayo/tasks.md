# Tasks

## 1. Bloco `tmdb-info` com temporadas

- [x] 1.1 Em `src/_blocks/tmdb-info/index.mjs`, expor `seasons` no `MediaInfo`: lista de `{ number, episodeCount, name, airDate }` para série e lista vazia para filme, lida da mesma resposta de `/tv/{id}` sem requisição nova. Verificação: `node --test test/blocks/tmdb-info/index.test.mjs` passa e uma chamada de série com `seasons` no corpo devolve os campos esperados.
- [x] 1.2 Atualizar `test/blocks/tmdb-info/index.test.mjs` para cobrir filme com `seasons` vazio, série com temporadas (incluindo a temporada 0 preservada) e série sem `seasons` no corpo, sem quebrar os casos existentes. Verificação: a suíte do bloco passa por inteiro.
- [x] 1.3 Atualizar a linha de `tmdb-info` em `src/_blocks/index.md` para citar as temporadas expostas e o uso no mapeamento de temporada. Verificação: `node --test test/blocks-catalog.test.js` passa.
- [x] 1.4 Reconstruir e revalidar os provedores que importam `tmdb-info` (`baixarapido`, `baixarfilmestorrent123`, `betor`, `dooplay`, `filmestorrent`, `fireplayer`, `limefilmes`, `pobreflix-nixplay`, `pobreflixtv`, `starckfilmes` e `therarbg`) com `npm run build`, sem mudar o comportamento deles. Verificação: `npm test` passa e os pacotes gerados ficam sincronizados com o bloco novo.

## 2. Estrutura do provedor e manifest

- [x] 2.1 Criar `src/dattebayo/` com `index.js` no contrato do app (captura única em `getStreams`, `console.error('[Dattebayo BR] ...')` e `sortByQuality`) e módulos `catalog.js`, `seasons.js` e `player.js` com stubs explícitos. Verificação: `node build.js dattebayo` termina com código 0 e `providers/dattebayo.js` exporta `getStreams`.
- [x] 2.2 Acrescentar a entrada `dattebayo` em `manifest.json` na versão `1.0.0`, com `supportedTypes` `["movie", "tv"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]`, descrição em pt-BR e logo em `https`. Verificação: `node --test test/manifest.test.js` passa.
- [x] 2.3 Conferir que a pasta `src/_template/` e os blocos existentes são a base do provedor, sem dependência de Node, `axios` ou API fora da lista do runtime. Verificação: `npm run lint` passa em `src/dattebayo/`.

## 3. Busca e confirmação de identidade

- [x] 3.1 Implementar em `catalog.js` a busca `GET /busca?busca=<termo>` com `URLSearchParams`, perfil `page`, parsing por cheerio básico de `.aniContainer` e `.ultimosAnimesHomeItem`, leitura de título, link e contagem de episódios, e paginação por `&page=<n>` limitada a três páginas por termo. Verificação: um teste com fixture de busca devolve os cartões esperados e não pede a página 4.
- [x] 3.2 Normalizar candidatos com remoção do sufixo `- Dublado` apenas para comparação, classificar o idioma por `/anime-dublado/` ou pelo sufixo `- Dublado` como `Dublado` e `Legendado` nos demais casos, e escolher o candidato com `findBestMatch` usando `year: null`, porque o cartão de busca não traz ano. Verificação: testes com título PT-BR, título original e candidato dublado confirmam o candidato e o idioma.
- [x] 3.3 Confirmar na ficha `Tipo` (`Filme` ou `TV`) e `Ano` (tolerância de um ano em filme e na ficha base de série) e descartar candidato incompatível sem stream. Verificação: testes de tipo incompatível, ano de filme incompatível e ano da base de série incompatível devolvem lista vazia e não montam stream.
- [x] 3.4 Criar as fixtures `search-movie.html`, `search-tv.html`, `search-empty.html`, `detail-movie.html`, `detail-tv-base.html` e `detail-type-mismatch.html` e os casos correspondentes em `test/dattebayo.test.js`. Verificação: os casos de filme legendado, filme dublado, busca vazia e layout de busca ausente passam.

## 4. Temporada, família e episódio

- [x] 4.1 Implementar em `seasons.js` a leitura da ficha: título canônico (`h1`), `Tipo`, `Ano`, `Episódios` no formato `disponíveis/total`, `tempAnterior`, `tempProxima` e a primeira página de episódios; montar a família de TV limitada a 12 fichas, incluindo só o título base ou títulos com marcador de temporada reconhecido. Verificação: fixtures de `Boku no Hero Academia` devolvem base, temporada 2 e os links de cadeia esperados; uma fixture de sequência (`Dragon Ball Z`) fica fora da família.
- [x] 4.2 Implementar o mapeamento de temporada: base sem marcador como temporada 1, `Season N`/`Nth Season`/sufixo numérico como N, `Part N` na mesma temporada da parte anterior, `Final Season` como última temporada do TMDB (ou anterior mais um), exclusão de `OVA`/`ONA`/`Especial`/`Filme`, cadeia seguida só dentro da mesma seção e ausência em caso de ambiguidade. Verificação: testes de temporada 1, temporada 2, parte final, temporada ambígua e cadeia que aponta para outra seção passam.
- [x] 4.3 Implementar a numeração absoluta para entrada única que cobre o total de episódios do TMDB, somando as temporadas 1..S-1 e ignorando a temporada 0. Verificação: teste de série longa com 220 episódios resolve temporada 2 episódio 1 para o episódio 53.
- [x] 4.4 Implementar a seleção do episódio pelo texto `Episódio NN` da listagem, com correspondência exata, ignorando `Episódio 00`, e paginação `/page/<n>` com estimativa por 24 itens, conferência das páginas vizinhas e leitura sequencial de fallback. Verificação: testes de episódio na página 1, na página 3, episódio ausente e episódio 0 passam.
- [x] 4.5 Criar as fixtures `detail-tv-season2.html`, `detail-tv-page2.html`, `detail-tv-final-part1.html`, `detail-tv-final-part2.html`, `detail-tv-long.html` e `detail-tv-ambiguous.html` e os casos correspondentes em `test/dattebayo.test.js`. Verificação: os casos de série temporada 1 episódio 1, temporada 2, episódio em página posterior, parte final, série longa, temporada não mapeada e ambiguidade passam.

## 5. Player, assinatura e streams

- [x] 5.1 Implementar em `player.js` a leitura das abas `.Aba` (`data-target` e rótulo), dos contêineres `.playerContainer` por `id` e do `var vid` de cada contêiner, considerando somente opções com aba correspondente e tratando ausência de abas como erro de layout. Verificação: fixture de player com três opções devolve SD, HD e FULLHD; fixture sem FULLHD devolve duas opções; fixture sem aba lança erro.
- [x] 5.2 Implementar a assinatura pública com `GET https://ads.animeyabu.net?token=&url=<vid>`, perfil `page` e `Referer` da página do vídeo, exigindo JSON de lista com `publicidade` em texto iniciado por `?`. Verificação: teste com resposta controlada devolve a URL assinada e teste sem `publicidade` descarta a opção.
- [x] 5.3 Montar cada stream com `buildStream`: `format` com `FORMATTER.AUTO`, `addon` `Dattebayo BR`, título, ano e temporada/episódio; `quality` pelo rótulo (`SD`→480p, `HD`→720p, `FULLHD`→1080p); `language` da entrada; `type` `mp4`; sem `name`, `title`, `size`, `subtitles` ou `headers` inventados. Verificação: testes de contrato conferem `quality`, `language`, `format`, ausência de `name`/`title` e ausência de opcionais não fornecidos.
- [x] 5.4 Isolar falha por opção com `console.warn('[Dattebayo BR] Opção <rótulo> descartada: <causa>')`, preservando as demais, e lançar erro com a causa de cada opção quando todas falharem. Verificação: teste de falha em HD preserva SD e FULLHD; teste de falha em todas lança erro e `getStreams` devolve lista vazia.
- [x] 5.5 Criar as fixtures `video-3-options.html`, `video-2-options.html`, `video-no-tabs.html` e as respostas de assinatura com URL sanitizada (`media.exemplo.test` e `?assinatura=...`). Verificação: `grep` não encontra `X-Amz-Signature`, `response-content-type` nem host real de mídia nas fixtures.

## 6. Ausência, deduplicação e falhas fatais

- [x] 6.1 Implementar a fronteira entre ausência reconhecida (busca vazia, temporada não mapeada, episódio ausente) e erro fatal (layout de busca/ficha/player, HTTP fora de 2xx, assinatura ausente em todas as opções). Verificação: testes de ausência devolvem `[]` sem `console.error`; testes de layout alterado registram `[Dattebayo BR]` e devolvem `[]`.
- [x] 6.2 Deduplicar opções pelo `vid` antes de montar os streams e devolver as versões dublada e legendada quando ambas existirem, cada uma com o idioma da seção. Verificação: teste com as duas seções devolve os dois idiomas sem URL repetida; teste com a mesma URL em duas abas devolve um stream.
- [x] 6.3 Garantir que uma falha depois da busca não devolva streams parciais de candidatos anteriores. Verificação: teste com a primeira ficha válida e a segunda com layout inválido confirma que a lista final é vazia e o erro é registrado.

## 7. Build e validação local

- [x] 7.1 Rodar `node build.js dattebayo` e conferir `providers/dattebayo.js`, `gdrive/providers/dattebayo.js`, `prism/providers/dattebayo.js` e os três manifests de formato. Verificação: o build termina com código 0 e os arquivos citados existem e exportam `getStreams`.
- [x] 7.2 Rodar `npm run build` para reconstruir o provedor novo e os provedores afetados pelo bloco `tmdb-info`. Verificação: o build termina com código 0 e os `<formato>/manifest.json` ficam sincronizados com o `manifest.json`.
- [x] 7.3 Rodar `npm run lint` e `npm test` no estado final. Verificação: os dois comandos terminam com código 0.
- [x] 7.4 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão. Verificação: `git diff --stat` mostra as saídas geradas apenas depois dos builds.

## 8. Documentação operacional e método

- [x] 8.1 Acrescentar a linha e a seção `## Dattebayo BR` em `providers.md`, com status inicial `🟠 Não verificado`, tipos, formato e a data da verificação somente quando houver rodada. Verificação: `node --test test/providers-catalog.test.js` passa.
- [x] 8.2 Acrescentar em `docs/provider-investigation.md` a variação de assinatura pública de mídia: contrato observado do serviço, validade de 3600 segundos, ausência de conta/chave, uso da URL assinada sem cabeçalhos, descarte do `contentURL` quebrado e do clipe de fallback, referências a `src/dattebayo/player.js` e `test/dattebayo.test.js`, e limites explícitos. Verificação: a seção existe, distingue método em uso de hipótese e não contém URL assinada real.
- [x] 8.3 Conferir que `docs/arch.md` não precisa mudar (nenhuma regra global nova) e que `README.md` continua coerente com a tabela de provedores. Verificação: `git diff -- docs/arch.md` está vazio e o README não promete um provedor fora do manifest.

## 9. Verificação online e status

- [x] 9.1 Com o pacote final construído, rodar `npm run test:online -- --provider dattebayo` usando `TMDB_API_KEY` somente do ambiente local. Verificação: o runner conclui a rodada e grava o relatório em `test/artifacts/online/<run-id>/result.json`.
- [x] 9.2 Atualizar a seção do Dattebayo BR em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os dez casos. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [x] 9.3 Se a rodada for inconclusiva ou falhar, registrar o resultado real e não marcar `Estável` sem evidência. Verificação: o status segue `docs/tests.md`, seção 7, e os casos inconclusivos permanecem visíveis.

## 10. Integração final

- [x] 10.1 Rodar novamente `npm run lint`, `npm test`, `npm run build` e `node --test test/dattebayo.test.js test/blocks/tmdb-info/index.test.mjs` no estado final. Verificação: todos terminam com código 0.
- [x] 10.2 Conferir o contrato de uma amostra de streams do relatório online: URL `http(s)`, `quality` do rótulo, `language` do enum, `format` presente e `name`/`title` gerados pelo formatador. Verificação: a amostra não tem campo obrigatório ausente nem campo proibido.
- [x] 10.3 Procurar segredos e assinaturas no repositório (`X-Amz-Signature`, `response-content-type`, `adssign`, tokens) fora de `test/artifacts/`. Verificação: nenhuma ocorrência em arquivos versionados.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
