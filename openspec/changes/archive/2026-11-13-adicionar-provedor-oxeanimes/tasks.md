# Tasks

## 1. Catálogo e identidade por áudio

- [x] 1.1 Criar fixtures reais sanitizadas em `test/fixtures/oxeanimes/` para busca com dublado e legendado, busca com arco de outro ano, busca vazia, página de série com episódios fora de ordem, página de filme, página sem link legível, episódio com `streamUrl`, episódio só com `sources` HLS, episódio só `embed`, resposta 502 e JSON inválido; conferir que nenhuma URL assinada, token ou cookie ficou no repositório.
- [x] 1.2 Implementar em `src/oxeanimes/catalog.js` a busca por variantes (`title`, `originalTitle`, `alternativeTitles`, `romajiTitles`, termo de temporada) com acúmulo por `href`, a classificação dublado/legendado por título e slug e a pontuação por `titleSimilarity` com limiar 0,60; verificar com testes de duas listas de áudio, título exato contra arco de 2025, busca vazia e limiar não atingido.
- [x] 1.3 Implementar a seleção do melhor candidato por áudio e a tentativa de até três candidatos quando a página não tiver o episódio; verificar com testes de primeira página correta, primeira sem o episódio e nenhuma com o episódio.
- [x] 1.4 Criar `src/oxeanimes/index.js` com validação de entrada, log `[OxeAnimes]`, captura única de erros e `sortByQuality`; verificar com `node --test test/oxeanimes.test.js` e com o pacote exportando `getStreams`.

## 2. Página da obra e episódio

- [x] 2.1 Implementar em `src/oxeanimes/page.js` a leitura de `/anime/<slug>` com cheerio básico, o mapeamento de `a[href*="/watch/"]` pelo `alt`/texto `Episódio N`, a deduplicação por URL e a escolha do número pedido; verificar com testes de episódios fora de ordem, episódio ausente, link sem número e página sem links.
- [x] 2.2 Implementar o caso de filme com entrada única ou rótulo `Episódio 1`, devolvendo erro de estrutura quando houver mais de uma URL sem rótulo inequívoco; verificar com testes de filme de uma entrada, filme com duplicata do mesmo link e filme com duas entradas distintas.
- [x] 2.3 Implementar a consulta `GET /api/episode/<id>?slug=<slug>` com `Referer`, a leitura de `streamUrl` e de `sources[]` `type: "hls"`, a resolução de URL relativa e a triagem de `embed`; verificar com testes de `streamUrl`, só `sources`, só `embed`, resposta 502 e JSON inválido.

## 3. Streams e contrato

- [x] 3.1 Confirmar o idioma pelo `tipo`/`title` do episódio e isolar cada áudio como opção independente, com `Promise.all` sobre resultados convertidos, aviso `[OxeAnimes] Opção <áudio> descartada: <causa>` e erro agregado quando todos falharem; verificar com testes de dois áudios, um falhando e todos falhando.
- [x] 3.2 Montar os streams com `buildStream`, `type: 'hls'`, `provider: 'OxeAnimes'`, `headers` com `Referer`/`User-Agent`, `quality` só quando o rótulo tiver resolução numérica e `format` com título, ano e coordenadas; verificar nos três templates publicados os campos `name`, `title`, `quality`, `language` e `headers`.
- [x] 3.3 Cobrir ausência reconhecida e erros de estrutura em `test/oxeanimes.test.js`: título ausente, episódio ausente, página inválida, busca não-2xx e falha da API; verificar que `getStreams` registra `[OxeAnimes]` e devolve `[]` nos casos fatais.
- [x] 3.4 Verificar que o provedor não faz requisição à master, não instala timeout e não lê settings; conferir no teste que o `fetch` simulado recebe apenas as rotas de busca, página e episódio.

## 4. Manifest, verificação online e documentação

- [x] 4.1 Adicionar a entrada `oxeanimes` ao `manifest.json` com nome, versão `1.0.0`, autor, tipos `["movie","tv"]`, formato `["m3u8"]`, idioma `pt` e logo HTTPS; verificar com `node -e` que os campos obrigatórios estão corretos e com `node build.js oxeanimes`.
- [x] 4.2 Adicionar `oxeanimes: { "exclusiveTag": "anime" }` em `test/online/profiles.json` e atualizar `revision`/`curatedAt`; verificar com `node --test test/online-catalog.test.js`.
- [x] 4.3 Adicionar a linha e a seção `## OxeAnimes` em `providers.md` com status `🟠 Não verificado` e sem bloco de verificação; verificar com `node --test test/providers-catalog.test.js`.
- [x] 4.4 Atualizar `docs/provider-investigation.md` com “Proxy de streaming próprio com Referer”, citando `src/oxeanimes/`, os testes e a spec; verificar que a seção registra o 403 sem `Referer`, o 403 do CDN e o 502 por episódio.

## 5. Integração e evidência online

- [x] 5.1 Rodar `npm run lint`, `npm test` e `node build.js oxeanimes`; verificar que não há falha e que os arquivos gerados foram atualizados.
- [x] 5.2 Executar `npm run test:online -- --provider oxeanimes` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; verificar a saída do runner e o relatório transitório sanitizado e registrar a rodada em `providers.md` conforme `docs/tests.md`.
- [x] 5.3 Ajustar o status de `providers.md` conforme os critérios de `docs/tests.md` e registrar no design a limitação de proxy 502 se ela persistir; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/oxeanimes-provider/spec.md`.
