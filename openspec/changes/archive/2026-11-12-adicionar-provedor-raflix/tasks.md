# Tasks

## 1. Estrutura, manifest e fixtures

- [x] 1.1 Criar `src/raflix/` com `index.js`, `api.js`, `boot.js` e `streams.js`, seguindo o contrato de `src/_template/` e os padrões de `src/megaembed/`; verificar que os quatro arquivos existem e que `npm run lint` aceita a estrutura inicial.
- [x] 1.2 Adicionar a entrada `raflix` ao `manifest.json` com nome `Raflix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formato `m3u8`, `contentLanguage` `pt` e logo HTTPS; verificar com `node --test test/manifest.test.js` e `node build.js raflix`.
- [x] 1.3 Criar `test/fixtures/raflix/` com respostas reais sanitizadas: metadados de filme e série, lista de fontes, boot com faixa PT-BR, boot com faixa Original + legenda PT, boot com `orionStreams` nulo, `/api/source` com três qualidades, `/api/source` com um único stream, `/api/source` vazio, 404 de metadados, `unreleased` e erro HTTP; verificar que nenhum arquivo contém URL de mídia assinada, `playbackToken`, cookie ou token em texto claro.
- [x] 1.4 Conferir os arquivos gerados `providers/raflix.js`, `gdrive/providers/raflix.js`, `prism/providers/raflix.js` e os `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams` e que o build termina sem erro.

## 2. Catálogo Raflix e metadados

- [x] 2.1 Implementar em `api.js` a validação de `tmdbId` e `mediaType`, a exigência de temporada e episódio positivos para `tv` e a montagem das URLs `https://raflix.web.id/api/media/<tipo>/<id>` e `https://raflix.web.id/api/media/sources` com `season` e `episode` em série; verificar com testes de filme, série, entrada inválida e ausência de `season`/`episode` em filme.
- [x] 2.2 Implementar a leitura de `media.title` e `media.year`, o tratamento de HTTP 404 como ausência e a localização da entrada `id: "vidrift"` na lista `sources`; verificar com testes de metadados válidos, 404, lista sem VidRift e lista com VidRift.
- [x] 2.3 Validar o caminho de mídia da URL do VidRift (`/embed/movie/<id>` e `/embed/tv/<id>/<temporada>/<episódio>`) e derivar o caminho de boot; verificar com testes de filme, série e URL fora do formato esperado.

## 3. Boot do VidRift e seleção PT-BR

- [x] 3.1 Implementar em `boot.js` a consulta a `https://embed.vidrift.in/api/boot/<caminho>` e a validação de `meta`, `meta.orionStreams`, `meta.playbackToken`, `meta.unreleased`, `meta.inCinemas` e `meta.airsSoon`; verificar com testes de boot com faixas, boot sem faixas, título não lançado e resposta inválida.
- [x] 3.2 Implementar a seleção da faixa `Brazilian Portuguese` do tipo HLS e a classificação como `Dublado`, com qualidade máxima de `rungs`; verificar com teste de faixa PT-BR e com faixa francesa descartada.
- [x] 3.3 Implementar a leitura do `subtitleListUrl` da faixa `Original`, a escolha do primeiro `track` com `lang: "pt"` e a classificação como `Legendado`; verificar com teste de faixa Original com legenda PT e com faixa Original sem legenda PT.
- [x] 3.4 Implementar a ausência reconhecida para `unreleased`, `inCinemas`, `airsSoon` e para o caso sem áudio PT-BR nem legenda PT; verificar com testes de lista vazia sem erro fatal e com `console.error` ausente.

## 4. Contingência H.264 e montagem dos streams

- [x] 4.1 Implementar em `streams.js` a tentativa de `/api/source` na ordem `vela`, `titan` e `atlas`, com `token` do boot, `parent=raflix.web.id` e `hevc=0`; verificar com testes de primeiro provedor com streams, primeiro com falha HTTP e segundo com streams, faixa `Dublado` coexistindo com a contingência, todos vazios e todos com falha.
- [x] 4.2 Implementar a escolha entre `url` e `proxyUrl` resolvido contra `https://embed.vidrift.in/`, a extração de qualidade da URL e o uso de `maxRes` quando houver um único stream; verificar com testes de `index-s1080p`, `/720/`, `maxRes` e qualidade ausente.
- [x] 4.3 Implementar os cabeçalhos de reprodução somente onde a fonte exige: `Referer` e `User-Agent` no master e na legenda da Orion, no proxy do Vela e no `subtitleListUrl`; sem cabeçalhos em URL direta do Titan e na legenda genérica; verificar com testes de cada caso.
- [x] 4.4 Implementar a legenda de contingência em `/api/subtitles/<caminho>/Portuguese`, a deduplicação por URL e a classificação `Legendado` apenas quando houver legenda PT; verificar com testes de legenda genérica, ausência de legenda, URL repetida e stream sem legenda descartado.
- [x] 4.5 Montar cada stream com `buildStream` e `format: { template: FORMATTER.AUTO, addon: "Raflix", title, year, season, episode }`, `provider` do player, `type: "hls"`, `language` do enum e `quality` confiável; verificar com testes de stream dublado, legendado, qualidade desconhecida e campos opcionais ausentes.

## 5. Entrada, erros e suíte do provedor

- [x] 5.1 Implementar `index.js` com o nome `Raflix`, `sortByQuality` e a fronteira de erro única: `console.error("[Raflix] ...")` e retorno `[]`; verificar com testes de falha total, ausência sem erro, aviso de opção descartada e `Dublado` preservado quando a contingência falha.
- [x] 5.2 Implementar a falha isolada de provedor de `/api/source` com `console.warn("[Raflix] Opção <provedor> descartada: <causa>")` e o erro agregado quando nenhuma opção produzir stream; verificar com testes de um provedor inválido preservando o seguinte e de todos inválidos.
- [x] 5.3 Cobrir `test/raflix.test.js` com o pacote gerado e `fetch` simulado, usando as fixtures sanitizadas; verificar com `node --test test/raflix.test.js` e conferir os casos de filme PT-BR, filme legendado, série PT-BR, série legendada, contingência, ausência 404, `unreleased`, JSON inválido, HTTP 500 e URL repetida.
- [x] 5.4 Confirmar que nenhum bloco novo é necessário e que `src/_blocks/index.md` e `docs/arch.md` não mudam; verificar com `node --test test/blocks-catalog.test.js` e com a revisão do diff de documentação.

## 6. Documentação e catálogo

- [x] 6.1 Adicionar a linha `Raflix` e a seção `## Raflix` em `providers.md` com status `🟠 Não verificado`, `—` na última verificação e sem bloco de verificação online; verificar com `node --test test/providers-catalog.test.js`.
- [x] 6.2 Atualizar `docs/provider-investigation.md` com o método “catálogo de players + boot JSON + contingência H.264”, registrando a descoberta dos endpoints, a seleção `Brazilian Portuguese`, a legenda PT, os cabeçalhos, as referências de código/teste e os limites de HEVC, 403 e expiração; verificar que o guia cita `src/raflix/`, `test/raflix.test.js` e a spec.

## 7. Integração e verificação online

- [x] 7.1 Rodar `npm run lint`, `npm test` e `node build.js raflix`, corrigindo falhas de estilo, JSDoc, fixture ou contrato; verificar que a suíte completa e o build terminam sem falhas.
- [x] 7.2 Executar `npm run test:online -- --provider raflix` com o pacote já construído e conferir o relatório em `test/artifacts/online/`; se a rodada for inconclusiva ou falhar por bloqueio externo, registrar o motivo e manter o status `🟠 Não verificado` sem inventar evidência.
- [x] 7.3 Registrar a rodada em `providers.md` quando houver resultado válido, ajustando o status conforme `docs/tests.md`; verificar com `node --test test/providers-catalog.test.js` e com a leitura do bloco final.

## Workflow follow-up

- Arquivar a mudança após os testes previstos passarem ou após as exclusões e os motivos estarem declarados.
- Conferir o resultado arquivado em `openspec/specs/raflix-provider/spec.md`.
