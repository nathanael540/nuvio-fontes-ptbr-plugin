# Tasks

## 1. Estrutura do provedor e manifest

- [x] 1.1 Criar `src/topfilmes/index.js` no contrato do app (captura única em `getStreams`, `console.error('[TopFilmes] ...')`, `sortByQuality` e retorno `[]` para `mediaType` diferente de `movie` antes de qualquer rede) e `src/topfilmes/extractor.js` com as etapas de busca, ficha, players e montagem. Verificação: `node build.js topfilmes` termina com código 0 e `providers/topfilmes.js` exporta `getStreams`.
- [x] 1.2 Acrescentar a entrada `topfilmes` em `manifest.json` na versão `1.0.0`, com `supportedTypes` `["movie"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]`, descrição em pt-BR e logo `https` de favicon do domínio. Verificação: `node --test test/manifest.test.js` passa.
- [x] 1.3 Conferir que o provedor usa apenas as globais e módulos do runtime (`cheerio-without-node-native`, blocos existentes, `fetch`) e nenhuma API de Node, `axios` ou `setTimeout`. Verificação: `npm run lint` passa em `src/topfilmes/`.

## 2. Busca e confirmação de identidade

- [x] 2.1 Implementar a busca `GET /busca?q=<termo>` com `URLSearchParams` e perfil `page`, parsing por cheerio básico de `.filmes`, `.filme`, `a`, `.title` e `.year`, com `url` resolvida contra a origem. Verificação: um teste com fixture de busca devolve os cartões esperados e uma página sem `.filmes` lança erro.
- [x] 2.2 Implementar a consulta a `getMediaInfo` e a tentativa de `title`, `originalTitle` e até dois `alternativeTitles`, parando no primeiro termo com candidato confirmável; todos os termos vazios devolvem `[]` sem erro. Verificação: testes de título PT-BR, título original e busca vazia passam.
- [x] 2.3 Escolher o candidato com `findBestMatch` pelo título e ano do cartão e confirmar na ficha `/assistir/<slug>` pelo título de `.infos h2` e pelo primeiro `.info` de quatro dígitos; ano mais de um ano distante descarta o candidato e ficha sem ano mantém o ano do cartão. Verificação: testes de candidato confirmado, ano incompatível, ficha sem ano e título incompatível passam.
- [x] 2.4 Criar as fixtures `search-vingadores.html`, `search-empty.html`, `search-fallback.html`, `detail-movie.html`, `detail-year-mismatch.html`, `detail-no-year.html` e `detail-title-mismatch.html`, sanitizadas, e os casos correspondentes em `test/topfilmes.test.js`. Verificação: os casos de filme resolvido, fallback por título original, busca vazia, ano incompatível, ficha sem ano e layout de busca alterado passam.

## 3. Players, idioma e streams

- [x] 3.1 Implementar a leitura de `.links_dub a` e `.links_leg a`, aceitando somente links do próprio domínio no caminho `/player/`, ignorando embeds externos e blocos comentados, deduplicando por URL e tratando ficha válida sem player como ausência e ficha sem `.links` ou sem título como erro. Verificação: testes de player dublado, player legendado, embed externo ignorado, ficha sem player e layout alterado passam.
- [x] 3.2 Implementar a consulta de cada `/player/<slug>?player=<n>` com `fetchText`, a leitura de todos os `<source>` com `src`, `size` e `type`, a resolução de `src` iniciado por `//` e a conversão de `size` em qualidade (`360` → `360p`, `720` → `720p`). Verificação: fixtures de player com dois sources, um source e source repetido produzem as qualidades esperadas e deduplicam a repetição.
- [x] 3.3 Montar cada stream com `buildStream`: `format` com `FORMATTER.AUTO`, `addon` `TopFilmes`, título e ano; `provider` `MediaFire`; `type` `mp4`; idioma do contêiner (`Dublado` ou `Legendado`); sem `name`, `title`, `headers`, `size` ou `subtitles` inventados; ordenar com `sortByQuality`. Verificação: testes de contrato conferem `quality`, `language`, `provider`, `format`, ausência de `name`/`title` e ordenação.
- [x] 3.4 Isolar a falha de cada player com `console.warn('[TopFilmes] Opção <jogador/qualidade> descartada: <causa>')`, preservando as demais opções, e lançar erro com a causa de cada uma quando todas falharem; nenhuma mensagem inclui a URL de mídia ou `expires`. Verificação: teste de um player com falha preserva o outro; teste de todos com falha faz `getStreams` devolver `[]` com `console.error`; a captura do log não contém `expires`.
- [x] 3.5 Criar as fixtures `player-two-sources.html`, `player-one-source.html`, `player-duplicate-source.html`, `player-missing-source.html`, `detail-no-player.html` e `detail-external-player.html`, com hosts e tokens fictícios, e os casos correspondentes em `test/topfilmes.test.js`. Verificação: `grep` não encontra `expires=`, `mediafire.com` nem URL assinada real nas fixtures.

## 4. Ausência, contrato e falhas fatais

- [x] 4.1 Garantir que pedido de série devolve `[]` sem chamar TMDB ou a fonte e que temporada/episódio são ignorados em filme. Verificação: teste com `mediaType` `tv` não registra requisição simulada e devolve lista vazia.
- [x] 4.2 Garantir que somente `getStreams` captura a falha final, registra `[TopFilmes]` e devolve `[]`, sem streams parciais de candidatos ou players anteriores. Verificação: testes de falha depois da busca confirmam lista vazia e log com o prefixo.
- [x] 4.3 Conferir que ausência reconhecida (busca vazia, nenhum candidato, ficha sem player) não registra `console.error` e que erro de layout, HTTP fora de 2xx e falha de todos os players registram erro. Verificação: os casos de ausência e de falha em `test/topfilmes.test.js` passam com as asserções de log.

## 5. Build e validação local

- [x] 5.1 Rodar `node build.js topfilmes` e conferir `providers/topfilmes.js`, `gdrive/providers/topfilmes.js`, `prism/providers/topfilmes.js` e os três manifests de formato. Verificação: o build termina com código 0, os arquivos existem e cada pacote exporta `getStreams`.
- [x] 5.2 Rodar `npm run lint` e `npm test` no estado final. Verificação: os dois comandos terminam com código 0.
- [x] 5.3 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão. Verificação: `git diff --stat` mostra as saídas geradas apenas depois do build.

## 6. Documentação operacional e método

- [x] 6.1 Acrescentar a linha e a seção `## TopFilmes` em `providers.md`, com status inicial `🟠 Não verificado`, tipos `filme`, formato `MP4` e a data da verificação somente quando houver rodada. Verificação: `node --test test/providers-catalog.test.js` passa.
- [x] 6.2 Acrescentar em `docs/provider-investigation.md`, na seção 3.12, a variação de MP4 entregue por redirecionamento da própria fonte para uma hospedagem externa: contrato observado, ausência de `Referer`/cookie na reprodução, motivo para devolver a URL da fonte e não a URL final, limites de validade e referências a `src/topfilmes/extractor.js` e `test/topfilmes.test.js`. Verificação: a seção existe, distingue método em uso de hipótese e não contém URL assinada real.
- [x] 6.3 Conferir que `docs/arch.md` não precisa mudar (nenhuma regra global nova), que `src/_blocks/index.md` continua igual (nenhum bloco novo) e que o README não promete um provedor fora do manifest. Verificação: `git diff -- docs/arch.md src/_blocks/index.md` está vazio e o README continua coerente com a tabela.

## 7. Verificação online e status

- [x] 7.1 Com o pacote final construído, rodar `npm run test:online -- --provider topfilmes` usando `TMDB_API_KEY` somente do ambiente local. Verificação: o runner conclui a rodada e grava o relatório em `test/artifacts/online/<run-id>/result.json`.
- [x] 7.2 Atualizar a seção do TopFilmes em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os cinco casos de filme. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [x] 7.3 Se a rodada for inconclusiva ou falhar, registrar o resultado real e não marcar `Estável` sem evidência. Verificação: o status segue `docs/tests.md`, seção 7, e os casos inconclusivos permanecem visíveis.

## 8. Integração final

- [x] 8.1 Rodar novamente `npm run lint`, `npm test`, `node build.js topfilmes` e `node --test test/topfilmes.test.js` no estado final. Verificação: todos terminam com código 0.
- [x] 8.2 Conferir uma amostra de streams do relatório online: URL `http(s)`, `quality` derivada de `size`, `language` do enum, `provider` `MediaFire`, `format` presente e `name`/`title` gerados pelo formatador. Verificação: a amostra não tem campo obrigatório ausente nem campo proibido.
- [x] 8.3 Procurar segredos e tokens no repositório (`expires=`, `mediafire.com`, cookies e URLs assinadas) fora de `test/artifacts/`. Verificação: nenhuma ocorrência em arquivos versionados.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
