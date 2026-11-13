# Tasks

## 1. Fixtures e leitura da fonte

- [x] 1.1 Capturar fixtures reais sanitizadas em `test/fixtures/doramogo/`: busca com resultado único, busca de variante legendada, busca sem resultado, ficha de série de uma temporada, ficha de série com três temporadas, ficha de filme, episódio de série, episódio de temporada posterior, episódio de filme, episódio redirecionado e página sem configuração de player. Remover cookies, tokens e URLs assinadas; verificar com `node -e` que cada arquivo contém os seletores e marcadores esperados e nenhum `PHPSESSID`, token ou URL assinada.
- [x] 1.2 Criar `src/doramogo/site.js` com a leitura dos cartões de busca (título, tipo, URL e ID do TMDB no pôster), da ficha (rótulo `Áudio:`, links de episódio, entrada de filme e pôster principal), da página de episódio (`urlConfig` e `FALLBACK_URL`) e a montagem da URL HLS de série e de filme; adicionar ao `test/doramogo.test.js` os casos de parsing (ID exato, título decorado, cartão sem ID, tipo conflitante, rótulos dublado e legendado, ficha com três temporadas, entrada de filme, configuração de série e de filme, configuração ausente e as duas URLs) e verificar com `node --test test/doramogo.test.js`.

## 2. Extrator, streams e testes do provedor

- [x] 2.1 Criar `src/doramogo/extractor.js` para validar a entrada, obter o `MediaInfo`, buscar as variantes de título do TMDB, confirmar candidatos pelo ID do pôster, resolver cada variante de áudio como opção independente, selecionar episódio ou filme e montar os streams com `buildStream` e `format`; criar `src/doramogo/index.js` com `PROVIDER_NAME = 'Doramogo'`, captura única em `getStreams`, log `[Doramogo]`, deduplicação por URL e `sortByQuality`; verificar com um caso de filme e um de série em `node --test test/doramogo.test.js`.
- [x] 2.2 Ampliar o `test/doramogo.test.js` para temporada posterior (`Sweet Home` S02E01), variante legendada (`Itaewon Class`), duas variantes de áudio, ausência de título, ausência de episódio, tipo e ID conflitantes, redirecionamento de episódio, configuração ausente, falha de uma variante e falha de todas; verificar com `node --test test/doramogo.test.js`.
- [x] 2.3 Verificar no teste os campos do contrato: URL HLS, `headers` de reprodução, `language` do rótulo, `provider` `doramogo`, `type` `hls`, qualidade `Desconhecida` sem rótulo, ausência de tamanho e legendas externas, e `name`/`title` gerados nos formatos `gdrive` e `prism`; rodar `node --test test/doramogo.test.js` e confirmar as duas variantes de formato.

## 3. Manifesto, catálogo e documentação

- [x] 3.1 Adicionar a entrada `doramogo` ao `manifest.json` com versão `1.0.0`, tipos `movie` e `tv`, formato `["m3u8"]`, `contentLanguage` `["pt"]`, `filename` `providers/doramogo.js` e logo PNG HTTPS do site; verificar com `node --test test/manifest.test.js`.
- [x] 3.2 Adicionar a linha e a seção do Doramogo em `providers.md` com `🟠 Não verificado` e `—` na última verificação, sem bloco de rodada; verificar com `node --test test/providers-catalog.test.js`.
- [x] 3.3 Acrescentar em `docs/provider-investigation.md` o método de busca HTML com confirmação pelo ID do TMDB no nome da imagem, a leitura do caminho de mídia publicado (`urlConfig` + host alternativo) e a exigência de `Referer` no host de mídia, com referências a `src/doramogo/` e `test/doramogo.test.js` e os limites observados; verificar que todos os caminhos citados existem.
- [x] 3.4 Confirmar que `test/online/profiles.json` permanece inalterado e que o catálogo `movie` não tem cinco títulos com a tag `dorama`, mantendo o perfil generalista; verificar com `node --test test/online-catalog.test.js`.
- [x] 3.5 Rodar `node build.js doramogo` e confirmar a geração de `providers/doramogo.js`, `gdrive/providers/doramogo.js`, `prism/providers/doramogo.js` e dos `<formato>/manifest.json`; verificar com `node --test test/build.test.js`.

## 4. Verificação integrada e evidência online

- [x] 4.1 Rodar `npm run lint`, `npm test` e `node build.js doramogo` com todos os casos de desenvolvimento passando; corrigir qualquer regressão antes de prosseguir.
- [x] 4.2 Executar `npm run test:online -- --provider doramogo --seed <valor> --record` com `TMDB_API_KEY` apenas no ambiente e uma semente cuja seleção inclua ao menos um título de dorama no `tv`; registrar a semente e a rodada em `providers.md` e ajustar o status conforme a evidência.
- [x] 4.3 Repetir `npm test` e `node --test test/providers-catalog.test.js` depois do registro online para confirmar a consistência do catálogo e do status.
- [x] 4.4 Revisar os artefatos e a documentação da mudança, mantendo as limitações declaradas no `design.md`: busca de 18 cartões sem paginação, host primário 403, ano da ficha não confiável, perfil generalista e playlist não sondada.

## Workflow follow-up

- Arquivar a mudança depois da revisão do mantenedor, com a rodada online registrada ou com a exclusão explicitamente declarada.
- Verificar o resultado arquivado em `openspec/specs/doramogo-provider/spec.md`.
