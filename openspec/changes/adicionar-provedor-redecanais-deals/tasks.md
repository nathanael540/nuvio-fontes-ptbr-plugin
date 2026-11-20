# Tasks

## 1. Estrutura, manifest e catálogo

- [ ] 1.1 Criar `src/redecanais-deals/` com `index.js`, `extractor.js`, `search.js`, `episodes.js` e `player.js`, seguindo o contrato de `src/_template/`; verificar que `node build.js redecanais-deals` gera `providers/redecanais-deals.js`, `gdrive/providers/redecanais-deals.js` e `prism/providers/redecanais-deals.js`.
- [ ] 1.2 Registrar `redecanais-deals` em `src/manifest.json` com nome `RedeCanais Deals`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]` e logo em `https`; verificar que `test/manifest.test.js` passa.
- [ ] 1.3 Adicionar a linha e a seção inicial em `providers.md` com status `🟠 Não verificado` e descrição de catálogo dublado; verificar que `test/providers-catalog.test.js` passa.
- [ ] 1.4 Confirmar que a base é `https://redecanais.deals` e que `.lt`, `.phd`, `.by` e `.in` não entram no código; verificar a constante de base e um teste que falha se uma requisição sair para outro domínio.

## 2. Busca, tipo e candidatos

- [ ] 2.1 Implementar a leitura do TMDB com `getMediaInfo` e a lista de até oito termos (PT-BR, original e alternativos); verificar teste de termos deduplicados e do limite de oito.
- [ ] 2.2 Implementar `GET /search.php?keywords=<termo>` com `encodeURIComponent`, leitura de uma única página e ausência por `Nenhum conteúdo encontrado.`; verificar teste de resultado, ausência e página sem o título `Buscar Conteúdo RedeCanais:`.
- [ ] 2.3 Implementar a leitura dos links `Acessar` e a separação por `-lista-de-episodios_`; verificar teste de filme, série e tipo divergente.
- [ ] 2.4 Implementar a limpeza do título, a similaridade 0,85 e a tolerância de ano; verificar testes de filme confirmado, série confirmada, ano divergente e ficha sem ano.

## 3. Episódios e identidade da ficha

- [ ] 3.1 Implementar a leitura dos links de episódio na página da série e o par `(\d+)a-temporada-episodio-(\d+)` do `href`; verificar teste com links relativos, absolutos e temporadas múltiplas.
- [ ] 3.2 Implementar a seleção exata pela temporada/episódio e a ausência quando o par não existe; verificar teste de par encontrado e par ausente.
- [ ] 3.3 Implementar a conferência do `h1` do episódio contra o par e o erro de estrutura quando a página de série não publica lista; verificar os dois casos na suíte offline.

## 4. Player, resolve e idioma

- [ ] 4.1 Implementar a abertura de `iframe[name="Player"]` e a leitura de `var SOURCE_URL`; verificar teste de player com `SOURCE_URL`, ficha sem iframe e player sem `SOURCE_URL`.
- [ ] 4.2 Implementar a leitura do `vid` e a confirmação do TMDB/temporada/episódio (`m<tmdb>.mp4`, `e<tmdb>-<s>-<e>.mp4`); verificar teste de `vid` compatível e `vid` divergente.
- [ ] 4.3 Implementar a chamada `action=resolve` com JSON `{ok, src, download}`; verificar teste de `ok:true`, `ok:false`, `src` ausente, JSON inválido e HTTP fora de 2xx.
- [ ] 4.4 Implementar o idioma pelo `audio` do `download`/`src` (`dub`/`leg`/ausente); verificar teste de dublado, legendado, fachada `?audio=leg` com `download` dub e ausência de marcador.

## 5. Streams, erros e suíte

- [ ] 5.1 Implementar a montagem com `buildStream` e `format`, `type` `mp4`, `provider` do `server`, qualidade do título, ordenação e deduplicação por `vid`/áudio; verificar teste de stream completo, qualidade desconhecida e deduplicação.
- [ ] 5.2 Implementar o isolamento por candidato com `console.warn('[RedeCanais Deals] Opção <rótulo> descartada: <causa>')`, o erro agregado e o tratamento de 404/`vid` divergente; verificar teste de uma opção falhando, todas falhando e candidato removido.
- [ ] 5.3 Criar fixtures reais sanitizadas em `test/fixtures/redecanais-deals/` para busca, filme, série, episódio, player, resolve, ausência e falha; verificar que nenhuma fixture contém `X-Amz-*`, `download.php`, cookie ou URL assinada.
- [ ] 5.4 Criar `test/redecanais-deals.test.js` cobrindo filme, série, episódio, ausência, busca sem resultado, estrutura inválida, 404, `vid` divergente, `ok:false`, `src` ausente, fachada de áudio, uma opção falhando, todas falhando e deduplicação; verificar que passa com `fetch` simulado e sem rede.
- [ ] 5.5 Rodar `npm run lint` e `npm test` e conferir que as suítes do provedor, do manifest e do catálogo passam.

## 6. Documentação do método

- [ ] 6.1 Adicionar a seção do catálogo `redecanais.deals` em `docs/provider-investigation.md`, após a seção do `.lt` quando existir, descrevendo a busca de página única, o `vid` com TMDB, o `SOURCE_URL`/`action=resolve` e a fachada `?audio=leg`, com referências para `src/redecanais-deals/` e `test/redecanais-deals.test.js` e sem URLs assinadas; verificar que a seção distingue método em uso, bloco disponível e hipótese.
- [ ] 6.2 Revisar `providers.md` e `src/_blocks/index.md` para confirmar que nenhum bloco novo foi criado e que a linha do provedor está coerente com o manifest; verificar com `npm test`.

## 7. Build, verificação online e revisão

- [ ] 7.1 Rodar `node build.js redecanais-deals` e `npm run build:min` e conferir os pacotes base, `gdrive` e `prism` e os manifests gerados.
- [ ] 7.2 Rodar `npm run test:online -- --provider redecanais-deals` com `TMDB_API_KEY` do ambiente e registrar a rodada em `providers.md` com `--record`, atualizando o status conforme os critérios de `docs/tests.md`.
- [ ] 7.3 Revisar o diff completo, confirmar que não há segredo, URL assinada, cookie ou arquivo gerado editado à mão, e conferir que `providers.md` e a spec refletem o comportamento implementado, inclusive a limitação de catálogo dublado na amostra.

## Workflow follow-up

- Arquivar a mudança com `/opsx:archive` depois da revisão e da rodada online.
- Commitar com `feat(redecanais-deals): adiciona provedor RedeCanais Deals` e `OpenSpec: adicionar-provedor-redecanais-deals`.
