# Design

## Context

Ver `proposal.md` para a motivação. O CineAgora roda DataLife Engine (DLE), não WordPress: a busca é `index.php?do=search&subaction=search&story=<consulta>` e as páginas usam `/filmes-hd-online/`, `/series-online-hd-gratis/` e categorias vizinhas. O site declara filmes e séries em PT-BR, com botões de áudio por player. O player real é o BrStream, em `watch.brstream.cc`, que publica um objeto `video` e entrega HLS.

A cadeia observada em 12/11/2026, com o filme TMDB `693134` (Duna: Parte Dois):

1. `GET https://cineagora.club/index.php?do=search&subaction=search&story=tt15239678` devolve um único resultado, `https://cineagora.club/filmes-hd-online/1163-duna-parte-2.html`.
2. A página traz `h1.title` "Duna - Parte 2", ano `2024` em `span.date a` e IMDb `https://www.imdb.com/title/tt15239678` em `div.imdb a`.
3. `.mirrors .button` traz `Dublado` com `data-link="https://watch.brstream.cc/watch?v=HVP8M2GO"` e o trailer do YouTube, que é descartado.
4. `GET https://watch.brstream.cc/watch?v=HVP8M2GO` publica `var video = {...}` com `id: "29035"`, `uid: "26"`, `md5: "3156231783935e97c9ac263991fe57cc"`, `type: "hls"`, `status: "1"`, `quality: "[\"720p\",\"480p\",\"240p\"]"` e o título da release.
5. `GET https://watch.brstream.cc/m3u8/26/3156231783935e97c9ac263991fe57cc/master.txt?s=1&id=29035&cache=1` devolve a playlist master com variantes 720p, 480p e 240p.
6. Os segmentos em `s1.brsosiskablack.site` respondem `video/mp2t` sem `Referer` e sem `Origin`.

Para séries, com "The Pitt" (IMDb `tt31938062`):

1. `GET https://cineagora.club/index.php?do=search&subaction=search&story=tt31938062` devolve `/series-online-hd-gratis/2797-the-pitt.html`.
2. A página traz o botão `Dublado` com `data-link="https://watch.brstream.cc/tv/the-pitt"`.
3. A página `/tv/the-pitt` publica `var seriesSlug = "the-pitt"` e usa `fetch_series_data.php` para listar temporadas e episódios.
4. `GET https://watch.brstream.cc/fetch_series_data.php?seriesSlug=the-pitt` devolve `seasons` com as temporadas 1 e 2; S01E01 tem `video_slug: "F7VHALE3"` e S02E01 tem `video_slug: "9GE4FUJW"`.
5. `GET https://watch.brstream.cc/watch/F7VHALE3` publica o mesmo objeto `video`, e a playlist master sai de `uid`, `md5`, `id` e `status`.

A mesma busca por título mostra por que o IMDb é preferível: `story=Duna` devolve 12 resultados, incluindo as versões de 1984 e 2021 e notícias; `story=The Pitt` devolve 25 resultados. O IMDb reduz a busca a um resultado e a confirmação na página elimina falsos positivos.

O site está atrás do Cloudflare, mas as requisições públicas usadas na investigação responderam sem desafio. O runtime do app é QuickJS, sem APIs do Node e sem `crypto.subtle` garantido, com `cheerio-without-node-native` e os blocos do repositório. O contrato do provedor está em `docs/arch.md`.

## Goals / Non-Goals

**Goals:**

1. Encontrar o post correto de filme ou série com busca por IMDb e confirmação de título, ano e tipo.
2. Descobrir cada espelho de áudio publicado na página e resolver o player BrStream até a playlist master HLS.
3. Selecionar o episódio pelo par temporada/número, sem usar posição visual ou ordem de lista.
4. Montar streams com qualidade, idioma e nome de release comprovados, usando `buildStream` e o formatador.
5. Isolar a falha de cada espelho e distinguir ausência reconhecida de erro de rede, parsing ou estrutura.

**Non-Goals:**

1. Downloads, torrent e qualquer fluxo P2P.
2. Players de anúncio, trailer do YouTube e hosts que não sejam `watch.brstream.cc`.
3. Legendas externas enquanto não houver URL de legenda confirmada.
4. Adivinhar qualidade ou áudio a partir do título da página quando a fonte não declarar o dado.
5. Generalizar o player BrStream como bloco compartilhado antes de existir um segundo consumidor real.
6. Contornar Cloudflare, captcha ou bloqueio regional.

## Decisions

### 1. Busca DLE pelo IMDb, com fallback por título

A busca usa `GET /index.php?do=search&subaction=search&story=<consulta>` e lê `a.item` com `href` e `data-title`. A ordem é: IMDb do TMDB, título PT-BR e título original quando diferente. Cada consulta usa somente a primeira página.

- O IMDb é o identificador exato que o app já recebe do TMDB e resolve o caso em uma consulta. A busca por título fica como contingência para títulos sem IMDb no TMDB ou posts em que o IMDb não esteja indexado.
- Não se usa paginação porque o fluxo coberto encontra o candidato na primeira página; a busca por título é limitada aos primeiros resultados e a confirmação na página impede escolher um homônimo.
- Não se usa `findBestMatch` sozinho: ele devolve o melhor candidato sem expor a ambiguidade de dois resultados válidos. O provedor ordena os candidatos por `titleSimilarity` e abre no máximo três candidatos.
- Busca vazia não é erro. HTTP fora de 2xx, HTML sem os elementos de resultado esperados ou falha de rede são erro e sobem para `getStreams`.

### 2. Identidade pela seção, pelo IMDb e pelo ano

Cada candidato é aceito somente quando:

1. O caminho pertence à seção do tipo pedido: `/filmes-hd-online/` para `movie` e `/series-online-hd-gratis/` para `tv`.
2. O título de `h1.title` corresponde ao título PT-BR, original ou alternativo, com `titleSimilarity` de pelo menos 0,85.
3. O ano de `span.date a` é igual ao ano do TMDB, quando conhecido.
4. O IMDb de `div.imdb a` é igual ao `imdbId` do TMDB, quando conhecido.

Exatamente um candidato confirmado é aceito. Nenhum é ausência. Mais de um é ausência por ambiguidade, sem escolher o primeiro. Se o TMDB não tiver ano ou IMDb, o campo correspondente é ignorado na comparação.

Alternativa considerada: ler o JSON-LD `Movie`/`TVSeries` e `sameAs`. O JSON-LD existe e traz os mesmos dados, mas extrair o conteúdo de `<script>` não é confiável no cheerio reduzido do NuvioTV; a caixa de informações tem os dados em elementos estáveis e legíveis pela API básica.

### 3. Espelhos como opções independentes

A página de filme e a de série publicam `<span class="button" role="button" data-link="...">Dublado</span>` e, quando há as duas versões, outro com `Legendado`. O provedor lê `.mirrors .button`, mantém apenas links de `watch.brstream.cc` e usa o texto do botão como rótulo da opção.

- O trailer do YouTube e qualquer host desconhecido são triagem, não falha.
- Cada botão BrStream é uma opção independente: a falha de um não descarta o outro.
- Sem botão BrStream, a página é ausência reconhecida (o título existe, mas não tem mídia).
- O selo do topo da página (`Dublado`, `Legendado` ou `Dublado Legendado`) descreve o post inteiro e não é usado para classificar uma opção; o rótulo do botão é o dado por opção.
- Se o rótulo for desconhecido, o nome da release entra como dica e a classificação final continua por conta do `language-discovery`.

### 4. Filme no BrStream

O link `https://watch.brstream.cc/watch?v=<slug>` é aberto e o objeto `video` é lido com `extractScriptJson(html, 'video')`. A opção só é aceita com `type: "hls"`, `status: "1"`, `uid` numérico, `id` numérico e `md5` hexadecimal de 32 caracteres.

A URL devolvida é a playlist master:

`https://watch.brstream.cc/m3u8/<uid>/<md5>/master.txt?s=1&id=<id>&cache=<status>`

- A playlist master é devolvida inteira, não uma variante. Em "Deadpool" (TMDB `293660`), a master publica faixas de áudio separadas (`LANGUAGE="por"` e `LANGUAGE="eng"`); devolver uma variante perderia a seleção de áudio.
- Não há requisição à playlist só para descobrir qualidade: `video.quality` já declara as resoluções disponíveis. A lista é um JSON em texto, como `"[\"720p\",\"480p\",\"240p\"]"`, e a maior entrada vira `quality`. Se a lista estiver ausente ou inválida, o campo é omitido e a descoberta local do `buildStream` decide.
- `video.status` diferente de `"1"` é falha da opção, não ausência: o player existe, mas não declara a mídia ativa.
- Página sem `video` ou com mensagem "Video is not found" é falha da opção.
- `video.subtitles` existe em alguns filmes, mas as URLs `localsubs/...` observadas não devolvem VTT em nenhum caminho público testado. Nenhuma legenda é inventada ou montada a partir de um caminho não confirmado.

### 5. Série no BrStream

O link `https://watch.brstream.cc/tv/<slug>` é aberto e `seriesSlug` é lido com `extractScriptString(html, 'seriesSlug')`. O provedor consulta `https://watch.brstream.cc/fetch_series_data.php?seriesSlug=<slug>` com perfil de API e lê `seasons`.

- A temporada é a chave textual `String(season)`; o episódio é a entrada cujo `episode_number` é exatamente `String(episode)`. Não se usa posição, ordem visual nem o último episódio.
- Temporada ausente ou episódio ausente é ausência da opção, não erro.
- `seasons` ausente ou fora do formato esperado é falha da opção.
- O `video_slug` do episódio é validado como alfanumérico e aberto em `https://watch.brstream.cc/watch/<video_slug>`, seguindo o mesmo contrato de `video` e playlist master do filme.
- `episode_title` vem com codificação dupla (`%2520`). O provedor decodifica até duas vezes para montar `filename`; se a decodificação falhar, o campo é omitido.

### 6. Streams e metadados

Cada stream é montado com `buildStream` e `format`:

- `url`: playlist master.
- `type`: `hls`.
- `provider`: `BrStream`.
- `quality`: maior entrada de `video.quality`, normalizada por `normalizeQuality`; sem qualidade declarada, o campo é omitido e a descoberta local decide.
- `language`: `languageFromTexts([rótulo, releaseTitle])`, nessa ordem. `Dublado` e `Legendado` são explícitos; `DUAL` sem rótulo vira `Dublado (Não PT-BR?)`. Se o resultado for inconclusivo, o campo é omitido e o `buildStream` aplica a descoberta com `languageHints`.
- `format`: `template: FORMATTER.AUTO`, `addon: 'CineAgora'`, `title`, `year`, `season`, `episode` e `filename` da release.
- Sem `headers`: a playlist master e os segmentos observados respondem sem `Referer`, `Origin` ou `User-Agent` especial. Enviar cabeçalhos de outro host seria ruído e poderia quebrar o CDN.
- Sem `size`, `seeders`, `peers` ou legendas: a fonte não fornece esses dados de forma utilizável.
- Ordenação final por `sortByQuality`.

### 7. Fronteira de erro

- Funções internas lançam erro com mensagem clara; não devolvem `null` para falha de rede ou parsing.
- Cada espelho é uma opção isolada; a falha é registrada com `console.warn('[CineAgora] Opção <rótulo> descartada: <causa>')` e as demais continuam.
- Se nenhuma opção produzir stream e alguma tiver falhado, o erro agregado sobe.
- Se todas as opções forem ausência reconhecida, o retorno é lista vazia sem erro.
- `getStreams` valida a entrada, captura a falha final, registra `console.error('[CineAgora] ...')` e devolve lista vazia.
- O prefixo de log é `[CineAgora]` e o `addon` do formatador é `CineAgora`.

### 8. Testes e fixtures

`test/fixtures/cineagora/` guarda respostas reais sanitizadas:

- busca por IMDb de filme e de série;
- busca por título com homônimos;
- página de filme com um espelho e com dois espelhos;
- página de filme só com trailer;
- página `watch` de filme, página de episódio e página de vídeo inválido;
- página `tv` da série, `fetch_series_data.php` com duas temporadas e uma resposta inválida.

As fixtures não guardam cookies, tokens, URLs assinadas nem a playlist master real; `uid`, `md5`, `id` e `video_slug` são substituídos por valores estáveis de teste. O teste verifica a construção da URL a partir desses valores.

Casos cobertos:

1. Filme dublado com IMDb e um espelho.
2. Filme com dublado e legendado, gerando dois streams.
3. Filme só com trailer, sem stream.
4. Fallback de IMDb para título PT-BR e para título original.
5. IMDb divergente, ano divergente e resultado de outra seção, descartados.
6. Dois candidatos válidos, ausência por ambiguidade.
7. Série S01E01 e S02E03, escolhidas pelas coordenadas.
8. Temporada ausente e episódio ausente, ausência.
9. `video` ausente, `status` inválido e campos inválidos, falha da opção.
10. Um espelho falha e o outro resolve; todos falham; todos são ausência.
11. `getStreams` captura a falha final e devolve lista vazia.

## Risks / Trade-offs

1. **Mudança do tema DLE ou dos seletores.** → A extração usa elementos estáveis da caixa de informações e dos botões de player; uma mudança de layout quebra o parsing com erro explícito, não vira ausência.
2. **Cloudflare ou bloqueio regional.** → O provedor não tenta contornar. A rodada online pode ficar inconclusiva e o status em `providers.md` reflete isso.
3. **Busca por IMDb não indexada em algum post.** → Fallback por título PT-BR e original, com confirmação de título, ano e seção; sem candidato único, ausência.
4. **`video.quality` desatualizada em relação à playlist.** → A lista é o que o player declara; o título da release pode citar 1080p, mas o stream sai com a maior resolução declarada na lista. Se a lista faltar, a descoberta local usa o nome da release.
5. **Playlist master quebrada ou expirada.** → A URL é derivada de `uid`, `md5`, `id` e `status`; não há cache entre pedidos. A falha aparece na reprodução, limite já conhecido da verificação online, que não abre mídia.
6. **Legendas externas não confirmadas.** → Ficam de fora; nenhuma URL é inventada. Uma mudança futura pode adicioná-las se um caminho VTT público for comprovado.
7. **Sem cabeçalhos de reprodução.** → Foi observado que a master e os segmentos respondem sem eles. Se o CDN passar a exigir `Referer`, a opção falha e a correção deve ser feita com evidência, sem copiar cabeçalhos de navegador por precaução.
8. **Séries muito longas.** → `fetch_series_data.php` devolve todas as temporadas em uma resposta; o custo é uma requisição por espelho, sem paginação adicional.
9. **Episódio em temporada especial (`season 0`).** → O contrato do app usa temporada a partir de 1; pedidos fora disso são recusados na validação de entrada.

## Migration Plan

1. Adicionar a entrada `cineagora` ao `manifest.json` e o código em `src/cineagora/`.
2. Implementar as fixtures e a suíte offline `test/cineagora.test.js`.
3. Rodar `npm run lint`, `npm test` e `node build.js cineagora`.
4. Rodar `npm run test:online -- --provider cineagora` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada em `providers.md` com `--record`.
5. Se a rodada online não comprovar funcionamento, manter a mudança sem arquivar e declarar a limitação no `design.md` e em `providers.md`.
6. Rollback: remover a entrada do manifest, a pasta `src/cineagora/`, o teste, as fixtures e a seção de `providers.md`; nenhum dado persistente é migrado.

## Open Questions

1. O caminho público das legendas externas do BrStream não foi confirmado; o campo `subtitles` do player aponta para `localsubs/...`, mas os caminhos testados devolvem HTML. Fica fora até haver evidência de VTT.
2. O comportamento de `status` diferente de `"1"` é tratado como falha da opção; se a fonte usar esse campo para outro estado, a rodada online pode revelar a necessidade de ajuste.
3. A busca DLE não é exaustiva na primeira página; títulos com muitos homônimos podem ficar sem candidato. A confirmação por IMDb e ano reduz o risco, mas não promete cobertura total.
