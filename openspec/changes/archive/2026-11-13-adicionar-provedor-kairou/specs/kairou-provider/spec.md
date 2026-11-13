# Spec Delta

## Purpose

Localizar filmes e séries no catálogo Kairou pelo ID do TMDB e devolver os streams HLS e MP4 publicados pela API de extração, com qualidade, áudio e legendas.

## ADDED Requirements

### Requirement: Consulta pela API de extração

O provedor SHALL consultar `GET https://www.kairou.space/api/extract` com o ID do TMDB, `type` `movie` para filme ou `series` para série, o título PT-BR e, em série, `season` e `episode`. O parâmetro `isAnime=1` SHALL ser enviado somente quando o TMDB classificar o título como anime.

#### Scenario: Filme consultado pelo ID do TMDB

- **WHEN** o app pede o filme TMDB `550`
- **THEN** o provedor consulta `type=movie&tmdbId=550&title=<título>`, sem `season` nem `episode`.

#### Scenario: Episódio consultado com temporada e número

- **WHEN** o app pede a série TMDB `1396`, temporada `1`, episódio `1`
- **THEN** o provedor consulta `type=series&tmdbId=1396&season=1&episode=1&title=<título>`.

#### Scenario: Anime recebe a marcação da fonte

- **WHEN** o TMDB classifica o título como anime
- **THEN** a consulta inclui `isAnime=1`, além dos demais parâmetros aplicáveis.

#### Scenario: Série sem temporada ou episódio válidos

- **WHEN** o pedido é de série e `season` ou `episode` não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de qualquer requisição.

### Requirement: Reconhecimento de ausência

O provedor SHALL devolver lista vazia quando a API responder `ok: true` com `streams` vazio. Resposta HTTP fora de 2xx, corpo que não seja JSON, `ok` diferente de `true` ou `streams` que não seja lista SHALL lançar erro, sem converter falha em ausência.

#### Scenario: Título sem streams

- **WHEN** a API responde `ok: true`, `count: 0` e `streams: []`
- **THEN** o provedor devolve lista vazia, sem registrar falha.

#### Scenario: Falha HTTP na extração

- **WHEN** a API responde HTTP 503
- **THEN** o erro sobe até `getStreams`, é registrado com `[Kairou]` e a saída é lista vazia.

#### Scenario: Corpo fora do contrato

- **WHEN** a resposta não é JSON ou não traz `streams` como lista
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: API recusa a extração

- **WHEN** a resposta traz `ok: false`
- **THEN** o provedor lança erro com o motivo informado pela fonte.

### Requirement: Resolução da URL de reprodução

O provedor SHALL resolver URLs relativas contra `https://www.kairou.space` e preservar URLs absolutas como publicadas. A URL de reprodução SHALL ser mantida como a fonte a entrega, inclusive o proxy público `/api/proxy`, e SHALL usar apenas HTTP(S).

#### Scenario: URL relativa do proxy

- **WHEN** a fonte devolve `/api/proxy?url=<mídia>`
- **THEN** o stream sai com `https://www.kairou.space/api/proxy?url=<mídia>`.

#### Scenario: URL absoluta de player

- **WHEN** a fonte devolve uma URL HTTP(S) absoluta, como o bridge HLS do pstream
- **THEN** o stream preserva a URL sem reescrevê-la.

#### Scenario: Esquema não suportado

- **WHEN** a URL de reprodução não usa HTTP nem HTTPS
- **THEN** o provedor lança erro em vez de montar o stream.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, usando `quality` pelo texto da fonte quando ele declarar uma resolução reconhecível, `language` pela classificação de áudio, `provider` pela origem e `type` quando a fonte o declarar. Campos que a fonte não fornece SHALL ser omitidos.

#### Scenario: Stream dublado em 1080p

- **WHEN** a fonte devolve uma opção `quality: "1080p"`, `isDub: true` e `type: "mp4"`
- **THEN** o stream sai com `quality` "1080p", `language` "Dublado" e `type` "mp4".

#### Scenario: Stream legendado com legenda PT

- **WHEN** a opção tem `isDub: false` e oferece legenda `pt` ou `pt-BR`
- **THEN** o stream sai com `language` "Legendado".

#### Scenario: Stream sem áudio PT e sem legenda PT

- **WHEN** a opção tem `isDub: false` e não oferece legenda em português
- **THEN** o stream sai com `language` "Gringo".

#### Scenario: Qualidade não informada

- **WHEN** a fonte não informa `quality` nem `is4k`
- **THEN** o stream é preservado com "Desconhecida", sem descarte e sem requisição extra.

#### Scenario: Rótulo de qualidade sem resolução

- **WHEN** a fonte informa `quality` com um rótulo que não declara resolução, como `Auto`
- **THEN** o provedor trata a qualidade como não informada, preserva o stream e usa a descoberta local ou "Desconhecida".

### Requirement: Triagem de 4K

O provedor SHALL descartar, por triagem, as opções marcadas com `is4k: true` ou qualidade `4K`, porque a fonte as reserva a assinantes. O descarte não SHALL contar como falha; se todas as opções forem 4K, a saída SHALL ser lista vazia.

#### Scenario: 4K entre opções 1080p

- **WHEN** a resposta traz uma opção 4K e três opções 1080p
- **THEN** o provedor devolve as três 1080p e descarta a 4K, sem aviso de falha.

#### Scenario: Somente 4K

- **WHEN** todas as opções da resposta são 4K
- **THEN** o provedor devolve lista vazia, sem tratar como ausência de título nem como erro.

### Requirement: Legendas externas

O provedor SHALL incluir as legendas da lista do próprio stream ou, na ausência dela, as legendas da resposta, com a URL resolvida contra `https://www.kairou.space`, o rótulo da fonte como `name` e o idioma normalizado a partir de `lang`. Legendas sem URL HTTP(S) válida SHALL ser descartadas.

#### Scenario: Legenda PT-BR convertida em VTT

- **WHEN** a fonte devolve `lang: "pt-BR"`, `label: "Português (Brasil) · Opção 1"` e URL `/api/proxy?format=vtt&url=<legenda>`
- **THEN** o stream inclui uma legenda com `language` "Português (Brasil)", o rótulo como `name` e a URL absoluta do proxy.

#### Scenario: Sem legendas

- **WHEN** a resposta não traz legendas
- **THEN** o campo `subtitles` não aparece no stream.

### Requirement: Isolamento por opção

O provedor SHALL validar cada item de `streams` como uma opção independente. Item inválido SHALL ser descartado com aviso `[Kairou] Opção <id> descartada: <causa>`, preservando as demais; se nenhuma opção produzir stream e alguma tiver falhado, o erro agregado SHALL subir para `getStreams`.

#### Scenario: Uma opção inválida entre várias válidas

- **WHEN** a resposta traz cinco streams e um deles tem URL fora de HTTP(S)
- **THEN** os quatro válidos são devolvidos e o inválido gera apenas o aviso de descarte.

#### Scenario: Todas as opções inválidas

- **WHEN** todos os streams da resposta falham na validação
- **THEN** o provedor lança erro com a causa de cada opção, em vez de devolver lista vazia.

### Requirement: Deduplicação e ordenação

O provedor SHALL remover streams com a mesma URL resolvida, mantendo a primeira ocorrência devolvida pela fonte, e SHALL ordenar a lista final da maior para a menor qualidade.

#### Scenario: Mesma URL para dublado e legendado

- **WHEN** a fonte devolve duas opções com a mesma URL, uma dublada e outra legendada
- **THEN** o provedor devolve um único stream, o primeiro da resposta.

#### Scenario: Ordenação por qualidade

- **WHEN** a lista final, depois da triagem, contém `720p`, `1080p` e `480p`
- **THEN** a saída começa por `1080p`, depois `720p` e depois `480p`.

### Requirement: Fronteira de erro

O provedor SHALL lançar erros internos com mensagem clara e SHALL deixar somente `getStreams` capturar a falha final, registrar com `[Kairou]` e devolver lista vazia. O provedor não SHALL impor limite de tempo próprio.

#### Scenario: Tipo de mídia inválido

- **WHEN** `mediaType` não é `movie` nem `tv`
- **THEN** o erro sobe até `getStreams`, é registrado com `[Kairou]` e a saída é lista vazia.

#### Scenario: Falha da consulta à API

- **WHEN** a única consulta à API falha antes de devolver streams
- **THEN** não há resultado parcial: o erro sobe até `getStreams` e a saída é lista vazia.
