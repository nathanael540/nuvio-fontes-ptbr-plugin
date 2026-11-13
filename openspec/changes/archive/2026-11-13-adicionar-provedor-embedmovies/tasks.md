# Tasks

## 1. Estrutura do provedor e manifest

- [x] 1.1 Criar `src/embedmovies/index.js` no contrato do app, com validação de `tmdbId`, `mediaType`, temporada e episódio, captura única em `getStreams`, `console.error('[EmbedMovies] ...')`, `sortByQuality` e retorno `[]` para entrada inválida antes de qualquer rede. Verificação: `node build.js embedmovies` termina com código 0 e `providers/embedmovies.js` exporta `getStreams`.
- [x] 1.2 Criar `src/embedmovies/extractor.js` com as etapas de busca no catálogo, montagem do endereço do player e chamada ao bloco `fireplayer`, sem APIs do Node e sem rede no carregamento do módulo. Verificação: `npm run lint` passa em `src/embedmovies/`.
- [x] 1.3 Acrescentar a entrada `embedmovies` ao fim de `manifest.json`, versão `1.0.0`, nome `EmbedMovies`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, `contentLanguage` `["pt"]`, descrição em pt-BR e logo `https` do favicon do domínio. Verificação: `node --test test/manifest.test.js` passa.
- [x] 1.4 Acrescentar a linha e a seção `## EmbedMovies` em `providers.md` com status inicial `🟠 Não verificado`, tipos `filme, série`, formato `HLS` e data de verificação somente quando houver rodada. Verificação: `node --test test/providers-catalog.test.js` passa.

## 2. Busca e identidade no catálogo

- [x] 2.1 Implementar a busca `POST https://embedmovies.org/inc/Ajax.php` com `fetchJson`, perfil `api`, `Referer` da origem e formulário `{ type: 'search', search: String(tmdbId) }`, sem `csrf_token` e sem `TMDB_API_KEY`. Verificação: um teste com fixture de busca devolve o item esperado e uma resposta HTTP fora de 2xx ou JSON inválido lança erro.
- [x] 2.2 Confirmar a identidade por correspondência exata de `Number(item.tmdb_id) === Number(tmdbId)` e `item.type` igual a `movie` para filme ou `tv` para série; ignorar o mesmo ID com tipo divergente e tratar ausência de correspondência como `[]` sem erro. Verificação: testes de filme encontrado, série encontrada, tipo divergente e busca vazia passam.
- [x] 2.3 Rejeitar resposta sem `success` verdadeiro ou sem `results` em array como erro de contrato, sem confundir com ausência. Verificação: testes de resposta malformada e de `success: false` devolvem `[]` com `console.error` e sem requisição ao player.
- [x] 2.4 Criar as fixtures `search-movie.json`, `search-tv.json`, `search-empty.json`, `search-type-mismatch.json` e `search-malformed.json` em `test/fixtures/embedmovies/`, sanitizadas. Verificação: os casos correspondentes em `test/embedmovies.test.js` passam e as fixtures não contêm URL de mídia real.

## 3. Player, streams e documentação do método

- [x] 3.1 Montar o endereço do player a partir do `embed` confirmado: filme usa o endereço como está; série remove a barra final e acrescenta `/<temporada>/<episódio>`. Validar HTTP(S) e os domínios `myembed.biz` e `playerflix.ink`; `embed` ausente ou fora deles é erro de contrato. Verificação: testes de player de filme, player de série e `embed` inválido passam.
- [x] 3.2 Chamar `playEntries` do bloco `fireplayer` com a entrada do player, `logName` e `domain` `embedmovies`, `providerName` `EmbedMovies`, `identity` com `tmdbId` e `imdb_id` do catálogo, e `meta` com título e ano do catálogo. Verificação: testes de filme e série resolvidos devolvem streams HLS com `provider` do host resolvido.
- [x] 3.3 Conferir o contrato do stream: `name` e `title` gerados pelo formatador, `format` com `FORMATTER.AUTO`, `addon` `EmbedMovies`, título, ano e coordenadas; `type` `hls`; cabeçalhos, legendas e idioma somente da cadeia; lista ordenada por qualidade. Verificação: testes de contrato conferem os campos e a ordenação, sem `name`/`title` informados pelo provedor.
- [x] 3.4 Implementar a triagem de opções não suportadas pelo bloco (`watchplay.shop`, Blogger, `ok.ru`, `embedplayabyss.top`, `budget danger`) e o isolamento de falha técnica por opção; se todas forem triagem, devolver `[]`, e se houver falha técnica sem stream, lançar erro com as causas. Verificação: testes de opção não suportada, falha isolada e todas as opções sem stream passam.
- [x] 3.5 Criar as fixtures `myembed-movie.html`, `myembed-tv.html`, `playerflix-movie.json`, `playerflix-tv.json`, `embedplayer-video.html`, `embedplayer-api.json` e `master.m3u8` em `test/fixtures/embedmovies/`, com hosts, hashes e ids fictícios. Verificação: os testes de filme e série resolvidos usam as fixtures e não fazem rede.
- [x] 3.6 Atualizar `docs/provider-investigation.md`, seção 3.1, com a variação “busca AJAX que aceita o ID do TMDB e devolve o embed de um player já coberto pelo bloco `fireplayer`”: contrato observado, referência a `src/embedmovies/extractor.js` e `test/embedmovies.test.js`, e limite das opções não suportadas. Verificação: a seção distingue método em uso de hipótese e não contém URL de mídia real.

## 4. Ausência, falhas e efemeridade

- [x] 4.1 Garantir que ausência reconhecida (sem correspondência exata ou todas as opções apenas triagem) devolve `[]` sem `console.error`; falha de busca, de contrato ou de todas as opções sobe até `getStreams`, que registra `[EmbedMovies] ...` e devolve `[]`. Verificação: testes de ausência, falha de busca e todas as opções com falha conferem os logs.
- [x] 4.2 Garantir que nenhum stream parcial de etapa anterior é devolvido quando a resolução falha depois da busca. Verificação: teste com busca confirmada e player inexistente devolve `[]` e registra erro.
- [x] 4.3 Garantir que entrada inválida (`tmdbId` não numérico ou zero, tipo fora de `movie`/`tv`, série sem temporada ou episódio válidos) devolve `[]` sem requisição simulada. Verificação: teste de entradas inválidas confere `calls.length === 0` e o prefixo `[EmbedMovies] Entrada:`.
- [x] 4.4 Sanitizar avisos e erros com `redact` do bloco, sem URL de mídia, hash, token ou parâmetro assinado. Verificação: a captura de logs dos testes não contém `m3u8`, `md5=`, `expires=` nem hash hexadecimal longo.

## 5. Build, validação e verificação online

- [x] 5.1 Rodar `node build.js embedmovies` e conferir `providers/embedmovies.js`, `gdrive/providers/embedmovies.js`, `prism/providers/embedmovies.js` e os três manifests de formato. Verificação: o build termina com código 0, os arquivos existem e cada pacote exporta `getStreams`.
- [x] 5.2 Rodar `npm run lint` e `npm test` no estado final. Verificação: os dois comandos terminam com código 0.
- [x] 5.3 Rodar `npm run test:online -- --provider embedmovies` com o pacote final. Verificação: o runner conclui a rodada e grava o relatório em `test/artifacts/online/<run-id>/result.json`.
- [x] 5.4 Atualizar a seção do EmbedMovies em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os cinco casos de filme e os cinco de série. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [x] 5.5 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão e que `docs/arch.md`, `src/_blocks/index.md` e `README.md` continuam coerentes, sem bloco novo. Verificação: `git diff --stat` mostra as saídas geradas somente depois do build e `git diff -- docs/arch.md src/_blocks/index.md` está vazio.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
