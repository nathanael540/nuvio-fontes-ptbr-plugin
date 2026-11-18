# Spec Delta

## Purpose

Localizar filmes e séries no catálogo agregado do MagnetBR por IMDb ou título, confirmar a identidade e devolver torrents avulsos ou o arquivo do episódio em pacotes de temporada, com idioma e metadados classificados a partir da própria fonte.

## ADDED Requirements

### Requirement: Identificadores de busca e fallback

O provedor SHALL consultar o catálogo completo pelo IMDb obtido no TMDB quando ele existir e SHALL usar os títulos PT-BR, original e alternativos como tentativas de fallback, sem repetir termos. O fallback SHALL ocorrer somente após uma tentativa válida sem candidato aceito; erro HTTP, JSON inválido ou estrutura fora do contrato SHALL interromper a busca sem tentar o termo seguinte. Cada tentativa SHALL ler somente a primeira página.

#### Scenario: IMDb disponível

- **WHEN** o TMDB informa um IMDb e a consulta por esse identificador devolve candidatos aceitos
- **THEN** o provedor usa esses candidatos e não consulta os títulos.

#### Scenario: IMDb sem candidatos

- **WHEN** a consulta por IMDb conclui sem candidato aceito
- **THEN** o provedor tenta os títulos PT-BR, original e alternativos antes de concluir ausência.

#### Scenario: Erro não aciona fallback

- **WHEN** a primeira tentativa responde HTTP fora de 2xx, JSON inválido ou estrutura sem a lista de resultados
- **THEN** a busca é encerrada com erro, sem consultar o identificador seguinte.

#### Scenario: Página única

- **WHEN** a primeira página devolve o limite de resultados da fonte
- **THEN** o provedor não pagina e avalia somente os itens recebidos.

### Requirement: Consulta de episódio e pacote

Em pedido de série, o provedor SHALL enviar a temporada e o episódio à fonte e SHALL consultar também a temporada sem episódio para localizar pacotes. Os resultados das duas consultas SHALL ser unidos sem repetir hash. A consulta de pacote SHALL ocorrer na mesma tentativa de identidade da consulta exata.

#### Scenario: Episódio avulso

- **WHEN** a consulta com temporada e episódio devolve uma release do episódio pedido
- **THEN** o provedor a avalia como stream magnet.

#### Scenario: Item sem marcador na consulta exata

- **WHEN** a consulta com temporada e episódio devolve um item sem `SxxExx` ou temporada no texto que passa na triagem de identidade
- **THEN** o provedor o trata como episódio avulso em magnet, não como pacote.

#### Scenario: Pacote apenas na consulta da temporada

- **WHEN** a consulta exata não devolve candidatos, mas a consulta da temporada devolve um pacote da temporada pedida
- **THEN** o provedor avalia o pacote para o episódio solicitado.

#### Scenario: Mesmo hash nas duas consultas

- **WHEN** a consulta exata e a consulta da temporada devolvem o mesmo hash
- **THEN** o provedor avalia esse hash uma única vez.

### Requirement: Triagem de identidade

O provedor SHALL descartar item cujo IMDb preenchido divirja do pedido e item cujo tipo declarado seja incompatível com o pedido. Sem IMDb no item, a aceitação SHALL exigir evidência local de título; em filme, o ano SHALL ser compatível quando conhecido. Coleções de filmes SHALL ser descartadas em pedido de filme.

#### Scenario: IMDb divergente

- **WHEN** a consulta por um IMDb devolve item com outro IMDb preenchido
- **THEN** o item é descartado, mesmo que o título coincida.

#### Scenario: Item sem IMDb

- **WHEN** o item não traz IMDb e o texto da release comprova o título do pedido, com ano compatível em filme
- **THEN** o item é aceito.

#### Scenario: Tipo incompatível

- **WHEN** um pedido de filme recebe item declarado como série ou um pedido de série recebe item declarado como filme
- **THEN** o item é descartado.

#### Scenario: Coleção em pedido de filme

- **WHEN** o texto do item descreve trilogia, coleção ou todos os filmes
- **THEN** o item é descartado por não representar o filme pedido.

### Requirement: Temporada, episódio e ano da temporada

Em série, o provedor SHALL aceitar o item com temporada ou episódio explícitos somente quando as coordenadas coincidirem com o pedido. Temporadas conflitantes no mesmo texto SHALL descartar o item. Item sem coordenadas explícitas SHALL ser aceito somente com IMDb igual, título compatível e ano da temporada compatível quando o TMDB o informar. O ano do item, quando conhecido, SHALL estar a no máximo um ano do ano da temporada no TMDB.

#### Scenario: Episódio divergente

- **WHEN** o texto do item identifica outro episódio da mesma temporada
- **THEN** o item é descartado.

#### Scenario: Temporada divergente

- **WHEN** o texto do item identifica somente outra temporada
- **THEN** o item é descartado.

#### Scenario: Temporadas conflitantes

- **WHEN** o texto do item cita mais de uma temporada, como `Season.1.S05`
- **THEN** o item é descartado sem tentar resolver o pacote.

#### Scenario: Item sem coordenadas explícitas

- **WHEN** a fonte devolve item sem `SxxExx` ou temporada no texto, mas com IMDb igual, título compatível e ano da temporada compatível
- **THEN** o item é aceito como release do episódio filtrado pelo servidor.

#### Scenario: Falso positivo de outra produção

- **WHEN** o item tem o IMDb pedido e o título coincide, mas o ano diverge em mais de um ano do ano da temporada no TMDB
- **THEN** o item é descartado.

### Requirement: Resolução de pacote de temporada

Pacote de temporada SHALL virar stream somente quando a lista do torrent tiver exatamente um arquivo de vídeo correspondente ao episódio. Sem arquivo identificado ou com mais de um candidato, o pacote SHALL ser descartado sem stream. A falha ao obter a lista do torrent SHALL descartar somente aquela opção, preservando as demais.

#### Scenario: Arquivo do episódio identificado

- **WHEN** o pacote contém exatamente um vídeo do episódio pedido na temporada pedida
- **THEN** o stream aponta para `torrent://<hash>/<índice>` com o índice desse arquivo.

#### Scenario: Pacote sem o episódio

- **WHEN** a lista do torrent não contém arquivo do episódio pedido
- **THEN** o pacote é descartado por triagem, sem erro fatal.

#### Scenario: Mais de um arquivo candidato

- **WHEN** a lista do torrent contém dois vídeos que correspondem ao episódio
- **THEN** o pacote é descartado, sem escolher o primeiro.

#### Scenario: Falha do cache de torrents

- **WHEN** o cache público de metadados responde fora de 2xx para um pacote
- **THEN** somente essa opção é descartada com aviso e as outras opções continuam.

### Requirement: Classificação de idioma

O provedor SHALL classificar o idioma somente pelos campos de áudio e legenda da fonte e pelos nomes originais da release, usando os seis valores do enum `LANGUAGE`. Áudio português SHALL prevalecer sobre legenda; português sem região comprovada SHALL receber o sufixo `(Não PT-BR?)`. O campo de título gerado pelo indexador SHALL NOT ser usado como prova de região brasileira.

#### Scenario: Áudio português

- **WHEN** `audio_tags` contém `Português` e não há região comprovada
- **THEN** o stream sai como `Dublado (Não PT-BR?)`.

#### Scenario: Áudio estrangeiro com legenda portuguesa

- **WHEN** `audio_tags` contém somente idioma estrangeiro e `legend` contém `Português`
- **THEN** o stream sai como `Legendado (Não PT-BR?)`.

#### Scenario: Áudio estrangeiro sem legenda portuguesa

- **WHEN** `audio_tags` contém somente idioma estrangeiro e não há legenda portuguesa
- **THEN** o stream sai como `Gringo`.

#### Scenario: Marcador gerado pelo indexador

- **WHEN** `audio_tags` não comprova áudio português e o título gerado contém `[Brazilian]`
- **THEN** o marcador não promove o stream a `Dublado`.

#### Scenario: Sem evidência

- **WHEN** os campos de áudio, legenda e nomes originais não comprovam idioma
- **THEN** o stream sai como `Idioma Desconhecido`.

### Requirement: Tamanho, qualidade e contagens

O provedor SHALL preencher o tamanho somente com valor plausível da fonte, normalizando vírgula decimal e ignorando valor em bytes isolado; sem valor plausível, o campo SHALL ser omitido, sem substituto inventado. A qualidade SHALL ser descoberta nos textos já obtidos, sem requisição extra. Seeders e peers SHALL vir da fonte quando forem inteiros não negativos, preservando zero.

#### Scenario: Tamanho em GB com vírgula

- **WHEN** a fonte devolve `2,8 GB`
- **THEN** o stream sai com `2.8 GB`.

#### Scenario: Tamanho corrompido

- **WHEN** a fonte devolve `30 B` e nenhum outro tamanho plausível
- **THEN** o stream sai sem `size`, sem adotar um valor padrão.

#### Scenario: Qualidade na release

- **WHEN** o título ou o nome original da release contém `1080p` ou `4k`
- **THEN** a qualidade é classificada localmente, sem consultar a mídia.

#### Scenario: Contagem zero

- **WHEN** a fonte informa `seed_count: 0`
- **THEN** o stream sai com `seeders: 0`, sem substituição por outro número.

### Requirement: Contrato dos streams

Todo stream SHALL sair pela montagem comum do repositório, com `format` e sem `name` ou `title` informados pelo provedor. Magnet SHALL usar hash BTIH hexadecimal de 40 caracteres, inclusive quando a fonte publicar base32, e o mesmo hash SHALL aparecer em `infoHash`. O catálogo de origem SHALL ser o `provider`; duplicatas pela URL SHALL ser removidas e a lista SHALL ser ordenada por qualidade.

#### Scenario: Magnet em base32

- **WHEN** o link publicado usa BTIH base32
- **THEN** o stream usa o hash convertido para 40 hexadecimais no magnet e em `infoHash`.

#### Scenario: Catálogo de origem

- **WHEN** o item informa `scraper_source`
- **THEN** esse valor aparece como `provider` do stream.

#### Scenario: Duplicata

- **WHEN** dois itens resolvem para a mesma URL
- **THEN** o provedor devolve um único stream.

#### Scenario: Campos proibidos

- **WHEN** um stream é montado
- **THEN** ele não leva `name` nem `title` informados pelo provedor.

### Requirement: Ausência, erros e tempo

Consulta sem resultados SHALL ser ausência, inclusive quando a fonte sinalizar indexação em segundo plano. Erros de entrada, TMDB, busca e estrutura SHALL subir para a captura única de `getStreams`, que registra com `[MagnetBR]` e devolve lista vazia. A falha de uma opção SHALL descartar somente essa opção; se nenhuma produzir stream e alguma tiver falhado, o erro agregado SHALL subir. O provedor SHALL NOT impor limite de tempo, cache ou nova tentativa por lentidão.

#### Scenario: Busca vazia com indexação agendada

- **WHEN** a fonte responde `count: 0` e `queued: true`
- **THEN** o provedor trata como ausência, sem erro.

#### Scenario: Falha HTTP na busca

- **WHEN** a busca responde HTTP 503
- **THEN** `getStreams` registra `[MagnetBR]` e devolve lista vazia.

#### Scenario: Uma opção falha e outra resolve

- **WHEN** um item tem magnet inválido e outro resolve
- **THEN** o stream válido é devolvido e o item inválido gera somente aviso.

#### Scenario: Todas as opções falham

- **WHEN** todos os itens aceitos falham na montagem ou na resolução do pacote
- **THEN** o provedor lança erro agregado com as causas e `getStreams` devolve lista vazia.

#### Scenario: Todas as opções são triagem

- **WHEN** todos os itens são descartados por critério de identidade
- **THEN** o provedor devolve lista vazia sem aviso de falha.

#### Scenario: Entrada inválida

- **WHEN** o tipo de mídia não é `movie` nem `tv`, ou falta temporada/episódio em série
- **THEN** o erro sobe antes de qualquer requisição à fonte.
