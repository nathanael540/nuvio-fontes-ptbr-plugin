# Tasks

## 1. Gate de viabilidade

- [ ] 1.1 Executar a busca pública (`/live-search?q=` e `/search?q=`) para um filme e uma série, abrir as fichas escolhidas e registrar título, ano, tipo, `v_id` e presença de `season`/`episode` no `design.md`, sem URL assinada. Verificação: as duas fichas confirmam identidade e tipo; os dados ficam no design.
- [ ] 1.2 Resolver o filme com `Referer` da ficha, obter a URL final e testar `Range: bytes=0-0` sem baixar o arquivo inteiro; registrar status, `Content-Type` e se a URL é reproduzível. Verificação: HTTP 206/200 de mídia ou o 403 real documentado; nenhum download completo.
- [ ] 1.3 Resolver um episódio de série, buscar o `.m3u8`, conferir `#EXTM3U` e testar um segmento com `Range`, com e sem `Referer`; registrar o resultado. Verificação: playlist válida e segmento 206/200; cabeçalhos necessários identificados.
- [ ] 1.4 Decidir o escopo do manifest: filme e série confirmados usam `supportedTypes` `["movie", "tv"]` e `formats` `["m3u8", "mkv"]`; só série usa `["tv"]`/`["m3u8"]`; só filme usa `["movie"]`/`["mkv", "m3u8"]`; nenhum confirmado interrompe a change. Se o escopo for reduzido, ajustar `proposal.md` e `specs/primeflix-provider/spec.md` antes da implementação. Verificação: decisão registrada no `design.md`, spec/proposal coerentes e tarefas 4 ou 5 marcadas como não aplicáveis.

## 2. Estrutura do provedor e manifest

- [ ] 2.1 Criar `src/primeflix/` com `index.js` no contrato do app (captura única em `getStreams`, `console.error('[Primeflix] ...')` e `sortByQuality`) e módulos `catalog.js` e `player.js` com stubs explícitos. Verificação: `node build.js primeflix` termina com código 0 e o pacote exporta `getStreams`.
- [ ] 2.2 Acrescentar a entrada `primeflix` em `manifest.json` com versão `1.0.0`, `contentLanguage` `["pt"]`, logo HTTPS e tipos/formatos definidos no gate. Verificação: `node --test test/manifest.test.js` passa.
- [ ] 2.3 Criar `test/primeflix.test.js` e `test/fixtures/primeflix/` com o esqueleto dos casos e respostas sanitizadas (`<id>`, `<arquivo>.mkv`, `media.exemplo.test`). Verificação: `node --test test/primeflix.test.js` executa os casos iniciais sem rede e sem URL real de mídia.

## 3. Busca e confirmação de identidade

- [ ] 3.1 Implementar a busca JSON `/live-search?q=<termo>` com `{ title, link }` e a reserva HTML `/search?q=<termo>` com os cartões de resultado; a reserva entra quando o JSON não devolve candidato confirmável, não só quando vem vazio. Montar URLs absolutas e validar o formato da resposta. Verificação: testes com fixtures de JSON, HTML e JSON sem candidato passam e nenhuma busca usa rede.
- [ ] 3.2 Implementar a leitura da ficha: título, ano (primeiro ano de quatro dígitos em `Year:`), `v_id`, tipo pelo player (pares `season`/`episode` ou marcador de série = série; `v_id` único sem marcador = filme) e conjunto de pares de episódios. Verificação: fixtures de filme, série e ficha sem `v_id`/sem ano devolvem os campos esperados ou lançam erro de layout.
- [ ] 3.3 Implementar a escolha do candidato: até cinco fichas por termo, filtro pelo tipo do pedido, `findBestMatch` com título/ano e tentativa dos títulos PT-BR, original e alternativos; candidato 404 é descartado. Verificação: testes de filme, série, tipo incompatível, ano incompatível, título original e ausência total passam.
- [ ] 3.4 Criar as fixtures `search-live.json`, `search-html.html`, `search-empty.json`, `detail-movie.html`, `detail-tv.html` e `detail-missing.html` com dados sanitizados. Verificação: os testes de busca e confirmação passam e as fixtures não contêm URL assinada nem mídia real.

## 4. Resolução de filme

- [ ] 4.1 Montar a URL do player do filme com `v_id` e resolver com `fetchPage`, `Referer` da ficha e `Range: bytes=0-0`; exigir URL final HTTP(S) de mídia e registrar a causa quando o redirecionamento ou o status falharem. Verificação: teste de MKV devolve a URL final, teste de 403 e teste de URL final inválida lançam erro.
- [ ] 4.2 Montar o stream do filme com `buildStream`: `format` com título, ano e nome do arquivo; `provider` `Primeflix`, `type` conforme a URL final; sem `name`/`title`, `size`, legendas, seeders ou peers inventados. Verificação: teste de contrato confere os campos e a ausência dos opcionais não fornecidos.
- [ ] 4.3 Criar a fixture `player-movie.html` e as respostas controladas de redirecionamento/erro; cobrir arquivo `.mkv`, alternativa `.mp4`/`.m3u8` e falha do CDN. Verificação: a suíte de filme passa offline e não baixa corpo de mídia.

## 5. Resolução de série e episódio

- [ ] 5.1 Verificar o par de temporada/episódio no conjunto da ficha antes de chamar o player; par ausente devolve lista vazia e par listado com 404 lança erro. Verificação: testes de episódio listado, temporada ausente, episódio ausente e 404 anunciado passam.
- [ ] 5.2 Montar a URL do player com `season`/`episode` e resolver a playlist HLS sem `Range`; exigir `.m3u8` (ou mídia reconhecida) e URL final HTTP(S). Verificação: teste de playlist devolve a URL final e teste de resposta sem playlist lança erro.
- [ ] 5.3 Montar o stream do episódio com `buildStream`: `format` com título, ano, temporada, episódio e nome do arquivo; `language` `Dublado` quando o caminho tiver `dub`; `type` `hls`. Verificação: teste de contrato confere temporada/episódio, idioma e ausência de campos inventados.
- [ ] 5.4 Criar as fixtures `player-tv.html`, `playlist.m3u8` e as respostas de erro; cobrir playlist com `#EXTM3U`, segmento assinado sanitizado e ausência de faixas de áudio/legenda. Verificação: a suíte de série passa offline e a fixture não contém `md5`/`expires` reais.

## 6. Idioma, qualidade e contrato do stream

- [ ] 6.1 Cobrir a classificação de idioma: `dub`/`dublado` → `Dublado`; `leg`/`legendado` → `Legendado`; idioma estrangeiro conhecido sem português → `Gringo`; sem evidência → `Idioma Desconhecido`; título/descrição do site não alteram a classificação. Verificação: os casos de idioma passam e não há promoção a PT-BR sem evidência.
- [ ] 6.2 Cobrir a qualidade: `1080p` no nome do arquivo, `camrip` como `CAM` e ausência como `Desconhecida`; nenhuma requisição extra é feita para descobrir qualidade. Verificação: os casos de qualidade passam e o teste confirma que só os textos já obtidos são lidos.
- [ ] 6.3 Validar o contrato comum: `format` em todo stream, `name`/`title` gerados pelo formatador, `headers` só quando o gate confirmar necessidade, `Range` nunca no stream e ordenação por `sortByQuality`. Verificação: teste de contrato de filme e série confere os campos e a ordenação.

## 7. Ausência, falhas e fronteira de erro

- [ ] 7.1 Implementar a distinção entre ausência (busca vazia, tipo/ano incompatível, par de episódio não listado, ficha 404) e falha (layout sem `v_id`, busca inválida, 403/5xx, 404 de mídia anunciada, URL final inválida). Verificação: testes de ausência devolvem `[]` sem `console.error`; testes de falha lançam erro.
- [ ] 7.2 Garantir que `getStreams` é o único ponto de captura, registra `[Primeflix]` e devolve `[]`, sem lista parcial de etapa anterior. Verificação: teste com falha depois de um candidato válido confirma a lista vazia e o log.
- [ ] 7.3 Verificar que a URL assinada não aparece em mensagens de erro, fixtures, relatórios ou documentação. Verificação: os testes usam placeholders e uma busca no repositório não encontra `md5=`, `expires=` ou host real de mídia fora de `test/artifacts/`.

## 8. Build e documentação

- [ ] 8.1 Rodar `node build.js primeflix` e conferir `providers/primeflix.js`, `gdrive/providers/primeflix.js`, `prism/providers/primeflix.js` e os três manifests de formato. Verificação: o build termina com código 0 e os arquivos existem e exportam `getStreams`.
- [ ] 8.2 Rodar `npm run lint` e `npm test` no estado atual. Verificação: os dois comandos terminam com código 0.
- [ ] 8.3 Acrescentar a linha e a seção `## Primeflix` em `providers.md`, com status inicial `🟠 Não verificado`, tipos/formatos do gate e a data só quando houver rodada. Verificação: `node --test test/providers-catalog.test.js` passa.
- [ ] 8.4 Acrescentar em `docs/provider-investigation.md` o método de CMS próprio com busca JSON, ficha com `v_id`/`season`, player `/vvv`, `Range` no filme, HLS no episódio e os limites de busca, idioma e token `secure_link`; citar `src/primeflix/` e `test/primeflix.test.js`. Verificação: a seção existe, distingue o observado do não confirmado e não contém URL assinada.
- [ ] 8.5 Conferir que `docs/arch.md` não precisa mudar (nenhuma regra global nova), que `src/_blocks/index.md` continua igual e que o README não promete um provedor fora do manifest. Verificação: `git diff -- docs/arch.md src/_blocks/index.md` está vazio e o README segue a tabela.

## 9. Verificação online e status

- [ ] 9.1 Com o pacote final construído, rodar `npm run test:online -- --provider primeflix` usando `TMDB_API_KEY` somente do ambiente local. Verificação: o runner conclui a rodada e grava `test/artifacts/online/<run-id>/result.json`.
- [ ] 9.2 Atualizar a seção do Primeflix em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os dez casos. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [ ] 9.3 Se a rodada for inconclusiva ou falhar, registrar o resultado real e não promover `Estável` sem evidência; se o filme continuar em 403, manter o escopo só de série ou o status `Parcial`/`Instável` conforme `docs/tests.md`. Verificação: o status e o escopo do manifest batem com a evidência registrada.

## 10. Integração final

- [ ] 10.1 Rodar novamente `npm run lint`, `npm test`, `node build.js primeflix` e `node --test test/primeflix.test.js` no estado final. Verificação: todos terminam com código 0.
- [ ] 10.2 Conferir uma amostra de streams do relatório online: URL HTTP(S), `quality` normalizada, `language` do enum, `format` presente, `name`/`title` gerados pelo formatador e ausência de campos proibidos. Verificação: a amostra não tem campo obrigatório ausente nem `Range` em `headers`.
- [ ] 10.3 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão e que o diff gerado está sincronizado com `src/`. Verificação: `git diff --stat` mostra as saídas geradas apenas depois do build e `git status` não tem edição manual nas pastas geradas.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
