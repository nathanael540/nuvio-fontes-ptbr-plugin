# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03). URLs assinadas do Google Video e o `videoUrl` do Blogger não são registrados aqui.

1. `GET https://serv01.meusdoramas.club/posts/get-video.php?episode_number=1&season_number=1&tmdb=94796` respondeu HTTP 200 `application/json; charset=utf-8` com 210 bytes e duas chaves: `success` (booleano) e `videoUrl` (string). O host do `videoUrl` é `www.blogger.com`.
2. O mesmo endpoint respondeu 200 com 60 bytes e `success: false` para o TMDB 1399 (`Game of Thrones`) e para o filme 496243 (`Parasita`). O catálogo é de séries asiáticas; filme não é servido.
3. `Alice in Borderland` S02E01 e `Sweet Home` S02E01 responderam `success: true` e resolveram a mesma cadeia, mostrando que a temporada entra na consulta e não é ignorada.
4. A página do Blogger respondeu 200 `text/html` com 24.807 a 27.931 bytes, `streamingData` e cinco URLs `googlevideo.com/videoplayback`. No HTML bruto não aparece `itag`; depois de desescapar `\u0026` para `&`, `\/` para `/`, `&quot;` para `"` e `&amp;` para `&`, aparecem quatro URLs com `itag` 18 e 22 e uma com `sabr` sem `itag`.
5. O MP4 respondeu 206 `video/mp4` com `Content-Range` e primeiros bytes `00000018 66747970 6d703432` para os quatro títulos de amostra. O `itag` 18 corresponde a 360p e o 22 a 720p; o 37 não apareceu na amostra.
6. O MP4 respondeu 403 `text/plain` sem `User-Agent` e 206 com o UA de navegador; `Referer` sozinho respondeu 403. O UA precisa ser enviado também na reprodução, não apenas na descoberta.
7. A página do Blogger não tem `captionTracks`, `.vtt` nem rótulo `Dublado`/`Legendado`; o site `meusdoramas.club` respondeu 403 na home e `seudorama.com` está fora do ar (redireciona para um domínio de apostas). A API `serv01.meusdoramas.club` é o único ponto necessário e está pública.
8. A API não usa chave, conta, cookie ou DRM; a consulta é por ID do TMDB e devolve `success: false` para ausência.

## Goals / Non-Goals

**Goals:**

1. Consultar a API por TMDB, temporada e episódio e reconhecer ausência por `success: false`.
2. Desescapar a página do Blogger e extrair somente MP4 progressivo com `itag` numérico.
3. Deduplicar e ordenar por qualidade, com o `User-Agent` comprovado na reprodução.
4. Manter testes offline com fixtures reais sanitizadas e verificação online no perfil `dorama`.

**Non-Goals:**

1. Declarar `Legendado` sem rótulo: a API e o Blogger não publicam áudio nem legenda.
2. Implementar `sabr`, player JavaScript, DRM ou download de segmentos.
3. Resolver hosts alternativos (`csst`, `incvideo`, `abyssplayer`, `vidlink`): não foram observados como necessários e não têm MP4 estático.
4. Adicionar timeout, retentativa, cache, sonda de mídia ou settings.
5. Garantir filmes: a API devolve `success: false` para filme.

## Decisions

### D1. Entrada e consulta à API

1. Validar `tmdbId` numérico e `mediaType` igual a `tv`; `movie` é recusado antes de qualquer requisição.
2. Normalizar temporada e episódio para inteiros a partir de 1; valor ausente ou inválido em `tv` é erro de entrada, não default silencioso.
3. Consultar `GET https://serv01.meusdoramas.club/posts/get-video.php` com `new URLSearchParams({ episode_number, season_number, tmdb })`, `User-Agent` de navegador e `Accept: application/json, text/plain, */*`.
4. Exigir HTTP 2xx e JSON com `success` booleano. `success === false` é ausência reconhecida e devolve lista vazia; `success === true` sem `videoUrl` string HTTP(S) é erro de estrutura.
5. Alternativa descartada: buscar por título no site. A API aceita o TMDB diretamente e o site não está acessível.

### D2. Página do Blogger e extração

1. Pedir `videoUrl` com `fetchText` e o mesmo `User-Agent`; aceitar somente host `blogger.com` (`www.blogger.com` ou `blogger.com`).
2. Desescapar o HTML inteiro, nesta ordem: `\uXXXX` → caractere, `\/` → `/`, `&quot;` → `"`, `&amp;` → `&`. A ordem importa: o `itag` só aparece depois do primeiro passo.
3. Extrair todas as URLs `https?://<subdomínio>.googlevideo.com/videoplayback?...` até o primeiro delimitador (`"`, `'`, `\`, espaço ou `<`); remover pontuação final.
4. Aceitar somente URL com `itag` numérico; descartar `sabr` sem `itag` e qualquer URL sem `itag`. O `sabr` é fragmentado e não serve a um player MP4 simples.
5. Mapear `itag`: 18 e 43 → 360p; 22 → 720p; 37 → 1080p; outros → `Desconhecida`. O mapa é o do Google Video; o 37 não foi observado, mas é o valor publicado para 1080p.
6. Deduplicar por URL exata e ordenar por qualidade (1080p, 720p, 360p, desconhecida). Não limitar a três: a fonte publica no máximo quatro úteis na amostra, e o app ordena.
7. Alternativa descartada: usar `streamingData.formats` como JSON. O HTML do Blogger não publica `formats`/`adaptiveFormats` como JSON limpo na amostra; a extração por URL desescapada é a que funcionou.
8. Comparação com os provedores atuais: `dattebayo` usa uma API própria e assinatura R2, não a página do Blogger; `anitube` também lê o Blogger, mas pelo `streamingData.formats` do Player 1 e com outra identidade. O leitor do AniTube é local e não serve a esta resposta; um bloco novo só se justificaria com um segundo consumidor deste mesmo formato.

### D3. Streams e idioma

1. Montar cada stream com `buildStream`:
   1. `url` do Google Video.
   2. `type: 'mp4'`.
   3. `provider: 'SeuDorama'`.
   4. `quality` pelo `itag`.
   5. `language: LANGUAGE.UNKNOWN`: não há áudio nem legenda declarados. A página do Blogger não tem `captionTracks`; o site não está acessível para rotular.
   6. `headers: { 'User-Agent': <mesmo UA da descoberta> }`, porque sem ele o MP4 responde 403.
   7. `format: { template: FORMATTER.AUTO, addon: 'SeuDorama', title, year, season, episode }`.
2. Não informar `size`, `subtitles`, `infoHash`, seeders ou peers.
3. Não usar `name`/`title` no stream.
4. Alternativa descartada: fixar `Legendado` como a proposta. O catálogo é de doramas com legenda embutida provável, mas a API não publica essa informação; afirmar seria inventar.

### D4. Erros, ausência e tempo

1. Entrada, API e página do Blogger são etapas fatais: erro sobe até `getStreams`, que registra `[SeuDorama] <etapa>: <mensagem>` e devolve `[]`.
2. `success: false` é ausência; página do Blogger com `streamingData` e nenhuma URL com `itag` é ausência da opção, não erro; página sem `streamingData` (bloqueio, login ou HTML inesperado) é erro de estrutura; JSON inválido e HTTP fora de 2xx também são erro.
3. Não há `setTimeout`, `AbortController`, retentativa, cache ou sonda.
4. `console.warn` não é necessário se a única opção for a página; a falha sobe como erro. Se houver mais de uma URL de mídia, cada uma é independente e a falha de uma gera aviso, preservando as demais.
5. A URL do Google Video é vinculada ao IP e expira; não guardar em cache, fixture, log ou mensagem de erro.

### D5. Testes, manifest e documentação

1. Fixtures reais sanitizadas em `test/fixtures/seudorama/`: API `success: true` com `videoUrl` fictício de `blogger.com`, API `success: false`, API 500, JSON inválido, Blogger com `itag` 18/22, Blogger com `sabr` sem `itag`, Blogger sem URL, Blogger com URL duplicada e Blogger com `itag` 37.
2. Casos: S01E01 resolve 360p e 720p; S01E02 resolve; S02E01 resolve; série fora do catálogo devolve `[]`; filme devolve `[]` sem `fetch`; `itag` 37 vira 1080p; sem `itag` é descartado; todas as URLs inválidas sobem erro; `headers.User-Agent` e `format` conferidos nos três templates.
3. Nenhuma fixture contém URL assinada do Google Video: usar `https://rr1---sn-example.googlevideo.com/videoplayback?itag=22` como placeholder sanitizado.
4. Manifest: `id` `seudorama`, nome `SeuDorama`, versão `1.0.0`, autor `nathanael540`, tipos `["tv"]`, formatos `["mp4"]`, `contentLanguage` `["pt"]`, logo `https://www.google.com/s2/favicons?domain=meusdoramas.club&sz=128`.
5. Verificação online: `"seudorama": { "exclusiveTag": "dorama" }` em `test/online/profiles.json`; a linha e a seção em `providers.md` começam em `🟠 Não verificado`.
6. `docs/provider-investigation.md`: nova seção “API por TMDB com página Blogger e MP4 do Google Video”, com o desescape, o `itag`, o descarte de `sabr` e a exigência de `User-Agent`.

## Risks / Trade-offs

1. **URL vinculada ao IP** → a URL do Google Video expira e é específica do IP que resolveu. O provedor resolve a cada pedido; o app busca do mesmo aparelho. Não há cache.
2. **Idioma desconhecido** → a API e o Blogger não publicam áudio/legenda; o stream sai `Idioma Desconhecido`. Se a fonte passar a rotular, o design muda.
3. **`sabr`** → a URL fragmentada não serve ao player MP4; é descartada. Se o Google Video passar a publicar somente `sabr`, o provedor fica sem stream.
4. **`itag` 37** → o mapa 1080p é o do Google Video, mas não foi observado na amostra; a qualidade pode não aparecer.
5. **API separada do site** → `serv01.meusdoramas.club` responde, mas a home do domínio responde 403 e `seudorama.com` está fora do ar. A API pode mudar sem aviso; erro de estrutura sobe.
6. **Sem filmes** → a API responde `success: false` para filme; o provedor é `tv` only.
7. **Duração/legenda embutida** → não foi possível confirmar se a legenda é PT-BR ou se há dublagem; o idioma fica desconhecido.

## Migration Plan

1. Criar `src/seudorama/` com `api.js`, `blogger.js`, `streams.js` e `index.js`; rodar `node --test test/seudorama.test.js`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método.
4. Rodar `npm run lint`, `npm test` e `node build.js seudorama`; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider seudorama` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar a mudança somente com os testes previstos passando ou com as exclusões declaradas.
7. Rollback: remover o provedor, a entrada do manifest, o perfil e a seção de `providers.md`.

## Validation

1. Confirmado online: API 200 `application/json` com `success: true` e `videoUrl` do Blogger para 94796, 136283, 96162, 90447, 110316 S02E01, 96648 S02E01 e 94796 S01E02; `success: false` para 1399 e 496243; Blogger 200 com `streamingData` e cinco URLs; `itag` 18/22 após desescape; MP4 206 `video/mp4` `ftyp`; 403 sem `User-Agent`.
2. Confirmado que a página do Blogger não publica `captionTracks` nem `.vtt`.
3. Não confirmado: reprodução no aparelho, todos os episódios, o `itag` 37 e o idioma real do áudio/legenda.
4. A rodada online e o teste no aparelho são as evidências que faltam; nenhuma delas altera o contrato descrito aqui.

## Resultado da implementação

1. Testes offline aprovados: `node --test test/seudorama.test.js` (14 casos), além de manifest, catálogo de provedores, catálogos online e build; `npx eslint src/seudorama test/seudorama.test.js` sem avisos. O build gerou os três pacotes (`providers/`, `gdrive/providers/` e `prism/providers/`).
2. Rodada online de 2026-11-14T06:46:19.103Z, perfil `dorama`, pacote 1.0.0: **Estável**, `tv 4/5`. Vincenzo falhou porque a API devolveu `videoUrl` fora do host `blogger.com`; o provedor recusou como erro de estrutura, conforme a spec, sem tentar player desconhecido. Itaewon Class, The Glory, Round 6 e Pousando no Amor resolveram dois streams cada (360p e 720p).
3. O idioma permanece `Idioma Desconhecido` em todos os streams: a API e a página do Blogger não publicam áudio nem legenda. A limitação de `D3` continua aberta.
4. Nenhuma URL assinada do Google Video entrou em log, mensagem, fixture ou relatório; o relatório sanitizado substitui o endereço por `<url>`.


## Open Questions

1. O áudio é original com legenda PT embutida em todos os títulos? A API não publica e o site está inacessível.
2. O `itag` 37 aparece em títulos mais recentes? A amostra só teve 18 e 22.
3. O host `serv01.meusdoramas.club` é estável ou muda com o front-end? A home do domínio está bloqueada.
4. O `videoUrl` pode vir como lista de objetos em outras respostas? A amostra só teve string; a implementação deve tratar string e, se vier lista, extrair `url`/`file`/`src` sem inventar.
