# redecanais-catalog Specification

## Purpose
Localizar filmes e séries do catálogo RedeCanais a partir do ID do TMDB, confirmar a identidade da ficha, selecionar o episódio pela temporada publicada e devolver os streams MP4 ou HLS do player da fonte.

## Requirements

### Requirement: Escopo e validação de entrada

O provedor SHALL atender `movie` e `tv`. `tmdbId` não numérico, `mediaType` fora do escopo e série sem temporada/episódio inteiros a partir de 1 SHALL lançar erro antes de qualquer requisição. Filme SHALL ignorar temporada e episódio.

#### Scenario: Entrada inválida

- **WHEN** `tmdbId` não é numérico ou `mediaType` não é `movie` nem `tv`
- **THEN** o provedor lança erro antes de qualquer requisição e `getStreams` registra a falha com `[RedeCanais]`.

#### Scenario: Série sem coordenadas

- **WHEN** `mediaType` é `tv` e temporada ou episódio não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de consultar o TMDB.

#### Scenario: Filme válido

- **WHEN** `mediaType` é `movie` com `tmdbId` numérico
- **THEN** o provedor consulta o TMDB e segue para a busca, ignorando temporada e episódio.

### Requirement: Busca por títulos do TMDB

O provedor SHALL consultar `GET /search.php?keywords=<termo>` com título PT-BR, original, alternativos e romaji, até oito termos deduplicados, e SHALL ler até cinco páginas de oito cartões. Página sem o título de busca da fonte SHALL lançar erro de estrutura; busca válida sem cartões SHALL ser ausência.

#### Scenario: Título encontra o conteúdo

- **WHEN** a busca por um dos títulos do TMDB devolve cartões
- **THEN** o provedor acumula os cartões e segue para a confirmação.

#### Scenario: Paginação

- **WHEN** a primeira página publica oito cartões e um link `&page=2`
- **THEN** o provedor lê a página seguinte, até o limite de cinco páginas.

#### Scenario: Busca sem resultado

- **WHEN** a página de busca é válida e não publica cartões
- **THEN** o provedor trata o termo como ausência e tenta o próximo, sem erro.

#### Scenario: Busca sem estrutura

- **WHEN** a resposta 2xx não tem o título de busca nem a marcação da página de resultados
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Separação entre filme e série

O provedor SHALL usar a rota `-lista-de-episodios_` como pista de série e SHALL confirmar o tipo pela presença de `div[itemprop="description"]` na ficha: com o contêiner é série, sem ele é filme. Ficha confirmada com pista de série e sem o contêiner SHALL lançar erro de estrutura; os demais tipos divergentes SHALL ser descartados sem erro.

#### Scenario: Cartão de filme

- **WHEN** o cartão aponta para `/duna-parte-dois-2024-dublado_<hash>.html` em pedido de filme
- **THEN** o provedor abre a ficha e confirma o filme pela ausência do contêiner de episódios.

#### Scenario: Cartão de série

- **WHEN** o cartão aponta para `/the-last-of-us-lista-de-episodios_<hash>.html` em pedido de série
- **THEN** o provedor abre a página da série e confirma o tipo pelo contêiner de episódios.

#### Scenario: Série sem marcador na rota

- **WHEN** o cartão aponta para `/chernobyl_<hash>.html` em pedido de série e a ficha publica o contêiner de episódios
- **THEN** o provedor trata a ficha como série e localiza o episódio.

#### Scenario: Tipo divergente

- **WHEN** a ficha confirmada de um pedido de filme publica o contêiner de episódios, ou a ficha sem a pista de série de um pedido de série não publica o contêiner
- **THEN** o candidato é descartado sem erro e o provedor tenta o próximo.

### Requirement: Confirmação de identidade

O provedor SHALL aceitar o cartão cujo título limpo, comparado aos títulos do TMDB, alcança similaridade 0,85 e cujo ano fica a até um ano do ano do TMDB ou da temporada pedida. O `h1` da ficha SHALL confirmar título e ano; divergência SHALL descartar o candidato.

#### Scenario: Filme confirmado

- **WHEN** o cartão e o `h1` do filme têm título compatível e ano dentro da tolerância
- **THEN** o candidato segue para a resolução do player.

#### Scenario: Série confirmada

- **WHEN** o cartão e o `h1` da série têm título compatível e o ano confere com a série ou com a temporada pedida
- **THEN** o provedor lê os episódios da página.

#### Scenario: Ano divergente

- **WHEN** o `h1` informa ano mais de um ano distante do esperado
- **THEN** o candidato é descartado e o provedor tenta o próximo.

#### Scenario: Ficha sem ano

- **WHEN** o `h1` confirma o título, mas não exibe ano
- **THEN** o provedor mantém o ano do cartão e não descarta o candidato por falta desse dado.

#### Scenario: Título divergente

- **WHEN** o `h1` da ficha não corresponde a nenhum título do TMDB acima do limiar
- **THEN** o candidato é descartado e o provedor tenta o próximo.

### Requirement: Seleção de episódio

O provedor SHALL selecionar o episódio pelo par temporada/episódio publicado no `href` e no texto de `div[itemprop="description"]`, sem usar posição visual, e SHALL usar o `href` da fonte. Par ausente SHALL ser ausência; página de série sem o contêiner de episódios SHALL ser erro de estrutura.

#### Scenario: Par publicado

- **WHEN** a série publica `1ª Temporada` e o link `...-1a-temporada-episodio-01-...` e o pedido é temporada 1, episódio 1
- **THEN** o provedor abre o `href` dessa entrada.

#### Scenario: Episódio legendado

- **WHEN** o link do episódio contém `-leg-` e o título do episódio contém `[LEG]`
- **THEN** o episódio é o mesmo par publicado e o áudio é classificado como legendado.

#### Scenario: Par ausente

- **WHEN** a série não publica o par temporada/episódio pedido
- **THEN** o candidato é ausência e o provedor tenta o próximo.

#### Scenario: Contêiner ausente

- **WHEN** a página de série confirmada não tem `div[itemprop="description"]`
- **THEN** o provedor lança erro de estrutura.

### Requirement: Resolução do player

O provedor SHALL abrir o `iframe[name="Player"]` com `Referer` da ficha e SHALL ler `SRC`, `SOURCE_FORMAT` e `SOURCE_MIME`. `file`/`video/mp4` SHALL gerar stream MP4; `hls` ou URL `.m3u8` SHALL gerar HLS; player sem `SRC` SHALL falhar isoladamente.

#### Scenario: MP4 confirmado

- **WHEN** o player publica `SOURCE_FORMAT: "file"`, `SOURCE_MIME: "video/mp4"` e `SRC` HTTP(S)
- **THEN** o provedor devolve um stream MP4 com essa URL.

#### Scenario: HLS declarado

- **WHEN** o player publica `SOURCE_FORMAT: "hls"` ou `SRC` terminado em `.m3u8`
- **THEN** o provedor devolve um stream HLS com essa URL.

#### Scenario: Player sem mídia

- **WHEN** o player responde 2xx, mas não publica `SRC` utilizável
- **THEN** a opção falha isoladamente com aviso.

#### Scenario: Ficha sem iframe

- **WHEN** a ficha confirmada não publica `iframe[name="Player"]`
- **THEN** a opção falha isoladamente com aviso.

### Requirement: Idioma

Em filme, o idioma SHALL vir do rótulo `Dublado`/`Legendado` da ficha ou do cartão. Em episódio, o marcador do próprio episódio (`-dublado`, `-leg`, `[LEG]`) SHALL prevalecer sobre o rótulo da série; o texto genérico `Dublado e Legendado` SHALL NOT classificar o áudio. Sem evidência, o stream SHALL sair com `Idioma Desconhecido`.

#### Scenario: Filme dublado

- **WHEN** a ficha do filme declara `(Dublado)`
- **THEN** o stream sai com `language` `Dublado`.

#### Scenario: Filme legendado

- **WHEN** a ficha do filme declara `(Legendado)`
- **THEN** o stream sai com `language` `Legendado`.

#### Scenario: Episódio legendado

- **WHEN** a série é rotulada `(Dublado)`, mas o link do episódio tem `-leg-` e o título tem `[LEG]`
- **THEN** o stream desse episódio sai com `language` `Legendado`.

#### Scenario: Texto genérico

- **WHEN** o título do episódio só traz `Dublado e Legendado` e o link não tem marcador
- **THEN** o provedor usa o rótulo da série e não classifica o texto genérico como áudio.

#### Scenario: Sem evidência

- **WHEN** nem a ficha nem o episódio declaram áudio ou legenda
- **THEN** o stream é preservado com `language` `Idioma Desconhecido`.

### Requirement: Qualidade e contrato do stream

Todo stream SHALL ser montado com `buildStream` e `format`, sem `name`/`title`, com `type`, `provider` do parâmetro `server` do player e qualidade do cartão/ficha. Sem qualidade na fonte, a descoberta local SHALL decidir. `headers`, tamanho e legendas SHALL entrar somente quando a fonte os fornecer.

#### Scenario: Stream completo

- **WHEN** a ficha declara `1080p`, o player entrega MP4 dublado e o parâmetro `server` é `R2`
- **THEN** o stream tem `quality` `1080p`, `type` `mp4`, `provider` `R2`, `language` `Dublado` e `format` com título, ano, temporada e episódio.

#### Scenario: Qualidade desconhecida

- **WHEN** o cartão e a ficha não publicam qualidade reconhecível
- **THEN** a qualidade é omitida e `buildStream` preenche `Desconhecida`.

#### Scenario: Sem campos inventados

- **WHEN** a fonte não informa tamanho, legenda externa ou cabeçalho de reprodução
- **THEN** esses campos não aparecem no stream.

#### Scenario: Ordenação

- **WHEN** o provedor devolve streams de qualidades diferentes
- **THEN** a lista sai ordenada da maior para a menor qualidade.

### Requirement: Isolamento, falha e ausência

Cada candidato e cada player SHALL ser resolvido em isolamento, com aviso `[RedeCanais] Opção <rótulo> descartada: <causa>`. Se nenhum produzir stream e algum falhar, o erro agregado SHALL subir. Candidato 404 SHALL ser pulado; ausência de cartão, par ou player SHALL devolver lista vazia.

#### Scenario: Um candidato falha

- **WHEN** a opção legendada responde 403 no player e a dublada entrega MP4
- **THEN** o stream dublado é devolvido e o aviso cita a opção legendada descartada.

#### Scenario: Todos falham

- **WHEN** todas as opções confirmadas falham no player
- **THEN** o erro agregado cita cada causa e sobe para `getStreams`.

#### Scenario: Tudo é ausência

- **WHEN** a busca não devolve cartão, nenhum candidato confirma ou o par de episódio não existe
- **THEN** o provedor devolve lista vazia, sem erro fatal.

#### Scenario: Candidato removido

- **WHEN** a ficha confirmada responde 404
- **THEN** o candidato é pulado sem erro e os demais continuam.

### Requirement: Sem tempo, sonda ou cache

O provedor SHALL NOT instalar timeout próprio, `AbortController`, retentativa, sonda de mídia, cache ou settings. A URL assinada SHALL ser resolvida a cada execução e SHALL NOT aparecer em log, fixture, relatório ou documentação.

#### Scenario: Resolução nova

- **WHEN** o mesmo título é resolvido em duas execuções
- **THEN** cada execução consulta o player de novo e usa a URL devolvida naquela execução.

#### Scenario: Log sanitizado

- **WHEN** o provedor registra aviso ou erro
- **THEN** a URL de mídia e seus parâmetros `exp` e `sig` não aparecem na mensagem.

#### Scenario: Sem sonda

- **WHEN** o player publica a URL de mídia
- **THEN** o provedor devolve a URL sem `Range`, `HEAD` ou abertura da playlist.
