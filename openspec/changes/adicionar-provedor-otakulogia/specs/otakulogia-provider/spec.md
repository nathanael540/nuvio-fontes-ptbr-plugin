# Spec Delta

## Purpose

Localizar filmes e séries de anime no catálogo Otakulogia pelo GraphQL público, confirmar a identidade por título e ano, selecionar temporada e episódio pelos dados declarados e devolver os MP4 diretos com qualidade e áudio informados pela fonte.

## ADDED Requirements

### Requirement: Transporte GraphQL

O provedor SHALL consultar `POST https://api.otakulogia.com/graphql` com corpo JSON `{query, variables}`, `User-Agent` de navegador, `Origin: https://otakulogia.com` e `Referer: https://otakulogia.com/`. Resposta com `errors` não vazio, `data` ausente ou `data` fora de objeto SHALL lançar erro de estrutura, em vez de devolver ausência.

#### Scenario: Resposta com erros GraphQL

- **WHEN** o endpoint responde HTTP 200 com `errors` não vazio
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: Resposta sem `data`

- **WHEN** o endpoint responde JSON sem `data` ou com `data` nulo
- **THEN** o provedor lança erro de estrutura, em vez de tratar como título inexistente.

#### Scenario: Corpo não JSON

- **WHEN** o endpoint responde um corpo que não é JSON válido
- **THEN** o erro de leitura sobe até `getStreams`, é registrado com `[Otakulogia]` e a saída é lista vazia.

### Requirement: Consulta de busca

A busca SHALL usar `query SearchAnimes($input: SearchAnimesInput) { searchAnimes(input: $input) { total items { id upstreamCid name slug nameEn year audioMix } } }` com variáveis `{"input": {"query": "<título>", "limit": 12}}` e ler `data.searchAnimes.items[]`.

#### Scenario: Filme consultado pela busca

- **WHEN** o app pede o filme TMDB `129`
- **THEN** o provedor envia um `POST` de busca com `input.query` igual ao título do TMDB e `input.limit` igual a `12`, sem temporada nem episódio nas variáveis.

#### Scenario: Busca sem itens

- **WHEN** a busca responde `data.searchAnimes` nulo ou com `items: []`
- **THEN** o provedor trata como ausência daquele termo, sem erro de estrutura.

#### Scenario: Busca fora do esquema

- **WHEN** `data.searchAnimes.items` não é lista
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

### Requirement: Consulta de detalhe

O detalhe SHALL usar `query AnimeCatalogDetail($upstreamCid: Int!, $upstreamTid: Int) { animeCatalogDetail(upstreamCid: $upstreamCid, upstreamTid: $upstreamTid) { anime { name year } seasons { upstreamTid name audioType } episodes { episodeNumber upstreamTempId videoUrl videoUrlFhd videoUrlSd videoType audioType } } }` com variáveis `{"upstreamCid": <inteiro>, "upstreamTid": null}`.

#### Scenario: Série consultada pelo detalhe

- **WHEN** a busca confirma um item de série com `upstreamCid` inteiro
- **THEN** o provedor envia o detalhe com esse `upstreamCid` inteiro e `upstreamTid` nulo, sem consultar temporada por temporada.

#### Scenario: Detalhe nulo

- **WHEN** o endpoint responde `animeCatalogDetail: null` para um item confirmado
- **THEN** o provedor trata o item como ausência, sem falha de estrutura.

#### Scenario: Detalhe fora do esquema

- **WHEN** `animeCatalogDetail` existe, mas `seasons` ou `episodes` não é lista
- **THEN** o provedor trata como falha daquele candidato, com aviso, e preserva os demais.

### Requirement: Termos de busca e parada

O provedor SHALL montar os termos com o título PT-BR, o título original, os títulos alternativos brasileiros e os romaji do TMDB, sem repetição pelo texto normalizado e com no máximo oito termos. As buscas SHALL rodar em paralelo e a leitura SHALL parar no primeiro termo, na ordem do TMDB, que tiver item confirmado. No máximo três itens confirmados SHALL seguir para o detalhe.

#### Scenario: Primeiro termo com correspondência

- **WHEN** o título PT-BR devolve um item confirmado e um termo alternativo posterior também teria correspondência
- **THEN** o provedor usa o primeiro termo na ordem do TMDB e não abre os itens do termo posterior.

#### Scenario: Falha isolada de um termo de busca

- **WHEN** um termo falha por HTTP ou rede, mas outro termo devolve um item confirmado
- **THEN** o item confirmado é usado, a falha do termo gera apenas aviso e o pedido não é interrompido.

#### Scenario: Todas as buscas falham

- **WHEN** nenhum termo devolve correspondência e pelo menos uma busca falhou
- **THEN** o provedor lança erro agregado com as causas, em vez de devolver ausência.

#### Scenario: Termos repetidos

- **WHEN** o TMDB repete o mesmo título normalizado no original e nos alternativos
- **THEN** o provedor consulta esse termo uma única vez.

### Requirement: Confirmação por título e ano

O provedor SHALL comparar `name` e `nameEn` de cada item com os títulos do TMDB por igualdade normalizada e SHALL aceitar diferença de até um ano quando os dois lados tiverem ano. Item com ano fora da tolerância SHALL ser descartado, mesmo com título igual.

#### Scenario: Correspondência pelo `name`

- **WHEN** um item da busca tem `name` igual ao título PT-BR do TMDB após a normalização e o ano dentro da tolerância
- **THEN** o item é confirmado e o detalhe é consultado.

#### Scenario: Correspondência pelo `nameEn`

- **WHEN** o `name` não coincide, mas `nameEn` é igual ao título original ou a um alternativo do TMDB após a normalização
- **THEN** o item é confirmado.

#### Scenario: Ano fora da tolerância

- **WHEN** o item e o TMDB têm ano e a diferença é maior que um
- **THEN** o item é descartado, mesmo com título igual.

#### Scenario: Nenhuma correspondência

- **WHEN** todos os termos de busca terminam com sucesso e nenhum item coincide por título e ano
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Seleção de temporada

O provedor SHALL selecionar as linhas de `seasons` cujo `name` seja `Temporada N`, aceitando zeros à esquerda e sufixo após `|`, ou `Filme` em pedido de filme. A seleção SHALL usar o número pedido, nunca a posição no array, e os episódios SHALL ser filtrados por `upstreamTempId` igual ao `upstreamTid` da linha selecionada. Nome fora desse formato SHALL resultar em ausência, sem mapeamento por posição ou numeração absoluta.

#### Scenario: Segunda temporada entre duas

- **WHEN** o detalhe traz `Temporada 1` e `Temporada 2` e o app pede a temporada `2`
- **THEN** o provedor usa apenas os episódios da linha `Temporada 2`.

#### Scenario: Temporada com zero à esquerda e pipe

- **WHEN** a linha se chama `Temporada 01 | Dublado` e o app pede a temporada `1`
- **THEN** a linha é aceita e seus episódios entram na seleção.

#### Scenario: Temporada ausente

- **WHEN** o detalhe não tem nenhuma linha com o número pedido
- **THEN** o provedor devolve lista vazia, sem erro.

#### Scenario: Nome de temporada fora do padrão

- **WHEN** a única linha candidata se chama `Season 2` ou `Arco 2`
- **THEN** o provedor devolve lista vazia, em vez de escolher pela posição.

### Requirement: Seleção de episódio

O provedor SHALL selecionar o episódio pelo número extraído da URL de `videoUrl` (último token numérico antes de `.mp4`, aceitando `1.mp4` e `ep01.mp4`), após ordenar os episódios da temporada por esse número. A sequência SHALL ser contígua, começando em 1, e o número pedido SHALL existir nela; caso contrário, a saída SHALL ser lista vazia. `episodeNumber` SHALL NOT ser usado para seleção, porque a fonte pode repetir o total de episódios da temporada em todos os itens.

#### Scenario: Episódios fora de ordem na lista

- **WHEN** os episódios da temporada estão fora de ordem e as URLs trazem `3.mp4`, `1.mp4` e `2.mp4`
- **THEN** o provedor ordena por 1, 2, 3 e escolhe `2.mp4` para o episódio 2.

#### Scenario: URL com prefixo `ep`

- **WHEN** as URLs da temporada são `ep01.mp4` a `ep61.mp4`
- **THEN** o provedor extrai 1 a 61 e escolhe `ep05.mp4` para o episódio 5.

#### Scenario: `episodeNumber` repetido

- **WHEN** todos os episódios da temporada têm `episodeNumber` 61 e as URLs `ep01.mp4` a `ep61.mp4`
- **THEN** o provedor ignora `episodeNumber` e escolhe `ep05.mp4` para o episódio 5.

#### Scenario: URL com buraco

- **WHEN** as URLs da temporada são `1.mp4`, `2.mp4` e `4.mp4` e o app pede o episódio 3
- **THEN** o provedor devolve lista vazia, sem usar a posição como palpite.

#### Scenario: Episódio pedido em outra temporada

- **WHEN** o episódio existe na temporada 1, mas o app pede a temporada 2
- **THEN** o provedor não reutiliza o episódio da temporada 1 e devolve ausência se a temporada 2 não o tiver.

### Requirement: Filme em `Filme` ou em temporada de episódio único

Em pedido de filme, o provedor SHALL considerar as linhas de `seasons` cujo `name` seja `Filme`, aceitando sufixo após `|`, e os episódios cujo `upstreamTempId` seja igual ao `upstreamTid` da linha. Se não houver linha `Filme`, o provedor SHALL aceitar a temporada que tenha exatamente um episódio, somente quando houver exatamente uma candidata; duas ou mais SHALL resultar em ausência. Todas as URLs distintas SHALL ser devolvidas como opções, sem o teto de quatro do addon de origem.

#### Scenario: Filme com duas linhas `Filme`

- **WHEN** o detalhe traz `Filme | Dublado` e `Filme | Legendado` com `upstreamTid` distintos
- **THEN** o provedor considera os episódios das duas linhas e devolve as URLs distintas.

#### Scenario: URLs duplicadas no filme

- **WHEN** duas linhas `Filme` apontam para a mesma URL
- **THEN** o provedor devolve uma única opção.

#### Scenario: Filme em temporada de episódio único

- **WHEN** o detalhe não tem linha `Filme` e tem exatamente uma temporada com um único episódio
- **THEN** o provedor devolve a URL desse episódio como opção de filme.

#### Scenario: Duas temporadas de episódio único

- **WHEN** o detalhe não tem linha `Filme` e tem duas temporadas com um episódio cada
- **THEN** o provedor devolve lista vazia, por ambiguidade.

#### Scenario: Filme sem temporada `Filme` nem episódio único

- **WHEN** o detalhe não tem nenhuma linha `Filme` e não tem exatamente uma temporada de episódio único
- **THEN** o provedor devolve lista vazia, sem tratar como falha.

### Requirement: Montagem dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, sem `name` nem `title`, com `type` `mp4`. O `format` SHALL conter `FORMATTER.AUTO`, `addon` `Otakulogia`, o título do TMDB, o ano quando houver e temporada/episódio em série.

#### Scenario: Stream montado pelo contrato

- **WHEN** uma opção válida é resolvida
- **THEN** o stream sai com `type` `mp4` e `name`/`title` gerados pelo formatador, sem campos informados pelo provedor.

#### Scenario: Filme sem temporada no `format`

- **WHEN** o pedido é de filme
- **THEN** o `format` não inclui temporada nem episódio.

### Requirement: Escolha da URL e qualidade

A URL SHALL ser o primeiro endereço HTTP(S) válido entre `videoUrl`, `videoUrlFhd` e `videoUrlSd`. A qualidade SHALL ser `FHD` quando a URL usada for `videoUrlFhd` e `SD` quando for `videoUrlSd`; sem correspondência, o campo SHALL ser omitido. Nenhuma requisição extra SHALL ser feita para descobrir qualidade.

#### Scenario: URL principal disponível

- **WHEN** o episódio traz `videoUrl` HTTP(S) válida
- **THEN** o stream usa `videoUrl`.

#### Scenario: `videoUrl` vazio com FHD

- **WHEN** `videoUrl` está vazio e `videoUrlFhd` é HTTP(S) válida
- **THEN** o stream usa `videoUrlFhd` e qualidade `FHD`.

#### Scenario: Qualidade FHD normalizada

- **WHEN** a URL usada é a de `videoUrlFhd`
- **THEN** a qualidade informada é `FHD` e o contrato a normaliza para `1080p`.

#### Scenario: Qualidade SD normalizada

- **WHEN** a URL usada é a de `videoUrlSd`
- **THEN** a qualidade informada é `SD` e o contrato a normaliza para `480p`.

#### Scenario: Qualidade sem correspondência

- **WHEN** a URL usada não é igual a `videoUrlFhd` nem a `videoUrlSd`
- **THEN** o campo `quality` é omitido e a descoberta local decide, sem requisição extra.

#### Scenario: FHD e SD iguais

- **WHEN** `videoUrlFhd` e `videoUrlSd` são iguais e a URL usada coincide com ambos
- **THEN** a qualidade informada é `FHD`.

### Requirement: Idioma e cabeçalhos

O idioma SHALL ser `Dublado` para `audioType` igual a `DUB` e `Legendado` para `LEG`, com fallback para o `audioType` da temporada; sem marcação, o campo SHALL ser omitido. Os cabeçalhos SHALL conter `User-Agent` e, somente quando a verificação mínima comprovar necessidade, `Referer` de `https://otakulogia.com/`; `Origin` SHALL NOT ser enviado.

#### Scenario: Áudio dublado

- **WHEN** o episódio ou a temporada traz `audioType` igual a `DUB`
- **THEN** o stream sai com `language` `Dublado`.

#### Scenario: Áudio legendado

- **WHEN** o episódio ou a temporada traz `audioType` igual a `LEG`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Áudio desconhecido

- **WHEN** o episódio e a temporada não trazem `audioType` reconhecível
- **THEN** o campo `language` é omitido e o contrato devolve `Idioma Desconhecido`.

#### Scenario: Cabeçalhos de reprodução sem `Referer` comprovado

- **WHEN** o stream é montado e a verificação mínima não comprovou a exigência de `Referer`
- **THEN** `headers` contém `User-Agent` e não contém `Referer` nem `Origin`.

#### Scenario: Cabeçalhos de reprodução com `Referer` comprovado

- **WHEN** a verificação mínima comprova que o MP4 exige `Referer`
- **THEN** `headers` contém `User-Agent` e `Referer` de `https://otakulogia.com/`, sem `Origin`.

### Requirement: Deduplicação e ordenação

O provedor SHALL remover streams com a mesma URL exata, mantendo a primeira ocorrência, e SHALL ordenar a lista final da maior para a menor qualidade.

#### Scenario: Mesma URL em duas opções

- **WHEN** dois episódios ou duas linhas de temporada apontam para a mesma URL
- **THEN** o provedor devolve um único stream.

#### Scenario: Ordenação por qualidade

- **WHEN** a lista final contém `480p`, `1080p` e `Desconhecida`
- **THEN** a saída começa por `1080p`, depois `480p` e por último `Desconhecida`.

### Requirement: Isolamento por candidato e fronteira de erro

O provedor SHALL isolar a falha de cada detalhe com `console.warn('[Otakulogia] Opção <upstreamCid> descartada: <causa>')` e preservar os demais. Se nenhum candidato produzir stream e algum tiver falhado, o erro agregado SHALL subir. Somente `getStreams` SHALL capturar a falha final, registrar com `[Otakulogia]` e devolver lista vazia. O provedor não SHALL impor timeout, retentativa ou cache próprios.

#### Scenario: Um detalhe falha entre dois

- **WHEN** dois itens são confirmados, um detalhe falha e o outro produz stream
- **THEN** o stream do detalhe válido é devolvido e a falha gera apenas o aviso de descarte.

#### Scenario: Todos os detalhes falham

- **WHEN** todos os itens confirmados falham no detalhe
- **THEN** o provedor lança erro agregado com a causa de cada candidato, em vez de devolver lista vazia.

#### Scenario: Itens removidos sem falha

- **WHEN** os detalhes respondem nulo ou não têm a temporada pedida, sem erro de rede ou estrutura
- **THEN** o provedor devolve lista vazia, sem erro agregado.

#### Scenario: Tipo de mídia inválido

- **WHEN** `mediaType` não é `movie` nem `tv`
- **THEN** o erro sobe até `getStreams`, é registrado com `[Otakulogia]` e a saída é lista vazia.

#### Scenario: Série sem temporada ou episódio válidos

- **WHEN** o pedido é de série e `season` ou `episode` não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de qualquer requisição.

#### Scenario: Falha HTTP ou limite de requisições

- **WHEN** uma busca ou um detalhe responde HTTP 429 ou 5xx
- **THEN** a falha sobe como erro da etapa ou da opção, nunca como ausência.
