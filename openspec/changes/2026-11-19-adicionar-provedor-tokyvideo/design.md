# Design

## Context

Ver `proposal.md` para a motivação. Este documento registra as observações da fonte, as decisões e o que ainda depende da implementação.

A investigação do site foi feita em 2026-11-19 (webfetch + análise de páginas públicas do tokyvideo.com).

### Observações

1. **Estrutura de busca e fichas.** A busca é `GET https://www.tokyvideo.com/br/procurar?q=<título>` (perfil `page`); a resposta traz cartões com `<h3><a href="https://www.tokyvideo.com/br/video/<slug>">TÍTULO</a></h3>` e um `<a class="thumb-duracion">` que envolve o thumb com `<span class="duracion">24:49</span>` como texto. A validação real da busca `gta 6` devolveu 49 cartões cujos primeiros títulos são "GTA 6 TRAILER OFICIAL DA ROCKSTAR", "GTA TRAILER", "Coisas que NÃO PODEM FALTAR no GTA 6" e "Todos os trailers do GTA".
2. **Estrutura da ficha do vídeo.** A página `/br/video/<slug>` (perfil `page`) traz `<video id="tokyvideo_player">` e, dentro dela, `<source src="https://cdnst32.tokyvideo.com/videos/921/921321/mp4/<sha256>.mp4?secure=<sig>,<exp>" type="video/mp4">`. A JSON-LD (array de scripts `application/ld+json`) traz `VideoObject` com `name` ("GTA TRAILER"), `duration` ("P0DT0H24M49S"), `videoQuality` ("HD") e `inLanguage` ("pt"). A página traz ainda `<title>GTA TRAILER - Tokyvideo</title>`.
3. **O `secure` é obrigatório no CDN.**HEAD no `cdnst32.tokyvideo.com` URL sem `secure` → 403; com `secure` vazio → 403; com a URL completa → 200. O provedor não pode construir a URL: extrai o `<source src>` completo da página.
4. **Vídeos bloqueados geograficamente.** Páginas como `https://www.tokyvideo.com/video/game-on-2006-full-documentary` respondem 200 com a ficha ("Game On! (2006) | Full Documentary") sem `<video>`, sem fonte MP4 e com mensagem "We are sorry, but this video is not available in your country". Para esses, a ficha do melhor candidato não traz fonte publicada: ausência.
5. **Não há estrutura de temporada/episódio.** Nenhum atributo `data-season`/`data-episode`, campo JSON-LD de episódio ou regra em JSON-LD: vídeos de série são páginas individuais cujos títulos publicam o episódio ("Bienvenidos al Episodio [2] de nuestra serie del Modo Historia de Grand Theft Auto VI en español"). O site tem também `https://www.tokyvideo.com/br/séries/...` páginas de séries, mas o fluxo do provedor continua sendo busca por título.
6. **Perfil `/br`.** O usuário pediu o site `tokyvideo.com/br`; as páginas de busca e vídeo usam o prefixo `/br` (`/br/procurar`, `/br/video/...`). A variante principal sem prefixo também existe; não a usamos porque o recorte pedido é o idioma português do Brasil do portal.

## Goals / Non-Goals

**Goals:**

1. Resolver filmes e episódios avulsos no site Tokyvideo pela busca e fichas do portal, com confirmação de identidade pela comparação de título com `title-match`.
2. Entregar o stream MP4 direto que o site publica na página do vídeo.
3. Classificar qualidade e registrar duração quando a fonte fornecer.
4. Distinguir ausência, triagem e falha; manter cada opção de ficha isolada.
5. Manter o contrato do app por completo: `buildStream`, `format`, `type`, `provider`, `headers`, `language` do enum fechado.

**Non-Goals:**

1. Paginar a busca além dos cartões iniciais (máximo 3 fichas abertas por execução).
2. Soprar a mídia, validar reprodução, consultar temporada/episódio no server (sem estrutura observada).
3. Criar bloco novo, nem alterar blocos existentes.
4. Registrar legendas externas: a fonte não as publica nas fichas observadas.
5. Tentar contornar bloqueio geográfico: a ficha sem fonte é ausência.

## Decisions

### D1. Estrutura do provedor: `index.js` + `extractor.js`

1. `src/tokyvideo/index.js` valida entrada, chama `extractor.extractStreams`, ordena com `sortByQuality` e é o único ponto de captura (`console.error('[Tokyvideo] ...')`).
2. `src/tokyvideo/extractor.js` concentra busca, parsing, ranking, ficha e montagem dos streams. Pequeno, sem arquivos adicionais.

### D2. Busca no perfil `/br`

1. `GET https://www.tokyvideo.com/br/procurar?q=<título>` (perfil `page`); sem chave, sem cookie e sem cache.
2. Endereço montado com `new URLSearchParams({ q: media.title }).toString()`.

### D3. Extração dos cartões

1. Os candidatos são âncoras `<a href=".../br/video/<slug>">` das fichas (deduplicadas por URL, primeira ocorrência primeiro).
2. O título de cada cartão é o texto da âncora legível: tags removidas, entidades decodificadas, espaços colapsados. âncoras cujo texto é somente duração (`^\d{1,3}:\d{2}(:\d{2})?$` — o `<a class="thumb-duracion">` do cartão) são ignoradas.
3. O ano do cartão, quando presente (`(2025)`), é lido para o `year` do candidato.

### D4. Ranking

1. Score do cartão = máximo de `titleSimilarity(cartão.título, t)` sobre `t` em `[media.title, media.originalTitle, ...alternativeTitles]`, com regra de contenção: quando `normalizeText(t)` está contido em `normalizeText(cartão.título)`, comparando sem espaços, score passa para `0,55 + razão do comprimento` (cantas exatas caem em 1).
2. Mínimo de 0,6; ordenado por score; máximo de 3 candidatos abertos.
3. Alternativa descartada: buscar só pelo `media.title` (menos robusto para variantes de tradução e conterção do título original).

### D5. Ficha e identidade

1. A ficha é lida com `fetchText` (perfil `page`).
2. O título confirmado vem da JSON-LD `VideoObject.name`; fallback ao `<title>` da página.
3. Confirmação: `titleSimilarity(título ficha, media.title) >= 0,5` para algum título do TMDB, ou o `normalizeText` de algum título do TMDB contido no `normalizeText` do título da ficha. Ficha sem título publicado (sem `name` e sem `<title>` legível) aceita o stream: o cartão já confirmou o título na busca.
4. Candidato com ficha sem `<source>` é descartado por ausência (geo-block observado); candendato cuja ficha não confirma o título é descartado com aviso.
5. Duração: `PnDTnHnMnS` do `duration` do JSON-LD; fallback ao `data-video-duration` da página.

### D6. Stream

1. `buildStream({ url: <CDN>, format: { template: AUTO, addon: 'Tokyvideo', title, year?, season?, episode?, duration? }, type: 'mp4', provider: host do CDN, headers: playbackHeaders(URL da ficha), quality: videoQuality? })`.
2. `quality`: o `videoQuality` do JSON-LD passa por `normalizeQuality` do bloco quality-discovery: `HD` → `720p`; o atributo `videoQuality` ausente ou inválido é omitido e o stream sai `Desconhecida`.
3. `language`: omitido — o site não publica evidência de áudio (inLanguage é da UI); o app determina `Idioma Desconhecido`.
4. `provider`: host do CDN extraído da URL (`cdnst32.tokyvideo.com` etc.).
5. `headers`: `playbackHeaders(URL da ficha)` — Referer/Origin/User-Agent padrão do http bloco.

### D7. Ausência e falhas

1. Ausência reconhecida (busca sem resultados confirmados, ficha sem fonte, título fora da regra) devolve lista vazia sem `console.error`.
2. Falha de rede/HTTP da página da ficha, falha de `buildStream` ou falha agregada: aviso por opção descartada; se nenhum stream e alguma falha, erro agregado até `getStreams`, que registra `console.error('[Tokyvideo] ...')` e devolve `[]`.
3. A busca é fase anterior às opções: fora de 2xx a falha sobe direto.

### D8. Logs sanitizados

1. Todo log passa por `sanitizeMessage` (igual ao do RIVO): URL, hash hexadecimal longo e assinaturas `secure` são substituídas.
2. URL de mídia assinada nunca aparece em log, fixture ou documentação.

### D9. Testes e fixtures

1. Fixtures em `test/fixtures/tokyvideo/`: `search.html` (cartões com `thumb-duracion` e âncoras de título), `video-gta-trailer.html` (ficha com JSON-LD + `<source>`), `video-geo.html` (ficha sem fonte), `meta-movie.json` (resposta do TMDB).
2. Rotas do teste mockam `www.tokyvideo.com` (busca e fichas) e `cdn.tokyvideo.example.test`; URLs de mídia em fixtures usam host `*.example.test` e `secure` placeholder.
3. Casos: filme resolvido (url, quality, language, type, provider, headers, name), episódio avulso (season/episode no format), ausência (busca sem match e ficha sem fonte), triagem de entrada, falha fatal na busca, falha isolada de opção, sanitização de logs, manifest do provedor.
