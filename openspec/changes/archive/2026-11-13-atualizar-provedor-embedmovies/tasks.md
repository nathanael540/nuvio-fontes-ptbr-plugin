# Tasks

## 1. Resolvedor WatchPlay no bloco `fireplayer`

- [x] 1.1 Declarar `resolveWatchplay` como propriedade opcional do `FireContext` no JSDoc de `src/_blocks/fireplayer/index.mjs`, sem alterar `assertContext` para exigir a flag. Verificação: `npm run lint` passa e `test/blocks/fireplayer/index.test.mjs` atual continua verde.
- [x] 1.2 Em `resolveUrl`, manter `{ triage: 'playlist sem RESOLUTION' }` quando `context.resolveWatchplay !== true` e chamar `resolveWatchplay(entry, context)` quando a flag for verdadeira para host `watchplay.shop`. Verificação: teste novo com a flag ausente continua vendo a triagem; teste com a flag presente vê a chamada de página e playlist.
- [x] 1.3 Implementar `resolveWatchplay`: `readHtml` da página com `Referer` da entrada; extrair a primeira URL `playlist.m3u8` (aspas simples ou duplas, `\/` desescapado), resolver com `httpUrl` contra `page.url`; lançar `playlist do WatchPlay ausente` quando não houver. Verificação: teste com página `createMyPlayer` devolve a URL esperada e teste sem playlist vira falha isolada.
- [x] 1.4 Baixar a playlist com `readHtml(..., { profile: 'player', headers: { Referer: page.url } })`, exigir `#EXTM3U`, chamar `interpretPlaylist`, `loadSubtitles` e `chooseLanguage`; devolver `playerPage: page.url`, `playlistUrl`, `adaptive`, `quality`, `variants`, `language`, `subtitles`, `headers: playbackHeaders(page.url)` e `meta: entry.meta || null`. Verificação: playlist VOD sem variantes devolve `quality: null`, `variants: []` e idioma `Dublado` com hint `pt-br`; a montagem com `buildStreams` sai `Desconhecida`.
- [x] 1.5 Garantir que página 200 sem playlist e playlist sem `#EXTM3U` sejam falhas da opção (com `console.warn` pelo `settleEntry`), não ausência; bloqueio reconhecido pelo `readHtml` continua triagem. Verificação: testes de página sem playlist, playlist inválida e bloqueio reconhecido separam `failures`, `triage` e `resolved`.
- [x] 1.6 Atualizar a linha do `fireplayer` em `src/_blocks/index.md` para citar WatchPlay como host opt-in do EmbedMovies e a nova propriedade de contexto. Verificação: `node --test test/blocks-catalog.test.js` passa.

## 2. EmbedMovies

- [x] 2.1 Passar `resolveWatchplay: true` no contexto de `playEntries` em `src/embedmovies/extractor.js`, mantendo `logName`, `domain`, `providerName`, `identity` e `meta` atuais. Verificação: teste do EmbedMovies com opção WatchPlay passa a resolver; teste com a flag removida volta ao comportamento antigo.
- [x] 2.2 Atualizar `test/fixtures/embedmovies/playerflix-movie.json` ou criar uma fixture equivalente com apenas a opção WatchPlay e as opções não suportadas; criar `watchplay-movie.html` e `watchplay-vod.m3u8` sanitizados, com hosts, ids e caminhos fictícios. Verificação: as fixtures não contêm URL de mídia real, token, hash de mídia ou parâmetro assinado.
- [x] 2.3 Adicionar caso "filme cuja única opção jogável é WatchPlay": busca, `myembed`, PlayerFlix, página WatchPlay, playlist VOD; esperar um stream `Desconhecida`, `Dublado`, `provider` `v2.watchplay.shop`, `type` `hls`, `format` com `addon` `EmbedMovies`, título e ano, sem `name`/`title` informados pelo provedor. Verificação: `node --test test/embedmovies.test.js` passa com o caso novo.
- [x] 2.4 Adicionar caso de série com WatchPlay: coordenadas no caminho do `myembed` e no `format`, playlist VOD e um stream `Desconhecida`. Verificação: o teste confere temporada/episódio e não depende de posição visual.
- [x] 2.5 Atualizar o teste "todas as opções apenas em triagem" para remover WatchPlay do conjunto de triagem; manter `embedplayabyss.top`, Blogger, `ok.ru` e `budget danger`. Verificação: o teste continua devolvendo `[]` sem `console.error` e sem `console.warn`.
- [x] 2.6 Atualizar o teste principal de filme: se a rota incluir WatchPlay, adicionar a página/playlist e ajustar a contagem de chamadas e streams; se não incluir, garantir que a opção seja resolvida apenas no caso dedicado. Verificação: a contagem de chamadas e a ordem dos streams conferem com as rotas simuladas.
- [x] 2.7 Reexecutar as suítes de DooPlay e FirePlayer PT-BR para confirmar que a flag ausente mantém a triagem de WatchPlay e as chamadas atuais. Verificação: `node --test test/dooplay.test.js` e `node --test test/fireplayer.test.js` passam sem edição de expectativa.

## 3. Documentação e versão

- [x] 3.1 Subir `embedmovies` de `1.0.0` para `1.1.0` no `manifest.json` e manter `supportedTypes`, `formats` e `contentLanguage`. Verificação: `node --test test/manifest.test.js` passa.
- [x] 3.2 Atualizar `docs/provider-investigation.md`, seção 3.12, com a variação "playlist de mídia VOD sem `RESOLUTION`": página `watchplay.shop`, playlist `#EXTM3U`/`#EXT-X-PLAYLIST-TYPE:VOD`/`ENDLIST`, segmento com extensão `.js`, qualidade `Desconhecida`, headers não obrigatórios e limite de não sondar. Referenciar `src/_blocks/fireplayer/index.mjs`, `src/embedmovies/extractor.js`, `test/blocks/fireplayer/index.test.mjs` e `test/embedmovies.test.js`. Verificação: a seção distingue método em uso de hipótese e não contém URL de mídia real.
- [x] 3.3 Atualizar `providers.md` com a rodada online do pacote `1.1.0` (data, ID, status, perfil, catálogos, semente, algoritmo e casos). Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.

## 4. Build, testes e verificação online

- [x] 4.1 Rodar `npm run lint` e as suítes alteradas: `node --test test/blocks/fireplayer/index.test.mjs`, `node --test test/embedmovies.test.js`, `node --test test/dooplay.test.js` e `node --test test/fireplayer.test.js`. Verificação: todos terminam com código 0.
- [x] 4.2 Rodar `node build.js embedmovies` e conferir `providers/embedmovies.js`, `gdrive/providers/embedmovies.js`, `prism/providers/embedmovies.js` e os manifests de formato. Verificação: o build termina com código 0 e cada pacote exporta `getStreams`.
- [x] 4.2.1 Reconstruir todos os provedores que importam o bloco `fireplayer` (`dooplay`, `fireplayer`, `pobreflix-nixplay`, `pobreflixtv`, `fshd` e `embedmovies`) e reexecutar as suítes correspondentes. Verificação: `node build.js <id>` termina com código 0 para cada consumidor, os pacotes gerados foram atualizados, e `node --test test/dooplay.test.js`, `test/fireplayer.test.js`, `test/pobreflix-nixplay.test.js`, `test/pobreflixtv.test.js`, `test/fshd.test.js` e `test/embedmovies.test.js` passam com o comportamento padrão.
- [x] 4.3 Antes da rodada completa, executar o pacote final para `movie 550` e `tv 1396 S01E01` e conferir a resolução WatchPlay: `Desconhecida`, `Dublado`, `provider` do host final, sem URL de mídia no log. Verificação: 550 devolve ao menos um stream quando o WatchPlay estiver disponível; 1396 preserva o stream VIP e, se o WatchPlay aparecer, devolve também a opção adicional.
- [x] 4.4 Rodar `npm run test:online -- --provider embedmovies` com o pacote final e `TMDB_API_KEY` apenas do ambiente. Verificação: o runner conclui, imprime o resumo e grava o relatório transitório sanitizado.
- [x] 4.5 Confirmar que `providers/`, `gdrive/` e `prism/` não foram editados à mão e que `docs/arch.md` não mudou. Verificação: `git diff --stat` mostra as saídas geradas somente depois do build e `git diff -- docs/arch.md` está vazio.

## 5. Workflow follow-up

- [x] 5.1 Arquivar a mudança depois da revisão e da evidência online registrada.
- [x] 5.2 Verificar o resultado arquivado em `openspec/changes/archive/`.
