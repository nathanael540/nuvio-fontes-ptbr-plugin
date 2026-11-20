# Spec Delta

## Purpose

Localizar filmes e séries do Cineveo pelo ID do TMDB, selecionar o episódio pela coordenada publicada e devolver os MP4 dublados ou legendados anunciados pelos servidores da fonte, distinguindo ausência de falha.

## ADDED Requirements

### Requirement: Consulta por ID do TMDB sem metadados externos

O provedor SHALL consultar `GET https://cineveo.cfd/api?action=details&type=movie|series&id=<tmdbId>` com o tipo pedido e SHALL usar somente a resposta da fonte para título, ano e episódios. O provedor MUST NOT consultar o TMDB, exigir `TMDB_API_KEY` ou procurar o título por nome nesta versão.

#### Scenario: Filme consultado pelo ID

- **WHEN** o app solicita `movie` com um TMDB presente no catálogo
- **THEN** o provedor consulta o detalhe de filme pelo ID e segue para os servidores.

#### Scenario: Série consultada pelo ID

- **WHEN** o app solicita `tv` com um TMDB presente no catálogo
- **THEN** o provedor consulta o detalhe de série pelo ID e segue para a seleção do episódio.

#### Scenario: ID ausente do catálogo

- **WHEN** a API não possui o ID para o tipo pedido
- **THEN** o provedor reconhece ausência, sem procurar o título por nome e sem consultar o TMDB.

### Requirement: Confirmação de tipo e identidade

A resposta SHALL ser aceita somente quando `type` corresponde ao pedido e `tmdb_id` é igual ao ID solicitado. Divergência de tipo ou de identificador SHALL ser falha de estrutura, não ausência.

#### Scenario: Resposta compatível

- **WHEN** a API devolve `type` igual ao pedido e `tmdb_id` igual ao ID solicitado
- **THEN** o provedor aceita o item e continua a extração.

#### Scenario: Identificador divergente

- **WHEN** o `tmdb_id` da resposta difere do ID solicitado
- **THEN** o provedor lança erro, em vez de devolver os streams de outro título.

#### Scenario: Tipo divergente

- **WHEN** a API devolve um `type` diferente do pedido, ainda que com HTTP 200
- **THEN** o provedor lança erro de estrutura.

### Requirement: Coordenadas do pedido

Pedido `movie` SHALL ignorar temporada e episódio. Pedido `tv` SHALL exigir temporada e episódio inteiros a partir de 1 antes de qualquer requisição; valor ausente ou inválido SHALL ser erro, não ausência.

#### Scenario: Filme com coordenadas nulas

- **WHEN** o app solicita `movie` com temporada e episódio nulos
- **THEN** o provedor consulta o filme sem exigir coordenadas.

#### Scenario: Série com coordenadas válidas

- **WHEN** o app solicita `tv` com temporada e episódio inteiros a partir de 1
- **THEN** o provedor consulta a série e seleciona o episódio pelo par.

#### Scenario: Série sem coordenadas

- **WHEN** o pedido `tv` traz temporada ou episódio ausente, zero ou fracionário
- **THEN** o provedor lança erro antes de consultar a fonte.

### Requirement: Ausência reconhecida na consulta de detalhe

HTTP 404 com o corpo de 404 documentado da fonte SHALL ser ausência. HTTP 200 com `servers` ausente ou vazio SHALL ser ausência. Demais respostas fora de 2xx, JSON inválido e estrutura inesperada SHALL ser falha.

#### Scenario: Título ausente

- **WHEN** a API responde 404 com o HTML de 404 da fonte
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Título sem servidores

- **WHEN** a API responde 200 com o item, mas sem nenhum servidor de áudio
- **THEN** o provedor reconhece ausência e não produz streams.

#### Scenario: Falha de rede ou HTTP

- **WHEN** a API responde 5xx, um 404 sem o corpo documentado ou a conexão falha
- **THEN** o erro sobe como falha, não como ausência.

#### Scenario: JSON inválido

- **WHEN** a API responde 200 com corpo que não é JSON válido
- **THEN** o provedor lança erro de estrutura.

### Requirement: Servidores de filme por áudio

Em filme, o provedor SHALL ler `servers.dub[]` e `servers.leg[]` e usar `url` ou, na ausência dela, `download` como endereço de reprodução. URL relativa SHALL ser resolvida contra a base da fonte. Cada servidor SHALL ser uma opção independente.

#### Scenario: Filme com dublado e legendado

- **WHEN** o detalhe do filme publica servidores nos dois grupos
- **THEN** o provedor produz streams para as opções dos dois áudios.

#### Scenario: Servidor só com download

- **WHEN** um servidor de filme publica `download` e não publica `url`
- **THEN** o `download` é usado como endereço da opção.

#### Scenario: Endereço relativo

- **WHEN** o servidor publica um caminho relativo
- **THEN** o provedor o resolve contra `https://cineveo.cfd` antes de montar o stream.

#### Scenario: Servidor sem endereço

- **WHEN** um servidor não publica `url` nem `download`
- **THEN** só essa opção falha, com aviso, e as demais continuam.

### Requirement: Seleção do episódio publicado

Em série, o provedor SHALL selecionar o episódio cujo `season` e `episode` iguais aos pedidos tenham `available === true`. Episódio ausente da lista ou indisponível SHALL ser ausência. A página do episódio SHALL ser aberta no padrão publicado pela fonte, `/series/<slug>-t<temporada>-ep<episódio>.html`.

#### Scenario: Episódio disponível

- **WHEN** o detalhe da série lista o par pedido com `available: true`
- **THEN** o provedor abre a página desse episódio e lê os servidores.

#### Scenario: Episódio não listado

- **WHEN** o detalhe da série não lista o par pedido
- **THEN** o provedor reconhece ausência, sem abrir uma página inventada.

#### Scenario: Episódio indisponível

- **WHEN** o par existe, mas `available` não é `true`
- **THEN** o provedor reconhece ausência e não produz stream para ele.

### Requirement: Leitura da página do episódio

A página do episódio SHALL conter o JSON de `<script id="initialEpisodeData">`; a ausência desse bloco SHALL ser erro de estrutura. O provedor SHALL validar o `tmdb_id` da série e as coordenadas do episódio. Coordenada divergente SHALL ser ausência; os servidores SHALL ser lidos de `servers.dub[]` e `servers.leg[]`, usando `download` ou `url`.

#### Scenario: Página válida

- **WHEN** a página traz `initialEpisodeData` com a série, a coordenada e os servidores esperados
- **THEN** o provedor lê as opções e monta os streams.

#### Scenario: Bloco ausente

- **WHEN** a página responde 200 sem `initialEpisodeData`
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

#### Scenario: Coordenada divergente

- **WHEN** a página publica temporada ou episódio diferente do pedido
- **THEN** o provedor reconhece ausência e não devolve o episódio errado.

#### Scenario: Série divergente

- **WHEN** o `tmdb_id` de `initialEpisodeData` difere do ID solicitado
- **THEN** o provedor lança erro de identidade.

### Requirement: Idioma pelo grupo de áudio

O idioma SHALL ser `Dublado` para `dub` e `Legendado` para `leg`. Grupo desconhecido SHALL resultar em `Idioma Desconhecido`, sem promoção por título, nome de arquivo ou texto genérico.

#### Scenario: Grupo dublado

- **WHEN** o servidor pertence a `servers.dub`
- **THEN** o stream sai com `language: "Dublado"`.

#### Scenario: Grupo legendado

- **WHEN** o servidor pertence a `servers.leg`
- **THEN** o stream sai com `language: "Legendado"`.

#### Scenario: Grupo desconhecido

- **WHEN** o servidor pertence a um grupo de áudio não reconhecido
- **THEN** o stream sai com `language: "Idioma Desconhecido"`.

### Requirement: Qualidade e tipo declarados pelo servidor

A qualidade SHALL vir de `quality` e, quando vazia, do nome do servidor. `HD` SHALL ser normalizado para `720p`, resolução explícita SHALL manter seu valor e rótulo sem resolução SHALL resultar em `Desconhecida`. O `type` SHALL vir do servidor; `mp4` e `hls` são aceitos e tipo não suportado é triagem, não falha.

#### Scenario: Resolução explícita

- **WHEN** o servidor declara `1080p`
- **THEN** o stream sai com qualidade `1080p`.

#### Scenario: Rótulo HD

- **WHEN** o servidor declara apenas `HD`
- **THEN** o stream sai com qualidade `720p`.

#### Scenario: Qualidade sem resolução

- **WHEN** o servidor não declara resolução reconhecível
- **THEN** o stream sai com qualidade `Desconhecida` e é preservado.

#### Scenario: Tipo não suportado

- **WHEN** o servidor declara um tipo diferente de `mp4` ou `hls`
- **THEN** a opção é descartada por triagem, com aviso, sem derrubar as demais.

### Requirement: Montagem e deduplicação dos streams

Todo stream SHALL ser montado com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'Cineveo'`, título, ano quando inteiro e temporada/episódio em série), sem `name` ou `title` informados. `headers`, `size`, `subtitles` e `provider` MUST NOT ser inventados. Duplicatas de mesma URL e mesmo idioma SHALL ser unidas; a lista final SHALL ser ordenada por qualidade.

#### Scenario: Stream de filme

- **WHEN** uma opção de filme é válida
- **THEN** o stream traz `format` com título e ano, qualidade, idioma, tipo e a URL da fonte.

#### Scenario: Stream de série

- **WHEN** uma opção de episódio é válida
- **THEN** o stream traz `format` com título, ano, temporada e episódio.

#### Scenario: Opcionais ausentes

- **WHEN** a fonte não publica tamanho, legendas, cabeçalhos ou um host de provedor
- **THEN** esses campos não aparecem no stream.

#### Scenario: Duplicata

- **WHEN** dois servidores apontam para a mesma URL e o mesmo idioma
- **THEN** o provedor devolve um único stream para eles.

### Requirement: Falha isolada e erro agregado

Cada servidor SHALL ser resolvido isoladamente; a falha de uma opção SHALL gerar `console.warn('[Cineveo] Opção <rótulo> descartada: <causa>')` e preservar as demais. Se nenhum stream for produzido e alguma opção tiver falhado, o erro agregado SHALL subir. Sem streams e sem falha, a saída SHALL ser lista vazia.

#### Scenario: Uma opção falha e outra funciona

- **WHEN** um servidor tem endereço inválido e outro entrega uma URL válida
- **THEN** o provedor devolve o stream válido e registra o aviso da opção descartada.

#### Scenario: Todas as opções falham

- **WHEN** nenhum servidor produz stream e ao menos um falhou tecnicamente
- **THEN** o erro agregado sobe até `getStreams`, que registra `[Cineveo]` e devolve lista vazia.

#### Scenario: Todas as opções ausentes

- **WHEN** a fonte não publica nenhum servidor para o título ou episódio
- **THEN** o provedor devolve lista vazia sem erro fatal.
