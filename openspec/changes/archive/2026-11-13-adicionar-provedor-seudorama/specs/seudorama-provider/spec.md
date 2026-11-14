# Spec Delta

## Purpose

Consultar o catálogo SeuDorama por ID do TMDB, ler a página Blogger publicada e devolver os MP4 progressivos do Google Video com a qualidade do `itag`.

## ADDED Requirements

### Requirement: Entrada e consulta por TMDB

O provedor SHALL validar `tmdbId` numérico e SHALL aceitar somente `mediaType` `tv`; `movie` SHALL ser recusado antes de qualquer requisição. O provedor SHALL normalizar temporada e episódio para inteiros a partir de 1 e SHALL consultar `GET https://serv01.meusdoramas.club/posts/get-video.php` com `episode_number`, `season_number` e `tmdb`, `User-Agent` de navegador e `Accept: application/json, text/plain, */*`.

#### Scenario: Série encontrada

- **WHEN** a API responde 200 com `success: true` e `videoUrl` do Blogger para S01E01
- **THEN** o provedor segue para a leitura da página do Blogger.

#### Scenario: Obra fora do catálogo

- **WHEN** a API responde 200 com `success: false`
- **THEN** o provedor devolve lista vazia, sem erro.

#### Scenario: Filme recusado

- **WHEN** `mediaType` é `movie`
- **THEN** o provedor recusa a entrada sem fazer requisições.

#### Scenario: Temporada e episódio na consulta

- **WHEN** o pedido é S02E01
- **THEN** a URL da API envia `season_number=2` e `episode_number=1`.

### Requirement: Leitura da página Blogger

O provedor SHALL exigir `videoUrl` HTTP(S) com host `blogger.com`, SHALL desescapar `\uXXXX`, `\/`, `&quot;` e `&amp;` e SHALL extrair somente URLs `https://*.googlevideo.com/videoplayback` com `itag` numérico. URLs com `sabr` sem `itag` SHALL ser descartadas.

#### Scenario: Página com itag 18 e 22

- **WHEN** a página do Blogger traz URLs com `itag=18` e `itag=22` após o desescape
- **THEN** o provedor extrai as duas e mapeia para 360p e 720p.

#### Scenario: Fluxo SABR

- **WHEN** a página traz `videoplayback?sabr=...` sem `itag`
- **THEN** a URL é descartada e não vira stream.

#### Scenario: Página sem itag

- **WHEN** nenhuma URL da página tem `itag` numérico
- **THEN** a saída é lista vazia, porque não há MP4 progressivo reconhecido.

#### Scenario: Host diferente do Blogger

- **WHEN** `videoUrl` aponta para outro host
- **THEN** o provedor lança erro de estrutura em vez de tentar um player desconhecido.

### Requirement: Qualidade, deduplicação e reprodução

O provedor SHALL mapear `itag` 18/43 para 360p, 22 para 720p e 37 para 1080p, SHALL deduplicar por URL, SHALL ordenar por qualidade e SHALL incluir `headers` com o mesmo `User-Agent` da descoberta, porque o MP4 responde 403 sem ele.

#### Scenario: Duas qualidades

- **WHEN** a página traz 360p e 720p
- **THEN** o provedor devolve os dois streams, com 720p antes de 360p.

#### Scenario: URL repetida

- **WHEN** a mesma URL aparece duas vezes
- **THEN** o provedor mantém uma ocorrência.

#### Scenario: Reprodução sem UA

- **WHEN** o MP4 é pedido sem `User-Agent`
- **THEN** a fonte responde 403; o stream só é válido com o `User-Agent` nos `headers`.

#### Scenario: Itag desconhecido

- **WHEN** o `itag` não está no mapa
- **THEN** o stream é preservado com `Desconhecida`.

### Requirement: Contrato dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` `mp4`, `provider` `SeuDorama`, `quality` pelo `itag`, `headers.User-Agent`, `language` `Idioma Desconhecido` enquanto a fonte não declarar áudio/legenda e `format` com título, ano, temporada e episódio. O provedor SHALL NOT informar `name`, `title`, `size` ou `subtitles` sem dados da fonte.

#### Scenario: Stream legendado não presumido

- **WHEN** a API e o Blogger não publicam áudio nem legenda
- **THEN** o stream sai com `Idioma Desconhecido`, sem `Legendado` inventado.

#### Scenario: Campos de release

- **WHEN** o título e o ano vêm do TMDB
- **THEN** o `format` leva título, ano, temporada e episódio e o formatador gera `name`/`title`.

#### Scenario: Sem tamanho ou legendas

- **WHEN** a página não publica tamanho nem legenda
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência, erros e limites de runtime

O provedor SHALL devolver lista vazia somente para `success: false`, página sem `itag` válido ou ausência de `videoUrl` reconhecida. Falha de rede, HTTP fora de 2xx, JSON inválido, host diferente do Blogger ou HTML sem URL reconhecível SHALL subir até `getStreams`, que registra `[SeuDorama]` e devolve lista vazia. O provedor SHALL NOT instalar timeout, retentativa, cache com validade, sonda de mídia ou settings.

#### Scenario: API fora do ar

- **WHEN** a API responde HTTP 500
- **THEN** o erro sobe até `getStreams`, é registrado com `[SeuDorama]` e a saída é `[]`.

#### Scenario: JSON inválido

- **WHEN** a API responde 200 com corpo que não é JSON
- **THEN** o erro sobe como falha de estrutura.

#### Scenario: Página de bloqueio

- **WHEN** a URL do Blogger responde HTML sem `streamingData` (bloqueio, login ou página inesperada)
- **THEN** o erro sobe como falha de estrutura, e não como ausência.

#### Scenario: Sem sonda

- **WHEN** a URL do Google Video é extraída
- **THEN** o provedor não baixa o arquivo inteiro nem usa `Range` para descobrir resolução.
