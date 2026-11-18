# Tasks

## 1. VenoPlay: estrutura, manifest e build

- [ ] 1.1 Criar `src/venoplay/index.js` com `PROVIDER_NAME = 'VenoPlay'`, validação de `tmdbId`/`mediaType`/temporada/episódio, `sortByQuality` e a única captura de erro com `console.error('[VenoPlay] ...')`; verificar que `npm run lint` aceita o arquivo e que o carregamento não faz requisição.
- [ ] 1.2 Criar `src/venoplay/site.js` e `src/venoplay/player.js` como esqueletos com JSDoc, sem rede no carregamento; verificar que `node build.js venoplay` gera `providers/venoplay.js` e as duas variantes sem erro.
- [ ] 1.3 Adicionar a entrada `venoplay` ao `manifest.json` com `movie` e `tv`, `formats: ["m3u8"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS; verificar que `node --test test/manifest.test.js` passa.
- [ ] 1.4 Conferir que `node build.js venoplay` gera `gdrive/providers/venoplay.js`, `prism/providers/venoplay.js` e as entradas nos `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams` e não contêm `async`/`await`.

## 2. VenoPlay: semente, busca e identidade

- [ ] 2.1 Implementar em `src/venoplay/site.js` a resolução da semente `https://www2.venoplay.com` com `fetchPage`, uso do host final em busca/página/API, fallback `https://w2.venoplay.site` e ausência de cache; verificar com testes de redirecionamento, semente sem redirect e semente indisponível.
- [ ] 2.2 Implementar a busca em `/busca?q=<termo>` com o título PT-BR e o original, leitura dos `div.poster-card`, extração do `onclick`, do `h3` e do tipo `Filme`/`Série`, e deduplicação de cartões repetidos por URL; verificar com fixture de busca e busca vazia.
- [ ] 2.3 Implementar a confirmação de título exato, tipo e ano no JSON-LD da página (`@type` e `datePublished`), sem usar o prefixo `filme-`/`serie-` da URL como prova de tipo; verificar com filme, série, tipo divergente e ano divergente.
- [ ] 2.4 Tratar página sem JSON-LD, sem `mediaId` ou sem ano como erro de estrutura, e mais de um candidato confirmado como ausência por ambiguidade; verificar que o teste não escolhe o primeiro candidato.
- [ ] 2.5 Criar fixtures reais sanitizadas em `test/fixtures/venoplay/` para busca, busca vazia, página de filme e página de série, com IDs sintéticos e sem URL de mídia, token ou cookie; verificar que os testes usam as fixtures e que o caminho da página é o do cartão confirmado.

## 3. VenoPlay: `get_players` e player `mgeb`

- [ ] 3.1 Implementar o `get_players` em `src/venoplay/site.js` com `id`, `season_number`, `episode_number` vazios em filme e as coordenadas em série, `site_id=4`, `Referer` da página, `X-Requested-With` e `Accept: application/json`; verificar com fixtures de filme e série.
- [ ] 3.2 Validar a resposta `players` como lista; lista vazia é ausência e HTTP fora de 2xx, JSON inválido ou estrutura diferente é erro de contrato; verificar os três casos em teste.
- [ ] 3.3 Implementar em `src/venoplay/player.js` a abertura do player `mgeb.space`/`mgeb.lat`, a leitura de `var sources` e a triagem de fontes: manter HLS `.m3u8` HTTPS de `mgeb.space`, rejeitar `workers.dev`, `username`, `token`, `password`, `fontedecanais`, `novix.x10.mx` e `infrastructuredesign.space`.
- [ ] 3.4 Implementar o fallback de host `mgeb.space` → `mgeb.lat` uma vez por opção, preservando query e caminho; verificar com teste de host primário em 403 e alternativo em 200.
- [ ] 3.5 Tratar `nhdapi.com` como triagem sem requisição e `var sources` ausente como erro de estrutura; verificar que nenhuma chamada é feita ao `nhdapi.com` e que `sources` vazio é ausência.
- [ ] 3.6 Montar os streams com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `VenoPlay`, `provider` `MGEB`, `type` `hls`, título/ano, temporada/episódio, idioma do rótulo, `quality` `Desconhecida`), sem sonda e sem `name`/`title`; verificar com testes de filme, série e opção dublada.
- [ ] 3.7 Isolar cada opção de player com `console.warn('[VenoPlay] ...')`, subir o erro agregado quando nenhuma produzir stream e devolver `[]` quando todas forem triagem; verificar com uma opção falhando e outra válida, todas falhando e todas em triagem.
- [ ] 3.8 Sanitizar as mensagens de log para não conter URL de mídia, token, `username` ou `md5`; verificar que os logs dos testes não contêm esses valores.

## 4. VenoPlay: suíte offline

- [ ] 4.1 Completar `test/venoplay.test.js` com os casos de filme, série, ausência, ambiguidade, tipo/ano divergentes, `get_players` vazio/inválido, HLS válido, credencial, worker, fallback de host e `nhdapi` em triagem; executar `node --test test/venoplay.test.js`.
- [ ] 4.2 Conferir que a suíte não acessa a internet, usa `fetch` simulado, não exige `TMDB_API_KEY` real e não deixa arquivos em `test/artifacts/`; verificar com `npm run lint` e pelo relatório do `node --test`.

## 5. CineAgora: registro de catálogos e busca

- [ ] 5.1 Criar `src/cineagora/catalogs.js` com os três catálogos (`cineagora`, `cinegratis`, `visioncine`), cada um com base, hosts, seções de filme/série, busca, parser de resultados, leitor de identidade e seletor de espelho; verificar que `npm run lint` aceita e que o carregamento não faz rede.
- [ ] 5.2 Implementar em `catalog.js` a busca por catálogo com a ordem IMDb, título PT-BR e original, no máximo três candidatos por termo e primeira página; verificar com fixtures dos três catálogos.
- [ ] 5.3 Implementar os adaptadores de resultado: CineAgora `a.item[data-title]`, CineGratis `li.film a.tt` com `h2.film-tt .kt` e `span.film-yil`, VisionCine `div.poster-container` com `img[alt]`/`title` e `.poster-year`; verificar cada adaptador com sua fixture.
- [ ] 5.4 Implementar as regras de identidade: CineAgora por `h1.title`/`span.date`/`div.imdb`; CineGratis por `h1 > a`/`h2`/JSON-LD `sameAs`; VisionCine por `h1`/`small`/`<title>` e busca por IMDb com um único resultado do tipo; verificar IMDb divergente, ano divergente, tipo divergente e candidato sem ano.
- [ ] 5.5 Tratar ambiguidade por catálogo como ausência daquele catálogo e confirmação em vários catálogos como caso normal; verificar os dois cenários em teste.
- [ ] 5.6 Implementar a busca concorrente dos três catálogos com conversão de cada promessa em resultado/falha antes de `Promise.all`, sem `Promise.allSettled`; verificar que um catálogo com HTTP 503 não interrompe os demais.

## 6. CineAgora: player, união e deduplicação

- [ ] 6.1 Ajustar `readMirrors` em `src/cineagora/player.js` para receber o seletor do catálogo, ignorar elemento sem `data-link`, filtrar `watch.brstream.cc` e extrair o rótulo do texto; verificar com as três marcações e com o botão de trailer sem erro.
- [ ] 6.2 Passar um `Set` compartilhado para `resolvePlayer` e deduplicar antes de montar o stream pela chave `uid|md5|id`; verificar que o mesmo arquivo nos três catálogos produz um stream e que arquivos distintos permanecem.
- [ ] 6.3 Garantir que o primeiro catálogo na ordem CineAgora, CineGratis, VisionCine fornece o rótulo e os detalhes da release; verificar com o mesmo arquivo rotulado de formas diferentes.
- [ ] 6.4 Atualizar `index.js` para resolver os catálogos confirmados em ordem, isolar falha por catálogo com `console.warn`, subir o erro agregado quando nada produzir stream e devolver `[]` quando todos forem ausência; verificar os três cenários em teste.
- [ ] 6.5 Manter o contrato do player BrStream e do `format` inalterado; verificar que filme, série, dublado e legendado continuam com a mesma URL e o mesmo `language` da spec `cineagora-player`.

## 7. CineAgora: fixtures e suíte offline

- [ ] 7.1 Criar fixtures reais sanitizadas em `test/fixtures/cineagora/` para busca, página e espelho de CineGratis e VisionCine, além do mesmo arquivo BrStream nos três catálogos; nenhuma fixture contém URL de mídia, token ou hash real.
- [ ] 7.2 Atualizar `test/cineagora.test.js` com os casos dos três catálogos, um catálogo sem título, um catálogo fora do ar, ambiguidade por catálogo, confirmação em vários catálogos, deduplicação, rótulo do primeiro catálogo e espelhos das três marcações; executar `node --test test/cineagora.test.js`.
- [ ] 7.3 Conferir que a suíte antiga de CineAgora continua passando sem internet e que os testes de filme/série/ausência não foram enfraquecidos; executar `npm run lint` e `node --test test/cineagora.test.js`.

## 8. Manifesto, catálogo de provedores e documentação

- [ ] 8.1 Atualizar a versão e a descrição do `cineagora` no `manifest.json` para citar os catálogos CineGratis e VisionCine, mantendo `formats`, tipos e idioma; verificar que `node --test test/manifest.test.js` passa.
- [ ] 8.2 Adicionar a linha e a seção do `VenoPlay` em `providers.md` com status `🟠 Não verificado` e data `—`; voltar o `CineAgora` para `🟠 Não verificado` por causa da nova versão; verificar que `node --test test/providers-catalog.test.js` passa.
- [ ] 8.3 Atualizar `docs/provider-investigation.md` §3.14 com a variação de catálogos DLE que compartilham o mesmo player BrStream (identidade pelo `video`, deduplicação e isolamento) e criar a seção seguinte com o método da VenoPlay (semente, busca, `get_players`, `mgeb`, triagem de `nhdapi` e hosts não comprovados); verificar que as referências apontam para arquivos existentes.
- [ ] 8.4 Revisar `README.md`, `docs/arch.md` e `src/_blocks/index.md`: não alterar se nenhuma regra global, convenção ou bloco mudou; registrar a conferência no `design.md` apenas se houver alteração.

## 9. Integração, build e verificação online

- [ ] 9.1 Rodar `npm run lint` e `npm test`; verificar que a suíte completa passa e que os testes existentes não foram alterados por causa dos novos catálogos.
- [ ] 9.2 Rodar `node build.js venoplay` e `node build.js cineagora`; conferir os três pacotes de cada provedor, os `<formato>/manifest.json`, a ausência de `async`/`await` e o teste `node --test test/build.test.js`.
- [ ] 9.3 Rodar `npm run test:online -- --provider venoplay --record` com `TMDB_API_KEY` apenas no ambiente; registrar o resultado por tipo e a seção em `providers.md`; se inconclusivo, manter `🟠 Não verificado` e registrar o motivo saneado.
- [ ] 9.4 Rodar `npm run test:online -- --provider cineagora --record` com `TMDB_API_KEY` apenas no ambiente; registrar a cobertura dos três catálogos e o status real em `providers.md`; se inconclusivo, manter `🟠 Não verificado`.
- [ ] 9.5 Atualizar a seção `Validation` do `design.md` com os resultados reais de lint, testes, build e das duas rodadas online, incluindo o que ficou fora (Legendado `nhdapi`, hosts não comprovados do `mgeb`, reprodução no aparelho e cobertura de catálogo); verificar que os números e status batem com `providers.md`.

## Workflow follow-up

- Arquivar a mudança após a revisão e as duas rodadas online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e as specs principais `venoplay-provider`, `cineagora-catalog` e `cineagora-player`.
- Se a rodada online revelar um host novo do `mgeb` ou o retorno do `nhdapi.com`, abrir uma mudança própria com fixture e evidência, sem ampliar esta.
