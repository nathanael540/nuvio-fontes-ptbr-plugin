# animeshd-provider Specification

## Purpose
Localizar e confirmar séries de anime no AnimesHD a partir do ID do TMDB, alinhar a temporada do TMDB à temporada publicada pela fonte, selecionar o episódio pelo `numerando` e devolver os MP4 do Blogger com qualidade, idioma e cabeçalho de reprodução coerentes.

## Requirements

### Requirement: Escopo seriado e validação de entrada

O provedor SHALL atender somente `mediaType` `tv` e SHALL devolver lista vazia para `movie` sem consultar a fonte. `tmdbId` não numérico, `mediaType` fora de `movie`/`tv` e série sem temporada ou episódio inteiros a partir de 1 SHALL lançar erro antes de qualquer requisição.

#### Scenario: Pedido de filme é recusado

- **WHEN** `getStreams` recebe `mediaType` `movie`
- **THEN** o provedor devolve lista vazia sem requisição ao AnimesHD.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` registra a falha com `[AnimesHD]`.

#### Scenario: Série válida segue para o TMDB

- **WHEN** `getStreams` recebe `tmdbId` numérico, `mediaType` `tv` e temporada/episódio inteiros a partir de 1
- **THEN** o provedor consulta o TMDB antes de acessar a fonte.

### Requirement: Busca por variantes de título

O provedor SHALL buscar em `GET /?s=<termo>` com romaji geral, título PT-BR, título original, alternativas brasileiras e romaji com temporada, sem repetir o texto normalizado. A busca sem cartões e com `body.search-no-results` SHALL ser ausência; busca sem cartões e sem esse marcador SHALL lançar erro de estrutura.

#### Scenario: Título romaji encontra a série

- **WHEN** o TMDB informa romaji e PT-BR e a busca pelo romaji devolve a ficha correspondente
- **THEN** o provedor acumula o cartão e segue para a confirmação na ficha.

#### Scenario: Busca sem resultado

- **WHEN** a página de busca apresenta `body.search-no-results`
- **THEN** o provedor devolve lista vazia sem erro.

#### Scenario: Busca fora do layout

- **WHEN** a página de busca não tem cartões nem `body.search-no-results`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

#### Scenario: Termos repetidos

- **WHEN** o TMDB repete o mesmo título normalizado em mais de uma variante
- **THEN** o provedor consulta esse termo uma única vez.

### Requirement: Confirmação por título e ano

O provedor SHALL confirmar o candidato em `.sheader h1` e `.sheader span.date`, comparando o `h1` inteiro, o texto antes dos parênteses e cada grupo entre parênteses com os títulos do TMDB. A similaridade mínima SHALL ser 0,85 e o ano SHALL ter tolerância de um. Ano ausente na ficha SHALL ser erro de estrutura; ano divergente SHALL descartar o candidato.

#### Scenario: Título composto com parênteses

- **WHEN** a ficha publica `Shingeki No Kyojin (Attack on Titan)` e o TMDB tem `Attack on Titan`
- **THEN** o provedor confirma o candidato pela parte entre parênteses.

#### Scenario: Resultado alheio

- **WHEN** a busca por `Demon Slayer` devolve o cartão de `Berserk` e a ficha não corresponde ao TMDB
- **THEN** o candidato é rejeitado e a busca continua.

#### Scenario: Ano divergente

- **WHEN** o `h1` é compatível, mas o ano da ficha difere do TMDB em mais de um
- **THEN** o candidato é rejeitado.

#### Scenario: Ficha removida

- **WHEN** um cartão aponta para uma ficha que responde 404
- **THEN** o candidato é pulado e os demais continuam.

#### Scenario: Ficha sem estrutura

- **WHEN** uma ficha responde 200 sem `h1` ou sem `span.date`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Seleção de temporada pelo calendário do TMDB

O provedor SHALL ler cada `div.se-c` com número em `span.se-t`, data do primeiro `span.date` e contagem de `li`. Quando a temporada do TMDB tiver `airDate`, a data do primeiro episódio SHALL coincidir com tolerância de um dia; empate SHALL ser desempatado pela contagem de episódios. Sem data, o provedor SHALL aceitar a temporada 1 única como agrupada ou o número exato com a mesma contagem.

#### Scenario: Temporada desalinhada

- **WHEN** o TMDB pede a temporada 3 de Demon Slayer e a fonte publica essa temporada como `Temporada 2`
- **THEN** o provedor escolhe a `Temporada 2` da fonte pela data de estreia.

#### Scenario: Temporada agrupada

- **WHEN** a fonte publica uma única `Temporada 1` com 291 episódios e o pedido é da temporada 1
- **THEN** o provedor usa essa temporada e seleciona o episódio local.

#### Scenario: Temporada agrupada acima da 1

- **WHEN** a fonte só tem uma `Temporada 1` e o pedido é da temporada 2
- **THEN** o provedor devolve lista vazia, sem somar episódios.

#### Scenario: Temporada ausente

- **WHEN** nenhuma temporada da fonte corresponde por data, contagem ou número
- **THEN** o provedor devolve lista vazia.

#### Scenario: Ficha sem temporadas

- **WHEN** a ficha confirmada responde 200 sem `div.se-c`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Seleção do episódio publicado

O provedor SHALL selecionar o episódio pelo segundo número de `div.numerando` dentro da temporada escolhida e SHALL exigir que o primeiro número seja o da temporada. O `href` publicado em `div.episodiotitle a` SHALL ser usado sem substituição; episódio ausente SHALL produzir lista vazia e episódio sem `href` SHALL lançar erro.

#### Scenario: Episódio publicado

- **WHEN** a temporada escolhida tem `div.numerando` `2 - 3` e o pedido é S03E03 do TMDB
- **THEN** o provedor abre o `href` do episódio 3 dessa temporada.

#### Scenario: Episódio não publicado

- **WHEN** a temporada existe, mas não tem o episódio pedido
- **THEN** o provedor devolve lista vazia.

#### Scenario: Entrada de outra temporada

- **WHEN** um `li` da temporada escolhida tem `numerando` com outro primeiro número
- **THEN** o provedor ignora essa entrada.

#### Scenario: Link sem href

- **WHEN** o episódio correspondente não tem `href`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Leitura das opções DooPlay

O provedor SHALL ler cada `li.dooplay_player_option` com `data-nume` numérico como opção independente, usando `data-post`, `data-nume`, `data-type` e o rótulo de `span.title`. `data-nume` não numérico SHALL ser ignorado. Página sem opções e com `h1.epih1` SHALL ser ausência; página sem `h1.epih1` e sem opções SHALL lançar erro de estrutura.

#### Scenario: Opção única

- **WHEN** a página publica uma opção com `data-nume` `1` e rótulo `Legendado`
- **THEN** o provedor a trata como opção independente.

#### Scenario: Opções dublada e legendada

- **WHEN** a página publica `data-nume` `1` com `Dublado` e `data-nume` `2` com `Legendado`
- **THEN** o provedor resolve as duas opções separadamente.

#### Scenario: Trailer

- **WHEN** um `li.dooplay_player_option` tem `data-nume` não numérico
- **THEN** o provedor o ignora sem falha.

#### Scenario: Página sem opções

- **WHEN** a página do episódio tem `h1.epih1` e nenhum `li.dooplay_player_option`
- **THEN** o provedor devolve lista vazia.

### Requirement: Expansão do player e leitura do Blogger

Cada opção SHALL ser expandida por `POST /wp-admin/admin-ajax.php` com `action=doo_player_ajax`, `post`, `nume` e `type`, perfil `api` e `Referer` da página. A resposta SHALL ser objeto com `embed_url` texto não vazio. Host fora de `blogger.com` SHALL ser triagem; o HTML do Blogger SHALL ser lido por `extractBloggerFormats`.

#### Scenario: Blogger com MP4 progressivos

- **WHEN** o `embed_url` aponta para `www.blogger.com/video.g` e o HTML publica dois formatos
- **THEN** o provedor devolve um stream MP4 por formato.

#### Scenario: Resposta sem embed

- **WHEN** o AJAX responde sem `embed_url` ou com valor vazio
- **THEN** a opção falha isoladamente e as demais continuam.

#### Scenario: Host não suportado

- **WHEN** o `embed_url` aponta para um host fora do Blogger
- **THEN** a opção é descartada por triagem, sem stream e sem falha.

#### Scenario: Blogger sem streamingData

- **WHEN** o HTML do Blogger não publica `streamingData.formats`
- **THEN** a opção falha isoladamente e as demais continuam.

### Requirement: Contrato dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, `type` `mp4`, `provider` `Blogger`, qualidade por `qualityLabel`, idioma pelo rótulo e `headers` com o `User-Agent` da descoberta. `name`/`title` não SHALL ser informados. Rótulo sem idioma SHALL permanecer desconhecido; campos que a fonte não fornece SHALL ser omitidos.

#### Scenario: Stream dublado em 720p

- **WHEN** a opção `Dublado` resolve um formato com `qualityLabel` `720p`
- **THEN** o stream sai com `language` `Dublado`, `quality` `720p`, `type` `mp4`, `provider` `Blogger` e `format` com título, ano, temporada e episódio.

#### Scenario: Rótulo técnico

- **WHEN** a opção tem rótulo `P1`
- **THEN** o stream é preservado com `Idioma Desconhecido`.

#### Scenario: Cabeçalho de reprodução

- **WHEN** o formato do Blogger é montado
- **THEN** `headers` contém o mesmo `User-Agent` usado para abrir o HTML do Blogger e nenhum `Referer`.

#### Scenario: URL repetida

- **WHEN** duas opções resolvem a mesma URL
- **THEN** o provedor devolve um único stream.

### Requirement: Isolamento por opção e erro agregado

O provedor SHALL descartar a opção que falhar com aviso `[AnimesHD] Opção <rótulo> descartada: <causa>` e SHALL preservar as demais. Se nenhuma opção produzir stream e ao menos uma falhar, o erro agregado com as causas SHALL subir para `getStreams`. Opção só de triagem não SHALL entrar no agregado.

#### Scenario: Falha isolada

- **WHEN** a opção `Legendado` falha e a `Dublado` produz stream
- **THEN** o provedor devolve o stream dublado e registra só o aviso da opção descartada.

#### Scenario: Todas falham

- **WHEN** todas as opções conhecidas falham
- **THEN** o erro agregado cita cada causa e sobe para `getStreams`.

#### Scenario: Todas em triagem

- **WHEN** todas as opções apontam para hosts não suportados
- **THEN** o provedor devolve lista vazia, porque não houve falha.

### Requirement: Ausência reconhecida e falha fatal

O provedor SHALL devolver lista vazia para busca sem resultado, nenhum candidato confirmado, temporada ou episódio não publicado, episódio 404 e página com `h1` e sem opções. HTTP 403/5xx, erro de rede ou estrutura inesperada SHALL subir até `getStreams`, que registra `[AnimesHD]` e devolve lista vazia.

#### Scenario: Ausência na busca

- **WHEN** a busca não devolve cartões ou nenhum candidato confirma título e ano
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Bloqueio na ficha

- **WHEN** a ficha do anime responde 403
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimesHD]` e a saída é lista vazia.

#### Scenario: Falha do TMDB

- **WHEN** a consulta ao TMDB falha por chave ausente ou resposta inválida
- **THEN** o erro sobe antes de qualquer requisição à fonte.

### Requirement: Sem timeout, sonda ou cache

O provedor SHALL NOT instalar timeout próprio, `AbortController`, retentativa, sonda de mídia, cache ou settings. A qualidade SHALL vir apenas do `qualityLabel` já obtido, e a URL do Blogger SHALL ser resolvida a cada pedido.

#### Scenario: Sem limite de tempo próprio

- **WHEN** a fonte demora a responder
- **THEN** o provedor aguarda o app e não cancela nem repete a requisição.

#### Scenario: Sem sonda de mídia

- **WHEN** o formato do Blogger é montado
- **THEN** o provedor devolve a URL publicada sem `Range`, `HEAD` ou leitura do arquivo.

#### Scenario: Sem cache

- **WHEN** duas execuções resolvem o mesmo episódio
- **THEN** o provedor abre o HTML do Blogger e obtém a URL novamente.
