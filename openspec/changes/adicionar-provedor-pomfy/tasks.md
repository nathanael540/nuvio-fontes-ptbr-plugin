# Tasks

## 1. Estrutura do provedor e manifest

- [ ] 1.1 Criar `src/pomfy/index.js` no contrato do app (captura única em `getStreams`, `console.error('[Pomfy] ...')`, `sortByQuality` e retorno `[]` para falha) e `src/pomfy/extractor.js` com a validação de `tmdbId`, `mediaType`, temporada e episódio antes de qualquer rede. Verificação: `node build.js pomfy` termina com código 0 e `providers/pomfy.js` exporta `getStreams`.
- [ ] 1.2 Acrescentar a entrada `pomfy` em `manifest.json` na versão `1.0.0`, com `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, `contentLanguage` `["pt"]`, descrição em pt-BR que declara o Flyfile e logo `https://api.pomfy.stream/apipomfywhiteblue.png`. Verificação: `node --test test/manifest.test.js` passa.
- [ ] 1.3 Conferir que o provedor usa apenas as globais e módulos do runtime (`fetch`, `URL`, `URLSearchParams`, blocos existentes) e nenhuma API de Node, `axios`, `setTimeout`, `crypto` ou `TextDecoder`. Verificação: `npm run lint` passa em `src/pomfy/`.

## 2. Página, token e seleção do player

- [ ] 2.1 Implementar a URL direta `/filme/<id>` e `/serie/<id>/<temporada>/<episódio>` e a consulta da página com `fetchPage`, perfil `page`, `Referer` da API e `Sec-Fetch-Dest: iframe`; ler `h1.title` e o primeiro ano em `info-badge-dim`, aceitando título/ano ausentes como metadados opcionais. Verificação: teste com fixture de filme e de série devolve a URL e os metadados esperados; página sem `h1.title` lança erro de layout.
- [ ] 2.2 Ler `statusToken` com `extractScriptString` e tratar página válida sem token como ausência. Verificação: testes de página com token, `statusToken` nulo e “Título Indisponível” passam sem erro.
- [ ] 2.3 Consultar `GET /api/play-token?t=<token>` com `fetchJson` e selecionar `flyfileUrl` ou, quando ele for nulo, `url` de `flyfile.app` ou `flyf.lat` com caminho `/embed/<id>`; sem endereço Flyfile ou com Byse é ausência, e resposta sem campos de player é erro. Verificação: testes de título dual, `url` Flyfile, Byse-only e resposta inválida passam.
- [ ] 2.4 Criar as fixtures `page-movie.html`, `page-series.html`, `page-unavailable.html`, `play-token-dual.json`, `play-token-flyfile.json` e `play-token-byse.json`, sanitizadas, e os casos correspondentes em `test/pomfy.test.js`. Verificação: os casos de filme, série, ausência e Byse-only passam.

## 3. Resolução do Flyfile

- [ ] 3.1 Extrair origem e ID do embed Flyfile e consultar `https://api.flyfile.app/api/public/file/<id>` com `Referer` do embed, `X-FlyFile-View: embed` e `X-Embed-Referrer: https://api.pomfy.stream/`. Verificação: teste confere URL, método e cabeçalhos da requisição.
- [ ] 3.2 Validar `status` `READY`, `videoAsset`, `qualities` como lista ou string JSON e ao menos uma qualidade `READY`; arquivo em processamento, sem `videoAsset` ou sem qualidade pronta devolve `[]`. Verificação: testes de arquivo pronto, processando e sem qualidade passam.
- [ ] 3.3 Consultar `GET /api/streaming/assign/<id>` com os mesmos cabeçalhos e `X-Adblock-Detected: 0`, exigir `url` https e `token` não vazio e montar `https://<url>/hls/<token>/master.m3u8`. Verificação: teste confere a URL do master; `assign` sem `url` ou sem `token` lança erro.
- [ ] 3.4 Criar as fixtures `file-ready.json`, `file-processing.json`, `file-no-qualities.json` e `assign.json`, com hosts, IDs e tokens fictícios, e os casos correspondentes em `test/pomfy.test.js`. Verificação: as fixtures não contêm URL assinada, token real ou domínio de mídia real.

## 4. Idioma, legendas e contrato do stream

- [ ] 4.1 Selecionar a maior `quality` pronta, usar `qualities[].sizeBytes` ou `file.size` no tamanho, e preencher `filename`, `bitrate` e `duration` quando `file.name` e `originalMetadata` os fornecerem; JSON inválido de `originalMetadata` não derruba o stream. Verificação: teste de duas qualidades confere `1080p`, tamanho, filename, bitrate e duração; teste sem metadado opcional confere ausência dos campos.
- [ ] 4.2 Implementar a classificação de idioma pelo áudio padrão e pelas legendas: português com Brasil → `Dublado`; português sem região → `Dublado (Não PT-BR?)`; estrangeiro com legenda PT → `Legendado`; legenda PT sem região → `Legendado (Não PT-BR?)`; sem evidência → `Não PT-BR` ou `Idioma Desconhecido`. Verificação: testes de cada cenário conferem o enum e nunca promovem português sem região a `Dublado`.
- [ ] 4.3 Mapear `videoAsset.subtitles` para `url` e `language` legível, descartar legenda com URL inválida isoladamente e não enviar `headers` de legenda. Verificação: teste com legendas PT/EN confere as duas; teste com uma URL inválida preserva a outra e o stream.
- [ ] 4.4 Montar o stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `Pomfy`, título/ano quando presentes, temporada/episódio em série, filename, bitrate e duração), `provider` `Flyfile`, `type` `hls`, sem `name`/`title`, sem `headers` e ordenado por `sortByQuality`. Verificação: teste de contrato confere os campos, a ausência de `name`/`title` e a ordenação.

## 5. Ausência, falhas e logs

- [ ] 5.1 Garantir que ausência reconhecida (sem token, Byse-only, arquivo não pronto, sem qualidade ou sem `videoAsset`) devolve `[]` sem `console.error`. Verificação: testes de ausência conferem lista vazia e nenhum log de erro.
- [ ] 5.2 Garantir que HTTP fora de 2xx na página, no `public/file` ou no `assign`, JSON inválido, layout sem `h1.title` e `assign` incompleto sobem até `getStreams`, que registra `[Pomfy] <etapa>: <causa>` e devolve `[]`. Verificação: testes de falha conferem a lista vazia e o prefixo do log.
- [ ] 5.3 Garantir que entrada inválida (`tmdbId` não numérico, `mediaType` desconhecido, série sem temporada/episódio positivos) devolve `[]` sem requisição simulada. Verificação: teste de entrada inválida confere `app.calls.length` igual a zero.
- [ ] 5.4 Garantir que nenhum log, fixture ou documentação contém URL de master, `statusToken` ou token do `assign`. Verificação: asserção de log e busca textual nas fixtures não encontram esses valores.

## 6. Documentação operacional e método

- [ ] 6.1 Acrescentar a linha e a seção `## Pomfy` em `providers.md`, com status inicial `🟠 Não verificado`, tipos `filme, série`, formato `HLS`, data `—` e a limitação de cobertura (Flyfile apenas). Verificação: `node --test test/providers-catalog.test.js` passa.
- [ ] 6.2 Acrescentar em `docs/provider-investigation.md` a seção 3.13 “Catálogo por ID do TMDB com token de embed e API pública do player”, com sinal, investigação, contrato, referências a `src/pomfy/extractor.js` e `test/pomfy.test.js` e os limites do Byse e da cobertura parcial. Verificação: a seção existe, distingue método em uso de hipótese e não contém URL assinada real.
- [ ] 6.3 Conferir que `docs/arch.md` não muda (nenhuma regra global nova), que `src/_blocks/index.md` continua igual (nenhum bloco novo) e que o README não promete cobertura integral. Verificação: `git diff -- docs/arch.md src/_blocks/index.md` está vazio e a descrição do manifest/pontos de documentação declaram o Flyfile.

## 7. Build e validação local

- [ ] 7.1 Rodar `node build.js pomfy` e conferir `providers/pomfy.js`, `gdrive/providers/pomfy.js`, `prism/providers/pomfy.js` e os três manifests de formato. Verificação: o build termina com código 0, os arquivos existem e cada pacote exporta `getStreams`.
- [ ] 7.2 Rodar `npm run lint` e `npm test` no estado final. Verificação: os dois comandos terminam com código 0.
- [ ] 7.3 Conferir que nenhum arquivo de `providers/`, `gdrive/` ou `prism/` foi editado à mão. Verificação: `git diff --stat` mostra as saídas geradas apenas depois do build.

## 8. Verificação online e status

- [ ] 8.1 Com o pacote final construído, rodar `npm run test:online -- --provider pomfy` usando `TMDB_API_KEY` somente do ambiente local, se o harness exigir a chave. Verificação: o runner conclui a rodada e grava o relatório em `test/artifacts/online/<run-id>/result.json`.
- [ ] 8.2 Atualizar a seção do Pomfy em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os casos de filme e série. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [ ] 8.3 Se a rodada for inconclusiva ou falhar, registrar o resultado real e não marcar `Estável` sem evidência; a cobertura parcial já está declarada. Verificação: o status segue `docs/tests.md`, seção 7, e os casos inconclusivos permanecem visíveis.

## 9. Integração final

- [ ] 9.1 Rodar novamente `npm run lint`, `npm test`, `node build.js pomfy` e `node --test test/pomfy.test.js` no estado final. Verificação: todos terminam com código 0.
- [ ] 9.2 Conferir uma amostra de streams do relatório online: URL `https://.../master.m3u8`, `quality` da maior qualidade pronta, `language` do enum, `provider` `Flyfile`, `type` `hls`, `format` presente e `name`/`title` gerados pelo formatador. Verificação: a amostra não tem campo obrigatório ausente nem campo proibido.
- [ ] 9.3 Procurar segredos e tokens no repositório (`statusToken`, `X-Captcha`, `key_parts`, URL assinada, cookie) fora de `test/artifacts/`. Verificação: nenhuma ocorrência em arquivos versionados.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
