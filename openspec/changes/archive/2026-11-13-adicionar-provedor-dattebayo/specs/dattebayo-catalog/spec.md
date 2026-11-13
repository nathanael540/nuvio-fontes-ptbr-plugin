# Dattebayo Catalog Specification

## Purpose

Localizar, confirmar e reproduzir títulos do catálogo Dattebayo BR a partir do ID do TMDB, com temporada e episódio corretos e idioma classificado pela seção da fonte.

## ADDED Requirements

### Requirement: Busca pelos títulos do TMDB

O provedor SHALL consultar a busca pública da fonte com o título PT-BR, o título original e os títulos alternativos do TMDB, nessa ordem, e SHALL encerrar a consulta quando um termo devolver candidato confirmável. Busca sem candidatos em todos os termos é ausência reconhecida.

#### Scenario: Título PT-BR encontra a ficha

1. **WHEN** a busca pelo título PT-BR devolve candidatos e um deles confirma tipo e identidade
2. **THEN** o provedor usa essa ficha e não consulta os termos seguintes.

#### Scenario: Título original encontra a ficha

1. **WHEN** a busca pelo título PT-BR não devolve candidato confirmável
2. **THEN** o provedor tenta o título original e os alternativos antes de concluir pela ausência.

#### Scenario: Busca sem resultados

1. **WHEN** todos os termos terminam com a lista de resultados vazia
2. **THEN** o provedor devolve lista vazia, sem erro fatal.

### Requirement: Confirmação na ficha

Cada candidato SHALL ser confirmado na ficha pelo tipo, `Filme` para pedido de filme e `TV` para pedido de série. Em filme, o ano SHALL ser confirmado com tolerância de um ano. Em série, a ficha base SHALL ter ano compatível com o ano da série no TMDB, com tolerância de um ano, e as fichas de temporada SHALL pertencer à família do título pedido. Candidato com tipo ou identidade incompatível SHALL ser descartado sem gerar stream.

#### Scenario: Filme confirmado

1. **WHEN** a ficha do candidato informa `Tipo` `Filme` e ano igual ou até um ano distante do TMDB
2. **THEN** o candidato segue para a resolução do filme.

#### Scenario: Série confirmada

1. **WHEN** a ficha base informa `Tipo` `TV`, ano compatível com o TMDB e o título pertence à família do título pedido
2. **THEN** o candidato segue para o mapeamento de temporada.

#### Scenario: Série de ano incompatível

1. **WHEN** a ficha base de uma série informa ano mais de um ano distante do ano do TMDB
2. **THEN** a família é descartada e o provedor tenta o próximo candidato.

#### Scenario: Tipo incompatível

1. **WHEN** um pedido de filme encontra uma ficha `TV`, ou um pedido de série encontra uma ficha `Filme`
2. **THEN** o candidato é descartado e o provedor tenta o próximo candidato.

#### Scenario: Ano incompatível

1. **WHEN** a ficha de um filme informa ano mais de um ano distante do ano do TMDB
2. **THEN** o candidato é descartado, mesmo com título semelhante.

#### Scenario: Sequência com outro título

1. **WHEN** o pedido é `Dragon Ball` e a ficha se chama `Dragon Ball Z`, `Dragon Ball Super` ou `Naruto Shippuden`
2. **THEN** a ficha não entra na família do título e não gera stream.

### Requirement: Idioma pela seção do catálogo

O idioma SHALL ser `Dublado` quando a entrada estiver em `/anime-dublado/` ou o título tiver o sufixo `- Dublado`. Sem essas evidências, o idioma SHALL ser `Legendado`. Quando as duas versões existirem, ambas SHALL ser consideradas e cada stream SHALL sair com o idioma da sua entrada.

#### Scenario: Entrada dublada

1. **WHEN** o candidato confirmado está em `/anime-dublado/` ou o título termina em `- Dublado`
2. **THEN** os streams gerados têm `language` `Dublado`.

#### Scenario: Entrada legendada

1. **WHEN** o candidato confirmado está em `/animes/`, `/tokusatsus/`, `/doramas/` ou `/donghua/` e o título não termina em `- Dublado`
2. **THEN** os streams gerados têm `language` `Legendado`.

#### Scenario: Versões dublada e legendada

1. **WHEN** a busca encontra entradas confirmáveis nas duas seções para o mesmo título
2. **THEN** o provedor resolve as duas e devolve os streams com os idiomas correspondentes.

### Requirement: Temporada 1 e temporadas explícitas

A temporada 1 SHALL usar a entrada base do título. Temporada maior que 1 SHALL usar a entrada cujo título identifica a temporada pedida, como `Season N`, `Nth Season` ou sufixo numérico. OVA, ONA, especial e filme SHALL NOT ser tratados como temporada de TV.

#### Scenario: Temporada 1 na entrada base

1. **WHEN** o pedido é de temporada 1 e a entrada base do título é `TV`
2. **THEN** o provedor usa a entrada base.

#### Scenario: Temporada 2 explícita

1. **WHEN** o pedido é de temporada 2 e existe entrada `TV` cujo título contém `Season 2` ou sufixo `2`
2. **THEN** o provedor usa essa entrada.

#### Scenario: OVA descartada

1. **WHEN** o candidato se chama `OVA`, `ONA`, `Especial` ou `Filme` e o pedido é de temporada
2. **THEN** o candidato é descartado do mapeamento de temporada.

### Requirement: Rótulos especiais de temporada

Entrada com `Final Season` SHALL ser mapeada para a última temporada regular do TMDB. Entrada com `Part N` sem número de temporada SHALL pertencer à mesma temporada da entrada anterior na cadeia. Sem o dado de temporadas do TMDB, `Final Season` usa a temporada anterior na cadeia mais um.

#### Scenario: Final Season na última temporada

1. **WHEN** o TMDB informa quatro temporadas regulares e a ficha se chama `The Final Season`
2. **THEN** o provedor mapeia a ficha para a temporada 4.

#### Scenario: Parte sem número herda a temporada

1. **WHEN** a ficha `The Final Season Part 2` vem depois de `The Final Season` na cadeia
2. **THEN** o provedor mapeia a parte para a mesma temporada da ficha anterior.

#### Scenario: Sem dado de temporadas do TMDB

1. **WHEN** o TMDB não devolve a lista de temporadas e a ficha `Final Season` vem depois de uma ficha da temporada 3
2. **THEN** o provedor mapeia `Final Season` para a temporada 4.

### Requirement: Partes da mesma temporada

Entradas que representam partes da mesma temporada SHALL ser ordenadas pela cadeia de temporadas da fonte, e os episódios SHALL ser distribuídos em faixas contínuas pela quantidade disponível de cada parte. Episódio fora de todas as faixas SHALL ser ausência.

#### Scenario: Episódio na segunda parte

1. **WHEN** a temporada tem 16 episódios na primeira parte e 12 na segunda, e o pedido é o episódio 17
2. **THEN** o provedor usa o episódio 1 da segunda parte.

#### Scenario: Episódio na primeira parte

1. **WHEN** o episódio pedido está dentro da faixa da primeira parte
2. **THEN** o provedor usa o número local correspondente na primeira parte.

#### Scenario: Faixas não cobrem o episódio

1. **WHEN** a soma das partes não alcança o número do episódio pedido
2. **THEN** o provedor devolve lista vazia, sem usar a parte mais próxima.

### Requirement: Série longa com entrada única

Quando uma única entrada de TV contiver o total de episódios da série no TMDB, a temporada e o episódio SHALL ser convertidos para o número absoluto somando os episódios das temporadas anteriores. A temporada 0 de especiais SHALL NOT entrar na soma.

#### Scenario: Temporada 2 de série longa

1. **WHEN** a série tem 52 episódios na temporada 1 e a entrada única contém os 220 episódios, e o pedido é temporada 2 episódio 1
2. **THEN** o provedor procura o episódio 53 na entrada única.

#### Scenario: Temporada 1 de série longa

1. **WHEN** o pedido é temporada 1 episódio 1 de uma série longa em entrada única
2. **THEN** o provedor procura o episódio 1, sem soma anterior.

#### Scenario: Entrada menor que o total

1. **WHEN** a entrada de TV tem menos episódios que o total da série no TMDB
2. **THEN** o provedor não aplica a numeração absoluta e segue o mapeamento por temporada.

### Requirement: Ausência por mapeamento ambíguo

Se mais de uma entrada de TV da mesma seção de idioma puder representar a temporada pedida sem relação de parte, ou se nenhuma entrada confirmar a temporada, o provedor SHALL devolver lista vazia. O provedor SHALL NOT escolher a primeira entrada nem reutilizar a temporada 1 como reserva.

#### Scenario: Duas entradas para a mesma temporada

1. **WHEN** duas entradas `TV` independentes confirmam o título e ambas alegam a mesma temporada
2. **THEN** o provedor devolve lista vazia.

#### Scenario: Temporada inexistente

1. **WHEN** nenhuma entrada da família confirma a temporada pedida
2. **THEN** o provedor devolve lista vazia.

#### Scenario: Sem reserva para temporada 1

1. **WHEN** a temporada pedida é maior que 1 e nenhuma entrada confirma essa temporada
2. **THEN** o provedor não usa a entrada da temporada 1.

### Requirement: Seleção do episódio

O número exibido na listagem de episódios da ficha SHALL ser a fonte de verdade. A paginação SHALL avançar até encontrar o episódio e o provedor SHALL usar somente a correspondência exata. Episódio 0 e especiais SHALL NOT atender a um pedido de episódio positivo.

#### Scenario: Episódio na primeira página

1. **WHEN** o episódio pedido aparece na primeira página da ficha
2. **THEN** o provedor usa o link desse episódio sem pedir páginas seguintes.

#### Scenario: Episódio em página posterior

1. **WHEN** o episódio pedido só aparece na página 3 da ficha
2. **THEN** o provedor localiza o episódio na página 3 e usa esse link.

#### Scenario: Episódio ausente

1. **WHEN** a listagem termina sem o número pedido
2. **THEN** o provedor devolve lista vazia.

#### Scenario: Episódio 0 ignorado

1. **WHEN** a listagem tem `Episódio 00` e o pedido é de episódio 1
2. **THEN** o provedor usa `Episódio 01`, não o episódio 0.

### Requirement: Resolução isolada das opções de player

Cada opção SD, HD e FULLHD da página do episódio SHALL ser resolvida isoladamente. A falha de uma opção SHALL descartar somente ela, com aviso `[Dattebayo BR]`. Se nenhuma opção produzir stream, o erro SHALL subir.

#### Scenario: Três opções disponíveis

1. **WHEN** a página oferece SD, HD e FULLHD e as três assinaturas funcionam
2. **THEN** o provedor devolve três streams.

#### Scenario: FULLHD ausente

1. **WHEN** a página oferece apenas SD e HD
2. **THEN** o provedor devolve dois streams, sem inventar a opção ausente.

#### Scenario: Falha em uma opção

1. **WHEN** a assinatura de HD falha e SD e FULLHD funcionam
2. **THEN** o provedor registra o aviso, descarta HD e devolve SD e FULLHD.

#### Scenario: Todas as opções falham

1. **WHEN** nenhuma das opções produz URL assinada válida
2. **THEN** o provedor lança erro com a causa de cada opção.

### Requirement: Qualidade e contrato do stream

A qualidade SHALL vir do rótulo da opção: `SD` vira `480p`, `HD` vira `720p` e `FULLHD` vira `1080p`. Todo stream SHALL ser montado com `buildStream` e o campo `format`, com URL MP4 assinada, idioma da entrada e sem `name` ou `title`; campo opcional SHALL entrar somente quando a fonte o fornecer.

#### Scenario: Qualidade das três opções

1. **WHEN** a página oferece SD, HD e FULLHD
2. **THEN** os streams saem com `480p`, `720p` e `1080p`.

#### Scenario: Formatação do stream

1. **WHEN** qualquer stream é montado
2. **THEN** `format` leva `addon` `Dattebayo BR`, título e ano do TMDB e, em série, temporada e episódio.

#### Scenario: Sem campos inventados

1. **WHEN** a fonte não informa tamanho, legenda externa ou cabeçalho de reprodução
2. **THEN** esses campos não aparecem no stream.

### Requirement: Assinatura pública de curta duração

A URL de mídia SHALL ser obtida pelo serviço público de assinatura já usado pelo player da fonte, sem conta, chave ou cookie. A assinatura é efêmera e SHALL NOT ser registrada em log, fixture, relatório ou documentação.

#### Scenario: Assinatura pública obtida

1. **WHEN** o serviço devolve a query assinada para a URL da opção
2. **THEN** o provedor monta o stream com a URL assinada e não persiste a assinatura.

#### Scenario: Assinatura indisponível

1. **WHEN** o serviço não devolve assinatura para uma opção
2. **THEN** somente essa opção é descartada.

#### Scenario: Assinatura fora de log

1. **WHEN** o provedor registra avisos ou erros
2. **THEN** a URL assinada e seus parâmetros não aparecem na mensagem.

### Requirement: Ausência e falhas fatais

Ausência reconhecida SHALL devolver lista vazia sem erro fatal. Falha de rede, HTTP fora de 2xx ou layout não reconhecido SHALL lançar erro. Somente `getStreams` SHALL capturar a falha final, registrar `console.error('[Dattebayo BR] ...')` e devolver lista vazia, sem lista parcial de etapa anterior.

#### Scenario: Busca vazia

1. **WHEN** a busca termina sem candidatos
2. **THEN** `getStreams` devolve lista vazia sem registrar erro.

#### Scenario: Layout alterado

1. **WHEN** a busca responde sem o contêiner de resultados esperado
2. **THEN** o provedor lança erro, `getStreams` registra a falha e devolve lista vazia.

#### Scenario: Falha depois da busca

1. **WHEN** a ficha ou o player falham depois de a busca ter encontrado candidatos
2. **THEN** o provedor não devolve os streams parciais de etapas anteriores.
