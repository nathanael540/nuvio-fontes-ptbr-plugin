# baixetorrent-org Specification

## Purpose
Localiza filmes e séries no catálogo público baixetorrent.org por ID do TMDB e devolve streams por magnet, sem conta e sem chave.

## Requirements

### Requirement: Identificação do título no catálogo

O provedor SHALL localizar o post do catálogo que corresponde ao título do TMDB, confirmando título e ano do resultado; SHALL buscar primeiro pelo IMDb do TMDB quando disponível e depois pelos títulos PT-BR, original e alternativos do TMDB.

#### Scenario: Filme localizado

- **WHEN** a entrada é `movie` com `tmdbId` válido
- **THEN** o post aceito tem título/ano compatíveis e os magnets geram streams para o filme

#### Scenario: Série localizada

- **WHEN** a entrada é `tv` com temporada e episódio válidos
- **THEN** o post aceito corresponde à temporada e os magnets geram streams para o episódio ou pacote

#### Scenario: Coordenadas inválidas não consultam a fonte

- **WHEN** a entrada é `tv` com temporada ou episódio ausente, zero ou negativo
- **THEN** o provedor lança erro de entrada antes de qualquer requisição

### Requirement: Magnets do post

O provedor SHALL aceitar magnets publicados no HTML do post (âncoras `magnet:?xt=urn:btih:<hash>`) como streams, com hash hexadecimal de 40 caracteres; SHALL descartar magnets sem hash válido como opção.

#### Scenario: Magnet válido vira stream

- **WHEN** o post publica um magnet com hash hexadecimal de 40 caracteres
- **THEN** o stream sai com `url` magnet e `infoHash` preenchido

#### Scenario: Magnet malformado é descartado

- **WHEN** o post publica `magnet:` sem hash hexadecimal de 40 caracteres
- **THEN** esse magnet é descartado; se não sobrar opção, o provedor devolve lista vazia

### Requirement: Formatos dos streams

O provedor SHALL montar streams com `buildStream` e `format` (`template: FORMATTER.AUTO`, addon com o nome do catálogo); `name` e `title` SHALL ser gerados pelo formatador; qualidade, idioma, tamanho e caminho SHALL ser lidos dos textos da fonte e omitidos quando inexistentes.

#### Scenario: Stream de filme

- **WHEN** o post aceito publica magnet para o filme
- **THEN** o stream sai com url magnet e qualidade/idioma quando classificáveis

#### Scenario: Campos não publicados

- **WHEN** a fonte não publica tamanho, qualidade ou idioma nos rótulos
- **THEN** esses campos não aparecem no stream

### Requirement: Ausência e falhas preservadas

O provedor SHALL devolver lista vazia quando o título não tem post aceito ou o post não publica magnet com hash; SHALL lançar erro em falha de rede, HTTP fora de 2xx, resposta inválida do catálogo ou magnet não lido; somente `getStreams` SHALL capturar, registrar e devolver lista vazia.

#### Scenario: Título sem post aceito

- **WHEN** a busca não devolve post cujo título/ano confirma o título do TMDB
- **THEN** o provedor devolve lista vazia sem erro

#### Scenario: Falha do catálogo sobe

- **WHEN** a REST responde HTTP fora de 2xx ou a resposta não é a lista esperada
- **THEN** o erro sobe até `getStreams`, que registra e devolve lista vazia
