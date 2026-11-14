# Design

## Context

Ver `proposal.md` — Why. A cadeia atual do EmbedMovies é `embedmovies.org` (busca por TMDB) → `myembed.biz` → `playerflix.ink` → opções. O bloco `fireplayer` já resolve `embedplayer2.xyz` (VIP Player), mas em `src/_blocks/fireplayer/index.mjs` a opção `watchplay.shop` é descartada antes de qualquer requisição com o rótulo `playlist sem RESOLUTION`. O `src/embedmovies/extractor.js` não tem como resolver essa opção por conta própria: as opções nascem dentro de `expandPlayerflix`, no bloco.

Observações online de 2026-11-13 (2026-11-14 UTC):

1. **PlayerFlix, filme 550.** `GET https://playerflix.ink/inc/Ajax.php?type=movie&id=550&season=null&episode=null`, com `X-Requested-With: XMLHttpRequest` e `Referer` da ficha, respondeu `200 application/json` e três opções: `watchplay` (`v1.watchplay.shop/movie/:id`, `lang: pt-br`), `embedplay` (`embedplayabyss.top`) e `superflixapi` (`budget: danger`). O pacote publicado `providers/embedmovies.js` devolveu 0 streams para 550 em 2026-11-14T02:51:44Z; os avisos foram `WatchPlay ... playlist sem RESOLUTION`, `Embed Play ... host fora do conjunto` e `Premium ... budget danger`.
2. **Página WatchPlay.** `GET https://v1.watchplay.shop/movie/:id` respondeu `200 text/html`, redirecionou para `v2.watchplay.shop` e publicou uma chamada `createMyPlayer` com uma URL `playlist.m3u8`.
3. **Playlist WatchPlay.** A playlist respondeu `200 application/vnd.apple.mpegurl`, com `#EXTM3U`, `#EXT-X-VERSION`, `#EXT-X-TARGETDURATION:5`, `#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-ENDLIST` e 1692 `#EXTINF`. Não havia `#EXT-X-STREAM-INF`, `#EXT-X-MEDIA` nem faixa de áudio separada. O primeiro segmento respondeu `206`, `Content-Range: bytes 0-1/1044306`, `Content-Type: text/javascript`; a extensão `.js` não indica o tipo real.
4. **Série.** A mesma cadeia para `1396` S01E01 (Breaking Bad) publicou uma playlist VOD com 697 segmentos e as mesmas características. A série já resolve pelo VIP Player; o WatchPlay é uma opção adicional.
5. **Referer.** A playlist respondeu com e sem `Referer`; o `Referer` da página final (`v2`) e o da página inicial (`v1`) devolveram o mesmo conteúdo. O segmento respondeu `206` com o `Referer` da página final. O cabeçalho não é obrigatório para a playlist na observação, mas será mantido com a URL final por consistência com o restante do bloco.

## Goals / Non-Goals

**Goals:**

1. Resolver a opção WatchPlay do PlayerFlix em uma playlist HLS válida, sem sonda e sem qualidade inventada.
2. Manter o comportamento atual de DooPlay e FirePlayer PT-BR, que continuam sem resolver WatchPlay.
3. Reaproveitar `readHtml`, `interpretPlaylist`, `loadSubtitles`, `chooseLanguage` e `buildStreams` do bloco.
4. Cobrir o caminho com testes offline e uma rodada online do pacote final.

**Non-Goals:**

1. Alterar a triagem de `embedplayabyss.top`, Blogger, `ok.ru`, `superflixapi.*` ou `budget danger`.
2. Criar um provedor novo, bloco novo ou settings de usuário.
3. Sondar a playlist para descobrir resolução; a própria playlist é lida uma vez para validar o `#EXTM3U`.
4. Baixar segmentos, cachear URLs ou contornar DRM, conta ou desafio.
5. Promover WatchPlay a todos os consumidores do bloco sem validação própria de cada um.

## Decisions

### 1. Resolvedor opt-in no bloco `fireplayer`

O bloco ganha `resolveWatchplay(entry, context)`. Em `resolveUrl`, o host `watchplay.shop` continua devolvendo `{ triage: 'playlist sem RESOLUTION' }` quando `context.resolveWatchplay !== true`; com a flag, chama o novo resolvedor. O `src/embedmovies/extractor.js` passa `resolveWatchplay: true` no contexto de `playEntries`. A propriedade é opcional no `FireContext` e não é um setting do app.

Alternativas descartadas: habilitar para todos os consumidores (mudaria DooPlay e FirePlayer sem rodada online própria); criar um resolvedor local no EmbedMovies (não teria acesso às opções, que nascem no bloco); duplicar a consulta direta ao PlayerFlix no provedor (ignoraria a identidade e o `meta` do catálogo, além de repetir a cadeia).

### 2. Leitura da página e extração da playlist

O resolvedor usa `readHtml(entry.url, { headers: { Referer: originReferer(entry.referer) } })`, que segue o redirecionamento e devolve `page.url` final. Da página, extrai a primeira URL que contenha `playlist.m3u8` entre aspas, desescapa `\/` e resolve contra `page.url` com `httpUrl`. Se a página não publicar a playlist, lança `Error('playlist do WatchPlay ausente')`; a falha é isolada por `settleEntry` e vira `console.warn`, sem derrubar as demais opções.

A URL `playlist.m3u8` é baixada com `readHtml(playlistUrl, { profile: 'player', headers: { Referer: page.url } })`. Se a resposta não começar com `#EXTM3U`, lança `Error('Resposta do WatchPlay não é playlist HLS')`. Não há requisição extra: a playlist já é necessária para validar o formato e obter as variantes.

### 3. Qualidade e idioma

`interpretPlaylist` devolve `variants` quando há `#EXT-X-STREAM-INF` e `quality` da maior variante; sem variantes, devolve `variants: []`, `quality: null` e a própria URL. `buildStreams` transforma isso em um stream com `UNKNOWN_QUALITY` (`Desconhecida`). A qualidade fixa `720p` da proposta é rejeitada: não há `RESOLUTION` na playlist observada e o contrato proíbe resolução sem prova.

O idioma usa `entry.languageHint`, que `expandPlayerflix` preenche com `option.lang` (`pt-br` observado). `chooseLanguage` aplica a mesma regra dos outros hosts: `pt-br` vira `Dublado`; sem dica classificável e sem áudio/legenda, o idioma fica desconhecido. Não se promove `Dublado` a PT-BR comprovado. O `provider` é o host final (`v2.watchplay.shop`), obtido de `new URL(media.playerPage).hostname` em `buildStreams`.

### 4. Escopo por tipo e por provedor

O resolvedor é agnóstico de tipo. A playlist de série 1396 S01E01 foi observada com o mesmo contrato e o `format` já recebe temporada e episódio do `request`. A proposta limita WatchPlay a filmes, mas essa restrição não tem justificativa no contrato atual; a mudança aceita filme e série. O opt-in fica restrito ao EmbedMovies para não alterar a saída de DooPlay e FirePlayer sem evidência própria.

### 5. Erros, triagem e headers

1. Página com bloqueio reconhecido pelo `readHtml` continua triagem.
2. Página 200 sem playlist ou playlist que não é HLS é falha da opção, não ausência.
3. Se todas as opções produzirem streams, as falhas ficam nos avisos; se nenhuma produzir e houver falha, o erro agregado sobe; se todas forem triagem, o resultado é vazio.
4. `headers` de reprodução são `playbackHeaders(page.url)`; a observação mostrou que a playlist e o segmento respondem sem `Referer`, então nenhum cabeçalho extra é exigido. O `Referer` final é mantido por consistência e não é usado como prova de necessidade.
5. Nenhuma URL de mídia, hash ou parâmetro assinado entra em log, fixture ou documentação; `redact` continua no caminho de aviso.

### 6. Testes e fixtures

1. Bloco: teste com `resolveWatchplay: true` e página/playlist de mídia; espera `resolved[0].quality === null`, `variants` vazio, `language: 'Dublado'`, `playerPage` final e um stream `Desconhecida` via `buildStreams`.
2. Bloco: teste de master com variantes e teste de página sem playlist como falha; teste com a flag ausente continua esperando a triagem atual.
3. EmbedMovies: filme com apenas WatchPlay jogável devolve um stream `Desconhecida`, `Dublado`, `provider` `v2.watchplay.shop` e `format` com título/ano; série preserva temporada/episódio; o caso "todas as opções apenas triagem" deixa de incluir WatchPlay.
4. Fixtures novas em `test/fixtures/embedmovies/`: página WatchPlay sanitizada, playlist VOD sem variantes e playlist master com variantes; hosts, hashes e ids fictícios, sem URL de mídia real.
5. Suítes de DooPlay e FirePlayer PT-BR são reexecutadas para confirmar que a flag ausente mantém a triagem e os testes atuais.

### 7. Documentação e versão

1. `src/_blocks/index.md`: a linha do `fireplayer` passa a citar WatchPlay como host opt-in do EmbedMovies.
2. `docs/provider-investigation.md`, seção 3.12: registrar a variação "playlist de mídia VOD sem `RESOLUTION`", a extensão `.js` dos segmentos, a qualidade `Desconhecida` e o limite de não sondar.
3. `manifest.json`: `embedmovies` sobe de `1.0.0` para `1.1.0`.
4. `providers.md`: nova rodada online do pacote `1.1.0`, com a tabela e a seção atualizadas.

## Risks / Trade-offs

1. **Página ou playlist WatchPlay muda** → a extração e o `#EXTM3U` falham de forma explícita; testes e rodada online detectam. Não há fallback silencioso.
2. **Qualidade desconhecida** → o stream fica no fim da ordenação, mas é reproduzível; a alternativa seria inventar 720p, o que o contrato proíbe.
3. **Idioma vem de `lang`** → o rótulo pode ser locale do catálogo, não áudio. O bloco já usa o mesmo campo para VIP e Premium; a mudança mantém a semântica da fonte e não afirma PT-BR além do rótulo.
4. **Playlist longa (1692 segmentos)** → é VOD com `ENDLIST`; o app baixa os segmentos na reprodução. Não há cache nem leitura do corpo do vídeo.
5. **Bloco compartilhado** → o opt-in evita mudar DooPlay/FirePlayer; ainda assim, a assinatura do contexto e o catálogo do bloco mudam. As suítes dos três consumidores e o build completo cobrem a regressão.
6. **Hosts `v1`/`v2`** → o redirecionamento é seguido; a URL final é usada como `Referer`. Se o host mudar, a página responde fora do contrato e a opção falha de forma isolada.

## Validation

1. **Observado**: 550 filme, PlayerFlix com WatchPlay, página 200, playlist VOD 200, 1692 segmentos, segmento 206; 1396 S01E01, playlist VOD 200, 697 segmentos; pacote atual 1.0.0 com 0 streams para 550 e 1 stream para 1396 (VIP).
2. **Observado em desenho**: a playlist real passada por `interpretPlaylist` e `buildStreams` produz um stream `Desconhecida`, `Dublado`, `provider` `v2.watchplay.shop`, com `name`/`title` gerados.
3. **Hipótese**: reprodução no app, comportamento em outros títulos e a estabilidade do formato da página/playlist. A rodada online do pacote final é a evidência de contrato; a reprodução real continua fora do harness.
4. **Não testado**: playlist WatchPlay com `#EXT-X-STREAM-INF` ou `#EXT-X-MEDIA` real; o resolvedor delega ao `interpretPlaylist` já testado. Se aparecer, a cobertura de master do bloco se aplica.

## Migration Plan

1. Alterar `src/_blocks/fireplayer/index.mjs`: propriedade `resolveWatchplay` no `FireContext`, handler `resolveWatchplay` e roteamento em `resolveUrl`.
2. Passar `resolveWatchplay: true` em `src/embedmovies/extractor.js`.
3. Atualizar `src/_blocks/index.md`, fixtures e testes do bloco e do EmbedMovies; reexecutar DooPlay e FirePlayer PT-BR.
4. Subir a versão do EmbedMovies para `1.1.0` no `manifest.json`.
5. Rodar `npm run lint`, `node --test test/blocks/fireplayer/index.test.mjs`, `node --test test/embedmovies.test.js`, `node --test test/dooplay.test.js`, `node --test test/fireplayer.test.js` e `node build.js embedmovies`.
6. Rodar `npm run test:online -- --provider embedmovies` e atualizar `providers.md`.
7. Rollback: remover a flag do EmbedMovies, o handler e a propriedade do bloco, restaurar o catálogo do bloco, os testes e a versão; os arquivos gerados voltam pelo build. Não há dados persistidos.
