# Spec Delta

## Purpose

Resolver filmes e séries no catálogo público Raflix pelo ID do TMDB, selecionar a fonte VidRift, devolver HLS com áudio dublado PT-BR ou legenda em português e reconhecer ausência sem conta, chave ou cookie.

## ADDED Requirements

### Requirement: Consulta ao catálogo Raflix por TMDB

O provedor SHALL consultar `GET https://raflix.web.id/api/media/<mediaType>/<tmdbId>` para obter título e ano e SHALL tratar HTTP 404 como ausência reconhecida. Em seguida, SHALL consultar `GET https://raflix.web.id/api/media/sources?type=<mediaType>&tmdbId=<id>` e localizar a entrada de `id` `vidrift`. Filme SHALL ser consultado sem coordenadas de episódio; série SHALL exigir temporada e episódio inteiros positivos antes de qualquer requisição.

#### Scenario: Filme consultado por TMDB

- **WHEN** a entrada é `movie` com um `tmdbId` válido
- **THEN** as consultas de metadados e de fontes usam `type=movie`, `tmdbId` e não enviam `season` nem `episode`.

#### Scenario: Série consultada com temporada e episódio

- **WHEN** a entrada é `tv` com temporada 2 e episódio 3
- **THEN** a consulta de fontes envia `type=tv`, `tmdbId`, `season=2` e `episode=3`.

#### Scenario: Coordenadas inválidas não consultam a fonte

- **WHEN** a entrada é `tv` com temporada ou episódio ausente, zero ou negativo
- **THEN** o provedor lança erro de entrada antes de qualquer requisição.

#### Scenario: Título inexistente no Raflix

- **WHEN** a consulta de metadados responde HTTP 404
- **THEN** o provedor devolve lista vazia, sem consultar o VidRift.

#### Scenario: Fonte VidRift ausente da lista

- **WHEN** a lista de fontes responde com sucesso mas não contém `id` `vidrift`
- **THEN** o provedor devolve lista vazia como ausência reconhecida.

### Requirement: Resolução no boot do VidRift

O provedor SHALL derivar o caminho de mídia da URL da fonte VidRift (`/embed/movie/<id>` ou `/embed/tv/<id>/<temporada>/<episódio>`) e consultar `GET <origem da URL da fonte>/api/boot/<caminho>`. A resposta SHALL ser lida como JSON e os campos `meta.orionStreams`, `meta.playbackToken`, `meta.unreleased`, `meta.inCinemas` e `meta.airsSoon` SHALL ser validados antes do uso. A requisição SHALL NOT usar cookie, conta, chave ou `TMDB_API_KEY`.

#### Scenario: Boot com faixas Orion

- **WHEN** o boot responde `meta.orionStreams` com ao menos uma faixa
- **THEN** o provedor usa essas faixas para selecionar áudio e legenda em português.

#### Scenario: Boot sem faixas Orion

- **WHEN** o boot responde `meta.orionStreams` nulo ou vazio
- **THEN** o provedor tenta a contingência H.264 de `/api/source`, sem tratar a resposta como ausência imediata.

#### Scenario: Título ainda não lançado

- **WHEN** o boot informa `unreleased`, `inCinemas` ou `airsSoon` como verdadeiro
- **THEN** o provedor devolve lista vazia como ausência reconhecida.

#### Scenario: Boot inválido é falha

- **WHEN** o boot responde HTTP fora de 2xx, corpo que não é JSON ou estrutura sem `meta`
- **THEN** o provedor lança erro de estrutura, sem devolver lista vazia como se fosse ausência.

### Requirement: Seleção de áudio PT-BR e legenda PT

O provedor SHALL selecionar a faixa de vídeo cujo nome contenha `Brazilian Portuguese` e devolvê-la com idioma `Dublado`. Quando não houver essa faixa, SHALL selecionar a faixa `Original` somente se houver legenda em português disponível, devolvendo-a com idioma `Legendado`. Sem áudio PT-BR nem legenda em português, a saída SHALL ser lista vazia como ausência reconhecida. Faixas de áudio em outros idiomas SHALL ser descartadas por triagem.

#### Scenario: Faixa dublada PT-BR disponível

- **WHEN** `meta.orionStreams` contém uma faixa `Orion · Brazilian Portuguese` do tipo HLS
- **THEN** o provedor devolve ao menos um stream com idioma `Dublado`.

#### Scenario: Somente legenda PT disponível

- **WHEN** não há faixa `Brazilian Portuguese` mas a faixa `Original` anuncia uma legenda de idioma `pt`
- **THEN** o provedor devolve o stream `Original` com idioma `Legendado` e a legenda PT anexada.

#### Scenario: Outro idioma não é PT-BR

- **WHEN** a única faixa é `Orion · French` e não há legenda em português
- **THEN** o provedor devolve lista vazia, sem classificar a faixa como `Legendado`.

### Requirement: Contingência H.264 via /api/source

Quando houver legenda PT disponível, o provedor SHALL tentar `/api/source` nos provedores `vela`, `titan` e `atlas`, nessa ordem, até um devolver streams. Cada stream SHALL usar `url` ou `proxyUrl` resolvido, qualidade da URL ou `maxRes`, e ser `Legendado`. A opção H.264 SHALL coexistir com a faixa `Dublado` quando ela existir.

#### Scenario: Vela devolve HLS com qualidades

- **WHEN** `vela` responde `streams` com URLs `index-s1080p`, `index-s720p` e `index-s480p`
- **THEN** o provedor devolve um stream `Legendado` para cada qualidade, com a legenda PT anexada.

#### Scenario: Primeiro provedor falha e o segundo responde

- **WHEN** `vela` responde HTTP 500 e `titan` responde streams HLS
- **THEN** o provedor descarta somente a opção `vela`, registra o aviso e devolve os streams de `titan`.

#### Scenario: Contingência ao lado do dublado

- **WHEN** há faixa `Brazilian Portuguese` e legenda PT, e `vela` responde streams HLS
- **THEN** o provedor devolve a faixa `Dublado` e os streams `Legendado` de `vela`.

#### Scenario: Nenhum provedor de contingência produz mídia

- **WHEN** `vela`, `titan` e `atlas` respondem sucesso sem streams
- **THEN** o provedor devolve a faixa `Dublado` quando ela existir ou lista vazia quando não houver, sem inventar uma URL.

#### Scenario: Todos os provedores de contingência falham

- **WHEN** `vela`, `titan` e `atlas` falham por rede ou HTTP fora de 2xx
- **THEN** o provedor preserva a faixa `Dublado` quando ela existir ou lança erro agregado com a causa de cada opção quando não houver stream algum.

### Requirement: Contrato dos streams HLS

O provedor SHALL montar cada stream com `buildStream` e `format`, informando URL absoluta, `type: "hls"`, `provider`, idioma do enum `LANGUAGE`, qualidade confiável e cabeçalhos exigidos. `name` e `title` vêm do formatador; campos ausentes são omitidos, URLs repetidas são deduplicadas e o resultado é ordenado por qualidade.

#### Scenario: Stream dublado da Orion

- **WHEN** a faixa `Brazilian Portuguese` é um HLS da Orion com `rungs` até 1080
- **THEN** o stream sai com `quality` `1080p`, `language` `Dublado`, `provider` `Orion` e `headers` com o `Referer` do VidRift.

#### Scenario: Stream legendado com legenda externa

- **WHEN** a faixa `Original` tem uma legenda PT em `subtitleListUrl`
- **THEN** o stream sai com `language` `Legendado` e `subtitles` contendo a URL absoluta, o idioma `Português` e o `Referer` exigido pela legenda.

#### Scenario: Qualidade ausente

- **WHEN** a contingência devolve um único stream sem resolução na URL e sem `maxRes`
- **THEN** o stream é preservado com `quality` `Desconhecida`.

#### Scenario: Cabeçalho só onde é necessário

- **WHEN** a contingência devolve um HLS direto que responde sem `Referer`
- **THEN** o stream não recebe `headers`, enquanto o proxy do VidRift recebe o `Referer` do site.

### Requirement: Ausência e falhas preservadas

O provedor SHALL lançar erro em falha de rede, HTTP fora de 2xx, JSON inválido ou estrutura inesperada. Somente `getStreams` SHALL capturar a falha final, registrar `[Raflix] ...` e devolver lista vazia. O provedor SHALL NOT impor limite de tempo, repetir a consulta automaticamente, manter cache das URLs de mídia ou usar conta, chave, cookie ou proxy externo.

#### Scenario: Falha HTTP sobe para getStreams

- **WHEN** a consulta de metadados ou o boot responde HTTP 500
- **THEN** o erro sobe até `getStreams`, que registra `[Raflix] ...` e devolve lista vazia.

#### Scenario: JSON inválido sobe para getStreams

- **WHEN** o boot responde HTTP 200 com corpo que não é JSON válido
- **THEN** o erro sobe até `getStreams`, sem ser convertido em ausência.

#### Scenario: URLs são renovadas a cada chamada

- **WHEN** o mesmo título é resolvido duas vezes em sequência
- **THEN** cada chamada consulta o boot e o `/api/source` de novo, sem reutilizar URL ou token anterior.
