# Spec Delta

## Purpose

Localizar filmes e séries de anime no AnimeQ a partir do ID do TMDB, confirmar título e ano, selecionar o episódio pela estrutura DooPlay, ler as fontes do player AnimeQ e devolver os streams das famílias públicas comprovadas, sob o contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca e confirmação de identidade

O provedor SHALL consultar `GET https://animeq.cloud/?s=<termo>` com o título PT-BR, o título original, os alternativos brasileiros e os títulos romaji do TMDB, em ordem. SHALL aceitar como candidatos os cartões `div.search-page div.result-item` com `.title a` e SHALL confirmar título e ano antes de abrir a página de detalhe. A presença de `div.no-result` SHALL indicar ausência da variante.

#### Scenario: Busca com resultado

- **WHEN** a busca de `demon slayer` devolve cartões com `.title a` e `.year`
- **THEN** o provedor compara título e ano e segue com o candidato compatível.

#### Scenario: Busca sem resultado

- **WHEN** a busca devolve `div.no-result`
- **THEN** o provedor trata a variante como ausência e tenta a próxima.

#### Scenario: HTML de busca não reconhecido

- **WHEN** a resposta não tem `div.search-page` nem `div.no-result`
- **THEN** o provedor lança erro de estrutura, sem confundir com ausência.

### Requirement: Seleção de série, temporada e episódio

Para série, o provedor SHALL abrir `/anime/<slug>`, SHALL ler os blocos `div.se-c` com o número em `span.se-t` e SHALL escolher o cartão `div.episode-card[data-episode-number]` cujo número seja igual ao episódio pedido, dentro da temporada pedida. O link SHALL ser o `a[href*="/episodio/"]` do cartão. O provedor SHALL NOT usar a posição visual.

#### Scenario: Episódio escolhido pelo atributo

- **WHEN** a temporada 1 lista `data-episode-number="1"`, `"2"` e `"3"` e o pedido é o episódio 2
- **THEN** o provedor usa o link do cartão com `data-episode-number="2"`.

#### Scenario: Temporada ausente

- **WHEN** a página só tem o bloco da temporada 1 e o pedido é da temporada 2
- **THEN** o provedor devolve lista vazia.

#### Scenario: Página sem blocos de temporada

- **WHEN** a página de série não tem `div.se-c` nem `div.episode-card`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Leitura do player AnimeQ

O provedor SHALL ler `div.animeq-player__source[data-animeq-source]` na página do episódio, SHALL aceitar como opções o `<source src>` e o `<iframe src>` de cada bloco e SHALL associar o rótulo de `button[data-animeq-switch="<índice>"][data-source-name]`. Cada opção SHALL ser resolvida em isolamento.

#### Scenario: Fonte direta em `<source>`

- **WHEN** o bloco publica `<source src="https://animeflix.blog/.../01-sd.mp4">`
- **THEN** o provedor trata a URL como uma opção MP4 independente.

#### Scenario: Iframe do Blogger

- **WHEN** o bloco publica `<iframe src="https://www.blogger.com/video.g?token=...">`
- **THEN** o provedor trata o iframe como uma opção da família Blogger.

#### Scenario: Rótulo da opção

- **WHEN** o bloco tem `data-animeq-source="2"` e o botão correspondente tem `data-source-name="Dublado"`
- **THEN** a opção recebe o rótulo `Dublado`.

### Requirement: Opções DooPlay do filme

Para filme, o provedor SHALL ler `li.dooplay_player_option` em `/filme/<slug>`, SHALL ignorar `data-nume` não numérico e SHALL expandir cada opção com `POST https://animeq.cloud/wp-admin/admin-ajax.php` no formulário `action=doo_player_ajax&post=<post>&nume=<nume>&type=<type>`, com `X-Requested-With: XMLHttpRequest`. A resposta SHALL conter `embed_url`.

#### Scenario: Filme com opção `FullHD / HLS`

- **WHEN** a opção devolve `embed_url` com `jwplayer?source=<mp4>`
- **THEN** o provedor resolve o `source` como mídia MP4.

#### Scenario: Opção sem `embed_url`

- **WHEN** o AJAX devolve `embed_url` vazio
- **THEN** a opção é descartada com aviso e as demais continuam.

#### Scenario: Botão de trailer

- **WHEN** `data-nume` é `trailer` ou outro valor não numérico
- **THEN** a opção é ignorada por triagem.

### Requirement: Resolução das famílias comprovadas

O provedor SHALL resolver: MP4 direto `http(s)`; `jwplayer?source=<valor>` decodificado, aceitando `http(s)`; e `blogger.com/video.g` pelo bloco `blogger-video`, que lê `streamingData.formats` e devolve os MP4 progressivos com `qualityLabel`. O provedor SHALL usar `Referer: https://animeq.cloud/` somente nas mídias do host `aniplay.online`, comprovadamente 403 sem ele. Iframes de `animeshd.cloud` e `animes.strp2p.com` SHALL ser descartados por triagem.

#### Scenario: Blogger entrega MP4 progressivo

- **WHEN** o iframe do Blogger publica `streamingData.formats` com um MP4 360p
- **THEN** o provedor devolve o stream com `quality` "360p" e `provider` "Blogger".

#### Scenario: MP4 direto sem cabeçalho

- **WHEN** a fonte direta é do host `animeflix.blog`, que respondeu 200 sem `Referer`
- **THEN** o stream é devolvido sem `headers`.

#### Scenario: MP4 que exige contexto

- **WHEN** a fonte direta é do host `aniplay.online`
- **THEN** o stream é devolvido com `Referer: https://animeq.cloud/`.

#### Scenario: Host fora do contrato

- **WHEN** o iframe aponta para `animeshd.cloud` (Embed69) ou `animes.strp2p.com` (Vidstack)
- **THEN** a opção é descartada por triagem, sem falha fatal.

#### Scenario: Todas as opções em triagem

- **WHEN** todas as fontes do episódio são de hosts fora do contrato
- **THEN** a saída é lista vazia.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type` `mp4` ou `hls` conforme a mídia, `provider` do player, `language` `Dublado`/`Legendado` somente quando o rótulo declarar e `quality` somente quando houver texto que a declare. O stream sem qualidade SHALL ser preservado como `Desconhecida`.

#### Scenario: Opção dublada

- **WHEN** o rótulo da fonte é `Dublado`
- **THEN** o stream sai com `language` "Dublado".

#### Scenario: Rótulo técnico sem idioma

- **WHEN** o rótulo é `SD / HD`, `FHD` ou `FullHD / HLS`
- **THEN** o idioma é omitido e a descoberta local decide.

#### Scenario: Qualidade do Blogger

- **WHEN** `qualityLabel` é `360p`
- **THEN** o stream sai com `quality` "360p".

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia para ausência de título, temporada, episódio ou de toda opção em triagem. Falha de rede, HTTP fora de 2xx, JSON inválido ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[AnimeQ]` e devolve lista vazia. A falha de uma opção de mídia SHALL ser registrada com `console.warn('[AnimeQ] Opção <rótulo> descartada: <causa>')` e preservar as demais.

#### Scenario: Fonte direta morta e Blogger vivo

- **WHEN** `mangas.cloud` responde 404 e o Blogger entrega um MP4
- **THEN** o provedor devolve o stream do Blogger e registra o aviso da fonte descartada.

#### Scenario: Todas as opções falham

- **WHEN** todas as fontes respondem erro e nenhum stream é produzido
- **THEN** o provedor lança erro agregado com a causa de cada opção.

#### Scenario: Título ausente

- **WHEN** todas as variantes terminam sem candidato confirmado
- **THEN** a saída é lista vazia, sem erro registrado.
