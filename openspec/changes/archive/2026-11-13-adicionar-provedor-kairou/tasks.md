# Tasks

## 1. Estrutura e manifest

- [x] 1.1 Criar `src/kairou/index.js` e `src/kairou/extractor.js` a partir do contrato de `src/_template/`, com `PROVIDER_NAME = 'Kairou'`; verificar que `npm run lint` aceita a estrutura inicial.
- [x] 1.2 Adicionar a entrada `kairou` ao `manifest.json` com `supportedTypes: ["movie", "tv"]`, `formats: ["m3u8", "mp4"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor, logo HTTPS e descrição coerente com o escopo; verificar que `node --test test/manifest.test.js` passa.
- [x] 1.3 Rodar `node build.js kairou` e confirmar que `providers/kairou.js`, as variantes `gdrive/` e `prism/` e os `<formato>/manifest.json` são gerados sem erro.

## 2. Consulta e identidade

- [x] 2.1 Implementar a validação de entrada e o pedido de série (`season`/`episode` inteiros a partir de 1) antes de qualquer requisição; verificar com teste de série sem temporada/episódio e de `mediaType` inválido.
- [x] 2.2 Implementar `getMediaInfo` e a montagem da URL `/api/extract` com `tmdbId`, `type`, `title`, `season`, `episode` e `isAnime=1` somente para anime, sem `fast=1`; verificar que o teste de filme, o de episódio e o de anime inspecionam os parâmetros enviados.
- [x] 2.3 Implementar a leitura da resposta com validação de `ok`, `streams` e `subtitles`; verificar com fixtures de resposta válida, `ok: false`, JSON inválido e `streams` ausente.
- [x] 2.4 Implementar a ausência reconhecida (`ok: true` e `streams: []`) sem erro; verificar com teste de título inexistente.

## 3. Streams e legendas

- [x] 3.1 Implementar a resolução de URL relativa contra `https://www.kairou.space`, a preservação de URL absoluta e a validação HTTP(S); verificar com fixture de proxy relativo, URL absoluta do pstream e URL inválida.
- [x] 3.2 Implementar a triagem de 4K (`is4k: true` ou qualidade `4K`) sem contar como falha e com lista vazia quando só houver 4K; verificar com testes de 4K entre 1080p e de resposta apenas 4K.
- [x] 3.3 Implementar a montagem com `buildStream`/`format`, qualidade por `quality`, idioma por `isDub` e presença de legenda PT, `provider` por `source` e `type` por `type`/`isHls`; verificar com testes de dublado, legendado, sem legenda PT e qualidade desconhecida.
- [x] 3.4 Implementar as legendas com URL VTT resolvida, `lang` normalizado, `label` como `name` e descarte de legenda inválida sem perder o vídeo; verificar com testes de legenda PT-BR, lista vazia e legenda sem URL.
- [x] 3.5 Implementar a deduplicação por URL resolvida e a ordenação por qualidade; verificar com teste de duas opções com a mesma URL e de lista com `720p`, `4K` e `1080p`.

## 4. Fronteira de erro e suíte offline

- [x] 4.1 Implementar o isolamento por opção com `console.warn('[Kairou] Opção ... descartada: ...')`, o erro agregado quando todas falham e a captura final em `getStreams` com `console.error('[Kairou] ...')`; verificar com testes de uma opção inválida entre válidas, todas inválidas e falha HTTP 503.
- [x] 4.2 Criar `test/fixtures/kairou/` com respostas reais sanitizadas de filme, episódio, anime, ausência, 4K/duplicata e resposta inválida, sem URL assinada, cookie ou token; verificar que nenhum arquivo contém mídia real.
- [x] 4.3 Completar `test/kairou.test.js` com os casos do design e executar `node --test test/kairou.test.js`; verificar que a suíte passa sem internet.

## 5. Documentação e integração

- [x] 5.1 Adicionar a linha e a seção `Kairou` em `providers.md`, com status `🟠 Não verificado` e data `—`; verificar que `node --test test/providers-catalog.test.js` passa.
- [x] 5.2 Atualizar `docs/provider-investigation.md` com o método “API de extração de uma SPA de streaming”, referenciando `src/kairou/` e `test/kairou.test.js` e registrando os limites (4K VIP, `fast=1` frio, `alive`/`status`, HLS sem extensão); verificar que as referências apontam para arquivos existentes.
- [x] 5.3 Revisar `README.md` e `docs/arch.md`; alterar apenas se o novo provedor mudar uma lista, convenção ou regra global, registrando a decisão no `design.md`.
- [x] 5.4 Rodar `npm run lint`, `npm test` e `node build.js kairou`; verificar que a suíte completa e o build passam e que os arquivos gerados foram atualizados.

## 6. Verificação online

- [x] 6.1 Rodar `npm run test:online -- --provider kairou --record` com `TMDB_API_KEY` apenas no ambiente e conferir a seção gerada em `providers.md`; se a rodada for inconclusiva, registrar o motivo e manter a mudança sem arquivar.

## Workflow follow-up

- Arquivar a mudança após a revisão e a rodada online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e a spec principal da capacidade.
