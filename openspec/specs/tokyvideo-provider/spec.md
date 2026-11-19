# tokyvideo-provider Specification

## Purpose

Localizar filmes e séries no site Tokyvideo (perfil `/br`) pela busca e fichas do site, confirmar a identidade da ficha pelo título do TMDB e devolver o stream MP4 direto publicado no `<source>` da página do vídeo.

## Requirements

### Requirement: Entrada e validação

O provedor SHALL aceitar `movie` e `tv` com `tmdbId` numérico positivo; em `tv`, temporada e episódio SHALL ser inteiros a partir de 1. Entrada inválida SHALL devolver lista vazia sem requisição externa.

#### Scenario: Pedido de filme

- **WHEN** o app chama o provedor com `mediaType` `movie` e um `tmdbId` numérico positivo
- **THEN** o provedor segue para a busca no site sem temporada nem episódio.

#### Scenario: Pedido de série

- **WHEN** o app chama o provedor com `mediaType` `tv` e temporada e episódio inteiros positivos
- **THEN** o provedor preserva as coordenadas para o `format` do stream.

#### Scenario: Entrada inválida

- **WHEN** o `tmdbId` não é numérico ou é zero, o tipo não é `movie` nem `tv`, ou a série não traz temporada e episódio válidos
- **THEN** o provedor devolve lista vazia, registra o erro de entrada e não faz requisição externa.

### Requirement: Busca de candidatos na listagem

O provedor SHALL buscar em `GET https://www.tokyvideo.com/br/procurar?q=<título>` com o título PT-BR do TMDB (perfil `page`) e extrair links únicos de `/br/video/<slug>`, ignorando âncoras cujo texto seja apenas uma duração (`\d{1,3}:\d{2}(:\d{2})?`).

#### Scenario: Busca fora de 2xx

- **WHEN** a busca responde fora do intervalo 2xx
- **THEN** o erro SHALL subir até `getStreams`.

### Requirement: Ranking e limite de candidatos

O ranking SHALL pontuar cada cartão com `titleSimilarity` (e regra de contenção em `normalizeText` sem espaços valendo `0,55 + razão do comprimento`) contra `title`, `originalTitle` e alternativos do TMDB, exigindo mínimo `0,6` e abrindo no máximo 3 fichas em ordem decrescente.

#### Scenario: Busca com resultados

- **WHEN** a busca retorna cartões com títulos que confirmam o título do TMDB
- **THEN** o provedor abre as fichas em ordem de semelhança e para no primeiro stream válido, limitando-se a 3 candidatos.

#### Scenario: Busca sem resultados confirmados

- **WHEN** nenhum cartão passa no mínimo de semelhança
- **THEN** o provedor devolve lista vazia sem erro fatal.

### Requirement: Ficha do vídeo

O provedor SHALL abrir a URL do candidato com `fetchText` (perfil `page`) e ler a JSON-LD de `<script type="application/ld+json">` (array ou objeto) em busca do objeto com `@type` `VideoObject`.

#### Scenario: Ficha com stream

- **WHEN** a ficha traz objeto `VideoObject` e `<source type="video/mp4">` com URL HTTPS
- **THEN** o provedor usa essa URL como stream.

#### Scenario: Ficha sem fonte

- **WHEN** a ficha não traz fonte MP4 reconhecida (vídeos bloqueados geograficamente respondem ficha sem `<source>`)
- **THEN** o candidato SHALL ser descartado por ausência e o próximo candidato SHALL ser aberto; sem candidato com stream, devolve lista vazia sem erro fatal.

#### Scenario: Ficha sem título publicado

- **WHEN** a ficha não traz `name` no `VideoObject` nem `<title>` legível na página
- **THEN** o provedor aceita o candidato se houver `<source>` MP4, sem checagem de título.

### Requirement: Identidade da ficha

O provedor SHALL confirmar o título da ficha pelo `name` do `VideoObject`, com fallback ao `<title>` da página: o candidato SHALL ser aceito quando `titleSimilarity(título da ficha, título do TMDB) >= 0,5` para algum dos títulos do TMDB ou quando o `normalizeText` do título do TMDB está contido no `normalizeText` do título da ficha, comparando sem espaços.

#### Scenario: Título confirmado

- **WHEN** o título da ficha e o do TMDB são semelhantes ou um contém o outro (normalizados)
- **THEN** o provedor avança para montar o stream.

#### Scenario: Título fora da regra

- **WHEN** o título da ficha não confirma nenhum título do TMDB
- **THEN** o provedor registra aviso e descarta o candidato, sem montar stream.

### Requirement: Contrato e formatação do stream

Todo stream SHALL ser montado com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `Tokyvideo`), levando título e ano do TMDB, temporada e episódio em série e duração da ficha (ISO 8601 do JSON-LD ou `data-video-duration`) quando disponíveis. `name` e `title` SHALL ser gerados apenas pelo formatador.

#### Scenario: Stream de filme

- **WHEN** um filme é resolvido
- **THEN** cada stream leva `addon` `Tokyvideo`, título e ano do TMDB e `type` `mp4`.

#### Scenario: Stream de episódio

- **WHEN** um episódio avulso é resolvido
- **THEN** o `format` leva temporada e episódio do pedido e título do TMDB.

#### Scenario: Campos opcionais

- **WHEN** a fonte não fornece tamanho, legendas ou outra informação opcional
- **THEN** o campo não é inventado no stream.

### Requirement: Metadados técnicos e cabeçalhos do stream

O stream SHALL usar `type` `mp4`, `provider` com o host do CDN, `headers` com `playbackHeaders` da URL da ficha e `quality` normalizada de `videoQuality` do `VideoObject` via `normalizeQuality`. `language` SHALL ser omitido por falta de evidência de áudio, resultando em `Idioma Desconhecido`.

#### Scenario: Qualidade descoberta

- **WHEN** a ficha traz `videoQuality` `HD`
- **THEN** o stream sai com qualidade `720p` (mapeamento do bloco quality-discovery); sem `videoQuality`, sai `Desconhecida`.

### Requirement: Ausência, falhas e log sanitizado

Ausência reconhecida SHALL devolver lista vazia sem `console.error`. Falha de rede ou HTTP da página do vídeo, falha de montagem do stream ou falha agregada SHALL subir até `getStreams`, que SHALL registrar `console.error('[Tokyvideo] ...')` e devolver lista vazia. Logs SHALL NOT conter URL de mídia, assinatura `secure`, token ou hash longo.

#### Scenario: Ausência reconhecida

- **WHEN** a busca não confirma título, ou a ficha do melhor candidato não traz fonte MP4 (inclusive ficha sem `<source>` por bloqueio geográfico)
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Falha fatal

- **WHEN** a busca falha tecnicamente, a ficha não é página legível ou o stream falha na montagem
- **THEN** `getStreams` registra `[Tokyvideo] ...` e devolve lista vazia, sem streams parciais.

#### Scenario: Logs sanitizados

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL do stream, a assinatura `secure` e hashes longos não aparecem na mensagem.
