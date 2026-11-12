# cineagora-catalog Specification

## Purpose

Localizar filmes e séries do CineAgora a partir dos dados do TMDB, confirmando tipo, título, ano e IMDb antes de abrir o player.

## Requirements

### Requirement: Busca pelo IMDb e fallback por título

O provedor SHALL consultar a busca do catálogo com o IMDb informado pelo TMDB. Sem candidato confirmado, SHALL consultar o título PT-BR e, se diferente, o título original. Cada consulta SHALL usar no máximo a primeira página de resultados.

#### Scenario: IMDb encontra o título

- **WHEN** o TMDB informa um IMDb presente no catálogo
- **THEN** o provedor confirma o candidato correspondente sem consultar os títulos.

#### Scenario: IMDb sem resultado

- **WHEN** a busca pelo IMDb não devolve candidato confirmado
- **THEN** o provedor consulta o título PT-BR do TMDB.

#### Scenario: Fallback para o título original

- **WHEN** a busca pelo título PT-BR não confirma nenhum candidato e o título original é diferente
- **THEN** o provedor consulta o título original.

#### Scenario: Nenhuma variante encontra o título

- **WHEN** IMDb, título PT-BR e título original terminam sem candidato confirmado
- **THEN** o provedor reconhece ausência e não produz streams.

### Requirement: Confirmação de identidade e tipo

Candidatos SHALL pertencer à seção do tipo pedido: `/filmes-hd-online/` para filme e `/series-online-hd-gratis/` para série. No máximo três SHALL ser abertos. O candidato SHALL ter o mesmo IMDb do TMDB quando conhecido, título compatível e ano igual quando conhecido.

#### Scenario: Filme confirmado

- **WHEN** exatamente um resultado da seção de filmes tem o IMDb, o título e o ano do TMDB
- **THEN** ele é aceito e segue para a descoberta de espelhos.

#### Scenario: Série confirmada

- **WHEN** exatamente um resultado da seção de séries tem o IMDb, o título e o ano do TMDB
- **THEN** ele é aceito e segue para a seleção do episódio.

#### Scenario: Resultado de outra seção

- **WHEN** um resultado aponta para notícia, coleção ou seção de tipo diferente do pedido
- **THEN** ele é descartado sem interromper a avaliação dos demais.

#### Scenario: IMDb divergente

- **WHEN** a página do candidato informa IMDb diferente do TMDB
- **THEN** o candidato é descartado, mesmo com título parecido.

#### Scenario: Ano divergente

- **WHEN** a página do candidato informa ano diferente do TMDB
- **THEN** o candidato é descartado, mesmo com o mesmo título.

#### Scenario: Ambiguidade

- **WHEN** mais de um candidato passa pela confirmação
- **THEN** o provedor reconhece ausência em vez de escolher o primeiro.

### Requirement: Entrada e coordenadas do pedido

Pedido `movie` SHALL ignorar temporada e episódio. Pedido `tv` SHALL exigir temporada e episódio inteiros a partir de 1 antes de consultar o catálogo; valor ausente ou inválido SHALL ser erro, não ausência.

#### Scenario: Filme

- **WHEN** o app solicita `movie` com TMDB válido
- **THEN** o provedor consulta o catálogo sem exigir temporada ou episódio.

#### Scenario: Série com coordenadas válidas

- **WHEN** o app solicita `tv` com temporada e episódio inteiros a partir de 1
- **THEN** o provedor consulta o catálogo e segue para a seleção do episódio.

#### Scenario: Série sem coordenadas

- **WHEN** o pedido `tv` traz temporada ou episódio ausente, zero ou fracionário
- **THEN** o provedor lança erro antes de qualquer requisição ao catálogo.

### Requirement: Ausência reconhecida e falhas preservadas

Busca vazia, nenhum candidato confirmado e candidato que não pertence ao tipo pedido SHALL ser ausência. HTTP fora de 2xx, HTML sem os marcadores esperados, JSON inválido e página de candidato ilegível SHALL ser erro.

#### Scenario: Catálogo sem o título

- **WHEN** todas as buscas terminam sem candidato confirmado
- **THEN** a saída é lista vazia, sem erro de falha.

#### Scenario: Falha de rede ou HTTP

- **WHEN** a busca responde fora de 2xx ou a conexão falha
- **THEN** o erro sobe até `getStreams`, que registra com `[CineAgora]` e devolve lista vazia.

#### Scenario: Página de candidato ilegível

- **WHEN** a página do candidato não traz título ou ano no formato esperado
- **THEN** o provedor lança erro de estrutura em vez de tratar como ausência.
