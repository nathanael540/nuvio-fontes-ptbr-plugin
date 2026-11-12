# Tasks

## 1. Estrutura e manifest

- [ ] 1.1 Criar `src/cineagora/` com `index.js`, `catalog.js`, `player.js` e `streams.js`, seguindo o contrato de `src/_template/` e a fronteira de erro de `src/dooplay/`; verificar que `npm run lint` aceita a estrutura inicial.
- [ ] 1.2 Adicionar a entrada `cineagora` ao `manifest.json` com `supportedTypes: ["movie", "tv"]`, `formats: ["m3u8"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor, logo HTTPS e descrição coerente com o escopo; verificar que `node --test test/manifest.test.js` passa e que `node build.js cineagora` gera o arquivo base e as variantes de formato.
- [ ] 1.3 Criar `test/fixtures/cineagora/` e o esqueleto de `test/cineagora.test.js` com o carregador de pacote usado pelos demais provedores; verificar que `npm test` descobre e executa a suíte, ainda que os casos de comportamento entrem nos grupos seguintes.

## 2. Catálogo e identidade

- [ ] 2.1 Implementar a busca DLE em `catalog.js` com IMDb, título PT-BR e título original, lendo `a.item` e usando a primeira página de cada consulta; verificar com testes de acerto por IMDb, fallback de título, ausência e HTTP fora de 2xx.
- [ ] 2.2 Implementar a confirmação de identidade pela seção do tipo, `titleSimilarity`, ano e link do IMDb, abrindo no máximo três candidatos e recusando ambiguidade; verificar com testes de filme confirmado, série confirmada, seção errada, IMDb divergente, ano divergente, dois candidatos válidos e ausência.
- [ ] 2.3 Validar a entrada antes de consultar o catálogo: `movie` ignora temporada/episódio e `tv` exige os dois inteiros a partir de 1; verificar com testes de filme, série válida, temporada ausente e episódio fracionário.
- [ ] 2.4 Adicionar fixtures sanitizadas de busca e de página de filme e de série; verificar que as fixtures não contêm cookies, tokens, URLs assinadas nem dados pessoais e que os testes de catálogo as usam.

## 3. Espelhos e player BrStream

- [ ] 3.1 Implementar a leitura de `.mirrors .button` em `player.js`, mantendo somente links de `watch.brstream.cc` e associando o texto do botão à opção; verificar com testes de um espelho, dois espelhos (Dublado/Legendado), somente trailer e host desconhecido.
- [ ] 3.2 Implementar a página `watch.brstream.cc/watch` com `extractScriptJson(html, 'video')`, validando `type`, `status`, `uid`, `md5` e `id` e montando a URL `master.txt`; verificar com testes de objeto válido, página sem `video`, `status` inválido e campos fora do formato.
- [ ] 3.3 Implementar o isolamento por espelho com `console.warn('[CineAgora] Opção ... descartada: ...')` e o erro agregado quando todas as opções falham; verificar com testes de uma opção falhando e a outra resolvendo, todas falhando e todas em ausência.
- [ ] 3.4 Adicionar fixtures sanitizadas de página de filme com um e dois espelhos, página `watch` válida e página de vídeo inválido; verificar que `uid`, `md5`, `id` e `video_slug` foram substituídos por valores de teste e que nenhuma playlist master real foi gravada.

## 4. Séries

- [ ] 4.1 Implementar a leitura de `watch.brstream.cc/tv/<slug>`, a consulta de `fetch_series_data.php` e a seleção por `seasons[String(season)]` e `episode_number === String(episode)`; verificar com testes de S01E01, S02E03, temporada ausente, episódio ausente e resposta sem `seasons`.
- [ ] 4.2 Implementar a abertura de `watch.brstream.cc/watch/<video_slug>` para o episódio, validando o slug alfanumérico e reutilizando a resolução de `video` do filme; verificar com testes de episódio válido, slug inválido e página sem `video`.
- [ ] 4.3 Adicionar fixtures sanitizadas da página de série, de `fetch_series_data.php` com duas temporadas e da página `watch` do episódio; verificar que os testes de série usam essas fixtures e que nenhum cookie ou URL de mídia real permanece.

## 5. Streams, erros e documentação

- [ ] 5.1 Montar cada stream em `streams.js` com `buildStream` e `format`, usando `addon` CineAgora, `provider` BrStream, `type` HLS, `filename` decodificado, maior `quality` de `video.quality` e idioma pelo rótulo/release, sem `headers` nem legendas; verificar com testes de qualidade máxima, Dublado, Legendado, `DUAL` sem rótulo, qualidade ausente e ausência de campos não fornecidos.
- [ ] 5.2 Implementar `getStreams` com validação de entrada, `sortByQuality`, captura final com `console.error('[CineAgora] ...')` e retorno `[]`; verificar com testes de erro inesperado, falha total e todas as opções em ausência.
- [ ] 5.3 Atualizar `providers.md` com a linha `CineAgora`, status `🟠 Não verificado` e a seção do provedor; verificar que `node --test test/providers-catalog.test.js` passa.
- [ ] 5.4 Adicionar em `docs/provider-investigation.md` o método “catálogo DLE com espelhos de áudio e player BrStream”, com a cadeia observada, referências de código/testes e limites (busca não exaustiva, master sem validação de reprodução, legendas não confirmadas); verificar que as referências apontam para arquivos e testes existentes.
- [ ] 5.5 Revisar `README.md` e `docs/arch.md`: só alterar se o novo provedor mudar uma lista, convenção ou regra global; registrar no `design.md` a decisão de não alterar quando não houver mudança de comportamento global.

## 6. Integração

- [ ] 6.1 Rodar `npm run lint`, `npm test` e `node build.js cineagora`; verificar que a suíte inteira e o build passam sem regenerar arquivos manuais fora de `providers/` e `<formato>/providers/`.
- [ ] 6.2 Conferir que `providers/cineagora.js`, `gdrive/providers/cineagora.js` e `prism/providers/cineagora.js` existem e exportam `getStreams`, e que os três manifests de formato listam o provedor; verificar com `node --test test/manifest.test.js` e `node --test test/build.test.js`.

## 7. Verificação online

- [ ] 7.1 Rodar `npm run test:online -- --provider cineagora --record` com `TMDB_API_KEY` apenas no ambiente e conferir a seção gerada em `providers.md`; se a rodada for inconclusiva ou falhar por bloqueio externo, registrar o motivo e manter a mudança sem arquivar, sem marcar esta tarefa como concluída.

## Workflow follow-up

- Arquivar a mudança após a revisão e a verificação online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e a spec principal da capacidade.
