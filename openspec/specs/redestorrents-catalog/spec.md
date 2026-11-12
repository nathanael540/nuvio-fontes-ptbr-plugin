# redestorrents-catalog Specification

## Purpose

Garantir que o catálogo Redes Torrents, dentro do provedor Baixa Rápido, encontre títulos que a busca do site distribui em páginas posteriores, sem criar um provedor separado nem aceitar fichas de outro título.

## Requirements

### Requirement: Catálogo Redes Torrents no Baixa Rápido

O Redes Torrents SHALL permanecer um catálogo do provedor Baixa Rápido, e o manifest SHALL NOT publicar um provedor separado com o id `redestorrents`.

#### Scenario: Manifest sem provedor dedicado

- **WHEN** o manifest é validado
- **THEN** não existe entrada de scraper com id `redestorrents` e a entrada `baixarapido` continua listando o catálogo Redes Torrents.

#### Scenario: Streams com a identidade do Baixa Rápido

- **WHEN** uma busca do Baixa Rápido consulta o catálogo Redes Torrents
- **THEN** os streams usam o provedor `baixarapido` e o rótulo `Baixa Rápido`.

### Requirement: Paginação da busca por páginas

O catálogo SHALL percorrer as páginas da busca em ordem, começando na página 1, e SHALL parar na primeira ficha confirmada, em uma página com menos de 20 cartões, em estado vazio, em página repetida ou ao completar 12 páginas.

#### Scenario: Ficha confirmada na primeira página

- **WHEN** a página 1 confirma o pedido
- **THEN** a página 2 não é lida.

#### Scenario: Ficha confirmada em página posterior

- **WHEN** as páginas 1 e 2 não confirmam o pedido e a página 3 confirma
- **THEN** a página 3 é lida e a paginação para nela.

#### Scenario: Última página

- **WHEN** uma página tem menos de 20 cartões e nenhum confirma o pedido
- **THEN** a paginação para sem ler a página seguinte.

#### Scenario: Página repetida

- **WHEN** a página seguinte repete os mesmos cartões da página anterior
- **THEN** a paginação para sem repetir a consulta de fichas.

#### Scenario: Limite de páginas

- **WHEN** 12 páginas foram lidas sem ficha confirmada
- **THEN** a paginação para e a página 13 não é lida.

#### Scenario: Título além do limite

- **WHEN** o único cartão que confirma o pedido está na página 13
- **THEN** o catálogo não devolve stream desse cartão.

### Requirement: Triagem em cada página

Em cada página, o catálogo SHALL aplicar a triagem existente de tipo, temporada e relação de título antes de consultar a ficha; somente os cartões aprovados SHALL gerar consulta de detalhe.

#### Scenario: Cartão de outro tipo

- **WHEN** o pedido é de filme e uma página posterior traz um cartão de série
- **THEN** a ficha desse cartão não é consultada.

#### Scenario: Cartão de outra temporada

- **WHEN** o pedido é de uma temporada e uma página posterior traz um cartão de outra temporada
- **THEN** a ficha desse cartão não é consultada.

#### Scenario: Cartão compatível em página posterior

- **WHEN** um cartão compatível aparece na página 4
- **THEN** a ficha é consultada e passa pela confirmação normal.

### Requirement: Confirmação e ausência

A paginação SHALL NOT substituir a confirmação por IMDb, título e ano; um cartão em página posterior SHALL ser aceito apenas se a ficha confirmar o mesmo título do TMDB. Se nenhuma página confirmar, o catálogo SHALL devolver lista vazia sem erro fatal; falhas de rede, HTTP ou parsing SHALL continuar sendo lançadas.

#### Scenario: Página posterior com outro título

- **WHEN** uma página posterior traz um cartão parecido, mas a ficha não confirma o título do TMDB
- **THEN** o catálogo não devolve stream desse cartão e não trata o caso como erro fatal.

#### Scenario: IMDb divergente em página posterior

- **WHEN** uma página posterior traz uma ficha com IMDb diferente do título do TMDB
- **THEN** a ficha é descartada.

#### Scenario: Falha de rede durante a paginação

- **WHEN** a página 2 responde com erro HTTP ou falha de rede
- **THEN** o erro é lançado e não convertido em lista vazia.

#### Scenario: Nenhuma página confirma

- **WHEN** todas as páginas lidas até o limite não confirmam o pedido
- **THEN** o catálogo devolve lista vazia sem erro fatal.

### Requirement: Registro da paginação

O catálogo SHALL registrar no console quantas páginas de busca foram lidas e o motivo da parada, sem incluir URLs assinadas, magnets ou dados pessoais.

#### Scenario: Parada por ficha confirmada

- **WHEN** a ficha é confirmada na página 2
- **THEN** o log informa 2 páginas lidas e parada por ficha confirmada.

#### Scenario: Parada por limite

- **WHEN** a paginação atinge 12 páginas sem confirmação
- **THEN** o log informa 12 páginas lidas e parada por limite de páginas.

#### Scenario: Parada por última página

- **WHEN** a página lida tem menos de 20 cartões
- **THEN** o log informa a quantidade de páginas lidas e parada por última página.
