# pomfy-catalog Specification

## Purpose

Resolver pedidos de filme e série do catálogo Pomfy pelo ID do TMDB, trocar o token de embed pelo player Flyfile e devolver o HLS público com qualidade, idioma, legendas e metadados de apresentação. Títulos publicados apenas no player Byse são ausência reconhecida.

## Requirements

### Requirement: Atendimento por ID do TMDB

O provedor SHALL montar o endereço do conteúdo diretamente com o ID do TMDB recebido: `GET /filme/<id>` para filme e `GET /serie/<id>/<temporada>/<episódio>` para série. O provedor SHALL aceitar somente `tmdbId` numérico, `mediaType` `movie` ou `tv` e, em série, temporada e episódio inteiros a partir de 1. Entrada inválida SHALL ser rejeitada antes de qualquer requisição.

#### Scenario: Pedido de filme
- **WHEN** o app chama o provedor com `mediaType` `movie` e um `tmdbId` numérico
- **THEN** o provedor consulta `/filme/<id>` sem buscar por título nem consultar o TMDB.

#### Scenario: Pedido de série
- **WHEN** o app chama o provedor com `mediaType` `tv`, temporada e episódio válidos
- **THEN** o provedor consulta `/serie/<id>/<temporada>/<episódio>`.

#### Scenario: Entrada inválida
- **WHEN** o `tmdbId` não é numérico, o `mediaType` é desconhecido ou a série não traz temporada/episódio positivos
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` devolve lista vazia.

### Requirement: Token de embed da página Pomfy

O provedor SHALL consultar a página do conteúdo com o contexto de iframe exigido pela fonte e SHALL extrair o valor de `statusToken`. Página válida sem `statusToken` SHALL ser ausência reconhecida. HTML que não contenha a estrutura esperada da página SHALL ser erro de layout.

#### Scenario: Página com token
- **WHEN** a página do filme ou episódio traz `statusToken` com uma string
- **THEN** o provedor usa esse valor na troca pelo player.

#### Scenario: Conteúdo sem token
- **WHEN** a página existe, mas `statusToken` é nulo ou o título está indisponível
- **THEN** o provedor devolve lista vazia sem erro.

#### Scenario: Layout alterado
- **WHEN** a resposta não tem a marcação de título nem o script esperado da página Pomfy
- **THEN** o provedor lança erro de layout.

### Requirement: Seleção do player Flyfile

O provedor SHALL trocar o `statusToken` por `GET /api/play-token?t=<token>` e SHALL selecionar o endereço Flyfile publicado em `flyfileUrl` ou, quando ele for nulo, em `url` cujo host seja `flyfile.app` ou `flyf.lat`. Resposta sem endereço Flyfile, inclusive `flyfileUrl` nulo com `byseUrl`/`url` do Byse, SHALL ser ausência reconhecida. Resposta fora de JSON ou sem os campos do contrato SHALL ser erro.

#### Scenario: Título com Flyfile
- **WHEN** a troca do token devolve `flyfileUrl` apontando para `/embed/<id>`
- **THEN** o provedor segue para a API do Flyfile usando o ID extraído.

#### Scenario: Título com `url` Flyfile
- **WHEN** `flyfileUrl` é nulo e `url` aponta para um host Flyfile em `/embed/<id>`
- **THEN** o provedor usa esse endereço como opção Flyfile.

#### Scenario: Título só com Byse
- **WHEN** a troca do token devolve somente `byseUrl` ou `url` do Byse
- **THEN** o provedor devolve lista vazia sem erro, porque o Byse não é integrado.

#### Scenario: Resposta de player inválida
- **WHEN** a troca do token devolve corpo não JSON ou não informa nenhum endereço reconhecível
- **THEN** o provedor lança erro.

### Requirement: Resolução do HLS no Flyfile

O provedor SHALL consultar a API pública do Flyfile com o referer do embed e os cabeçalhos de embed, SHALL pedir `streaming/assign/<id>` para obter servidor e token e SHALL montar a URL `https://<servidor>/hls/<token>/master.m3u8`. Falha de rede, HTTP fora de 2xx ou `assign` sem `url`/`token` SHALL ser erro.

#### Scenario: Arquivo pronto
- **WHEN** o arquivo está `READY`, tem qualidade pronta e o `assign` devolve servidor e token
- **THEN** o provedor devolve a URL do master HLS.

#### Scenario: Assign incompleto
- **WHEN** o `assign` responde sem `url` ou sem `token`
- **THEN** o provedor lança erro.

### Requirement: Validação do arquivo Flyfile

O provedor SHALL exigir arquivo `READY`, `videoAsset` e ao menos uma qualidade `READY` (lista ou string JSON). Arquivo fora de `READY`, sem `videoAsset` ou sem qualidade pronta SHALL ser ausência reconhecida. Resposta de metadado sem JSON válido SHALL ser erro.

#### Scenario: Arquivo em processamento
- **WHEN** o arquivo não está `READY` ou não tem nenhuma qualidade pronta
- **THEN** o provedor devolve lista vazia sem erro.

#### Scenario: Metadado inválido
- **WHEN** a API do arquivo responde fora de 2xx ou sem JSON válido
- **THEN** o provedor lança erro.

### Requirement: Metadados do stream

O stream SHALL usar como qualidade a maior `quality` pronta do arquivo Flyfile e SHALL informar tamanho, `filename`, bitrate e duração quando o metadado do arquivo os fornecer. O stream SHALL declarar `provider` `Flyfile` e `type` `hls`. A URL do master HLS SHALL ser obtida na execução e SHALL NOT ser cacheada nem registrada em log, fixture ou documentação.

#### Scenario: Qualidade e metadados
- **WHEN** o arquivo anuncia `720p` e `1080p` prontos e o metadado original traz bitrate e duração
- **THEN** o stream sai com `1080p`, tamanho da qualidade escolhida, `filename`, bitrate, duração, `provider` `Flyfile` e `type` `hls`.

#### Scenario: Metadado opcional ausente
- **WHEN** o arquivo não informa tamanho, filename, bitrate ou duração
- **THEN** esses campos não aparecem no stream.

#### Scenario: URL efêmera
- **WHEN** o provedor resolve o mesmo título em duas execuções
- **THEN** cada execução pede um novo `assign` e nenhum log contém a URL do master ou o token.

### Requirement: Classificação de idioma

O idioma do stream SHALL ser derivado do áudio padrão do arquivo: áudio português com indicação de Brasil vira `Dublado`; português sem indicação de Brasil vira `Dublado (Não PT-BR?)`; áudio estrangeiro com legenda portuguesa vira `Legendado`; legenda portuguesa sem indicação de Brasil vira `Legendado (Não PT-BR?)`; sem áudio português nem legenda portuguesa, o resultado é `Gringo` ou `Idioma Desconhecido`. O provedor SHALL NOT promover português sem região a `Dublado`.

#### Scenario: Áudio padrão brasileiro
- **WHEN** o áudio padrão é português com rótulo ou região Brasil
- **THEN** o stream tem `language` `Dublado`.

#### Scenario: Áudio estrangeiro com legenda PT
- **WHEN** o áudio padrão não é português e o arquivo oferece legenda em português
- **THEN** o stream tem `language` `Legendado`.

#### Scenario: Sem evidência de idioma
- **WHEN** o arquivo não informa áudio nem legenda em português
- **THEN** o stream tem `language` `Gringo` ou `Idioma Desconhecido`, conforme a evidência disponível, e nunca `Dublado`.

### Requirement: Legendas externas

O provedor SHALL incluir as legendas anunciadas pelo arquivo Flyfile como `subtitles`, cada uma com `url` e `language` legível. Legendas SHALL NOT receber `headers` que a fonte não exige. Legenda com URL inválida SHALL ser descartada isoladamente sem derrubar o stream.

#### Scenario: Legendas disponíveis
- **WHEN** o arquivo anuncia legendas em português e inglês
- **THEN** o stream traz as duas legendas com os idiomas correspondentes.

#### Scenario: Legenda inválida
- **WHEN** uma legenda anunciada tem URL fora de http(s)
- **THEN** somente essa legenda é descartada e o stream continua com as demais.

### Requirement: Ausência e falhas

Ausência reconhecida — página sem `statusToken`, resposta só com Byse, arquivo não pronto, sem qualidade ou sem `videoAsset` — SHALL devolver lista vazia sem erro. Falha de rede, HTTP fora de 2xx, JSON inválido, layout alterado e `assign` incompleto SHALL lançar erro. Somente `getStreams` SHALL capturar a falha final, registrar `console.error('[Pomfy] ...')` e devolver lista vazia, sem streams parciais.

#### Scenario: Ausência
- **WHEN** a fonte conhece o título, mas não oferece Flyfile pronto
- **THEN** o provedor devolve lista vazia sem `console.error`.

#### Scenario: Falha fatal
- **WHEN** a página ou a API do Flyfile falha depois de o token ter sido obtido
- **THEN** o erro sobe e `getStreams` devolve lista vazia com `console.error` contendo o prefixo `[Pomfy]`.

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format` com `FORMATTER.AUTO`, `addon` `Pomfy`, título e ano da página quando presentes e, em série, temporada e episódio. `name` e `title` SHALL NOT ser informados pelo provedor. A lista SHALL ser ordenada por qualidade.

#### Scenario: Stream formatado
- **WHEN** qualquer stream é montado
- **THEN** `format` leva `addon` `Pomfy`, título e ano da página e as coordenadas da série.

#### Scenario: Sem campos inventados
- **WHEN** a fonte não fornece um campo opcional
- **THEN** o campo não aparece no stream.

#### Scenario: Ordenação
- **WHEN** o provedor devolve mais de um stream
- **THEN** a lista sai ordenada da maior para a menor qualidade.
