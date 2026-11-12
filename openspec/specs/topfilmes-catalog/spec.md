# topfilmes-catalog Specification

## Purpose

Localizar filmes do catálogo TopFilmes a partir do ID do TMDB, confirmar a identidade da ficha, selecionar as opções de player e devolver os MP4 dublados ou legendados que a fonte publica.

## Requirements

### Requirement: Escopo de filme

O provedor SHALL atender somente pedidos de filme. Pedido de série SHALL devolver lista vazia sem consultar a fonte nem o TMDB.

#### Scenario: Pedido de filme

- **WHEN** o app chama o provedor com `mediaType` `movie`
- **THEN** o provedor segue para a busca e a resolução do filme.

#### Scenario: Pedido de série

- **WHEN** o app chama o provedor com `mediaType` `tv`
- **THEN** o provedor devolve lista vazia sem erro e sem requisição externa.

### Requirement: Busca pelos títulos do TMDB

O provedor SHALL consultar `GET /busca?q=<termo>` com o título PT-BR, o título original e até dois títulos alternativos do TMDB, nessa ordem, e SHALL parar no primeiro termo que produza candidato confirmável. A fonte SHALL ser tratada como uma única página de até 24 cartões, sem paginação. Todos os termos sem candidato confirmável são ausência reconhecida.

#### Scenario: Título PT-BR encontra o filme

- **WHEN** a busca pelo título PT-BR devolve candidatos e um deles confirma título e ano
- **THEN** o provedor usa esse candidato e não consulta os termos seguintes.

#### Scenario: Título original encontra o filme

- **WHEN** a busca pelo título PT-BR não devolve candidato confirmável
- **THEN** o provedor tenta o título original e os alternativos antes de concluir pela ausência.

#### Scenario: Busca sem resultados

- **WHEN** todos os termos terminam sem cartões de resultado
- **THEN** o provedor devolve lista vazia, sem erro fatal.

### Requirement: Confirmação de identidade

O candidato SHALL ser escolhido entre os cartões pelo título e pelo ano do TMDB, com tolerância de um ano. A ficha `/assistir/<slug>` SHALL confirmar o título e, quando exibir ano, o ano do filme. Candidato com título ou ano incompatível SHALL ser descartado sem gerar stream.

#### Scenario: Candidato confirmado

- **WHEN** o cartão e a ficha têm título compatível e ano igual ou até um ano distante do TMDB
- **THEN** o candidato segue para a resolução dos players.

#### Scenario: Ano incompatível

- **WHEN** a ficha informa ano mais de um ano distante do TMDB
- **THEN** o candidato é descartado e o provedor tenta o próximo candidato.

#### Scenario: Ficha sem ano

- **WHEN** a ficha confirma o título, mas não exibe ano
- **THEN** o provedor mantém o ano do cartão de busca e não descarta o candidato por falta desse dado.

#### Scenario: Título incompatível na ficha

- **WHEN** a ficha tem título que não corresponde a nenhum título do TMDB acima do limiar de semelhança
- **THEN** o candidato é descartado e o provedor tenta o próximo candidato.

### Requirement: Seleção de players na ficha

O provedor SHALL ler as opções em `.links_dub` e `.links_leg` da ficha e SHALL aceitar somente links do próprio domínio no caminho `/player/<slug>?player=<n>`. Blocos comentados e embeds externos SHALL ser ignorados. Ficha válida sem opção de player é ausência reconhecida; ficha sem o contêiner de links ou sem o título esperado é erro de layout.

#### Scenario: Player dublado

- **WHEN** a ficha tem um link `/player/<slug>?player=1` em `.links_dub`
- **THEN** o provedor resolve esse player e classifica os streams como `Dublado`.

#### Scenario: Player legendado

- **WHEN** a ficha tem um link `/player/<slug>?player=1` em `.links_leg`
- **THEN** o provedor resolve esse player e classifica os streams como `Legendado`.

#### Scenario: Embed externo ignorado

- **WHEN** a ficha contém somente um embed de YouTube ou um bloco de legendado comentado
- **THEN** o provedor não tenta resolver esse endereço como player.

#### Scenario: Ficha sem player

- **WHEN** a ficha é válida, mas não tem nenhum link de player no próprio domínio
- **THEN** o provedor devolve lista vazia, sem erro fatal.

#### Scenario: Layout da ficha alterado

- **WHEN** a ficha não tem o contêiner de links ou o título esperado
- **THEN** o provedor lança erro de layout.

### Requirement: Resolução do player e qualidades

Cada player SHALL ser consultado em `GET /player/<slug>?player=<n>` e SHALL fornecer todos os elementos `<source>` com `src` e `size`. Cada `<source>` SHALL virar um stream, com a qualidade derivada de `size` (`360` vira `360p`, `720` vira `720p` etc.). Endereço relativo ao protocolo SHALL ser resolvido para `https`. Fontes com a mesma URL e qualidade SHALL ser deduplicadas.

#### Scenario: Duas qualidades no mesmo player

- **WHEN** o player publica `<source size="360">` e `<source size="720">`
- **THEN** o provedor devolve dois streams, um com `360p` e outro com `720p`.

#### Scenario: Uma qualidade

- **WHEN** o player publica somente `<source size="720">`
- **THEN** o provedor devolve um stream com `720p`.

#### Scenario: Fonte repetida

- **WHEN** dois players publicam a mesma URL com a mesma qualidade
- **THEN** o provedor devolve um único stream para essa combinação.

### Requirement: Idioma pelo contêiner da ficha

O idioma SHALL ser `Dublado` para opções em `.links_dub` e `Legendado` para opções em `.links_leg`. O provedor SHALL NOT declarar idioma sem a evidência do contêiner.

#### Scenario: Opção dublada

- **WHEN** a opção veio de `.links_dub`
- **THEN** os streams dessa opção têm `language` `Dublado`.

#### Scenario: Opção legendada

- **WHEN** a opção veio de `.links_leg`
- **THEN** os streams dessa opção têm `language` `Legendado`.

### Requirement: Resolução isolada e ausência

Cada player SHALL ser resolvido isoladamente. Falha de rede, HTTP fora de 2xx, player sem `<source>` ou fonte sem `src` SHALL descartar somente aquela opção, com aviso `[TopFilmes] ...`. Se todas as opções falharem, o erro SHALL subir. Somente `getStreams` SHALL capturar a falha final, registrar `console.error('[TopFilmes] ...')` e devolver lista vazia, sem streams parciais.

#### Scenario: Um player falha

- **WHEN** um player responde 404 ou não publica `<source>` e outro player funciona
- **THEN** o provedor registra o aviso, descarta o player com falha e devolve os streams do player que funciona.

#### Scenario: Todos os players falham

- **WHEN** nenhuma opção produz stream
- **THEN** o provedor lança erro com a causa de cada opção e `getStreams` devolve lista vazia com `console.error`.

#### Scenario: Ausência reconhecida

- **WHEN** a busca termina vazia, nenhum candidato confirma a identidade ou a ficha não tem player
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Falha depois da busca

- **WHEN** a ficha ou todos os players falham depois de a busca ter encontrado candidatos
- **THEN** o provedor não devolve os streams parciais de etapas anteriores.

### Requirement: Contrato do stream

Todo stream SHALL ser montado com `buildStream` e o campo `format`, com `FORMATTER.AUTO`, `addon` `TopFilmes`, título e ano do TMDB, `provider` `MediaFire` e `type` `mp4`. `name` e `title` SHALL NOT ser informados pelo provedor. Campo opcional SHALL entrar somente quando a fonte o fornecer. A lista SHALL ser ordenada por qualidade.

#### Scenario: Formatação do stream

- **WHEN** qualquer stream é montado
- **THEN** `format` leva `addon` `TopFilmes`, título e ano do TMDB, e `provider` é `MediaFire`.

#### Scenario: Sem campos inventados

- **WHEN** a fonte não informa tamanho, legenda externa ou cabeçalho de reprodução
- **THEN** esses campos não aparecem no stream.

#### Scenario: Ordenação por qualidade

- **WHEN** o provedor devolve streams de 360p e 720p
- **THEN** a lista sai ordenada da maior para a menor qualidade.

### Requirement: URL de mídia efêmera

A URL de mídia SHALL ser obtida na própria execução do player, SHALL NOT ser cacheada e SHALL NOT ser registrada em log, fixture, relatório ou documentação. O provedor SHALL NOT acrescentar cabeçalhos de reprodução quando a fonte não os exigir.

#### Scenario: Resolução a cada execução

- **WHEN** o provedor resolve o mesmo filme em duas execuções
- **THEN** cada execução consulta o player de novo e usa a URL devolvida naquela execução.

#### Scenario: Logs sanitizados

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL de mídia e seu parâmetro `expires` não aparecem na mensagem.
