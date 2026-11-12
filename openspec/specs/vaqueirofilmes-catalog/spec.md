# vaqueirofilmes-catalog Specification

## Purpose
Encontrar o filme pedido no catálogo WordPress da VaqueiroFilmes e confirmar sua identidade antes de resolver qualquer player.

## Requirements

### Requirement: Busca no catálogo WordPress

O provedor SHALL consultar `wp-json/wp/v2/search` com o título PT-BR do TMDB e `subtype=movie`, lendo até 40 resultados em páginas de 20. Se a primeira consulta não produzir candidato confirmado, SHALL repetir com o título original. Nenhum candidato confirmado nas duas consultas é ausência reconhecida; erro HTTP, JSON inválido ou resposta sem lista SHALL ser tratado como falha.

#### Scenario: Título PT-BR encontra candidatos

- **WHEN** a busca por título PT-BR retorna ao menos um resultado com `subtype=movie`
- **THEN** o provedor segue para a confirmação de identidade sem consultar o título original.

#### Scenario: Fallback para título original

- **WHEN** a busca por título PT-BR não produz candidato confirmado
- **THEN** o provedor consulta o título original e avalia os candidatos retornados.

#### Scenario: Ausência nas duas buscas

- **WHEN** nenhum candidato das buscas por título PT-BR e original é confirmado
- **THEN** o provedor reconhece ausência e não produz streams.

#### Scenario: Falha não vira ausência

- **WHEN** a busca responde HTTP fora de 2xx, JSON inválido ou objeto sem lista de resultados
- **THEN** o provedor lança erro e não devolve lista vazia como se o título não existisse.

### Requirement: Confirmação de título e ano

Os candidatos SHALL ser ordenados por similaridade com os títulos conhecidos e no máximo três SHALL ser abertos na página do filme. Um candidato é aceito somente se o tipo for `movie`, o ano extraído da página coincidir com o ano do TMDB (quando conhecido) e o título corresponder ao título PT-BR, original ou alternativo. Se exatamente um candidato passar, ele é aceito; se nenhum passar, o resultado é ausência; se mais de um passar, o resultado também é ausência por ambiguidade.

#### Scenario: Candidato confirmado

- **WHEN** exatamente um candidato declara o mesmo ano do TMDB e um título conhecido
- **THEN** ele é aceito e segue para a resolução de players.

#### Scenario: Ano divergente

- **WHEN** a página do candidato declara ano diferente do TMDB
- **THEN** o candidato é descartado, mesmo que o título seja igual.

#### Scenario: Resultado de série

- **WHEN** um resultado da busca tem `subtype` diferente de `movie`
- **THEN** ele é descartado e não gera stream.

#### Scenario: Ambiguidade sem correspondência única

- **WHEN** mais de um candidato passa pela confirmação e nenhum é a correspondência exata de título e ano
- **THEN** o provedor reconhece ausência em vez de escolher o primeiro resultado.

### Requirement: Somente filmes

O provedor SHALL atender apenas pedidos `movie`. Pedido `tv` SHALL ser recusado como fora do contrato do provedor, sem consultar o catálogo e sem tratar a recusa como ausência da fonte.

#### Scenario: Pedido de filme

- **WHEN** o app solicita um `movie` com TMDB válido
- **THEN** o provedor consulta o catálogo e segue o fluxo de resolução.

#### Scenario: Pedido de série

- **WHEN** o app solicita `tv`
- **THEN** o provedor registra a recusa e retorna lista vazia sem consultar o catálogo.
