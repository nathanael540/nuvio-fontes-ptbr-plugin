# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 13/11/2026 (BRT), entre 02:49Z e 03:03Z de 14/11/2026, contra `https://animesfhd.net`; URLs assinadas, tokens de mídia e cookies não são registrados aqui.

1. `https://animesfhd.net/` respondeu HTTP 200 `text/html`; `GET /api/home` respondeu HTTP 200 `application/json` com `series`, `top`, `recent`, `releasing`, `today`, `hero`, `liked`, `carousels` e `selections`.
2. `GET /animes?page=1` respondeu HTTP 200 `text/html` com 30 cartões `a.card` (`h3.card__title`, `p.card__sub` com ano, episódios e áudio). A página 8 trouxe "Kimetsu no Yaiba" (2019, 8 eps, Dublado); a página 100 ainda tinha 30 cartões.
3. `GET /api/animes/pesquisar?q=Demon%20Slayer` respondeu HTTP 401 `application/json` com `{"error":"Você precisa estar conectado."}`. As rotas `/api/animes`, `/api/animes?page=1`, `/api/catalog` e `/api/search` também responderam 401. A busca anônima é a varredura do catálogo HTML.
4. `GET /serie/4305442346626588` respondeu HTTP 200 e publicou `h1` "Kimetsu no Yaiba – 4ª temporada", uma lista de cartões `EP.N` e `version-pill` para outras temporadas.
5. `GET /api/episodes/1815938127981516` respondeu HTTP 200 `application/json` e publicou `versions` com 8 entradas (4 temporadas × dublado/legendado), cada uma com `series_id`, `season`, `audio`, `episode_count` e `first_episode_id`.
6. `GET /serie/3176795044965301` (versão 1 dublada) respondeu HTTP 200, `h1` "Kimetsu no Yaiba – 1ª temporada" e 26 cartões `EP.1` a `EP.26`. O primeiro link apontou para `1938250517685094`, cujo `/api/episodes/<id>` devolveu `episode_number: 1`, `audio: dublado` e uma fonte; o segundo, `2925907259400048`, devolveu `episode_number: 2`.
7. A hipótese aritmética da proposta original falhou: `1938250517685094 + 1` respondeu HTTP 404. O identificador seguinte não é sequencial; a lista sazonal é a fonte do vínculo entre número e ID.
8. `GET /serie/226614734288731` (versão 2 dublada) respondeu HTTP 200 com 18 cartões: `EP.1` a `EP.7` são o Arco do Trem Infinito e `EP.8` é "Hashira Tengen Uzui, o Pilar do Som". Isso confirma que a fonte agrupa as temporadas 2 e 3 do TMDB na sua "2ª temporada" de 18 episódios.
9. `GET /api/episodes/1938250517685094` devolveu `sources[0]` com `kind: file`, `audio: dublado`, `url: /api/v/s6?source=...&playlist=.m3u8`, `label: Player 1`, `media_kind: s6`, `health: unknown` e `source_resolution: catalog`.
10. A URL absoluta `https://animesfhd.net/api/v/s6?...` respondeu HTTP 200 `application/vnd.apple.mpegurl`, corpo iniciado em `#EXTM3U`, playlist de mídia com `#EXT-X-TARGETDURATION` e segmentos relativos. Não havia `#EXT-X-STREAM-INF` nem `RESOLUTION`.
11. A playlist respondeu 200 com e sem `Referer`; não foi necessário cabeçalho de reprodução. O `Range` foi ignorado e o corpo completo foi devolvido.
12. O catálogo anônimo continua além da página 100; o teto de 12 páginas da proposta cobre cerca de 360 cartões, além dos carrosséis da home.

## Goals / Non-Goals

**Goals:**

1. Confirmar título e ano de uma série sem usar a busca autenticada.
2. Mapear a temporada do TMDB para a versão sazonal da fonte, inclusive quando a fonte agrupa temporadas.
3. Selecionar o episódio pelo rótulo `EP.N` da lista sazonal e resolver o HLS publicado.
4. Manter a mudança testável offline e verificável online no perfil `anime`.

**Non-Goals:**

1. Cobrir filmes do catálogo; a mudança é só `tv`.
2. Usar conta, cookie, token, proxy ou a rota privada de busca.
3. Sondar cada URL, baixar a playlist ou inventar qualidade.
4. Garantir cobertura integral do catálogo; o teto de 12 páginas é explícito.
5. Reutilizar a aritmética de `first_episode_id` da proposta original.

## Decisions

### D1. Escopo e entrada

1. Aceitar somente `mediaType: 'tv'`; `movie` devolve `[]` sem requisição externa.
2. Validar `season` e `episode` como inteiros positivos antes do TMDB.
3. Usar `getMediaInfo` para título PT-BR, original, alternativos, romaji, ano e `seasons`. A temporada 0 do TMDB é ignorada no cálculo global.

### D2. Busca anônima no catálogo

1. Ler `GET /api/home` e extrair os itens de `carousels[].items`, `recent`, `releasing`, `today`, `hero`, `liked`, `top` e `selections`; deduplicar por `series_id`.
2. Ler `GET /animes?page=1..12` e extrair `a.card[href^="/serie/"]`, `h3.card__title` e `p.card__sub` (ano, episódios, áudio).
3. Pontuar os candidatos com `findBestMatch`/`titleSimilarity` usando título e ano; abrir no máximo quatro fichas.
4. Confirmar a ficha por `h1`, temporada exibida e a existência de pelo menos um episódio; o cartão pode representar apenas a temporada mais recente, e o mapeamento por `versions` corrige a temporada pedida.
5. Alternativas descartadas:
   1. `/api/animes/pesquisar`: 401 sem sessão.
   2. Aumentar o teto para 100 páginas: 3000+ requisições de HTML e tempo incompatível com o app; 12 páginas mais os carrosséis é o recorte documentado.
   3. Usar Jina Reader ou busca externa: adicionaria dependência e não garante identidade.

### D3. Temporada e episódio global

1. Calcular `globalRequested = soma(episode_count das temporadas TMDB com número entre 1 e season-1) + episode`.
2. Ordenar as `versions` da fonte por `season` e `audio`; para o áudio pedido, calcular `startGlobal = 1 + soma(episode_count das versões anteriores do mesmo áudio)` e `endGlobal = startGlobal + episode_count - 1`.
3. Selecionar a versão cujo intervalo contém `globalRequested`; o episódio local é `globalRequested - startGlobal + 1`.
4. Abrir `GET /serie/<version.series_id>` e escolher o cartão cujo título começa com `EP.<local>`; nunca usar a posição do link nem `first_episode_id + n`.
5. Se o áudio pedido não existir, tentar o outro áudio anunciado; se nenhum cobrir o episódio, devolver `[]`.
6. Exemplo confirmado: Demon Slayer S03E01 → global 34 → versão 2 (27–44) → local 8 → "Hashira Tengen Uzui, o Pilar do Som". Demon Slayer S01E01 → global 1 → versão 1 → local 1.
7. Alternativas descartadas:
   1. Usar `version.season` como se fosse a temporada do TMDB: a fonte agrupa S02+S03 na sua temporada 2.
   2. Mapear por posição na página: a ordenação pode mudar e o link não é identidade.
   3. Criar uma tabela estática por título: não escala e já foi demonstrada desnecessária para Demon Slayer.

### D4. Resolução da mídia

1. Buscar `GET /api/episodes/<episode_id>` e ler `sources[]` como opções independentes.
2. Resolver cada `url` relativa contra `https://animesfhd.net`; o caminho `/api/v/s6?...` é HLS, confirmado por `Content-Type` e `#EXTM3U`.
3. Devolver um stream por fonte, com `provider` do `label` (`Player 1` etc.), `type: 'hls'` e `language` de `audio` (`dublado` → Dublado, `legendado` → Legendado).
4. Qualidade: `source_resolution` é `catalog`, não uma resolução; a playlist é de mídia, sem `RESOLUTION`. Usar `discoverQuality` apenas sobre `label`/URL já obtidos e preservar `Desconhecida` quando não houver correspondência. Não fazer requisição extra para descobrir qualidade.
5. Cabeçalhos: nenhum foi necessário na playlist; não acrescentar `Referer`/`Origin` por precaução.
6. Alternativa descartada: a sonda `Range` obrigatória da proposta original. A fonte entrega uma playlist válida e o app resolve os segmentos; a sonda adicionaria requisição e não mudaria a qualidade.

### D5. Streams e contrato

1. Montar cada stream com `buildStream` e `format: { template: FORMATTER.AUTO, addon: 'AnimesFHD', title: media.title, year: media.year, season, episode }`.
2. Campos: `url`, `quality` (ou omitido), `language`, `type: 'hls'`, `provider` e `headers` somente se comprovados.
3. Ordenar com `sortByQuality` no ponto de entrada.
4. Sem `name`/`title`, sem `size`, sem legendas externas, sem seeders/peers; a fonte não os publica.

### D6. Erros

1. Entrada, TMDB, busca e ficha são fatais; a página sazonal e cada fonte são opções isoladas.
2. HTTP, HTML sem `EP.N` ou JSON inválido na API de episódio sobem como erro estrutural; 404 de uma versão sazonal é ausência.
3. Se todas as fontes falharem, lançar erro com a causa de cada uma; se nenhuma fonte for publicada, devolver `[]`.
4. `getStreams` captura tudo, registra `[AnimesFHD] ...` e devolve `[]`.

### D7. Testes, build e documentação

1. Fixtures sanitizadas em `test/fixtures/animesfhd/`: home com carrossel, catálogo com cards, ficha sazonal, versões, episódio dublado, episódio legendado, episódio de temporada agrupada, `sources` vazio, JSON inválido e estrutura sem `EP.N`.
2. Casos em `test/animesfhd.test.js`: S01E01 dublado, S01E02 dublado, S03E01 (global 34 → local 8), episódio ausente, título fora do teto, `movie` recusado sem rede, busca 401 não chamada, uma fonte falhando e todas falhando.
3. Manifest: `id` `animesfhd`, nome `AnimesFHD`, versão `1.0.0`, tipo `tv`, formato `m3u8`, `contentLanguage` `pt` e logo HTTPS.
4. Verificação online: perfil `anime` em `test/online/profiles.json`; status inicial `🟠 Não verificado`.
5. Documentação: atualizar `providers.md` e `docs/provider-investigation.md` com o método “catálogo HTML com versões sazonais e episódio global”, citando `src/animesfhd/`, os testes e a spec. Nenhum bloco novo é necessário.

## Risks / Trade-offs

1. **Cobertura limitada a 12 páginas** → títulos fora do recorte e dos carrosséis ficam sem resultado. O limite fica explícito no código e na documentação; ampliar exige outra mudança.
2. **Temporadas agrupadas** → o cálculo global depende de `episode_count` da fonte e do TMDB. Um catálogo com temporadas fora de ordem pode escolher a versão errada; a confirmação pelo rótulo `EP.N` e o teste de S03E01 reduzem o risco.
3. **Qualidade desconhecida** → a fonte não declara resolução e a playlist é de mídia. O stream é preservado como `Desconhecida`; não há sonda.
4. **HLS proxy** → a URL `/api/v/s6` é temporária e pode expirar; resolver a cada pedido, sem cache, fixture ou log.
5. **Mudança de layout** → `a.card`, `h3.card__title`, `EP.N` e `versions` podem mudar. A falha sobe como erro estrutural; os testes de fixture tornam a quebra visível.
6. **Cloudflare** → as rotas testadas responderam sem desafio; um desafio futuro vira erro HTTP, não ausência.
7. **Sem busca** → títulos populares são encontrados nos carrosséis/páginas iniciais; o restante é ausência reconhecida apenas dentro do recorte.

## Migration Plan

1. Criar `src/animesfhd/` e os testes com fixtures sanitizadas; rodar `node build.js animesfhd`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil `anime` em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método reaproveitável.
4. Rodar `npm run lint`, `npm test` e o build; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider animesfhd` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar somente com os testes previstos passando ou com exclusões declaradas.
7. Rollback: remover a entrada do manifest, os arquivos gerados, o perfil e a seção de `providers.md`; nenhum bloco existente é alterado.

## Open Questions

1. Confirmar na rodada online quantos títulos de anime do catálogo caem dentro do teto de 12 páginas e se o perfil precisa de ajuste.
2. Confirmar se outras séries agrupam temporadas do TMDB de forma diferente de Demon Slayer; o cálculo global é a regra, mas um caso com temporadas fora de ordem exigiria novo teste.
3. Confirmar se o backend `/api/v/s6` mantém a playlist de mídia sem `RESOLUTION` em todo o acervo.
