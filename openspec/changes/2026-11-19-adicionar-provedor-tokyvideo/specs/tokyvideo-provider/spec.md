# Tokyvideo-provider Specification

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

### Requirement: Busca e ranking dos candidatos

O provedor SHALL buscar em `GET https://www.tokyvideo.com/br/procurar?q=<título>` com o título PT-BR do TMDB, perfil `page`. Os candidatos SHALL ser os links das fichas (`/br/video/<slug>`), deduplicados por URL. Os títulos SHALL vir dos ânclas de texto do cartão: âncoras cujo texto é somente um duração (`\d{1,3}:\d{2}(:\d{2})?`) SHALL ser ignoradas. O ranking SHALL usar `titleSimilarity` de `title-match` contra `title`, `originalTitle` e alternativos do TMDB, com regra de contenção (título do TMDB contido em `normalizeText` do título do cartão, comparando sem espaços, valendo `0,55 + razão do comprimento`); o mínimo de semelhança SHALL ser `0,6`.

#### Scenario: Busca com resultados

- **WHEN** a busca retorna cartões com títulos que confirmam o título do TMDB
- **THEN** o provedor abre as fichas em ordem de semelhança e parce com o primeiro stream válido; no máximo 3 candidatos SHALL ser abertos por execução.

#### Scenario: Busca sem resultados confirmados

- **WHEN** nenhum cartão passa no mínimo de semelhança
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Busca fora de 2xx

- **WHEN** a busca responde fora do intervalo 2xx
- **THEN** o erro SHALL subir até `getStreams`.

### Requirement: Ficha do vídeo

O provedor SHALL abrir a URL do candidato com `fetchText` (perfil `page`) e ler a JSON-LD de `<script type="application/ld+json">` (array ou objeto) em busca do objeto com `@type` `VideoObject`.

#### Scenario: Ficha com stream

- **WHEN** a ficha traz objeto `VideoObject` e `<source type="video/mp4">` com URL HTTPS
- **THEN** o provedor usa essa URL como stream.

#### Scenario: Ficha sem fonte

- **WHEN** a ficha não traz fonte MP4 reconhecida (videos bloqueados geograficamente respondem ficha sem `<source>`)
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

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format` (`FORMATTER.AUTO`, `addon` `Tokyvideo`), com título e ano do TMDB quando disponíveis, temporada e episódio do pedido em série e duração da ficha (ISO 8601 do JSON-LD, com fallback ao `data-video-duration`) quando disponível. O `type` SHALL ser `mp4`; `provider` SHALL ser o host do CDN; `headers` SHALL ser `playbackHeaders` da URL da ficha; a qualidade SHALL ser o `videoQuality` do `VideoObject` quando presente (via `normalizeQuality` do bloco quality-discovery); `language` SHALL ser omitido — o site não publica evidência de áudio — e o app SHALL obter `Idioma Desconhecido`. O `name` e o `title` SHALL ser gerados pelo formatador; `name` e `title` informados pelo provedor SHALL ser rejeitados.

#### Scenario: Stream de filme

- **WHEN** um filme é resolvido
- **THEN** cada stream leva `addon` `Tokyvideo`, título e ano do TMDB e `type` `mp4`.

#### Scenario: Stream de episódio

- **WHEN** um episódio avulso é resolvido
- **THEN** o `format` leva temporada e episódio do pedido e título do TMDB.

#### Scenario: Qualidade descoberta

- **WHEN** a ficha traz `videoQuality` `HD`
- **THEN** o stream sai com qualidade `720p` (mapeamento do bloco quality-discovery); sem `videoQuality`, sai `Desconhecida`.

#### Scenario: Campos opcionais

- **WHEN** a fonte não fornece tamanho, legendas ou outra informação opcional
- **THEN** o campo não é inventado no stream.

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
