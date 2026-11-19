# baixacine-provider Spec Delta

## Purpose

Localizar filmes e séries do catálogo Baixa Cine (https://baixacine.com/) por busca HTML e TMDB, devolvendo streams de magnet com qualidade, idioma e metadados da fonte.

## ADDED Requirements

### Requirement: Busca e confirmação de identidade

O provedor SHALL buscar na página de busca do site (`https://baixacine.com/?s=<termo>`) com o título do `MediaInfo` e confirmar a identidade entre os resultados usando título e ano da fonte (`title`/`year`) contra `findBestMatch` do bloco `title-match`; WHEN nenhum resultado passar SHALL retornar lista vazia, e WHEN existirem resultados com título sem correspondência SHALL retornar lista vazia sem log.

#### Scenario: Filme confirmado

- **WHEN** a busca devolve o filme do `MediaInfo` com ano dentro da tolerância do `findBestMatch`
- **THEN** o provedor consulta o post confirmado e devolve seus streams.

#### Scenario: Título não presente no catálogo

- **WHEN** nenhum resultado da busca corresponde ao `MediaInfo`
- **THEN** o provedor devolve lista vazia sem registrar aviso ou erro.

#### Scenario: Resultado sem correspondência

- **WHEN** a busca devolve resultados, mas nenhum tem título/ano que corresponda ao `MediaInfo`
- **THEN** o provedor devolve lista vazia sem log.

### Requirement: Extração do magnet do post

O provedor SHALL ler o post confirmado e extrair os links `magnet:?xt=urn:btih:` dos magnets do HTML; SHALL aceitar hash hexadecimal de 40 caracteres; WHEN o hash na fonte for base32 de 32 caracteres SHALL convertê-lo para hexadecimal de 40 caracteres; magnets sem `xt=urn:btih:` valido SHALL ser descartados isoladamente; WHEN o post não trazer magnet válido SHALL lançar erro.

#### Scenario: Magnet com hash hexadecimal

- **WHEN** o post publica `magnet:?xt=urn:btih:<hash40hex>`
- **THEN** o stream SHALL acompanhar o hash em `infoHash` e `url`.

#### Scenario: Magnet com hash base32

- **WHEN** o post publica `magnet:?xt=urn:btih:<hash32b32>`
- **THEN** o provedor converte o hash para hexadecimal de 40 caracteres em `infoHash` e no `xt` de `url`.

#### Scenario: Post sem magnet

- **WHEN** o post confirmado não traz magnet com `xt=urn:btih:` válido
- **THEN** o provedor lança erro agregado; não há stream.

### Requirement: Metadados e montagem dos streams

O provedor SHALL montar cada stream com `buildStream`, com qualidade descoberta localmente nos textos obtidos (`dn` do magnet e textos da fonte; sem correspondência, `Desconhecida`), idioma descoberto nos textos da fonte (`Dublado`, `Legendado` ou afins do enum), tamanho textual da fonte, `provider` "Baixa Cine" e `type` "magnet"; os campos `format` SHALL carregar o máximo de detalhes que a fonte traz (título, ano).

#### Scenario: Stream completo do filme O Brilho do Mar

- **WHEN** o post do "O Brilho do Mar" (2023) é confirmado
- **THEN** o stream SHALL ter `quality` `1080p`, `language` `Dublado`, `size` `2.48 GB` e `url` magnet com hash de 40 caracteres hexadecimais, e `name`/`title` gerados pelo formatador com addon "Baixa Cine".

### Requirement: Ausência e falhas

WHEN a confirmação não seleciona post e não há magnet, SHALL ser lista vazia. Erros de rede ou parsing SHALL ser lançados; `getStreams` SHALL registrar com `console.error('[Baixacine] ...')` e devolver lista vazia.

#### Scenario: Magnet de post sem resultados

- **WHEN** a busca acerta o post mas o HTML não contém magnet com `xt=urn:btih:` válido
- **THEN** o provedor lança erro e `getStreams` devolve lista vazia com log de erro.

### Requirement: Contrato de entrada

O provedor SHALL validar a entrada antes de qualquer requisição: `tmdbId` numérico, `mediaType` `movie` ou `tv`; para `tv`, SHALL exigir `season` e `episode` inteiros positivos.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` inválido
- **THEN** o provedor lança erro de entrada sem fazer nenhuma requisição à fonte.
