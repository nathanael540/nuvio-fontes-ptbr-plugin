# Tasks

## 1. Cliente assinado e busca em `h5-api.otv.cc`

- [x] 1.1 Implementar `src/seekee/api.js` com criptografia RSA-1024 PKCS#1 v1.5 pura em ES2016 (sem `BigInt` nem APIs exclusivas do Node), geração de assinatura `sign`/`aeskey` via `crypto-js` (AES-128-ECB + MD5) e consulta a `https://h5-api.otv.cc/quan/h5/search/search` com validação de `code === "00000"`; verificar via casos unitários em `test/seekee.test.js` cobrindo formato dos cabeçalhos, ordenação de parâmetros e erro técnico em resposta não-`"00000"`.
- [x] 1.2 Implementar triagem e confirmação de candidatos por TMDB (`tmdb-info`, `title-match`, `slugify`) com filtro de `typeCode` (`movie`/`drama`), comparação de título e slug e checagem de ano em filmes; verificar via fixtures sanitizadas em `test/fixtures/seekee/` que filme, série, fallback para título original e ausência sem correspondência passam em `node --test test/seekee.test.js`.

## 2. Rede de espelhos, temporadas, episódios e extração de streams

- [x] 2.1 Implementar `src/seekee/extractor.js` e `src/seekee/index.js` com reescrita de `h5.onfilom.com` para a lista ordenada de 7 espelhos (`es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com`, `ww20.321moviesfree.com`), navegação para `seasons[].websiteParam` em séries, validação estrita de `currentEpisodeNumber === episode`, expansão de `dubbingList`, extração de `mediaInfoList`/`definitionList`/`subtitlingList` e montagem ordenada via `buildStream` e `sortByQuality`; verificar com fixtures reais sanitizadas cobrindo filme, série em temporada > 1, variante dublada + legendada, áudio estrangeiro sem legenda PT (`Gringo`), episódio inexistente com fallback para episódio 1 descartado, failover de espelho após HTTP 403 e isolamento de falha parcial em `node --test test/seekee.test.js`.

## 3. Registro, build e documentação

- [x] 3.1 Adicionar a entrada `seekee` em `manifest.json` (`supportedTypes: ["movie", "tv"]`, `formats: ["m3u8"]`, `contentLanguage: ["pt"]`) e executar `node build.js seekee`; verificar geração de `providers/seekee.js`, `gdrive/providers/seekee.js`, `prism/providers/seekee.js` e aprovação dos testes `test/manifest.test.js` e `test/build.test.js`.
- [x] 3.2 Atualizar `providers.md` (linha na tabela e seção `## Seekee` com `🟠 Não verificado`) e documentar o método de busca assinada com espelhos `/pt/detail/` em `docs/provider-investigation.md`; verificar aprovação de `test/providers-catalog.test.js`.
- [x] 3.3 Executar `npm run lint` e `npm test` completos no repositório; verificar código de saída `0` em todos os testes e zero alertas/erros de ESLint (incluindo regras de runtime QuickJS em `src/seekee/`).

## Workflow follow-up

- Executar `npm run test:online -- --provider seekee --record` após configurar `TMDB_API_KEY` no ambiente para validar títulos reais de filme e série e atualizar `providers.md` com o status verificado (ver `docs/tests.md`).
- Arquivar a change `novo-provedor-seekee` com `/opsx:archive` após a rodada online e revisão aprovadas.
