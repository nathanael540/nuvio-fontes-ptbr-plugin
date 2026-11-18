# Spec Delta

## Purpose

Localizar filmes e séries na VenoPlay pelo título do TMDB, confirmar o tipo e o ano na página da fonte e resolver o player `mgeb` em streams HLS dublados a partir do `get_players`.

## ADDED Requirements

### Requirement: Entrada e domínio vigente

O provedor SHALL aceitar `movie` e `tv` com `tmdbId` numérico; em série, temporada e episódio SHALL ser inteiros a partir de 1. A semente `https://www2.venoplay.com` SHALL ser resolvida a cada chamada e o host final usado na busca, na página e na API, sem cache. Entrada inválida SHALL ser rejeitada antes da rede.

#### Scenario: Pedido de filme

- **WHEN** o app pede `movie` com um `tmdbId` numérico positivo
- **THEN** o provedor resolve a semente e segue para a busca pelo título, sem temporada nem episódio.

#### Scenario: Pedido de série

- **WHEN** o app pede `tv` com temporada e episódio inteiros a partir de 1
- **THEN** o provedor preserva as coordenadas para a consulta do `get_players`.

#### Scenario: Entrada inválida

- **WHEN** o `tmdbId` não é numérico, o tipo não é `movie` nem `tv`, ou a série não traz temporada e episódio válidos
- **THEN** o provedor devolve lista vazia e não faz requisição externa.

#### Scenario: Semente com redirecionamento

- **WHEN** a semente responde com URL final em outro host
- **THEN** o provedor usa o host final na busca, na página e na API daquela chamada.

#### Scenario: Semente indisponível

- **WHEN** a semente falha ou não responde
- **THEN** o provedor usa `https://w2.venoplay.site` como reserva e continua a chamada.

### Requirement: Busca e confirmação do título

O provedor SHALL buscar em `/busca?q=<termo>` com o título PT-BR e o original do TMDB, ler os cartões de resultado e confirmar o título exato, o tipo (`Filme`/`Série`) e o ano publicado na página. O prefixo `filme-`/`serie-` da URL SHALL NOT decidir o tipo. Mais de um candidato confirmado SHALL ser ausência por ambiguidade.

#### Scenario: Título exato encontrado

- **WHEN** um cartão traz o título exato, o tipo pedido e a página confirma o ano do TMDB
- **THEN** o provedor usa a página e extrai o `mediaId`.

#### Scenario: Fallback para o título original

- **WHEN** a busca pelo título PT-BR não confirma nenhum candidato e o título original é diferente
- **THEN** o provedor repete a busca com o título original.

#### Scenario: Tipo divergente

- **WHEN** o cartão com o título exato declara `Filme` em um pedido `tv` ou `Série` em um pedido `movie`
- **THEN** o candidato é descartado sem interromper os demais.

#### Scenario: Ano divergente

- **WHEN** a página do candidato publica ano diferente do TMDB
- **THEN** o candidato é descartado.

#### Scenario: Ambiguidade

- **WHEN** mais de um candidato passa pela confirmação no mesmo termo
- **THEN** o provedor reconhece ausência em vez de escolher o primeiro.

#### Scenario: Título fora do catálogo

- **WHEN** nenhum termo encontra um candidato confirmado
- **THEN** o provedor devolve lista vazia sem erro fatal.

### Requirement: Player por `get_players`

O provedor SHALL extrair o `mediaId` da página do título e consultar `GET /api/get_players?id=<id>&season_number=<s>&episode_number=<e>&site_id=4`; em filme, temporada e episódio SHALL ser vazios. A resposta SHALL trazer `players` em lista; lista vazia é ausência e resposta fora desse contrato é erro.

#### Scenario: Filme

- **WHEN** a página confirma um filme com `mediaId` numérico
- **THEN** o provedor consulta o `get_players` com temporada e episódio vazios.

#### Scenario: Série

- **WHEN** a página confirma uma série com `mediaId` numérico
- **THEN** o provedor consulta o `get_players` com a temporada e o episódio pedidos.

#### Scenario: Lista vazia

- **WHEN** a API responde `players` como lista vazia
- **THEN** o provedor reconhece ausência e não faz nova tentativa com outro título.

#### Scenario: Resposta inválida

- **WHEN** a API responde fora de 2xx, não é JSON ou não traz `players` como lista
- **THEN** o provedor lança erro de contrato, sem tratar como ausência.

### Requirement: Resolução do player `mgeb`

Cada item de `players` SHALL ser uma opção independente. O provedor SHALL abrir a URL do player `mgeb.space`/`mgeb.lat`, ler `var sources` e manter somente HLS `.m3u8` HTTPS de host comprovado, sem `workers.dev` e sem `username`, `token` ou `password`. O host `nhdapi.com` SHALL ser triagem. Falha de uma opção SHALL preservar as demais.

#### Scenario: Opção dublada no `mgeb`

- **WHEN** o `get_players` devolve uma opção `Dublado` em `mgeb.space` ou `mgeb.lat`
- **THEN** o provedor abre o player e lê `var sources`.

#### Scenario: Fonte HLS aceita

- **WHEN** `sources` traz uma URL `.m3u8` HTTPS de host comprovado
- **THEN** o provedor monta um stream HLS com essa URL.

#### Scenario: Fonte com credencial

- **WHEN** a URL de uma fonte contém `username`, `token` ou `password`
- **THEN** o provedor a descarta por triagem, mesmo que responda mídia.

#### Scenario: Fonte de worker

- **WHEN** a URL de uma fonte pertence a `workers.dev`
- **THEN** o provedor a descarta por triagem.

#### Scenario: Player sem `sources`

- **WHEN** a página do player responde 2xx sem `var sources`
- **THEN** a opção falha com erro de estrutura.

#### Scenario: `sources` vazio

- **WHEN** `var sources` é uma lista vazia ou sem nenhuma fonte HLS aceitável
- **THEN** a opção termina em ausência.

#### Scenario: Opção legendada indisponível

- **WHEN** o `get_players` devolve `Legendado` em `nhdapi.com`
- **THEN** o provedor descarta a opção por triagem, sem requisição ao host.

#### Scenario: Falha do host `mgeb.space`

- **WHEN** o player em `mgeb.space` responde fora de 2xx
- **THEN** o provedor tenta o mesmo caminho em `mgeb.lat` antes de descartar a opção.

#### Scenario: Uma opção falha e outra resolve

- **WHEN** uma opção falha e a outra produz playlist
- **THEN** o provedor devolve o stream da opção válida e registra o aviso da descartada.

### Requirement: Contrato dos streams

Cada stream SHALL ser montado com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `VenoPlay`, `provider` do host, `type` `hls`, título e ano do TMDB quando disponíveis, temporada e episódio do pedido). O idioma SHALL vir do rótulo do player e a qualidade SHALL ser `Desconhecida`, sem sonda. `name` e `title` SHALL NOT ser informados.

#### Scenario: Opção dublada

- **WHEN** o item de `players` se chama `Dublado`
- **THEN** o stream sai com `language` `Dublado`.

#### Scenario: Qualidade não declarada

- **WHEN** a fonte não declara resolução
- **THEN** o stream sai com `quality` `Desconhecida` e nenhuma requisição extra é feita à mídia.

#### Scenario: Episódio formatado

- **WHEN** o pedido é de série
- **THEN** o `format` leva temporada e episódio do pedido.

#### Scenario: Fontes repetidas

- **WHEN** duas fontes apontam para a mesma URL
- **THEN** o provedor devolve um único stream.

### Requirement: Fronteira de erro e ausência

Ausência reconhecida SHALL devolver lista vazia sem `console.error`. Falha de rede, HTTP, contrato ou de todas as opções SHALL subir até `getStreams`, que registra `[VenoPlay] ...` e devolve lista vazia. Logs SHALL NOT conter URL de mídia, token, `username` ou `md5`.

#### Scenario: Ausência reconhecida

- **WHEN** o título não está no catálogo, o `get_players` está vazio ou as fontes são todas triagem
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Falha fatal

- **WHEN** a busca, o `get_players` ou todas as opções falham tecnicamente
- **THEN** `getStreams` registra `[VenoPlay] ...` e devolve lista vazia, sem streams parciais.

#### Scenario: Logs sanitizados

- **WHEN** o provedor registra um aviso ou erro
- **THEN** a mensagem não contém URL de mídia, token, `username` ou `md5`.
