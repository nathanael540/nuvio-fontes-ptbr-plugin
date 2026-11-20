# redecanais-deals-catalog Specification

## Purpose
Localizar filmes e séries do catálogo `redecanais.deals` a partir do ID do TMDB, confirmar a identidade pelo `vid` do player, selecionar o episódio publicado e devolver o MP4 assinado do `action=resolve` com o idioma comprovado pelo arquivo resolvido.

## Requirements

### Requirement: Escopo e validação de entrada

O provedor SHALL atender `movie` e `tv`. `tmdbId` não numérico, `mediaType` fora do escopo e série sem temporada/episódio inteiros a partir de 1 SHALL lançar erro antes de qualquer requisição. Filme SHALL ignorar temporada e episódio.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` registra a falha com `[RedeCanais Deals]`.

#### Scenario: Série sem coordenadas

- **WHEN** `mediaType` é `tv` e temporada ou episódio não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de consultar o TMDB.

#### Scenario: Filme válido

- **WHEN** `mediaType` é `movie` com `tmdbId` numérico
- **THEN** o provedor consulta o TMDB e segue para a busca, ignorando temporada e episódio.

### Requirement: Busca por títulos do TMDB

O provedor SHALL consultar `GET /search.php?keywords=<termo>` com título PT-BR, original e alternativos, até oito termos deduplicados. A busca SHALL ser tratada como uma única página, sem paginação inventada. Página sem o título de busca SHALL lançar erro de estrutura; busca válida com `Nenhum conteúdo encontrado.` ou sem links SHALL ser ausência.

#### Scenario: Título encontra o conteúdo

- **WHEN** a busca por um dos títulos do TMDB devolve resultados
- **THEN** o provedor acumula os candidatos e segue para a confirmação.

#### Scenario: Busca sem resultado

- **WHEN** a página é válida e publica `Nenhum conteúdo encontrado.` ou não tem links de resultado
- **THEN** o provedor trata o termo como ausência e tenta o próximo, sem erro.

#### Scenario: Busca sem estrutura

- **WHEN** a resposta 2xx não tem o título `Buscar Conteúdo RedeCanais:` nem a lista de resultados
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Separação entre filme e série

O provedor SHALL aceitar como série somente a rota com `-lista-de-episodios_<hash>.html` e como filme somente a rota sem esse marcador. Cartão de tipo divergente SHALL ser descartado sem abrir a ficha.

#### Scenario: Cartão de filme

- **WHEN** o resultado aponta para `/vingadores-era-de-ultron-2015-1080p_<hash>.html?audio=dub` em pedido de filme
- **THEN** o provedor abre a ficha do filme.

#### Scenario: Cartão de série

- **WHEN** o resultado aponta para `/the-last-of-us-lista-de-episodios_<hash>.html?audio=dub` em pedido de série
- **THEN** o provedor abre a página da série para localizar o episódio.

#### Scenario: Tipo divergente

- **WHEN** o resultado de série aparece em pedido de filme ou o de filme aparece em pedido de série
- **THEN** o candidato é descartado sem abrir a ficha.

### Requirement: Confirmação de identidade

O provedor SHALL confirmar o candidato pelo título e pelo ano do TMDB, com tolerância de um ano, e SHALL exigir que o `vid` do player contenha o TMDB pedido (`m<tmdb>.mp4` em filme; `e<tmdb>-<temporada>-<episódio>.mp4` em série). `vid` com TMDB diferente SHALL descartar o candidato.

#### Scenario: Filme confirmado

- **WHEN** o título/ano do resultado conferem e o `vid` é `m99861.mp4` para o TMDB 99861
- **THEN** o candidato segue para a resolução do player.

#### Scenario: Série confirmada

- **WHEN** o título/ano conferem e o `vid` é `e100088-1-1.mp4` para o TMDB 100088, temporada 1, episódio 1
- **THEN** o candidato segue para a resolução do player.

#### Scenario: TMDB divergente

- **WHEN** o `vid` aponta para outro TMDB, outra temporada ou outro episódio
- **THEN** o candidato é descartado e o provedor tenta o próximo.

#### Scenario: Ficha sem ano

- **WHEN** o título confere, mas a ficha não publica ano
- **THEN** o provedor mantém o ano do resultado e não descarta o candidato por falta desse dado.

### Requirement: Seleção de episódio

O provedor SHALL selecionar o episódio pelo par `Nª Temporada - Episódio N` publicado nos links da página da série, sem usar posição visual, e SHALL usar o `href` da fonte. Par ausente SHALL ser ausência; página de série sem lista de episódios SHALL ser erro de estrutura.

#### Scenario: Par publicado

- **WHEN** a série publica o link `...-1a-temporada-episodio-01_<hash>.html?audio=dub` e o pedido é temporada 1, episódio 1
- **THEN** o provedor abre esse `href` e usa o `audio` publicado.

#### Scenario: Par ausente

- **WHEN** a página não publica o par temporada/episódio pedido
- **THEN** o candidato é ausência e o provedor tenta o próximo.

#### Scenario: Lista ausente

- **WHEN** a página de série confirmada não publica links de episódio
- **THEN** o provedor lança erro de estrutura.

### Requirement: Resolução do player

O provedor SHALL abrir `iframe[name="Player"]`, ler `var SOURCE_URL` e consultar `action=resolve`. A resposta SHALL ser JSON com `ok: true` e `src` HTTP(S); `ok` falso, `src` ausente, JSON inválido ou resposta fora de 2xx SHALL ser falha da opção. O `download` SHALL NOT ser usado como stream.

#### Scenario: Resolve válido

- **WHEN** o resolve devolve `ok: true` e `src` MP4 HTTP(S)
- **THEN** o provedor monta um stream MP4 com a URL de `src`.

#### Scenario: Resolve sem mídia

- **WHEN** o resolve devolve `ok: false`, `src` vazio ou JSON inválido
- **THEN** a opção falha isoladamente com aviso.

#### Scenario: Ficha sem iframe

- **WHEN** a ficha confirmada não publica `iframe[name="Player"]` ou `SOURCE_URL`
- **THEN** a opção falha isoladamente com aviso.

### Requirement: Idioma comprovado pelo arquivo

O provedor SHALL classificar o idioma pelo `audio` do `download`/`src` resolvido: `dub` SHALL ser `Dublado`, `leg` SHALL ser `Legendado` e ausência SHALL ser `Idioma Desconhecido`. O rótulo `(Legendado)` da página e o parâmetro `?audio=leg` SHALL NOT ser prova do arquivo, porque o resolve devolve o mesmo MP4 dublado.

#### Scenario: Arquivo dublado

- **WHEN** o resolve devolve `download` com `audio=dub`
- **THEN** o stream sai com `language` `Dublado`, mesmo que a página diga `(Legendado)`.

#### Scenario: Arquivo legendado

- **WHEN** o resolve devolve `download` com `audio=leg`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Sem marcador

- **WHEN** o resolve não publica `audio` no `download`/`src`
- **THEN** o stream é preservado com `language` `Idioma Desconhecido`.

#### Scenario: Fachada legendada

- **WHEN** a página `?audio=leg` muda o título para `(Legendado)`, mas o resolve devolve `audio=dub`
- **THEN** o provedor classifica o stream como `Dublado`, não como `Legendado`.

### Requirement: Qualidade e contrato do stream

Todo stream SHALL ser montado com `buildStream` e `format`, sem `name`/`title`, com `type` `mp4`, `provider` do parâmetro `server` do player e qualidade do título. Sem qualidade na fonte, a descoberta local SHALL decidir. `headers`, tamanho e legendas SHALL entrar somente quando a fonte os fornecer.

#### Scenario: Stream completo

- **WHEN** o título publica `1080p`, o resolve entrega MP4 dublado e o `server` é `XT`
- **THEN** o stream tem `quality` `1080p`, `type` `mp4`, `provider` `XT`, `language` `Dublado` e `format` com título, ano, temporada e episódio.

#### Scenario: Qualidade desconhecida

- **WHEN** o título não publica qualidade reconhecível
- **THEN** a qualidade é omitida e `buildStream` preenche `Desconhecida`.

#### Scenario: Sem campos inventados

- **WHEN** a fonte não informa tamanho, legenda externa ou cabeçalho de reprodução
- **THEN** esses campos não aparecem no stream.

#### Scenario: Ordenação

- **WHEN** o provedor devolve streams de qualidades diferentes
- **THEN** a lista sai ordenada da maior para a menor qualidade.

### Requirement: Isolamento, falha e ausência

Cada candidato SHALL ser resolvido em isolamento, com aviso `[RedeCanais Deals] Opção <rótulo> descartada: <causa>`. Se nenhum produzir stream e algum falhar, o erro agregado SHALL subir. Candidato 404 ou `vid` divergente SHALL ser pulado; ausência de busca, par de episódio ou player SHALL devolver lista vazia.

#### Scenario: Um candidato falha

- **WHEN** um candidato responde 404 e outro entrega MP4
- **THEN** o stream válido é devolvido e o aviso cita o candidato descartado.

#### Scenario: Todos falham

- **WHEN** todos os candidatos confirmados falham no player ou no resolve
- **THEN** o erro agregado cita cada causa e sobe para `getStreams`.

#### Scenario: Tudo é ausência

- **WHEN** a busca não devolve resultado, nenhum `vid` confere ou o par de episódio não existe
- **THEN** o provedor devolve lista vazia, sem erro fatal.

#### Scenario: Candidato removido

- **WHEN** a ficha confirmada responde 404
- **THEN** o candidato é pulado sem erro e os demais continuam.

### Requirement: Sem tempo, sonda ou cache

O provedor SHALL NOT instalar timeout próprio, `AbortController`, retentativa, sonda de mídia, cache ou settings. A URL assinada SHALL ser resolvida a cada execução e SHALL NOT aparecer em log, fixture, relatório ou documentação.

#### Scenario: Resolução nova

- **WHEN** o mesmo título é resolvido em duas execuções
- **THEN** cada execução consulta o resolve de novo e usa a URL devolvida naquela execução.

#### Scenario: Log sanitizado

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL de mídia e seus parâmetros `X-Amz-Signature` e `X-Amz-Date` não aparecem na mensagem.

#### Scenario: Sem sonda

- **WHEN** o resolve publica a URL de mídia
- **THEN** o provedor devolve a URL sem `Range`, `HEAD` ou abertura do MP4.
