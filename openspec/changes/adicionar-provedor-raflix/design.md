# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://raflix.web.id/`, `https://embed.vidrift.in/` e os endpoints públicos usados pela SPA. URLs assinadas, tokens de mídia, cookies e corpos completos de mídia não são registrados aqui.

1. O Raflix é uma SPA React. O HTML inicial não contém catálogo; a página `/title/movie/<tmdbId>` consulta `GET /api/media/<tipo>/<tmdbId>` para metadados e `GET /api/media/sources?type=<tipo>&tmdbId=<id>` para a lista de players. Série inclui `season` e `episode` na segunda consulta.
2. `GET /api/media/<tipo>/<tmdbId>` responde HTTP 404 com `{"error":"Title was not found"}` para ID inexistente. É o sinal de ausência mais confiável antes de consultar o player.
3. `GET /api/media/sources` responde HTTP 200 com `{"ok":true,...,"sources":[...]}` mesmo para um TMDB inexistente. A lista é gerada por template e contém, na ordem observada, `xpass`, `moviesapi`, `filesun`, `vidstorm`, `vidrift`, `apiplayer` e `embedmaster`. Ela não comprova que o título exista; serve para localizar a URL pública do player escolhido.
4. A entrada `vidrift` aponta para `https://embed.vidrift.in/embed/movie/<id>` ou `https://embed.vidrift.in/embed/tv/<id>/<temporada>/<episódio>`. O caminho após `/embed/` é o mesmo usado pelas APIs do player.
5. `GET https://embed.vidrift.in/api/boot/<caminho>` responde HTTP 200 com `meta`, `isOwnSite` e `ad`. `meta.orionStreams` é uma lista ou `null`; cada item tem `name`, `url`, `type`, `provider`, `rungs` e `subtitleListUrl`. `meta.playbackToken` é um JWT curto usado por `/api/source`. `meta.unreleased`, `meta.inCinemas` e `meta.airsSoon` anunciam indisponibilidade.
6. Os nomes de faixa observados são `Orion · Original`, `Orion · Brazilian Portuguese`, `Orion · French`, `Orion · Hindi`, `Orion · Spanish`, `Orion · Latin American Spanish`, `Orion · English`, `Orion · Arabic`, `Orion · Indonesian`, `Orion · Russian`, `Orion · Tamil`, `Orion · Telugu`, `Orion · Ukrainian`. A faixa PT-BR aparece como `Brazilian Portuguese`; a lista de legendas de cada faixa fica em `subtitleListUrl` e usa `lang: "pt"`.
7. Em `movie/11866` (Flight of the Phoenix), `movie/299534` (Vingadores: Ultimato), `tv/100088` (The Last of Us) e `tv/1399` (A Guerra dos Tronos), o boot anunciou `Orion · Brazilian Portuguese` em HLS. Em `tv/1396` (Breaking Bad), `tv/94997` (House of the Dragon), `tv/66732` (Stranger Things) e `tv/94605` (Arcane), o boot não anunciou essa faixa, mas a lista de legendas da faixa `Original` incluiu `pt`. Em `tv/76479` (The Boys), o boot veio com `orionStreams: null`.
8. O master HLS da Orion é HEVC (`hvc1`) e exige `Referer: https://embed.vidrift.in/`; sem o cabeçalho responde HTTP 403. A legenda VTT de `subtitleListUrl` também exige o mesmo `Referer`; sem ele responde HTTP 403.
9. `GET /api/source/<caminho>?token=<playbackToken>&provider=<provedor>&parent=raflix.web.id&hevc=0` responde JSON com `success`, `provider`, `maxRes`, `streams[]` e `subtitles[]`. Cada stream tem `url`, `proxyUrl`, `type`, `provider` e `direct`.
10. Em `tv/76479`, `vela` devolveu três HLS com `proxyUrl` relativo `/api/proxy/hls?...` e qualidades `1080p`, `720p` e `480p` no caminho; o proxy exigiu `Referer` e respondeu HTTP 403 sem ele. `titan` devolveu um HLS direto em `img1.hscow.com` com `maxRes: 720`, sem exigir `Referer`. `atlas` devolveu um proxy em `cdn.milkyway.cymru` sem exigir `Referer`. `lyra` e `orion` falharam nesse título.
11. `GET /api/subtitles/<caminho>/Portuguese` devolve VTT com texto em PT-BR nas amostras e não exige `Referer`. O endpoint `/pt` ora devolveu PT-PT, ora inglês, e o rótulo `Portuguese (BR)` da página nem sempre corresponde ao conteúdo; por isso a legenda de contingência usa `/Portuguese` e a legenda da Orion usa o `subtitleListUrl` da própria faixa.
12. A página `/embed/...` é server-rendered e contém `embedMeta` e `subtitleTracks`, mas passou a responder HTTP 403 depois de várias consultas na mesma sessão. O `/api/boot` continuou respondendo. O `embedMeta` da página chegou a listar MP4 dublados PT-BR em `mb.vidrift.net`, mas o MP4 respondeu HTTP 403 sem os cookies do player; não é uma opção jogável no contrato atual.
13. Os outros players do Raflix não foram adotados nesta versão: XPass usa JS ofuscado e token próprio; MoviesAPI é uma SPA com bundle grande; FileSun devolve outro iframe após `/api/resolve`; VidStorm não respondeu; APIPlayer anuncia Cloudflare Turnstile; EmbedMaster redireciona para `embdmstrplayer.com/v2/<token>`. Nenhum deles apresentou, nas amostras, uma cadeia pública tão direta quanto o VidRift.
14. O runtime do app fornece `fetch`, `URL`, `URLSearchParams`, `AbortController`, `atob`/`btoa` e os módulos externos `cheerio-without-node-native` e `crypto-js`. Não há `axios`, `crypto.subtle` garantido nem APIs do Node. O provedor não precisa de HTML parser, criptografia ou chave externa.

## Goals / Non-Goals

**Goals:**

1. Resolver filmes e séries pelo TMDB, sem busca textual e sem `getMediaInfo`.
2. Priorizar áudio dublado PT-BR quando o VidRift o anuncia; caso contrário, devolver a faixa original com legenda PT.
3. Oferecer uma contingência H.264 jogável quando a faixa PT-BR for HEVC ou a Orion não tiver a faixa.
4. Distinguir ausência reconhecida de falha de rede, HTTP, JSON ou estrutura.
5. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online pelo perfil generalista.

**Non-Goals:**

1. Resolver XPass, MoviesAPI, FileSun, VidStorm, APIPlayer ou EmbedMaster.
2. Usar a página `/embed/...` ou os MP4 de `mb.vidrift.net` que exigem cookies do player.
3. Baixar o master HLS, sondar variantes, baixar mídia ou descobrir qualidade por requisição extra.
4. Manter cache, renovar URLs expiradas ou repetir a resolução automaticamente.
5. Adicionar conta, cookie, token de serviço, proxy externo ou chave; a única chave externa do repositório continua sendo `TMDB_API_KEY`, não usada aqui.
6. Criar bloco compartilhado antes de existir um segundo consumidor real da mesma cadeia.
7. Oferecer idiomas que não sejam PT-BR; faixas francesas, hindi, espanholas e similares são descartadas por triagem.

## Decisions

### D1. Usar o catálogo Raflix e a fonte VidRift, não raspar a SPA

1. A lista de fontes do Raflix é pública e identifica o player por `id` e URL. O VidRift é a única fonte observada com áudio PT-BR explícito, legendas PT e API JSON sem Turnstile ou cookie.
2. Alternativas descartadas:
   1. Raspar o HTML da SPA: o conteúdo é montado por JavaScript e o HTML inicial não contém mídia.
   2. Resolver todos os players do Raflix: aumenta muito a superfície e mistura contratos diferentes; XPass, FileSun, APIPlayer e EmbedMaster exigem etapas próprias.
   3. Usar a página `/embed/...` do VidRift: ela responde 403 após uso repetido e seus MP4 não são jogáveis sem cookie. O `/api/boot` é a interface estável.
   4. Chamar `/api/source` como primeira opção: o boot entrega os nomes de faixa e a legenda por áudio; sem ele, não há como comprovar PT-BR.
3. A URL do player vem da lista do Raflix. Se a entrada `vidrift` desaparecer, o provedor considera ausência em vez de fixar um domínio.

### D2. Boot JSON como fonte primária

1. Consultar `<origem da URL da fonte>/api/boot/<caminho>` depois dos metadados e da lista de fontes; a origem vem da URL publicada pelo Raflix, não de um domínio fixo.
2. Usar `meta.orionStreams` para identificar a faixa `Brazilian Portuguese` e a faixa `Original`.
3. Usar `meta.playbackToken` apenas para a contingência de `/api/source`; não armazenar nem registrar o token.
4. Tratar `meta.unreleased`, `meta.inCinemas` e `meta.airsSoon` como ausência antes de tentar qualquer player.
5. O corpo do boot inclui `warmManifests` com playlists compactadas; o provedor ignora esse campo e não o registra em log ou fixture.

### D3. Seleção PT-BR

1. `Brazilian Portuguese` em `orionStreams` é a única evidência aceita para `Dublado`. O nome da faixa vem da fonte; não inferir dublagem pelo título ou pelo país.
2. Para `Legendado`, a legenda PT vem do `subtitleListUrl` da faixa `Original`; o primeiro `track` com `lang: "pt"` é usado. Se a lista não tiver `pt`, tentar `/api/subtitles/<caminho>/Portuguese`.
3. A legenda da Orion exige `headers: { Referer: "https://embed.vidrift.in/", "User-Agent": <padrão> }`; a legenda genérica não exige cabeçalho.
4. Se não houver áudio PT-BR nem legenda PT, devolver `[]`. O título pode existir no Raflix, mas não atende ao `contentLanguage` PT-BR do provedor; isso é ausência reconhecida, não falha.
5. Faixas `Original`, `French`, `Hindi`, `Spanish`, `English`, `Arabic`, `Indonesian`, `Russian`, `Tamil`, `Telugu` e `Ukrainian` não são devolvidas como `Dublado`.

### D4. Contingência H.264 via /api/source

1. Sempre que houver legenda PT disponível, tentar `vela`, `titan` e `atlas`, nessa ordem, até um provedor devolver ao menos um stream. O primeiro que responder com streams encerra a tentativa; os demais não são consultados. A opção H.264 coexiste com a faixa `Dublado` quando ela existir.
2. Usar `url` quando não vazio; caso contrário, resolver `proxyUrl` contra a origem da URL da fonte. A resposta de `vela` usa `proxyUrl` relativo no mesmo host; a de `titan` usa `url` absoluto; a de `atlas` usa `proxyUrl` absoluto.
3. Qualidade: extrair `(\d{3,4})p` do caminho decodificado da URL (`index-s1080p`, `/720/`); se não houver e o provedor devolver exatamente um stream com `maxRes` inteiro entre 360 e 2160, usar `maxRes`; caso contrário, omitir e deixar `Desconhecida`.
4. Cabeçalhos: usar `playbackHeaders("https://embed.vidrift.in/")` quando `direct` for falso ou a URL for o proxy do VidRift; não enviar cabeçalhos em `url` direto de outro host. A legenda genérica não recebe cabeçalhos.
5. Classificar os streams de contingência como `Legendado` somente se a legenda PT existir. Sem legenda, não devolver a opção; a contingência não comprova áudio PT-BR.
6. A falha de um provedor de contingência é isolada: `console.warn("[Raflix] Opção <provedor> descartada: <causa>")`. Se todos falharem e houver faixa `Dublado`, ela é preservada; sem faixa `Dublado`, o erro agregado sobe. Se todos responderem sucesso sem streams, a saída é a faixa `Dublado` quando existir ou `[]` quando não houver.

### D5. Montagem e ordenação dos streams

1. Montar cada stream com `buildStream` e `format: { template: FORMATTER.AUTO, addon: "Raflix", title, year, season?, episode? }`. Título e ano vêm de `/api/media`; temporada e episódio vêm da entrada.
2. `provider` recebe o player da faixa (`Orion`, `Vela`, `Titan` ou `Atlas`); `type` é `hls`.
3. `quality` é explícita quando a fonte informa a resolução; sem ela, `buildStream` descobre localmente ou usa `Desconhecida`.
4. `language` usa `LANGUAGE.DUBBED` ou `LANGUAGE.SUBTITLED`; não usar os valores com sufixo `(Não PT-BR?)` porque a fonte comprova a faixa PT-BR/legenda PT, não um dialeto duvidoso.
5. Deduplicar por URL final. A faixa PT-BR e a contingência podem coexistir; a ordenação final é `sortByQuality`, como no template.
6. Não preencher `size`, `infoHash`, `seeders` ou `peers`: a fonte não os fornece. `subtitles` só entra quando há URL PT real.

### D6. Fronteira de erro

1. Metadados 404 é ausência. Metadados 5xx, rede ou JSON inválido é falha fatal.
2. Lista de fontes 2xx sem `vidrift` é ausência. HTTP fora de 2xx, JSON inválido ou estrutura sem `sources` é falha fatal.
3. Boot 2xx com `orionStreams` nulo/vazio não é ausência imediata: aciona `/api/source`. Boot fora de 2xx, sem `meta` ou com JSON inválido é falha fatal.
4. `/api/source` com `success: true` e `streams: []` é ausência; HTTP 5xx ou rede é falha daquela opção. O erro agregado só sobe se nenhuma opção produzir stream e ao menos uma tiver falhado.
5. `getStreams` é o único ponto de captura: registra `console.error("[Raflix] ...")` e devolve `[]`. Nenhum timeout próprio, cache ou repetição automática.

### D7. Manifest, documentação e testes

1. Manifest: `id` `raflix`, nome `Raflix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8`, `contentLanguage` `pt` e logo `https://raflix.web.id/icon-192.png`.
2. `providers.md`: linha e seção `## Raflix` com status `🟠 Não verificado`, `—` na última verificação e sem bloco online até a rodada.
3. `docs/provider-investigation.md`: nova seção sobre catálogo de players + boot JSON + contingência H.264, com as referências de código/teste e os limites de HEVC, `Referer`, 403 e expiração.
4. Nenhum bloco novo e nenhuma alteração em `src/_blocks/index.md`.
5. `test/fixtures/raflix/` guarda respostas reais sanitizadas: metadados de filme e série, lista de fontes, boot com faixa PT-BR, boot com faixa Original + legenda PT, boot com `orionStreams` nulo, `/api/source` com três qualidades, `/api/source` com um único stream, `/api/source` vazio, 404 de metadados, `unreleased` e erro HTTP. URLs de mídia assinadas, tokens e cookies não entram em texto claro; usar placeholders.
6. Testes determinísticos no mock cobrem a montagem dos streams e as mensagens de erro; a fixture real cobre estrutura e tipos. O teste do provedor usa o pacote gerado e `fetch` simulado.

## Risks / Trade-offs

1. **Faixa PT-BR em HEVC** → o aparelho pode não decodificar. Mitigação: a contingência H.264 é tentada sempre que houver legenda PT e coexiste como `Legendado` ao lado do `Dublado`; o risco residual fica registrado.
2. **Boot sem faixas e `/api/source` com provedores voláteis** → a resolução pode falhar em títulos específicos. Mitigação: tentar três provedores e tratar a falha de cada um isoladamente; a rodada online mede a cobertura.
3. **URLs de HLS expiram** → resolver a cada chamada, sem cache. Uma URL expirada no meio da reprodução é limitação da fonte.
4. **`Referer` obrigatório** → o master e a legenda da Orion, e o proxy do Vela, respondem 403 sem ele. Mitigação: cabeçalhos explícitos somente nos hosts que os exigem; não aplicar cegamente a URLs diretas de outros hosts.
5. **Endpoint de legenda genérica inconsistente** → `/pt` ora devolveu PT-PT, ora inglês; `/Portuguese` devolveu PT-BR nas amostras. Mitigação: preferir o `subtitleListUrl` da faixa Original e usar `/Portuguese` apenas como contingência; a fixture registra a amostra real.
6. **Taxa de requisições / 403 da página** → a página `/embed/...` respondeu 403 após várias consultas; o `/api/boot` continuou funcionando. Mitigação: não usar a página; o boot e o `/api/source` são as interfaces adotadas.
7. **Sem PT-BR em parte do acervo** → títulos que só têm áudio estrangeiro e nenhuma legenda PT são ausência reconhecida. A descrição do provedor não promete cobertura integral.
8. **Lista de players gerada por template** → a lista de fontes do Raflix não valida o título. Mitigação: o 404 de metadados é o sinal de ausência; a lista só localiza a URL do VidRift.
9. **Boot grande (`warmManifests`)** → aumenta o corpo sem utilidade. Mitigação: ignorar o campo; não guardá-lo em fixture nem em log.
10. **Sem bloqueio de tempo próprio** → o app gerencia a espera. A cadeia pode demorar em títulos sem Orion; a rodada online registra o comportamento.

## Migration Plan

1. Criar `src/raflix/` com `index.js`, `api.js`, `boot.js` e `streams.js`, seguindo o contrato de `src/_template/` e os padrões de `src/megaembed/`.
2. Adicionar a entrada `raflix` ao `manifest.json`, a linha e a seção em `providers.md` e as fixtures/testes.
3. Implementar a consulta de metadados, a lista de fontes, o boot, a seleção PT-BR, a contingência `/api/source`, a montagem dos streams e a fronteira de erro.
4. Rodar `npm run lint`, `npm test` e `node build.js raflix`.
5. Executar `npm run test:online -- --provider raflix` com o pacote construído e registrar a rodada em `providers.md`; sem ela, o status permanece `🟠 Não verificado`.
6. Arquivar a mudança somente com os testes previstos passando ou com as exclusões declaradas.
7. Rollback: remover a entrada do manifest, `src/raflix/`, o teste, as fixtures e a seção de `providers.md`; nenhum dado persistente é migrado.
