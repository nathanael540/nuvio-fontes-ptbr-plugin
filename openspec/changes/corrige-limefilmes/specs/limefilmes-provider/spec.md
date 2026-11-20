# Spec Delta

## Purpose

Localizar filmes e séries no catálogo público do LimeFilmes por título, confirmar a identidade da obra e devolver apenas magnets e arquivos de episódio sustentados pela página do post.

## ADDED Requirements

### Requirement: Busca sem recorte fixo

O provedor SHALL avaliar todos os resultados devolvidos por cada consulta pública de título, até o limite máximo da API da fonte, e SHALL NOT descartar uma correspondência exata por causa de um recorte fixo de resultados.

#### Scenario: Correspondência depois da 20ª posição

1. **WHEN** a consulta por um título devolve mais resultados do que a janela anterior e a correspondência exata aparece depois da 20ª posição
2. **THEN** o provedor avalia essa correspondência e devolve os streams compatíveis com a obra.

#### Scenario: Correspondência na primeira página

1. **WHEN** a correspondência exata aparece entre os primeiros resultados da consulta
2. **THEN** o provedor continua aceitando e resolvendo a obra como antes.

#### Scenario: Consulta acima do limite da fonte

1. **WHEN** uma consulta devolve mais resultados do que o limite máximo aceito pela API
2. **THEN** o provedor avalia somente os resultados recebidos, sem falhar e sem inventar correspondência.

### Requirement: Confirmação de identidade

O provedor SHALL aceitar post somente da categoria do tipo pedido e SHALL confirmar título e ano em filme ou temporada em série. Coleção, ano divergente em mais de um ano, temporada diferente e IMDb divergente SHALL NOT ser aceitos.

#### Scenario: Filme com ano compatível

1. **WHEN** o post pertence à categoria de filmes, o título corresponde e o ano está a no máximo um ano do ano do TMDB
2. **THEN** o post é aceito para extração.

#### Scenario: Filme com ano divergente

1. **WHEN** o post corresponde ao título, mas o ano diverge em mais de um ano
2. **THEN** o post é descartado.

#### Scenario: Série de outra temporada

1. **WHEN** o post de série identifica somente uma temporada diferente da solicitada
2. **THEN** o post é descartado.

#### Scenario: Coleção em pedido de filme

1. **WHEN** o post descreve coleção, trilogia ou intervalo de anos
2. **THEN** o post é descartado.

#### Scenario: IMDb divergente

1. **WHEN** a página do post informa IMDb diferente do IMDb do pedido
2. **THEN** o post é descartado.

#### Scenario: Mais de um título com a mesma pontuação

1. **WHEN** dois posts aceitos têm a mesma pontuação e títulos preparados diferentes
2. **THEN** o provedor não escolhe um deles e conclui ausência.

### Requirement: Opções de mídia

O provedor SHALL extrair magnets do artigo do post confirmado e SHALL montar cada stream pela montagem comum do repositório, com qualidade, idioma e tamanho descobertos nos textos da fonte. Sem magnet utilizável, SHALL NOT inventar mídia.

#### Scenario: Filme com magnets

1. **WHEN** o artigo do filme confirmado contém magnets com rótulo
2. **THEN** cada opção válida vira um stream com os metadados do rótulo.

#### Scenario: Episódio avulso

1. **WHEN** o magnet identifica o episódio solicitado
2. **THEN** o stream usa o magnet com a temporada e o episódio do pedido.

#### Scenario: Episódio em pacote

1. **WHEN** o magnet não identifica um episódio avulso e a lista do torrent contém exatamente o arquivo do episódio solicitado
2. **THEN** o stream aponta para `torrent://<hash>/<índice>` com esse arquivo.

#### Scenario: Episódio não identificado no pacote

1. **WHEN** o pacote não contém exatamente um arquivo do episódio solicitado
2. **THEN** o pacote é descartado sem stream, sem escolher arquivo arbitrário.

#### Scenario: Opção inválida isolada

1. **WHEN** uma opção tem magnet inválido ou falha ao resolver o pacote
2. **THEN** somente essa opção é descartada com aviso e as demais são preservadas.

### Requirement: Ausência e falhas

Consulta sem post compatível SHALL ser ausência com lista vazia, sem erro fatal. A falha de uma opção SHALL descartar somente essa opção; se nenhuma produzir stream e alguma tiver falhado, o erro SHALL subir para a captura única de `getStreams`.

#### Scenario: Título ausente

1. **WHEN** nenhuma variante de título encontra post compatível
2. **THEN** o provedor devolve lista vazia sem inventar mídia.

#### Scenario: Entrada inválida

1. **WHEN** o tipo de mídia não é `movie` nem `tv`, ou falta temporada ou episódio em série
2. **THEN** o erro sobe antes de qualquer requisição à fonte.

#### Scenario: Todas as opções falham

1. **WHEN** todos os magnets aceitos falham na montagem ou na resolução do pacote
2. **THEN** o provedor lança erro agregado e `getStreams` devolve lista vazia.

#### Scenario: Sem limite de tempo próprio

1. **WHEN** a fonte demora a responder
2. **THEN** o provedor aguarda o controle externo do app, sem timeout, cache ou nova tentativa por lentidão.

### Requirement: Contrato dos streams

Todo stream SHALL sair com `url`, `quality`, idioma do enum `LANGUAGE` e `format`; em torrent SHALL levar `infoHash` hexadecimal. `name` e `title` SHALL NOT ser informados pelo provedor, a lista SHALL ser ordenada por qualidade e duplicatas por hash SHALL ser removidas.

#### Scenario: Magnet válido

1. **WHEN** o magnet usa hash BTIH hexadecimal de 40 caracteres
2. **THEN** o stream sai como `magnet` com o mesmo hash em `infoHash`.

#### Scenario: Arquivo de pacote

1. **WHEN** o episódio é resolvido dentro de um pacote
2. **THEN** o stream sai como `torrent` com o hash e o índice do arquivo.

#### Scenario: Campos proibidos

1. **WHEN** um stream é montado
2. **THEN** ele não leva `name` nem `title` informados pelo provedor.

#### Scenario: Qualidade desconhecida

1. **WHEN** nenhum texto da opção informa a qualidade
2. **THEN** o stream é preservado como `Desconhecida` e fica no fim da ordenação.
