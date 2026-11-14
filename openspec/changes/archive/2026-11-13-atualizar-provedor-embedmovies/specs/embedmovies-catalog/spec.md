# Spec Delta

## ADDED Requirements

### Requirement: Resolução da opção WatchPlay

O provedor SHALL resolver a opção `WatchPlay` do PlayerFlix quando a página publicar uma playlist HLS. A página SHALL ser seguida até a URL final e a playlist SHALL iniciar com `#EXTM3U`, sendo interpretada como master ou playlist de mídia. O stream SHALL usar o host final do player como `provider` e o `format` SHALL levar título, ano e coordenadas do pedido.

#### Scenario: Filme cuja única opção jogável é WatchPlay

- **WHEN** as opções do PlayerFlix de um filme trazem `WatchPlay` com `lang: pt-br` e a página publica uma playlist VOD `#EXTM3U` sem `#EXT-X-STREAM-INF`
- **THEN** o provedor devolve um stream HLS com qualidade `Desconhecida`, idioma `Dublado`, `provider` do host final do player, título e ano do catálogo no `format`.

#### Scenario: Master com variantes é interpretado

- **WHEN** a playlist WatchPlay é master com `#EXT-X-STREAM-INF` e `RESOLUTION`
- **THEN** o provedor devolve as variantes com as qualidades declaradas e preserva a master quando houver faixa externa de áudio ou legenda.

#### Scenario: Página WatchPlay sem playlist

- **WHEN** a página WatchPlay responde 200 mas não publica uma URL `playlist.m3u8` válida
- **THEN** somente essa opção falha, com `console.warn`, e as demais opções continuam; se nenhuma produzir stream e houver falha, o erro agregado sobe para `getStreams`.

#### Scenario: Série com WatchPlay

- **WHEN** a opção WatchPlay pertence a uma série com temporada e episódio válidos
- **THEN** o stream leva a temporada e o episódio pedidos no `format` e mantém a mesma regra de qualidade e idioma.

### Requirement: Qualidade e idioma do WatchPlay

Quando a playlist WatchPlay não declarar `RESOLUTION`, o stream SHALL sair com qualidade `Desconhecida`, sem sonda adicional. O rótulo `lang` da opção SHALL ser usado como dica de idioma e o provedor SHALL NOT inventar `Dublado` sem prova.

#### Scenario: Playlist sem RESOLUTION não vira 720p

- **WHEN** a playlist WatchPlay não declara `RESOLUTION` em nenhuma variante
- **THEN** o stream é preservado com qualidade `Desconhecida` e o provedor não atribui `720p`, `1080p` ou outra resolução sem declaração da fonte.

#### Scenario: Idioma não comprovado

- **WHEN** a opção WatchPlay não traz `lang` classificável e a playlist não declara faixa de áudio
- **THEN** o provedor não inventa `Dublado`; aplica a descoberta local do bloco e mantém o idioma desconhecido quando não houver prova.

## MODIFIED Requirements

### Requirement: Resolução e triagem das opções

O provedor SHALL seguir a cadeia pública do player até as opções e SHALL resolver cada opção suportada isoladamente. Opção descartada por triagem SHALL NOT falhar o provedor; falha técnica de uma opção SHALL descartar somente aquela opção. Se nenhuma opção produzir stream e houver falha técnica, o erro SHALL subir; se todas as opções forem apenas triagem, o resultado SHALL ser ausência.

#### Scenario: Opção suportada resolve

- **WHEN** a cadeia do player publica uma opção suportada com HLS válido
- **THEN** o provedor devolve os streams dessa opção.

#### Scenario: Opção WatchPlay é suportada

- **WHEN** a cadeia do player publica `WatchPlay` com uma playlist HLS válida
- **THEN** o provedor resolve essa opção em vez de descartá-la por triagem.

#### Scenario: Opção não suportada

- **WHEN** a cadeia publica uma opção de host ou formato fora do conjunto suportado, como `embedplayabyss.top`, Blogger, `ok.ru` ou `superflixapi.boats`
- **THEN** o provedor a descarta por triagem e continua com as demais.

#### Scenario: Falha isolada

- **WHEN** uma opção falha por rede, HTTP ou resposta inválida e outra opção produz stream
- **THEN** o provedor registra o aviso da opção descartada e devolve os streams da opção que funcionou.

#### Scenario: Todas as opções são triagem

- **WHEN** nenhuma opção produz stream, mas todas foram descartadas por critério de triagem
- **THEN** o provedor devolve lista vazia sem erro fatal.

#### Scenario: Todas as opções falham

- **WHEN** nenhuma opção produz stream e ao menos uma falhou tecnicamente
- **THEN** o erro sobe com a causa das opções e `getStreams` devolve lista vazia com `console.error`.
