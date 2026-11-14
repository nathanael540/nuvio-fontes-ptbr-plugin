# Tasks

## 0. Dependência

- [ ] 0.1 Aplicar previamente a change `2026-11-13-extrair-bloco-blogger-video`, que cria `src/_blocks/blogger-video/index.mjs`, sua suíte e o refactor do AniTube. Esta change não repete a criação do bloco. Verificação: `node --test test/blocks/blogger-video/index.test.mjs` e `node --test test/anitube.test.js` passam antes de iniciar o AnimeQ.

## 2. Catálogo e identidade

- [ ] 2.1 Criar `src/animeq/catalog.js` com a busca `GET /?s=<termo>` via `fetchPage`, leitura de `div.search-page`, `div.no-result`, `div.result-item`, `.title a` e `.year`; verificar com fixtures de busca com resultado e de busca vazia.
- [ ] 2.2 Montar as variantes com `getMediaInfo` (PT-BR, original, alternativos e romaji), deduplicadas por `normalizeText`, e confirmar com `findBestMatch`; verificar com testes de título PT-BR ausente e romaji presente.
- [ ] 2.3 Implementar a seleção de série: `div.se-c`, `span.se-t` e `div.episode-card[data-episode-number]`, com link `a[href*="/episodio/"]`; verificar com testes de S01E02, temporada ausente e página sem blocos (erro).
- [ ] 2.4 Implementar a seleção de filme em `/filme/<slug>`; verificar que filme não é tratado como série e que série não é tratada como filme.

## 3. Players e embeds

- [ ] 3.1 Ler `div.animeq-player__source[data-animeq-source]`, extrair `<source src>`/`<iframe src>` e associar o rótulo por `data-animeq-switch`; verificar com fixtures de fonte direta, Blogger, Embed69 e Vidstack.
- [ ] 3.2 Expandir `li.dooplay_player_option` de filme via `POST /wp-admin/admin-ajax.php` (`action=doo_player_ajax`), ignorando `trailer`; verificar com fixtures de AJAX válido, `embed_url` vazio e JSON inválido.
- [ ] 3.3 Resolver `jwplayer?source=<valor>` decodificando o parâmetro e aceitando `http(s)`; verificar com fixtures de MP4 e de `source` inválido.
- [ ] 3.4 Resolver o Blogger com o bloco `blogger-video` e mapear `qualityLabel`; verificar com fixture de `streamingData` 360p.
- [ ] 3.5 Aplicar `Referer: https://animeq.cloud/` somente em `aniplay.online`; verificar que `animeflix.blog` e `googlevideo.com` saem sem cabeçalhos.
- [ ] 3.6 Descartar Embed69 (`animeshd.cloud`) e Vidstack (`animes.strp2p.com`) por triagem; verificar que uma página só com eles devolve lista vazia.

## 4. Contrato dos streams

- [ ] 4.1 Montar cada stream com `buildStream`, `type` conforme a mídia, `provider` (`AnimeQ`/`Blogger`) e `format` com título, ano, temporada e episódio; verificar `url`, `type`, `provider`, `quality` e `language` nos três formatos publicados.
- [ ] 4.2 Aplicar idioma só por rótulo `Dublado`/`Legendado` e omitir em rótulos técnicos; verificar que a saída sempre traz um valor do enum.
- [ ] 4.3 Preservar stream sem qualidade como `Desconhecida` e usar `360p` quando o Blogger declarar; verificar que nenhum stream é descartado por qualidade ausente.
- [ ] 4.4 Tratar cada opção em isolamento, com `console.warn('[AnimeQ] Opção <rótulo> descartada: <causa>')`, erro agregado quando todas falham e lista vazia quando todas são triagem; verificar com testes de fonte morta + Blogger vivo e de todas falhando.

## 5. Testes offline

- [ ] 5.1 Registrar fixtures reais sanitizadas em `test/fixtures/animeq/`: busca, busca vazia, série, episódio com fonte direta, episódio com Blogger, filme, Embed69, Vidstack e HTML inválido; substituir tokens do Blogger e URLs de mídia por placeholders e conferir que nada assinado ficou no repositório.
- [ ] 5.2 Criar `test/animeq.test.js` cobrindo filme, episódio avulso, episódio em temporada posterior, ausência, host não suportado e falha estrutural, executando o pacote gerado com `fetch` simulado; verificar com `node --test test/animeq.test.js`.

## 6. Build, manifest e publicação

- [ ] 6.1 Adicionar a entrada `animeq` ao `manifest.json` com nome `AnimeQ`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, idioma `pt` e logo HTTPS; verificar com `node -e` e com `node build.js animeq`.
- [ ] 6.2 Confirmar que o bloco `blogger-video` e o AniTube já foram reconstruídos e testados pela change de dependência; não reconstruir o AniTube aqui. Verificação: o pacote `providers/anitube.js` continua exportando `getStreams` e a suíte do AniTube passa.
- [ ] 6.3 Conferir `providers/animeq.js`, as variantes de formato e os `<formato>/manifest.json`; verificar que os arquivos exportam `getStreams`.
- [ ] 6.4 Adicionar `animeq: { "exclusiveTag": "anime" }` em `test/online/profiles.json`, atualizar `revision`/`curatedAt` e confirmar ao menos cinco filmes e cinco séries com a tag `anime`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 6.5 Adicionar a linha e a seção `## AnimeQ` em `providers.md` com status `🟠 Não verificado`; verificar com `node --test test/providers-catalog.test.js`.

## 7. Documentação e verificação online

- [ ] 7.1 Atualizar `docs/provider-investigation.md` com o método do player AnimeQ (blocos `animeq-player__source`, rótulos por índice), o `jwplayer?source=` e o bloco `blogger-video` entregue pela change de dependência; verificar que a seção cita `src/animeq/`, o teste e a spec.
- [ ] 7.2 Rodar `npm run lint`, `npm test` e `node build.js animeq`; corrigir qualquer falha.
- [ ] 7.3 Executar `npm run test:online -- --provider animeq` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; registrar a rodada em `providers.md`.
- [ ] 7.4 Ajustar o status conforme o resultado e registrar como limitação qualquer fonte morta ou host fora do contrato; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/animeq-catalog/spec.md`.
