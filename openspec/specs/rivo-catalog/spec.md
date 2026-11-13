# rivo-catalog Specification

## Purpose

Localizar filmes e séries no player público do RIVO pelo ID do TMDB, distribuir a consulta pelos servidores de mídia da fonte e devolver os streams HLS e MP4 com a qualidade, o idioma e as legendas anunciados.

## Requirements

### Requirement: Entrada e escopo

O provedor SHALL aceitar `mediaType` `movie` e `tv`. O `tmdbId` SHALL ser numérico e positivo; em `tv`, temporada e episódio SHALL ser inteiros a partir de 1. Entrada inválida SHALL devolver lista vazia sem consultar a rede.

#### Scenario: Pedido de filme

- **WHEN** o app chama o provedor com `mediaType` `movie` e um `tmdbId` numérico positivo
- **THEN** o provedor segue para a consulta do player usando o ID recebido.

#### Scenario: Pedido de série

- **WHEN** o app chama o provedor com `mediaType` `tv`, temporada e episódio inteiros positivos
- **THEN** o provedor segue para a consulta do player preservando as coordenadas do episódio.

#### Scenario: Entrada inválida

- **WHEN** o `tmdbId` não é numérico ou é zero, o tipo não é `movie` nem `tv`, ou uma série vem sem temporada ou episódio válidos
- **THEN** o provedor devolve lista vazia, registra o erro de entrada e não faz requisição externa.

### Requirement: Consulta por ID do TMDB

O provedor SHALL usar o `tmdbId` diretamente no player público do RIVO, sem busca textual e sem `TMDB_API_KEY`. Em filme, o pedido SHALL identificar o filme; em série, SHALL incluir a temporada e o episódio pedidos. HTTP fora de 2xx, JSON inválido ou resposta sem a lista de fontes SHALL ser erro de contrato.

#### Scenario: Filme consultado por ID

- **WHEN** o pedido é de filme e o player responde com a estrutura de fontes
- **THEN** o provedor usa os itens de `sources` daquele filme, sem procurar por título.

#### Scenario: Série consultada por ID e coordenadas

- **WHEN** o pedido é de série e o player responde com a estrutura de fontes
- **THEN** o provedor usa as fontes da temporada e do episódio pedidos, sem trocar as coordenadas.

#### Scenario: Resposta inválida do player

- **WHEN** o player responde fora de 2xx, não é JSON ou não traz `sources` em array
- **THEN** o provedor lança erro de contrato e não trata a falha como ausência.

### Requirement: Descoberta e isolamento dos servidores

O provedor SHALL obter a lista pública de servidores de mídia da fonte e consultar cada servidor suportado. Servidor sem fontes SHALL ser ausência daquele servidor, não erro. Falha técnica de um servidor SHALL descartar somente aquele servidor, com aviso; se nenhum servidor produzir stream e ao menos um falhar, o erro SHALL subir.

#### Scenario: Vários servidores com fontes

- **WHEN** mais de um servidor responde com fontes válidas
- **THEN** o provedor reúne as fontes de todos os servidores que responderam.

#### Scenario: Servidor sem fontes

- **WHEN** um servidor responde com `sources` vazio
- **THEN** o provedor o trata como ausência daquele servidor e continua com os demais, sem erro fatal.

#### Scenario: Falha isolada de servidor

- **WHEN** um servidor falha por rede, HTTP ou resposta inválida e outro produz stream
- **THEN** o provedor registra o aviso do servidor descartado e devolve os streams dos demais.

#### Scenario: Todos os servidores sem fontes

- **WHEN** todos os servidores respondem com `sources` vazio e nenhum falha
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Todos os servidores falham

- **WHEN** nenhum servidor produz stream e ao menos um falhou tecnicamente
- **THEN** o erro sobe com a causa dos servidores e `getStreams` devolve lista vazia com `console.error`.

### Requirement: Triagem de fontes não suportadas

O provedor SHALL aceitar somente fontes com `kind` `hls` ou `mp4` e URL HTTP(S). Fonte com `kind` não suportado SHALL ser descartada por triagem. Fonte suportada com URL inválida ou campo obrigatório ausente SHALL ser descartada como opção inválida, com aviso; se nenhuma opção produzir stream e alguma tiver falhado, o erro SHALL subir. Triagem por `kind` SHALL NOT ser tratada como falha técnica.

#### Scenario: Fonte HLS aceita

- **WHEN** a fonte traz `kind` `hls` e URL HTTP(S)
- **THEN** o provedor monta um stream HLS com essa URL.

#### Scenario: Fonte MP4 aceita

- **WHEN** a fonte traz `kind` `mp4` e URL HTTP(S)
- **THEN** o provedor monta um stream MP4 com essa URL.

#### Scenario: Fonte não suportada

- **WHEN** a fonte traz `kind` `dash` ou formato desconhecido
- **THEN** o provedor a descarta por triagem e continua com as fontes suportadas.

#### Scenario: Fonte suportada malformada

- **WHEN** uma fonte `hls` ou `mp4` traz URL inválida ou campo obrigatório ausente
- **THEN** o provedor a descarta com aviso e continua com as demais; se for a única e nenhuma outra produzir stream, o erro agregado sobe.

#### Scenario: Somente fontes não suportadas

- **WHEN** todas as fontes de todos os servidores têm `kind` não suportado
- **THEN** o provedor devolve lista vazia sem erro fatal.

### Requirement: Qualidade da fonte

A qualidade SHALL ser descoberta no rótulo da fonte. Resolução reconhecida SHALL virar `<n>p` ou `4K`; rótulo sem resolução, como `Auto`, SHALL virar `Desconhecida`. A qualidade SHALL NOT ser inferida de título, ano ou bitrate.

#### Scenario: Rótulo com resolução

- **WHEN** o rótulo traz `1080p`, `720p` ou `4K`
- **THEN** a qualidade do stream é a resolução normalizada.

#### Scenario: Rótulo sem resolução

- **WHEN** o rótulo é `Auto` ou não traz resolução reconhecível
- **THEN** a qualidade do stream é `Desconhecida`.

#### Scenario: Rótulo com metadados técnicos

- **WHEN** o rótulo traz resolução acompanhada de bitrate, codec ou sufixo de áudio
- **THEN** somente a resolução é usada como qualidade.

### Requirement: Idioma da fonte

O idioma SHALL ser classificado a partir do rótulo de idioma da fonte e a saída SHALL ser um dos seis valores de `LANGUAGE`. `Brazilian Portuguese` SHALL ser `Dublado`; `Portuguese` sem região SHALL ser `Dublado (Não PT-BR?)`; `Portuguese sub` SHALL ser `Legendado (Não PT-BR?)`; idioma estrangeiro SHALL ser `Gringo`; rótulo sem idioma SHALL ser `Idioma Desconhecido`.

#### Scenario: Áudio brasileiro

- **WHEN** o rótulo informa `Brazilian Portuguese` como áudio
- **THEN** o stream sai com `Dublado`.

#### Scenario: Português sem região

- **WHEN** o rótulo informa `Portuguese` como áudio, sem indicação de Brasil
- **THEN** o stream sai com `Dublado (Não PT-BR?)`.

#### Scenario: Legenda em português

- **WHEN** o rótulo informa `Portuguese sub` ou equivalente de legenda em português
- **THEN** o stream sai com `Legendado (Não PT-BR?)`.

#### Scenario: Idioma estrangeiro

- **WHEN** o rótulo informa inglês, espanhol, hindi ou outro idioma estrangeiro
- **THEN** o stream sai com `Gringo`.

#### Scenario: Sem idioma no rótulo

- **WHEN** o rótulo não informa idioma
- **THEN** o stream sai com `Idioma Desconhecido`.

### Requirement: Legendas da fonte

As legendas SHALL vir somente da resposta do mesmo servidor da fonte. Cada legenda SHALL ter URL HTTP(S) e idioma. Legenda não direta SHALL usar o proxy público de legendas do RIVO. Legendas repetidas SHALL ser deduplicadas; servidor sem legendas SHALL NOT inventar entradas.

#### Scenario: Legenda direta

- **WHEN** o servidor anuncia uma legenda com URL utilizável diretamente
- **THEN** o stream recebe essa URL e o idioma anunciado.

#### Scenario: Legenda intermediada

- **WHEN** o servidor anuncia uma legenda que depende do proxy público do RIVO
- **THEN** o stream recebe a URL do proxy com a legenda codificada e o idioma anunciado.

#### Scenario: Legendas repetidas

- **WHEN** o mesmo servidor repete a mesma legenda em mais de uma entrada
- **THEN** o stream recebe apenas uma cópia.

#### Scenario: Servidor sem legendas

- **WHEN** o servidor não anuncia legendas
- **THEN** o stream não recebe o campo `subtitles`.

### Requirement: Metadados da obra

Título e ano SHALL ser usados no `format` quando o endpoint público de metadados os fornecer. Temporada e episódio SHALL vir do pedido do app, não do metadado. Falha ou ausência do metadado SHALL NOT impedir a devolução das fontes já obtidas; o campo correspondente SHALL ser omitido.

#### Scenario: Metadados de filme

- **WHEN** o endpoint de metadados devolve título e ano do filme
- **THEN** o `format` dos streams leva esses valores.

#### Scenario: Metadados de série

- **WHEN** o endpoint de metadados devolve título e ano da série
- **THEN** o `format` dos streams leva título, ano, temporada e episódio do pedido.

#### Scenario: Metadados indisponíveis

- **WHEN** o endpoint de metadados falha ou não devolve o campo
- **THEN** o provedor registra o aviso, omite o campo no `format` e ainda devolve as fontes obtidas.

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format`, com `FORMATTER.AUTO` e `addon` `RIVO`. O `type` SHALL ser `hls` ou `mp4` conforme a fonte; `provider` SHALL identificar o servidor de origem. O provedor SHALL NOT informar `name` nem `title`, e a lista SHALL ser ordenada por qualidade.

#### Scenario: Formatação de filme

- **WHEN** um filme é resolvido
- **THEN** cada stream leva `addon` `RIVO`, título e ano quando disponíveis e `type` igual ao `kind` da fonte.

#### Scenario: Formatação de série

- **WHEN** um episódio é resolvido
- **THEN** cada stream leva temporada e episódio do pedido no `format`, além do título e do ano.

#### Scenario: Origem do stream

- **WHEN** a fonte vem de um servidor de mídia
- **THEN** o campo `provider` identifica esse servidor.

#### Scenario: Ordenação

- **WHEN** o provedor devolve streams de qualidades diferentes
- **THEN** a lista sai da maior para a menor qualidade.

#### Scenario: Campos opcionais

- **WHEN** a fonte não fornece tamanho, cabeçalhos ou outra informação opcional
- **THEN** o campo não é inventado no stream.

### Requirement: Ausência, falhas e efemeridade

Ausência reconhecida SHALL devolver lista vazia sem erro fatal. Falha de consulta, de contrato ou de todas as opções SHALL subir até `getStreams`, que SHALL registrar `console.error('[RIVO] ...')` e devolver lista vazia. URL de mídia assinada SHALL ser obtida a cada execução e SHALL NOT aparecer em log, fixture ou documentação.

#### Scenario: Ausência reconhecida

- **WHEN** o player responde sem fontes ou todas as fontes são apenas triagem
- **THEN** o provedor devolve lista vazia sem `console.error`.

#### Scenario: Falha fatal

- **WHEN** a consulta falha, o contrato muda ou todas as opções falham tecnicamente
- **THEN** `getStreams` registra `[RIVO] ...` e devolve lista vazia, sem streams parciais.

#### Scenario: Resolução a cada execução

- **WHEN** o provedor resolve o mesmo título em duas execuções
- **THEN** cada execução consulta o player de novo, sem reutilizar URL de mídia.

#### Scenario: Logs sanitizados

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL de mídia, tokens, assinaturas e hashes não aparecem na mensagem.
