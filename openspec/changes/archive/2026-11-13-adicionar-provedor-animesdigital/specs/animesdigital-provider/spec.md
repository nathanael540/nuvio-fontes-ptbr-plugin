# Spec Delta

## Purpose

Localizar filmes e séries no AnimesDigital a partir do ID do TMDB, confirmar título, ano e tipo, selecionar temporada e episódio pela página de detalhe e devolver os streams HLS publicados pelo player Anivideo, sob o contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca por variantes de título

O provedor SHALL consultar `GET https://animesdigital.org/?s=<termo>` com o título PT-BR, o título original, os alternativos brasileiros e os títulos romaji do TMDB, em ordem, deduplicados por `normalizeText`. SHALL seguir o redirecionamento para `/pesquisa/<termo>/` e SHALL aceitar como candidatos os cartões `div.itemA` e `div.itemE` que tenham link e título.

#### Scenario: Título romaji encontra a obra

- **WHEN** o título PT-BR não devolve cartões e o título romaji do TMDB aparece na busca
- **THEN** o provedor usa o cartão correspondente como candidato e confirma a identidade na página de detalhe.

#### Scenario: Busca sem cartões é ausência

- **WHEN** a página de pesquisa responde 200 com `div.header_title` e nenhum `div.itemA` ou `div.itemE`
- **THEN** o provedor trata a variante como ausência e tenta a próxima.

#### Scenario: HTML de busca não reconhecido é falha

- **WHEN** a resposta não tem `div.header_title` nem cartões, ou o HTTP não é 2xx
- **THEN** o provedor lança erro de estrutura ou de rede, sem confundir com ausência.

### Requirement: Confirmação de título, ano e tipo

O provedor SHALL abrir a página de detalhe `/anime/a/<slug>` do candidato e SHALL aceitar somente quando o título (limpo de decorações como `Dublado`, `Legendado`, `Filme`, `Todos os Episódios` e sufixos de temporada) for compatível com o TMDB e o ano de `div.info` (rótulo `Ano`) estiver dentro de um ano do ano do TMDB. Candidato sem ano na página SHALL ser aceito somente quando houver um único candidato compatível.

#### Scenario: Ano divergente descarta o candidato

- **WHEN** a página do candidato informa ano 2019 e o TMDB informa 2023
- **THEN** o candidato é descartado e a busca continua.

#### Scenario: Mais de um candidato compatível

- **WHEN** dois candidatos passam no título e no ano e não é possível distingui-los pela estrutura
- **THEN** o provedor devolve lista vazia por ambiguidade, sem escolher o primeiro.

#### Scenario: Tipo confirmado pela estrutura

- **WHEN** o pedido é de filme e a página tem um único link `/video/a/<id>` e nenhum `div.item_ep`
- **THEN** o provedor usa esse link como a mídia do filme.

#### Scenario: Filme com pseudoepisódio na ficha de anime

- **WHEN** o pedido é de filme e a ficha `/anime/a/<slug>` não tem o sufixo `-filme`, mas publica um único link `/video/a/<id>` e no máximo um cartão `Episódio 01`
- **THEN** o provedor aceita a página como a mídia do filme, sem tratá-la como série.

### Requirement: Seleção de temporada e episódio

Para série, o provedor SHALL escolher o episódio pelo número declarado em `div.title_anime` (`<Título> Episódio N`), dentro dos blocos `div.item_ep`, e SHALL usar o link `/video/a/<id>` do cartão escolhido. A temporada SHALL ser aceita quando o título do candidato declarar o número (`Temporada N`, `Season N` ou sufixo numérico) ou quando a temporada pedida for 1 e não houver marcador. O provedor SHALL NOT inferir temporada por número absoluto nem por posição.

#### Scenario: Episódio escolhido pelo número do título

- **WHEN** a página lista `Episódio 24`, `Episódio 25` e `Episódio 26` fora de ordem e o pedido é o episódio 25
- **THEN** o provedor escolhe o cartão `Episódio 25`.

#### Scenario: Temporada não declarada

- **WHEN** o pedido é da temporada 2 e nenhum candidato declara `Temporada 2`, `Season 2` ou sufixo `2`
- **THEN** o provedor devolve lista vazia, sem mapear a temporada por posição.

#### Scenario: Temporada 1 sem marcador

- **WHEN** o pedido é da temporada 1 e a página de detalhe não declara temporada
- **THEN** o provedor aceita a página e escolhe o episódio pelo número.

#### Scenario: Episódio ausente

- **WHEN** a página de detalhe da série não tem cartão com o número pedido
- **THEN** o provedor devolve lista vazia.

### Requirement: Resolução do player Anivideo

O provedor SHALL localizar `iframe[src*="api.anivideo.net/videohls.php?d="]` na página do episódio ou do filme, SHALL ler o parâmetro `d` como URL de mídia e SHALL aceitar somente `http(s)`. O provedor SHALL NOT sondar a mídia, baixar a playlist nem resolver o `iframe` da rota interna `aHR0...`, que na amostra publicava um vídeo de fundo.

#### Scenario: Iframe Anivideo com manifesto no parâmetro

- **WHEN** a página publica `videohls.php?d=https%3A%2F%2Fcdn...%2Findex.m3u8`
- **THEN** o stream usa a URL decodificada do parâmetro `d`.

#### Scenario: Página sem Anivideo

- **WHEN** a página não tem iframe Anivideo e não tem nenhum outro player suportado
- **THEN** o provedor devolve lista vazia, porque a fonte reconheceu a página e não ofereceu opção no contrato.

#### Scenario: Parâmetro `d` inválido

- **WHEN** o iframe Anivideo existe mas o parâmetro `d` está vazio ou fora de `http(s)`
- **THEN** a opção é descartada com aviso; se nenhuma outra produzir stream, o erro agregado sobe.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type: 'hls'`, `provider: 'Anivideo'`, título, ano, temporada e episódio quando aplicáveis. Cabeçalhos de reprodução SHALL ser omitidos porque o manifesto respondeu 200 sem eles.

#### Scenario: Stream HLS formatado

- **WHEN** o iframe Anivideo entrega um manifesto de um episódio de série
- **THEN** o stream sai com `type` HLS, `provider` "Anivideo" e `format` com título, ano, temporada e episódio.

#### Scenario: Cabeçalhos omitidos

- **WHEN** o manifesto respondeu 200 sem `Referer` e sem `Origin`
- **THEN** o stream não traz `headers`.

### Requirement: Idioma e qualidade sem prova

O provedor SHALL classificar o idioma como `Dublado` ou `Legendado` somente quando o título do candidato ou da página declarar o termo; caso contrário, SHALL omitir o campo para a descoberta local. A qualidade SHALL vir apenas de texto já obtido; sem resolução reconhecível, o stream SHALL ser preservado como `Desconhecida`, sem requisição extra.

#### Scenario: Stream dublado

- **WHEN** o título do candidato declara `Dublado`
- **THEN** o stream sai com `language` "Dublado".

#### Scenario: Idioma não declarado

- **WHEN** o título não declara `Dublado` nem `Legendado`
- **THEN** o stream é preservado e a classificação fica a cargo da descoberta local, sem inventar português.

#### Scenario: Qualidade desconhecida

- **WHEN** o texto obtido não traz resolução reconhecível
- **THEN** o stream sai com "Desconhecida", sem requisição extra.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, candidato ambíguo, temporada não declarada, episódio ausente ou página sem player suportado. Falha de rede, HTTP fora de 2xx ou estrutura inesperada SHALL subir até `getStreams`, que registra com `[AnimesDigital]` e devolve lista vazia.

#### Scenario: Título ausente em todas as variantes

- **WHEN** as buscas terminam sem candidato confirmado
- **THEN** a saída é lista vazia, sem erro registrado.

#### Scenario: Falha de rede na busca

- **WHEN** a busca responde fora de 2xx ou o corpo não é HTML reconhecível
- **THEN** o erro sobe até `getStreams`, é registrado com `[AnimesDigital]` e a saída é lista vazia.
