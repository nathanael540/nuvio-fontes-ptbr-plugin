# baixacine-provider Spec Delta

## Purpose

Localizar filmes e séries do catálogo Baixa Cine (https://baixacine.com/) pelo formulário de busca e TMDB, devolvendo streams de magnet com qualidade, idioma e metadados da fonte.

## ADDED Requirements

### Requirement: Busca no catálogo

O provedor SHALL consultar o formulário do site (`https://baixacine.com/index.php?busca=<termo>`) com os títulos do `MediaInfo`, em ordem de preferência; WHEN a resposta não trouxer cartões SHALL tratar como ausência e tentar o próximo título.

#### Scenario: Busca com resultado

- **WHEN** o termo do `MediaInfo` retorna cartões no formulário de busca
- **THEN** o provedor segue para a confirmação de identidade.

#### Scenario: Busca vazia

- **WHEN** o formulário não retorna cartões para o termo
- **THEN** o provedor tenta o próximo título do `MediaInfo` sem registrar erro.

### Requirement: Confirmação de identidade e tipo

O provedor SHALL confirmar o cartão com `findBestMatch` do bloco `title-match` contra título e ano do `MediaInfo`, aceitando variantes do título do cartão sem separadores e sem sufixos de edição ou temporada. Em pedido de filme SHALL descartar cartões com "Temporada"; em pedido de série SHALL aceitar só cartões com "Temporada" e ignorar o ano do cartão. WHEN nenhum cartão corresponder SHALL devolver lista vazia sem log.

#### Scenario: Filme confirmado

- **WHEN** a busca devolve o filme do `MediaInfo` com ano dentro da tolerância do `findBestMatch`
- **THEN** o provedor consulta o post confirmado e devolve seus streams.

#### Scenario: Variante de título

- **WHEN** o cartão traz sufixo de edição ou temporada ("4K", "Legendado", "5ª Temporada")
- **THEN** a variante sem o sufixo confirma a identidade.

#### Scenario: Série com ano da temporada

- **WHEN** o cartão da série traz o ano da temporada, diferente do ano da série no `MediaInfo`
- **THEN** o provedor ignora o ano do cartão e confirma pelo título.

#### Scenario: Título não presente no catálogo

- **WHEN** nenhum resultado da busca corresponde ao `MediaInfo`
- **THEN** o provedor devolve lista vazia sem registrar aviso ou erro.

### Requirement: Extração do magnet do post

O provedor SHALL ler o post confirmado e extrair os links `magnet:?xt=urn:btih:` dos magnets do HTML; SHALL aceitar hash hexadecimal de 40 caracteres; WHEN o hash na fonte for base32 de 32 caracteres SHALL convertê-lo para hexadecimal de 40 caracteres; magnets sem `xt=urn:btih:` válido SHALL ser descartados isoladamente; WHEN o post não trouxer magnet válido SHALL lançar erro.

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

O provedor SHALL montar cada stream com `buildStream`, com qualidade descoberta localmente (`dn` do magnet e, em post de um único magnet, o valor "Qualidade"; sem correspondência, `Desconhecida`), idioma descoberto no `dn` e no valor real de "Idioma / áudio" (sem conclusão, omitido e descoberto pelo arquivo), tamanho da linha "Tamanho do arquivo" apenas em post de um único magnet, `provider` "Baixa Cine" e `type` "magnet"; o `format` SHALL carregar título e ano.

#### Scenario: Stream completo do filme O Brilho do Mar

- **WHEN** o post do "O Brilho do Mar" (2023) é confirmado
- **THEN** o stream SHALL ter `quality` `1080p`, `language` `Dublado`, `size` `2.48 GB` e `url` magnet com hash de 40 caracteres hexadecimais, e `name`/`title` gerados pelo formatador com addon "Baixa Cine".

#### Scenario: Post com vários magnets

- **WHEN** o post confirmado publica vários magnets com tamanhos combinados
- **THEN** cada stream usa a qualidade do próprio `dn` e o campo `size` fica ausente.

### Requirement: Ausência e falhas

WHEN a confirmação não seleciona post e não há magnet, SHALL ser lista vazia. Erros de rede ou parsing SHALL ser lançados; `getStreams` SHALL registrar com `console.error('[Baixa Cine] ...')` e devolver lista vazia.

#### Scenario: Post sem magnet

- **WHEN** a busca acerta o post mas o HTML não contém magnet com `xt=urn:btih:` válido
- **THEN** o provedor lança erro e `getStreams` devolve lista vazia com log de erro.

### Requirement: Contrato de entrada

O provedor SHALL validar a entrada antes de qualquer requisição: `tmdbId` numérico, `mediaType` `movie` ou `tv`; para `tv`, SHALL exigir `season` e `episode` inteiros positivos.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` inválido
- **THEN** o provedor lança erro de entrada sem fazer nenhuma requisição à fonte.
