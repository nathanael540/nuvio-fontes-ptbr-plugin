# Spec Delta

## Purpose

Localizar filmes e séries de donghua no catálogo público Donghua No Sekai, confirmar a identidade na ficha, selecionar temporada e episódio pelos marcadores publicados e devolver os streams HLS e MP4 dos players do site, legendados em português.

## ADDED Requirements

### Requirement: Entrada e busca HTML

O provedor SHALL validar `tmdbId`, `mediaType`, `season` e `episode` e SHALL consultar `GET https://donghuanosekai.com/?s=<termo>`, lendo os cartões `div.itemE.capa`, o tipo em `div.selos[data-ona]`, o título em `h3` e a URL publicada.

#### Scenario: Série sem coordenadas

- **WHEN** o tipo é `tv` e temporada ou episódio não é inteiro a partir de 1
- **THEN** o provedor lança erro antes de qualquer requisição.

#### Scenario: Busca sem cartões

- **WHEN** a página de busca é válida e não publica cartões
- **THEN** o provedor devolve lista vazia, sem erro.

#### Scenario: Busca sem estrutura

- **WHEN** a página de busca não tem o contêiner de resultados
- **THEN** o provedor lança erro de estrutura, em vez de tratar como ausência.

### Requirement: Termos de busca

O provedor SHALL montar no máximo quatro termos com o título limpo do TMDB, a forma curta do original chinês (antes de pontuação ou de `之`), o original completo e o primeiro alternativo ou romaji, sem repetir texto normalizado.

#### Scenario: Título com parênteses ou colchetes

- **WHEN** o TMDB publica `Douluo Dalu (Soul Land)` ou `Swallowed Star [Tun Shi Xing Kong]`
- **THEN** o provedor pesquisa primeiro a forma sem o trecho entre parênteses ou colchetes.

#### Scenario: Original chinês longo

- **WHEN** o original é `白蛇：缘起` ou `枕刀歌之尘世行`
- **THEN** o provedor inclui a forma curta `白蛇` ou `枕刀歌` antes do original completo.

#### Scenario: Termos repetidos

- **WHEN** dois termos ficam iguais após a normalização
- **THEN** o provedor consulta o texto uma única vez.

### Requirement: Confirmação de identidade

O provedor SHALL confirmar a ficha por `h1` e `Titulo Alternativo`, comparando títulos latinos por similaridade e títulos chineses por igualdade bruta sem pontuação, e SHALL aceitar diferença de até um ano quando os dois lados publicarem ano.

#### Scenario: Correspondência pelo título alternativo

- **WHEN** o `h1` não coincide, mas um título alternativo da ficha coincide com o original ou o alternativo do TMDB
- **THEN** a ficha é confirmada.

#### Scenario: Ano divergente

- **WHEN** a ficha e o TMDB publicam ano com diferença maior que um
- **THEN** a ficha é descartada, mesmo com título parecido.

#### Scenario: Tipo divergente

- **WHEN** o pedido é filme e a ficha publica `Tipo: ONA`, ou o pedido é série e a ficha publica `Tipo: Movie`
- **THEN** a ficha é descartada.

#### Scenario: Especial

- **WHEN** o cartão publica `data-ona="Special"` ou a ficha é marcada como especial
- **THEN** o candidato é descartado.

#### Scenario: Nenhuma ficha confirmada

- **WHEN** os termos terminam sem ficha confirmada
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Seleção de temporada

O provedor SHALL selecionar a temporada pelo marcador do `h1` (`Nª Temporada`, `Temporada N`, `Season N`, `Nth Season`, `第N季`) e SHALL NOT usar a posição de listas. Sem marcador, SHALL aceitar apenas a temporada 1 quando o TMDB tiver uma única temporada regular ou quando o episódio couber na contagem da temporada 1.

#### Scenario: Ficha de temporada específica

- **WHEN** a ficha se chama `Doupo Cangqiong – 2ª Temporada` e o app pede a temporada 2
- **THEN** o provedor usa os episódios locais dessa ficha.

#### Scenario: Temporada divergente

- **WHEN** a única ficha confirmada é da temporada 3 e o app pede a temporada 2
- **THEN** o provedor devolve lista vazia, sem reutilizar os episódios da temporada 3.

#### Scenario: Ficha única com temporada 1

- **WHEN** a ficha não tem marcador, o TMDB tem uma única temporada regular e o app pede a temporada 1
- **THEN** o provedor usa o episódio local de mesmo número.

#### Scenario: Ficha única e temporada maior

- **WHEN** a ficha não tem marcador e o app pede temporada maior que 1 em série com várias temporadas no TMDB
- **THEN** o provedor devolve lista vazia, sem mapear por posição.

### Requirement: Seleção de episódio

O provedor SHALL selecionar o episódio pela lista `div.episode_list div.item`, usando o primeiro inteiro de `span.episode` (`Episódio 19 (184)` vale 19) e a URL publicada, e SHALL ignorar links `__trashed` e faixas `Episódios N-M`.

#### Scenario: Episódio com numeração global

- **WHEN** a lista publica `Episódio 19 (184)` e o app pede o episódio 19
- **THEN** o provedor usa a URL desse item.

#### Scenario: Episódio ausente

- **WHEN** a ficha confirmada não lista o episódio pedido
- **THEN** o provedor devolve lista vazia, sem erro.

#### Scenario: Link removido

- **WHEN** o único item do episódio pedido aponta para `__trashed-*`
- **THEN** o provedor trata como ausência.

#### Scenario: Faixa de episódios

- **WHEN** a lista publica `Episódios 34-35` e o app pede o episódio 34
- **THEN** o provedor não usa a faixa como episódio avulso.

### Requirement: Filme e coleção de filme

Em pedido de filme, o provedor SHALL usar os players da própria ficha. Se a ficha for `Tipo: Movie` com um único episódio e nenhum player, SHALL seguir esse único link. Coleção com mais de um item SHALL resultar em ausência.

#### Scenario: Filme com players na ficha

- **WHEN** a ficha confirmada de filme publica players
- **THEN** o provedor resolve esses players.

#### Scenario: Filme em ficha de coleção

- **WHEN** a ficha confirmada publica `Tipo: Movie`, `Episódios: 1`, nenhum player e um único link de episódio
- **THEN** o provedor segue o link e resolve os players da página do filme.

#### Scenario: Coleção ambígua

- **WHEN** a ficha de filme publica mais de um item de episódio
- **THEN** o provedor devolve lista vazia.

### Requirement: Resolução dos players

O provedor SHALL resolver cada `div.slideItem[data-video-url]` em isolamento, aceitando o player nativo `player-nativov2.php` (`v` e `720`), `player-new/?url=`, `<source>` direto e Blogger, e SHALL descartar por triagem Dailymotion, StreamSB, Fembed, Wolfstream, Short.ink e hosts não comprovados.

#### Scenario: Player nativo com duas qualidades

- **WHEN** o iframe publica `v=<HLS>` e `720=<HLS>`
- **THEN** o provedor devolve um stream para cada URL distinta.

#### Scenario: Player direto

- **WHEN** o player publica `<source src="<HLS>" size="720">`
- **THEN** o provedor devolve o stream HLS com qualidade `720p`.

#### Scenario: Blogger

- **WHEN** o player publica um iframe `blogger.com/video.g`
- **THEN** o provedor lê `streamingData.formats` pelo bloco `blogger-video` e devolve os MP4 publicados.

#### Scenario: Host de triagem

- **WHEN** o player publica apenas Dailymotion, StreamSB, Fembed, Wolfstream ou Short.ink
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Montagem dos streams

O provedor SHALL montar cada stream com `buildStream` e `format`, sem `name` nem `title`, com `type` `hls` ou `mp4`, `addon` `Donghua No Sekai`, título e ano do TMDB e temporada/episódio em série, e SHALL classificar o idioma como `Legendado`.

#### Scenario: Stream de série

- **WHEN** uma opção de série é resolvida
- **THEN** o `format` contém temporada e episódio e o stream sai com `language` `Legendado`.

#### Scenario: Filme sem temporada

- **WHEN** o pedido é de filme
- **THEN** o `format` não inclui temporada nem episódio.

#### Scenario: Duplicata

- **WHEN** dois players publicam a mesma URL
- **THEN** o provedor devolve uma única opção.

### Requirement: Erros e isolamento

O provedor SHALL isolar a falha de cada player com `console.warn('[Donghua No Sekai] Opção <rótulo> descartada: <causa>')`, preservando os demais, e SHALL subir o erro agregado quando nenhum player produzir stream e algum tiver falhado. Somente `getStreams` SHALL capturar a falha final.

#### Scenario: Um player falha entre dois

- **WHEN** um player responde 5xx e outro produz stream
- **THEN** o stream válido é devolvido e a falha gera apenas o aviso.

#### Scenario: Todos os players falham

- **WHEN** todos os players falham
- **THEN** o erro agregado sobe até `getStreams`, que registra `[Donghua No Sekai]` e devolve lista vazia.

#### Scenario: Sem timeout próprio

- **WHEN** a fonte demora
- **THEN** o provedor não impõe timeout, retentativa, cache ou settings.
