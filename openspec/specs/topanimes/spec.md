# topanimes Specification

## Purpose
Localizar e confirmar filmes e séries no TopAnimes a partir do ID do TMDB, selecionar o episódio pela numeração publicada ou absoluta, ler as opções DooPlay e devolver os streams dos players Booonceivu, Blogger, `/antivirus`, Ruplay/IncVideo e Filemoon/Byse, com idioma, qualidade, legendas e formato coerentes.

## Requirements

### Requirement: Escopo e validação de entrada

O provedor SHALL atender `movie` e `tv`. `tmdbId` não numérico, `mediaType` fora de `movie`/`tv` e série sem temporada/episódio inteiros a partir de 1 SHALL lançar erro antes de qualquer requisição. Filme SHALL ignorar temporada e episódio.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` registra a falha com `[TopAnimes]`.

#### Scenario: Série sem coordenadas

- **WHEN** `mediaType` é `tv` e temporada ou episódio não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de consultar o TMDB.

#### Scenario: Filme válido

- **WHEN** `mediaType` é `movie` com `tmdbId` numérico
- **THEN** o provedor consulta o TMDB e segue para a busca, ignorando temporada e episódio.

### Requirement: Busca por variantes do TMDB

O provedor SHALL consultar `GET https://topanimes.net/?s=<termo>` com título PT-BR, original, alternativos e romaji, priorizando os romaji da temporada pedida em série e limitando a oito termos deduplicados. Página sem `.search-page` SHALL lançar erro de estrutura; `.no-result` ou zero cartões SHALL ser ausência.

#### Scenario: Romaji encontra a obra

- **WHEN** a busca pelo título PT-BR não devolve a ficha, mas o romaji do TMDB devolve o cartão correspondente
- **THEN** o provedor acumula o cartão e continua a confirmação.

#### Scenario: Busca sem resultado

- **WHEN** a página de busca publica `.no-result` ou nenhum `article`
- **THEN** o provedor trata como ausência e tenta o próximo termo, sem erro.

#### Scenario: Busca sem estrutura

- **WHEN** a resposta 2xx não contém `.search-page`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Confirmação de identidade

O provedor SHALL aceitar o cartão cujo tipo da rota coincide com o pedido e cujo título limpo, comparado aos títulos e romaji do TMDB, alcança similaridade 0,88. Em série, SHALL aceitar também prefixo do título-base quando o par temporada/episódio existe e o ano confere. O ano SHALL usar tolerância de um e, em série, o ano da temporada.

#### Scenario: Filme confirmado

- **WHEN** o cartão de `/filmes/` tem título limpo equivalente ao título do TMDB e ano compatível
- **THEN** o provedor abre a ficha do filme.

#### Scenario: Série confirmada por prefixo

- **WHEN** a página `Kimetsu no Yaiba: Yuukaku-hen` tem o par temporada 3/episódio 1 e o ano confere com a temporada 3 do TMDB
- **THEN** o provedor aceita o candidato mesmo sem igualdade exata de título.

#### Scenario: Tipo divergente

- **WHEN** o cartão de `/animes/` aparece em pedido de filme
- **THEN** o candidato é descartado sem abrir a ficha.

#### Scenario: Ano divergente

- **WHEN** o cartão tem ano fora da tolerância de um em relação ao ano esperado
- **THEN** o candidato é descartado e a busca continua.

#### Scenario: Nenhum candidato

- **WHEN** todos os termos terminam sem candidato confirmado
- **THEN** o provedor devolve lista vazia, sem tratar como falha.

### Requirement: Seleção de temporada e episódio

O provedor SHALL selecionar o episódio pelo par `temporada - episódio` de `.numerando` quando o campo existe. Sem `.numerando`, SHALL usar `.epnumber` como numeração absoluta, somando os `episodeCount` das temporadas regulares anteriores do TMDB, salvo quando o título da página declara a temporada pedida, caso em que usa a numeração local. O `href` publicado SHALL ser usado.

#### Scenario: Par publicado

- **WHEN** a página tem `.numerando` "3 - 1" e o pedido é temporada 3, episódio 1
- **THEN** o provedor abre o `href` dessa entrada.

#### Scenario: Numeração absoluta

- **WHEN** a página de Naruto Shippuden não tem `.numerando` e o pedido é temporada 2, episódio 1
- **THEN** o provedor procura `.epnumber` 33, soma dos 32 episódios da temporada 1 mais um.

#### Scenario: Temporada declarada na página

- **WHEN** a página sem `.numerando` declara a temporada pedida no título
- **THEN** o provedor usa o número local do episódio, sem somar temporadas.

#### Scenario: Episódio ausente

- **WHEN** a página não publica o par ou o número absoluto pedido
- **THEN** o candidato é ausência e o provedor tenta o próximo.

### Requirement: Leitura das opções DooPlay

O provedor SHALL ler cada `li.dooplay_player_option` com `data-nume` numérico como opção independente, associando o rótulo de `.title` ao primeiro `iframe` de `#source-player-<nume>`. O trailer SHALL ser descartado. Opção sem iframe SHALL ser descartada por triagem.

#### Scenario: Iframe inline

- **WHEN** a opção 2 tem `<iframe src="https://sk-boyceta.booonceivu.shop/?id=...">`
- **THEN** o provedor resolve a URL do iframe como a opção de rótulo "Vidstreaming".

#### Scenario: Trailer

- **WHEN** a opção tem `data-nume="trailer"` ou rótulo "Watch trailer"
- **THEN** a opção é ignorada sem requisição.

#### Scenario: Página sem opções

- **WHEN** a ficha do filme ou a página do episódio não publica `li.dooplay_player_option`
- **THEN** o provedor devolve lista vazia para aquele candidato.

### Requirement: Resolução Booonceivu

O provedor SHALL resolver hosts terminados em `booonceivu.shop` com `Referer` de `https://topanimes.net/`. A resposta JSON com `status: "success"` SHALL gerar HLS de `midias[]` e legendas de `legendas[]`; o HTML com `jwplayer` SHALL gerar MP4 de `sources`. `SD`, `LD` e `FD` SHALL virar `1080p`, `720p` e `360p`.

#### Scenario: JSON com mídias

- **WHEN** o player devolve `status: "success"` e duas mídias HLS
- **THEN** o provedor devolve um stream por mídia, com a qualidade mapeada do rótulo.

#### Scenario: JSON com legendas

- **WHEN** `legendas[]` traz uma legenda "Português" e uma "English"
- **THEN** as duas entram em `subtitles`, sem `headers`.

#### Scenario: HTML com MP4

- **WHEN** o host devolve HTML com `sources: [{"file":"https://cdn/...mp4","type":"video/mp4","label":"1080p"}]`
- **THEN** o provedor devolve um stream MP4 1080p.

#### Scenario: Status de erro

- **WHEN** o JSON tem `status` diferente de `"success"` ou `midias` vazio
- **THEN** a opção não produz stream e não é falha.

### Requirement: Resolução Blogger e `/antivirus`

O provedor SHALL resolver `blogger.com/video.g` com o bloco `blogger-video`, gerando um MP4 por formato progressivo, com `User-Agent` na reprodução. O wrapper `topanimes.net/antivirusN/...` SHALL ser lido como jwplayer, gerando HLS com `Referer` de `https://topanimes.net/` e `User-Agent` na reprodução.

#### Scenario: Blogger com três formatos

- **WHEN** o HTML publica formatos 144p, 360p e 720p
- **THEN** o provedor devolve três streams MP4 com a qualidade de cada `qualityLabel`.

#### Scenario: HLS do wrapper

- **WHEN** o wrapper publica `sources` com `file` HLS e `label` "1080p"
- **THEN** o provedor devolve um stream HLS 1080p com os cabeçalhos de reprodução.

#### Scenario: Wrapper sem fonte

- **WHEN** a página do player publica `sources` com `file` vazio
- **THEN** a opção não produz stream e não é falha.

### Requirement: Resolução Ruplay/IncVideo

O provedor SHALL resolver `csst.online`, `fsst.online` e `incvideo*.online` seguindo o redirecionamento do embed e lendo o campo `file` do `Playerjs`, com um MP4 por URL `/get_file/` e o rótulo entre colchetes como qualidade. O sufixo `&poster=` concatenado sem `?` SHALL ser removido antes de abrir o embed. O stream SHALL levar `User-Agent` e `Referer` da origem final do embed.

#### Scenario: Playerjs multi-qualidade

- **WHEN** o embed publica `[360p]`, `[720p]` e `[1080p]` em URLs `/get_file/`
- **THEN** o provedor devolve três MP4 com as qualidades normalizadas.

#### Scenario: Sufixo malformado

- **WHEN** o `/aviso/?url=` entrega `https://csst.online/embed/805424&poster=https://...`
- **THEN** o provedor abre `https://csst.online/embed/805424`, descartando o sufixo.

#### Scenario: Referer de reprodução

- **WHEN** o embed termina em `https://incvideo1.online/embed/805424/`
- **THEN** o stream leva `Referer: https://incvideo1.online/` e `User-Agent`, nunca `Referer` de `topanimes.net`.

#### Scenario: Embed sem Playerjs

- **WHEN** o HTML do embed não publica `Playerjs` ou `file`
- **THEN** a opção falha isoladamente com aviso e as demais continuam.

### Requirement: Resolução Filemoon/Byse

O provedor SHALL resolver `filemoon.*` com `/e/<código>` consultando `api/videos/<código>/` com `Referer` do embed e decifrando o `playback` AES-256-GCM localmente. As fontes HLS SHALL vir de `sources`, com `height` e, sem ele, `label` como qualidade, e as legendas de `tracks`. O `.m3u8` SHALL sair sem cabeçalhos de reprodução.

#### Scenario: Playback válido

- **WHEN** a API devolve `playback` cifrado com `sources` HLS
- **THEN** o provedor decifra, devolve os HLS com qualidade e legendas e não abre a playlist.

#### Scenario: Playback inválido

- **WHEN** o `playback` não tem `key_parts`, chave, IV ou payload válidos
- **THEN** a opção falha isoladamente com aviso e o erro agregado sobe se nenhuma produzir stream.

#### Scenario: Faixas de legenda

- **WHEN** o `playback` publica `tracks` com idioma e URL
- **THEN** as legendas entram no stream com o idioma publicado.

#### Scenario: Fontes sem mídia

- **WHEN** o `playback` não tem `sources` ou nenhuma fonte é HLS/MP4
- **THEN** a opção não produz stream.

### Requirement: Idioma e legendas

O provedor SHALL classificar o áudio como `Dublado` quando o título da ficha/cartão contém `Dublado`; SHALL classificar como `Legendado` quando a página não é dublada e publica legenda em português; caso contrário, SHALL deixar a descoberta local. Legendas SHALL ser preservadas com `url` e o rótulo da fonte em `language`.

#### Scenario: Página dublada

- **WHEN** a ficha se chama "Solo Leveling Dublado"
- **THEN** todo stream da página sai com `language` "Dublado".

#### Scenario: Página legendada

- **WHEN** a ficha "Sousou no Frieren" publica legenda "Português" e não contém "Dublado"
- **THEN** os streams saem com `language` "Legendado" e a legenda é preservada.

#### Scenario: Sem marcador

- **WHEN** a página não declara áudio nem publica legenda em português
- **THEN** o stream é preservado e a descoberta local decide o idioma, podendo resultar em "Idioma Desconhecido".

### Requirement: Contrato dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, sem `name`/`title`, com `type`, `provider`, qualidade do rótulo, `headers` apenas quando o player exigir e `format` com título, ano, temporada e episódio. Streams duplicados por URL e qualidade SHALL ser unidos.

#### Scenario: Stream completo

- **WHEN** o Booonceivu devolve um HLS 720p com legenda PT em página dublada
- **THEN** o stream tem `url`, `quality` "720p", `language` "Dublado", `type` "hls", `provider` do rótulo, `subtitles` e `format` completo.

#### Scenario: Qualidade desconhecida

- **WHEN** o player publica mídia sem rótulo reconhecível
- **THEN** a qualidade é omitida e `buildStream` preenche "Desconhecida".

#### Scenario: Mesma URL

- **WHEN** duas opções resolvem a mesma URL e a mesma qualidade
- **THEN** o provedor devolve um único stream.

### Requirement: Isolamento, erro e ausência

Cada opção SHALL ser resolvida em isolamento com aviso `[TopAnimes] Opção <rótulo> descartada: <causa>`. Se nenhuma opção produzir stream e alguma falhar, o erro agregado SHALL subir. HTTP 403/5xx em busca, ficha, episódio ou player SHALL subir, enquanto ficha/episódio 404, player desativado, host de triagem e ausência SHALL devolver lista vazia.

#### Scenario: Uma opção falha

- **WHEN** o Blogger falha e o Booonceivu devolve HLS
- **THEN** o stream Booonceivu é devolvido e o aviso cita a opção Blogger.

#### Scenario: Todas falham

- **WHEN** todas as opções conhecidas falham
- **THEN** o erro agregado cita cada causa e sobe para `getStreams`.

#### Scenario: Todas são triagem

- **WHEN** todas as opções apontam para hosts não suportados
- **THEN** o provedor devolve lista vazia, porque não houve falha.

#### Scenario: Ficha removida

- **WHEN** a ficha confirmada responde 404
- **THEN** o candidato é pulado sem erro e os demais continuam.

### Requirement: Sem timeout, sonda ou cache

O provedor SHALL NOT instalar timeout próprio, `AbortController`, retentativa, sonda de mídia, cache ou settings. A qualidade SHALL vir do rótulo já obtido, e o master HLS SHALL ser devolvido inteiro.

#### Scenario: Sem sonda

- **WHEN** o player publica a URL de mídia
- **THEN** o provedor devolve a URL sem `Range`, `HEAD` ou abertura de playlist.

#### Scenario: Sem cache

- **WHEN** duas execuções resolvem o mesmo player
- **THEN** a URL é resolvida de novo, sem reutilizar token ou assinatura.
