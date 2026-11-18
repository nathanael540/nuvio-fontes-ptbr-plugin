# Tasks

## 1. Estrutura, origem e manifest

- [x] 1.1 Criar `src/otakulogia/index.js`, `src/otakulogia/api.js`, `src/otakulogia/catalog.js` e `src/otakulogia/extractor.js` a partir do contrato de `src/_template/`, com `PROVIDER_NAME = 'Otakulogia'` e a captura única em `getStreams`; verificar que `npm run lint` aceita a estrutura inicial.
- [x] 1.2 No topo de `src/otakulogia/api.js` e no trecho de seleção de `src/otakulogia/catalog.js`, registrar a origem `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`; verificar que nenhuma URL de mídia, token, cookie ou segredo foi copiado.
- [x] 1.3 Adicionar a entrada `otakulogia` ao `manifest.json` com nome `Otakulogia`, versão `1.0.0`, autor `nathanael540`, `supportedTypes: ["movie", "tv"]`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, `enabled: true`, `filename: "providers/otakulogia.js"`, descrição em pt-BR e logo `https://www.google.com/s2/favicons?domain=otakulogia.com&sz=128`; verificar com `node --test test/manifest.test.js`.
- [x] 1.4 Rodar `node build.js otakulogia` e confirmar que `providers/otakulogia.js`, `gdrive/providers/otakulogia.js`, `prism/providers/otakulogia.js` e os `<formato>/manifest.json` são gerados sem erro; não editar os arquivos gerados à mão.

## 2. GraphQL e identidade

- [x] 2.1 Implementar em `api.js` o `POST` com `fetchJson`, `profile: 'api'`, `json: { query, variables }`, `Origin: https://otakulogia.com` e `Referer: https://otakulogia.com/`; rejeitar `errors` não vazio, `data` ausente ou `data` fora de objeto; não impor timeout, retentativa ou cache.
- [x] 2.2 Implementar a query de busca e as variáveis `{"input": {"query": "<título>", "limit": 12}}`; validar `data.searchAnimes` como objeto ou nulo e `items` como lista, tratando `searchAnimes` nulo e `items: []` como ausência e estrutura inválida como erro.
- [x] 2.3 Implementar os termos de busca com título PT-BR, original, alternativos brasileiros e romaji, deduplicados por `normalizeText` e limitados a oito; disparar em paralelo com captura individual de sucesso ou falha, parar no primeiro termo com correspondência e levar no máximo três itens ao detalhe.
- [x] 2.4 Implementar a confirmação por igualdade normalizada de `name`/`nameEn` com os títulos do TMDB e tolerância de um ano quando os dois lados tiverem ano; verificar com testes de correspondência exata, por `nameEn`, ano fora da tolerância e ausência de correspondência.
- [x] 2.5 Verificar o comportamento de falha de busca: um termo com erro e outro com correspondência continua, com aviso `[Otakulogia] Busca "<termo>" descartada: <causa>`; nenhum termo com correspondência e ao menos uma falha sobe como erro agregado; todas as buscas com sucesso e sem correspondência devolvem lista vazia.

## 3. Detalhe, temporada, episódio e filme

- [x] 3.1 Implementar a query de detalhe com `{"upstreamCid": <inteiro>, "upstreamTid": null}`; exigir `seasons` e `episodes` como listas, tratar `animeCatalogDetail: null` como ausência do item e estrutura inválida como falha isolada do candidato.
- [x] 3.2 Implementar a seleção de temporada pelo nome `Temporada N`, aceitando zeros à esquerda e sufixo após `|`, e `Filme` em pedido de filme; usar o número pedido, nunca a posição no array, e filtrar episódios por `upstreamTempId` igual ao `upstreamTid`.
- [x] 3.3 Implementar a seleção de episódio pela numeração da URL de `videoUrl` (`/(\d+)\.mp4(?:$|\?)/i`, aceitando `1.mp4` e `ep01.mp4`), ordenando a temporada por esse número e exigindo sequência contígua começando em 1; ignorar `episodeNumber` na seleção e devolver ausência para número pedido fora da sequência ou URL sem número.
- [x] 3.4 Implementar o filme pelas linhas `Filme` e, quando não houver, pela única temporada com exatamente um episódio; usar os episódios de `upstreamTempId` igual ao `upstreamTid`, todas as URLs distintas e sem teto de quatro; deduplicar por URL exata e devolver ausência quando houver mais de uma temporada de episódio único.
- [x] 3.5 Verificar com testes: série com duas temporadas, temporada com zero à esquerda e pipe, temporada ausente, nome fora do padrão, filme com uma e duas linhas `Filme`, filme em temporada de episódio único, duas temporadas de episódio único, episódios fora de ordem, `ep01.mp4`, `episodeNumber` repetido, URL com buraco e URL sem número.

## 4. Streams, qualidade, idioma e cabeçalhos

- [x] 4.1 Implementar a escolha da URL na ordem `videoUrl`, `videoUrlFhd`, `videoUrlSd`, aceitando apenas HTTP(S) válido; opção sem nenhuma URL válida é descartada com aviso, não confundida com ausência.
- [x] 4.2 Implementar a qualidade `FHD` quando a URL usada for `videoUrlFhd` e `SD` quando for `videoUrlSd`; sem correspondência, omitir `quality` e deixar a descoberta local no arquivo, na pasta e na URL, sem requisição extra.
- [x] 4.3 Implementar o idioma pelo `audioType` do episódio com fallback para o da temporada: `DUB` vira `LANGUAGE.DUBBED`, `LEG` vira `LANGUAGE.SUBTITLED` e valor ausente ou desconhecido não é informado.
- [x] 4.4 Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'Otakulogia'`, título, ano quando houver, temporada e episódio em série), `type: 'mp4'`, `headers` com `User-Agent` e `Referer` somente se a tarefa 4.7 comprovar a necessidade, sem `name`, `title` nem `provider`.
- [x] 4.5 Deduplicar a lista por URL exata, mantendo a primeira ocorrência, e ordenar com `sortByQuality` no ponto de entrada.
- [x] 4.6 Verificar com testes: `videoUrl` disponível, `videoUrl` vazio com FHD, qualidade FHD, qualidade SD, FHD e SD iguais, qualidade desconhecida, áudio DUB, LEG e desconhecido, fallback de áudio pela temporada, cabeçalhos somente com `User-Agent` e URLs duplicadas.
- [x] 4.7 Confirmar, com até duas requisições mínimas ao MP4, se o `Referer` é necessário; se for, acrescentar `Referer: https://otakulogia.com/` ao `headers` e ao teste, sem baixar mídia e sem registrar a URL.

## 5. Fronteira de erro

- [x] 5.1 Implementar a captura única em `getStreams`, com `console.error('[Otakulogia] Falha em <tipo> <id>: <causa>')` e retorno de lista vazia; confirmar que nenhuma outra função captura erro genérico.
- [x] 5.2 Validar `mediaType` em `movie`/`tv` e exigir `season`/`episode` inteiros a partir de 1 em série antes de qualquer requisição; filme ignora as coordenadas.
- [x] 5.3 Implementar o isolamento de cada detalhe com `console.warn('[Otakulogia] Opção <upstreamCid> descartada: <causa>')`; se nada produzir stream e algum candidato falhar, lançar erro agregado com as causas; se todos forem ausência, devolver lista vazia.
- [x] 5.4 Verificar com testes: `errors` GraphQL, corpo não JSON, `data` ausente, lista de resultados vazia, HTTP 429/5xx, um detalhe falhando entre dois, todos os detalhes falhando, todos os detalhes nulos e `mediaType` inválido.
- [x] 5.5 Confirmar que não há `AbortController`, `setTimeout`, `setInterval`, retentativa, cache ou sonda de mídia no código do provedor.

## 6. Fixtures e suíte offline

- [x] 6.1 Criar `test/fixtures/otakulogia/` com respostas sanitizadas: busca com correspondência, busca com `nameEn`, busca sem resultado, detalhe de série com duas temporadas, detalhe de filme na temporada `Filme`, detalhe de filme em temporada de episódio único, episódios fora de ordem, `episodeNumber` repetido, URLs `ep01.mp4`, URL com buraco, detalhe com `videoUrl` vazio e FHD/SD, resposta com `errors` e corpo não JSON.
- [x] 6.2 Substituir hosts de mídia por `cdn.example` e remover qualquer cookie, token, URL assinada ou dado pessoal; verificar que nenhuma fixture contém URL de mídia real.
- [x] 6.3 Criar `test/otakulogia.test.js` com `buildProvider` em diretório temporário e `fetch` simulado, cobrindo os casos de busca, identidade, temporada, episódio, filme, streams, deduplicação, ordenação e erros; executar `node --test test/otakulogia.test.js` sem internet.
- [x] 6.4 Confirmar que os testes exercitam o pacote gerado, não só o código-fonte, e que as asserções verificam `url`, `quality`, `language`, `type`, `headers`, `name` e `title` formatados.

## 7. Documentação e perfis

- [x] 7.1 Adicionar em `providers.md` a linha com `Otakulogia`, ID em crase, tipos `filme, série`, formato `MP4`, status `🟠 Não verificado` e data `—`, além da seção `## Otakulogia` com `**Status: 🟠 Não verificado.**`, coerentes com a descrição do manifest; verificar com `node --test test/providers-catalog.test.js`.
- [x] 7.2 Atualizar `docs/provider-investigation.md` com a seção 3.37, “GraphQL público de catálogo de animes”, marcada como “Situação: Em uso no Otakulogia”, contendo as duas queries, as variáveis, a leitura de `items`/`seasons`/`episodes`, a confirmação por título e ano, a seleção pela numeração da URL e o motivo de ignorar `episodeNumber`, o caso `Filme` e a temporada de episódio único, a classificação de áudio e os limites; registrar que a reutilização em outra fonte é hipótese até nova evidência e referenciar `src/otakulogia/` e `test/otakulogia.test.js`.
- [x] 7.3 Adicionar `otakulogia` a `test/online/profiles.json` com `exclusiveTag: "anime"` e incrementar a revisão do arquivo; verificar com `node --test test/online-catalog.test.js` que o perfil tem pelo menos cinco filmes e cinco séries elegíveis.
- [x] 7.4 Revisar `README.md`, `docs/arch.md`, `docs/tests.md`, `test/README.md` e `src/_blocks/index.md`; alterar somente se o novo provedor mudar uma lista, convenção ou regra global, registrando o motivo no `design.md`.
- [x] 7.5 Confirmar que nenhum bloco novo foi criado e que `src/_blocks/index.md` permanece inalterado.

## 8. Build e validação

- [x] 8.1 Rodar `npm run lint` e corrigir qualquer violação do perfil de runtime, sem desativar regra do lint.
- [x] 8.2 Rodar `npm test` e confirmar que as suítes de provedores, manifest, catálogo, build, servidor e infraestrutura online passam.
- [x] 8.3 Rodar `node build.js otakulogia` e confirmar o build nos três formatos, sem editar os arquivos gerados manualmente.
- [x] 8.4 Rodar `node --test test/manifest.test.js`, `node --test test/providers-catalog.test.js`, `node --test test/online-catalog.test.js` e `node --test test/otakulogia.test.js`; registrar no `design.md` qualquer exclusão ou caso não coberto.
- [x] 8.5 Conferir que `providers/otakulogia.js` não usa `async`/`await` no arquivo final e que exporta apenas `getStreams`.

## 9. Verificação online

- [x] 9.1 Executar `node build.js otakulogia` imediatamente antes da rodada para que o pacote avaliado seja o final.
- [x] 9.2 Rodar `npm run test:online -- --provider otakulogia --record` com `TMDB_API_KEY` apenas no ambiente local, perfil `anime`, e conferir a seção gerada em `providers.md`; sem a chave, o provedor fica inconclusivo por configuração e a rodada não é registrada como falha da fonte.
- [x] 9.3 Verificar, com no máximo duas requisições mínimas ao MP4 e sem baixar mídia, se o arquivo responde com e sem `Referer`; registrar a data e o resultado no `design.md` e ajustar `headers` somente se houver evidência. A URL de mídia não entra em fixture, log público, `design.md` ou `providers.md`.
- [x] 9.4 Atualizar o status e a data em `providers.md` conforme os critérios de `docs/tests.md`: `🟢 Estável` com ao menos um título resolvido em cada tipo, `🔵 Parcial` com um tipo comprovado e outro sem resolução, `🔴 Instável` sem resolução em nenhum tipo e `🟠 Não verificado` se a rodada for inconclusiva.
- [x] 9.5 Se a rodada for inconclusiva por timeout, cota ou configuração, manter a mudança sem arquivar, registrar o motivo no `design.md` e não descrever o caso como ausência no acervo.

## 10. Workflow follow-up

- [x] 10.1 Arquivar a mudança somente com os testes previstos passando e a rodada online registrada, ou declarar explicitamente no `design.md` o que ficou fora e o motivo de não arquivar.
- [x] 10.2 Preparar o commit `feat(otakulogia): adiciona provedor Otakulogia`, com o corpo `OpenSpec: adicionar-provedor-otakulogia`, incluindo `src/otakulogia/`, `providers/`, `gdrive/providers/`, `prism/providers/`, `manifest.json`, `providers.md`, `docs/provider-investigation.md`, `test/otakulogia.test.js`, `test/fixtures/otakulogia/` e `test/online/profiles.json`.
- [x] 10.3 Conferir que o commit não inclui arquivos gerados fora da mudança, `test/artifacts/`, chaves, tokens ou URLs de mídia.
