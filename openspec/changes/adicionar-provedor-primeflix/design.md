# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra as páginas e o player públicos do Primeflix; nenhuma URL assinada, cookie, token ou arquivo de mídia real é registrado aqui.

1. O site usa um CMS próprio, não WordPress. Filmes e séries compartilham o caminho `/movie/<slug>`; não há `wp-json` nem ID do TMDB/IMDb na ficha.
2. A busca de sugestões `GET /live-search?q=<termo>` devolve JSON com `title`, `description` e `link`, sem ano nem tipo. A página `GET /search?q=<termo>` devolve HTML com os mesmos links em cartões `.grid-item.l2`. O parâmetro `page=2` não alterou a lista na amostra; não foi observada paginação.
3. A ficha traz `<title><título> - Primeflix</title>`, `<span>Year:</span> <ano>` e o player Playerjs. Filme: `const v_id = <n>` e `file:"/vvv?id=<n>&mobile=1&get=video"`. Série: `file` é uma lista de temporadas com `playlist` de episódios, cada um com `season=<s>&episode=<e>`; o trecho usa vírgulas finais e não é JSON estrito.
4. O player `GET /vvv?id=<n>[&season=<s>&episode=<e>]&mobile=1&get=video` responde 307. Sem `Referer`, o `Location` veio malformado (`:///a1/...`); com `Referer` do próprio site, veio absoluto para `/a1/inbox/<arquivo>.mkv` (filme) ou `/a1/out/.../<id>_s01e01_dub_<...>.m3u8` (série). O segundo salto é para um CDN com `md5`, `expires` e `ref` na query.
5. A playlist da série é uma playlist de mídia (`#EXTM3U`, `#EXT-X-TARGETDURATION`, segmentos `.ts` assinados), sem variantes, faixas de áudio ou legendas declaradas. O `.m3u8` respondeu 200 com e sem `Referer`; os segmentos responderam 206 com e sem `Referer` na amostra.
6. O filme termina em arquivo direto `.mkv`. O `HEAD` em `/vvv` e em `/a1/inbox/...` respondeu 405; `Range` é aceito pelo CDN (os segmentos responderam 206). O token do arquivo de filme devolveu 403 com `X-Reason: secure_link` na amostra; outros IDs de filme devolveram 404. O filme não foi confirmado.
7. O endpoint `/vvv` declara `Content-Type: application/x-mpegurl` mesmo quando redireciona para MKV; o tipo real deve ser lido da URL final ou da ficha, não desse cabeçalho.
8. `hls:1` aparece no Playerjs de filme e de série; não comprova HLS.
9. O idioma não tem seletor na página. A única evidência observada é o caminho da mídia (`dub` no episódio; `eng` no nome de um filme, que o bloco `language-discovery` não reconhece sozinho). Qualidade aparece no nome do arquivo (`1080p`, `camrip`), não em campo estruturado. Tamanho, legendas externas, seeders e peers não foram observados.
10. O login por Telegram existe para favoritos; a busca e o player são públicos, sem conta, cookie ou chave. O runtime do app tem `fetch`, `URL`, `URLSearchParams`, `atob`/`btoa`, cheerio básico e `crypto-js`; o provedor não usa `WebAssembly`, `setTimeout`, `TextDecoder` nem APIs do Node.

## Goals / Non-Goals

**Goals:**

1. Entregar busca e confirmação de identidade por título e ano, com tipo derivado do player e sem confundir filme com série.
2. Resolver filme e episódio pelo fluxo público do `/vvv`, sem baixar a mídia inteira e sem persistir a URL assinada.
3. Classificar idioma e qualidade somente pela evidência já obtida, preservando `Desconhecida`/`Idioma Desconhecido` quando não houver prova.
4. Separar ausência de falha e cobrir o fluxo com testes offline e uma rodada online do pacote final.
5. Manter o escopo em `movie`/`tv` somente se o gate e a rodada online confirmarem cada tipo; caso contrário, ajustar o manifest ou não implementar.

**Non-Goals:**

1. Reproduzir o player Playerjs, executar JavaScript da página ou seguir scripts de terceiros.
2. Baixar o MKV para inspecionar faixas de áudio/legenda ou sondar reprodução.
3. Usar conta, cookie, Telegram, proxy, bypass ou qualquer chave além da `TMDB_API_KEY` entregue pelo app.
4. Oferecer torrents, tamanho, seeders, peers ou legendas que a fonte não publica.
5. Adicionar um bloco compartilhado: o fluxo é específico desta fonte e não há segundo consumidor real.

## Decisions

### D1. Busca e confirmação de identidade

1. Consultar `/live-search?q=<termo>` com o título PT-BR, o original e os alternativos, nessa ordem, e parar no primeiro termo com candidato confirmado. Se o JSON não devolver candidato confirmável, repetir na página HTML `/search?q=<termo>`.
2. A busca não traz ano nem tipo; cada candidato será aberto na ficha e só entra na escolha com título, ano (tolerância de um ano) e tipo confirmados. `findBestMatch` recebe os candidatos já filtrados pelo tipo do pedido. Ficha sem `Year:` é layout incompleto e lança erro, porque o ano é obrigatório para a confirmação.
3. Limitar a cinco fichas por termo, na ordem da busca, para não transformar uma busca comum em dezenas de requisições. Alternativa descartada: abrir todos os resultados; a latência cresce sem ganho proporcional.
4. Alternativa descartada: montar a URL pelo slug do título. O site usa slugs divergentes para alguns títulos (por exemplo, sufixos comerciais), e um 404 de slug não prova ausência.
5. Alternativa descartada: confiar no `mediaType` do app sem verificar a ficha. O mesmo título pode existir como filme e série, e o caminho `/movie/` é usado pelos dois.

### D2. Tipo pela configuração do player

1. Série: a ficha contém pares `season=<s>&episode=<e>` no `file` do Playerjs ou marcador de série (`playlist`/`Temporada`) quando não há episódio listado. Filme: contém um `v_id` e um `file` único, sem pares nem marcador de série.
2. O tipo confirmado na ficha SHALL ser igual ao `mediaType` do pedido; candidato do outro tipo é descartado.
3. O ano SHALL ser lido do rótulo `Year:` da ficha; um intervalo como `2023–` usa o primeiro ano de quatro dígitos. Ficha sem ano é layout incompleto e lança erro.
4. O par pedido de temporada/episódio precisa existir na lista da ficha. Par ausente é ausência, sem consultar o player.
5. Alternativa descartada: raspar o `comment` (`Temporada N`, `Serie N`) e converter posição em número. O par explícito na URL é a coordenada estável e não depende do texto da interface.

### D3. Resolução da mídia pelo `/vvv`

1. Montar `https://primeflix.sh/vvv?id=<v_id>&mobile=1&get=video` para filme e acrescentar `season`/`episode` para série. Enviar `Referer` da ficha, porque sem ele o `Location` volta relativo/malformado.
2. `fetchPage` segue os redirecionamentos e devolve `response.url`, que é a URL final do CDN. A URL é efêmera e não pode ser registrada em log, fixture, relatório ou documentação.
3. Filme: enviar `Range: bytes=0-0` na resolução para obter a URL final sem baixar o MKV. O `HEAD` não serve (405). O `Range` não vai para o `headers` do stream, porque o app o ignora.
4. Série: buscar a playlist completa (pequena) sem `Range`; a URL final é o `.m3u8`, e o app busca os segmentos assinados ao reproduzir.
5. Validar a URL final como HTTP(S) e mídia reconhecida (`.mkv`, `.mp4`, `.m3u8`); `Content-Type` do `/vvv` não é confiável.
6. Alternativa descartada: `redirect: 'manual'` para ler o `Location` sem corpo. O runtime do app não confirma esse modo; `response.url` após redirecionamentos é o recurso documentado.
7. Alternativa descartada: usar o `file` da ficha como URL de mídia. Ele aponta para o `/vvv`, não para o arquivo.
8. Alternativa descartada: sondar o MKV com `ftyp` ou baixar o arquivo. O custo e a privacidade não se justificam para descobrir uma URL.

### D4. Idioma e qualidade pela evidência local

1. Idioma: analisar o caminho/nome do arquivo final com o bloco `language-discovery`. `dub`/`dublado` comprova `Dublado`; `leg`/`legendado` comprova `Legendado`; idioma estrangeiro conhecido sem português vira `Gringo`; sem prova, `Idioma Desconhecido`.
2. A descrição do site (“Dublado e Legendado”), o título e o país de origem não são prova de áudio. O `eng` no nome de um arquivo não é reconhecido pelo bloco e não promove o stream a `Gringo` sozinho.
3. Qualidade: `discoverQuality` nos textos já obtidos, com o nome do arquivo e a URL final. `CAMRIP`/`CAM` prevalece sobre `1080p`; sem pista, `Desconhecida`.
4. Alternativa descartada: inferir dublado porque a ficha está em português. O catálogo pode publicar o arquivo original legendado.
5. Alternativa descartada: baixar o MKV e ler as faixas de áudio para classificar. O arquivo pode ter gigabytes e o runtime não tem parser de Matroska.

### D5. Contrato do stream e cabeçalhos

1. Todo stream passa por `buildStream`, com `format` (`FORMATTER.AUTO`, `addon` `Primeflix`, título, ano, temporada/episódio quando houver e nome do arquivo final).
2. `provider` `Primeflix`; `type` `hls` para `.m3u8` e `mkv`/`mp4` para arquivo direto. Sem `size`, `subtitles`, `seeders` ou `peers` enquanto a fonte não os fornecer.
3. Cabeçalhos de reprodução: a série testada tocou sem `Referer`; o filme não foi confirmado. O gate decide se `Referer` é necessário. Se for, enviar somente `Referer` da ficha (e o User-Agent padrão se o CDN exigir), sem `Origin`/`Range` por hábito.
4. Alternativa descartada: reutilizar `playbackHeaders` cegamente. Ele acrescenta `Origin` e um `Referer` de player que a fonte pode não esperar; a decisão fica condicionada à evidência.
5. Alternativa descartada: devolver a URL do `/vvv` como stream. O app não reproduz um endpoint que responde 307 com `Content-Type` de playlist.

### D6. Ausência, falha e gate

1. Ausência: busca sem candidato, tipo/ano incompatível, par de temporada/episódio não listado e ficha 404 de um resultado. Saída `[]`, sem erro.
2. Falha: ficha 200 sem `v_id`, resposta de busca que não é JSON/HTML reconhecível, `/vvv` 403/5xx, `/vvv` 404 para mídia anunciada e URL final não reconhecida. O erro sobe; `getStreams` registra `[Primeflix] ...` e devolve `[]`.
3. Não há opções independentes: cada pedido tem um único player. A falha dele é fatal para o pedido, sem `console.warn` por opção.
4. Gate de viabilidade antes do código: confirmar uma série e um filme com o fluxo público, incluindo a reprodução do primeiro segmento/arquivo. Na amostra, a série confirmou HLS; o filme devolveu 403 `secure_link`. Se o gate confirmar somente série, o manifest usa `supportedTypes` `["tv"]` e `formats` `["m3u8"]`; se nenhum confirmar, a change não é implementada.
5. A rodada online do pacote final é a evidência de publicação; o gate não substitui a verificação online.

### D7. Testes, documentação e manifest

1. Testes offline em `test/primeflix.test.js`, com `globalThis.fetch` substituído por respostas controladas e fixtures em `test/fixtures/primeflix/`, sem rede.
2. Casos: busca JSON, fallback HTML quando o JSON não confirma, busca vazia, filme direto, série HLS, temporada/ano/tipo incompatível, episódio ausente, player 404/403, layout sem `v_id` ou sem ano, URL final inválida, idioma `dub`/`leg`/desconhecido e qualidade `1080p`/`camrip`/desconhecida.
3. Fixtures sanitizadas: `<id>`, `<arquivo>.mkv`, `media.exemplo.test`, `?assinatura=...`; nenhum `md5`, `expires`, token ou URL real de mídia.
4. Manifest: `id` `primeflix`, nome `Primeflix`, versão `1.0.0`, autor `nathanael540`, `contentLanguage` `pt`, `supportedTypes` conforme o gate e `formats` conforme o gate (`["m3u8", "mkv"]` para filme e série; `["m3u8"]` para série). Logo HTTPS de favicon.
5. `providers.md`: linha e seção com `🟠 Não verificado`; a rodada online promove o status conforme `docs/tests.md`.
6. `docs/provider-investigation.md`: novo método “CMS próprio com busca JSON e player `/vvv`”, com busca, ficha, redirecionamento, `Range` no filme, HLS no episódio, limites de busca e de filme.
7. Nenhum bloco novo; `tmdb-info`, `http`, `title-match`, `script-extract` (se necessário), `slugify`, `quality-discovery`, `language-discovery`, `stream-build` e `custom-formatter` bastam.

## Risks / Trade-offs

1. **Token `secure_link` do filme** → o gate e a rodada online impedem prometer filme sem evidência; se persistir, o provedor sai só com `tv`.
2. **Endpoint `/vvv` não documentado** → testes de layout e a rodada online detectam a mudança; o erro é explícito, não ausência.
3. **Busca limitada e sem paginação** → títulos fora do recorte não são encontrados; a limitação fica documentada e não se inventa uma rota de busca.
4. **URL assinada expira** → o provedor devolve a URL publicada no momento da consulta; o app reproduz em seguida, como nos demais provedores.
5. **`Range` ignorado no MKV** → risco de baixar o arquivo inteiro na resolução; o gate confirma o comportamento e, se necessário, o fluxo é revisto antes de publicar.
6. **Idioma do filme** → o nome pode não provar áudio PT-BR; o stream fica `Idioma Desconhecido` em vez de prometer dublado.
7. **Domínio ou CDN muda** → a base é uma constante e o erro sobe; não há espelhos observados para tentar.
8. **Conteúdo removido** → ficha/player 404 viram ausência ou falha conforme a etapa; não se reutiliza outro título parecido.

## Migration Plan

1. Executar o gate: busca, ficha de filme e de série, `/vvv` com e sem `Referer`, URL final, `Range` no filme e playlist/segmento da série. Registrar no design o resultado de cada tipo e parar se nenhum confirmar.
2. Criar `src/primeflix/` com `index.js` (contrato, captura única, `sortByQuality`), `catalog.js` (busca/identidade/tipo) e `player.js` (resolução e streams).
3. Adicionar a entrada no `manifest.json`, os testes e as fixtures; rodar `node build.js primeflix`.
4. Atualizar `providers.md` com `🟠 Não verificado` e `docs/provider-investigation.md` com o método.
5. Rodar `npm run lint`, `npm test` e `npm run test:online -- --provider primeflix`; ajustar o status e o escopo (`movie`/`tv`) conforme a evidência.
6. Rollback: remover a entrada do manifest, `src/primeflix/`, os testes, as fixtures, os arquivos gerados e a seção de `providers.md`; nenhum bloco é alterado.

## Open Questions

1. O 403 `secure_link` do filme vem de IP/região, de relógio/token ou de arquivo removido? O gate responde com uma rede residencial/brasileira.
2. O CDN do filme honra `Range` sem baixar o arquivo? O gate confirma com `Range: bytes=0-0`.
3. O filme exige `Referer` igual ao `ref` assinado ou reproduz sem cabeçalhos, como a série?
4. Existem títulos legendados com `leg` no caminho, ou o catálogo é só dublado em série e original/legendado em filme? A fixture cobre o token; a rodada online confirma o acervo.
5. A busca tem outra página ou um limite fixo? A amostra não mostrou paginação; o limite observado fica registrado no guia.
