# Tasks

## 1. Estrutura, manifest e catálogo

- [ ] 1.1 Criar `src/tokyvideo/extractor.js` como esqueleto: constantes (`BASE`, `SEARCH_PATH`, `VIDEO_PATH`, `MAX_CANDIDATES`, `MIN_CARD_SCORE`), imports dos blocos usados e `extractStreams` com JSDoc; verificar `npm run lint` aceita o arquivo e que o carregamento do pacote não faz requisição (testes com `fetch` que lança).
- [ ] 1.2 Criar `src/tokyvideo/index.js` com `PROVIDER_NAME = 'Tokyvideo'`, `validateInput`, `getStreams` com `sortByQuality` e a única captura com `console.error('[Tokyvideo] ...')`; verificar `npm run lint` e `node build.js tokyvideo` geram `providers/tokyvideo.js` sem erro.
- [ ] 1.3 Adicionar a entrada `tokyvideo` ao `manifest.json` com `movie` e `tv`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor `nathanael540`, descrição em pt-BR e logo HTTPS; verificar `node --test test/manifest.test.js` e `node --test test/providers-catalog.test.js` passam.
- [ ] 1.4 Confirmar que `node build.js tokyvideo` gera `gdrive/providers/tokyvideo.js`, `prism/providers/tokyvideo.js` e entradas nos `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams`.

## 2. Busca, ranking e ficha

- [ ] 2.1 Implementar `searchUrl` (`GET https://www.tokyvideo.com/br/procurar?q=<título>`, perfil `page`), `decodeEntities`, `cleanText` e `parseSearchResults` (âncoras `/br/video/...`, dedup por URL, título sem duração); verificar com os cartões reais de `gta 6` (49 cards; primeiro "GTA 6 TRAILER OFICIAL DA ROCKSTAR").
- [ ] 2.2 Implementar `rankCards`/`cardScore`: `titleSimilarity` contra `media.title`/`originalTitle`/alternativos, regra de contenção `0,55 + razão`, mínimo `0,6`, máximo 3 candidatos; verificar que o ranking do real retorna os cartões com títulos confirmados primeiro.
- [ ] 2.3 Implementar `readVideoJsonLd`, `readMp4Source` (`type` contendo `video/mp4` ou `src` terminado em `.mp4` sem `type`), `readAttr`, `readPageTitle`, `readDurationSeconds` (ISO 8601) e `readDataVideoDuration`; verificar com as páginas reais: "GTA TRAILER" → `cdnst32.tokyvideo.com` (HTTP 200), `P0DT0H24M49S` → 1489.

## 3. Identidade e streams

- [ ] 3.1 Implementar `pageTitleConfirmed`: `titleSimilarity >= 0,5` ou contenção normalizada; título ausente aceita.
- [ ] 3.2 Implementar `parseVideoPage` (title, duration, cdnUrl) e `buildFields`: `buildStream` com `format` (`FORMATTER.AUTO`, `addon: 'Tokyvideo'`, título/ano/duração), `type: 'mp4'`, `provider` = host do CDN, `headers: playbackHeaders(URL da ficha)` e `quality` = `videoQuality` quando presente.
- [ ] 3.3 Implementar `resolveCard` e `extractStreams` (fluxo: busca → ranking → abrir fichas → primeiro stream válido; falhas isoladas com `console.warn('[Tokyvideo] Opção <título> descartada: <causa>')`; erro agregado se nenhum produz stream e algum falhou).

## 4. Testes Node

- [ ] 4.1 Criar `test/fixtures/tokyvideo/`: `search.html` (cartões com `thumb-duracion` e âncoras de título em `www.tokyvideo.com/br/video/...`), `video-gta-trailer.html` (ficha com JSON-LD `VideoObject`, `videoQuality` "HD" e `<source type="video/mp4" src="https://cdn.tokyvideo.example.test/...mp4?secure=fake">`), `video-geo.html` (ficha sem fonte) e `meta-movie.json` (TMDB para o filme).
- [ ] 4.2 Criar `test/tokyvideo.test.js` com a suíte `vm` do RIVO (buildProvider, `AppURL`, rotas por hostname/pathname): filme resolvido (url do stream, `quality` `720p`, `language` `Idioma Desconhecido`, `type` `mp4`, `provider`, `headers`, `name`/`title` do formatador); episódio avulso (season/episode no `format`); ausência reconhecida (busca sem resultados confirmados e ficha sem fonte — lista vazia, sem `console.error`); triagem de entrada (4.2 do RIVO: inválidos devolvem `[]` e registram erro sem requisição); falha fatal (busca fora de 2xx); isolamento de opção (ficha sem fonte caminha para a próxima); manifest do provedor; sanitização de logs (sem assinatura/URL no aviso e no erro).

## 5. Documentação

- [ ] 5.1 Adicionar a linha e a seção `## Tokyvideo` em `providers.md` com status `🟠 Não verificado` e a última verificação `—`; verificar `node --test test/providers-catalog.test.js`.
- [ ] 5.2 Adicionar `### 3.40. Site de vídeo com MP4 assinado no <source> da ficha` em `docs/provider-investigation.md` (situação, sinal de reconhecimento, investigação, contrato, ação, referências e limites), sem registrar assinaturas reais.

## 6. Verificação final

- [ ] 6.1 Rodar `npm run lint` e `npm test`; confirmar que o build de todos os pacotes passa (`node build.js tokyvideo`) e que os novos arquivos não contêm `Promise.allSettled`, `AbortController`, `setTimeout`, `require` de Node ou APIs externas no carregamento do módulo.
