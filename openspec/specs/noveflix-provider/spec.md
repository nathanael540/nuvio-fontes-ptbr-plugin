# noveflix-provider Specification

## Purpose
Localizar novelas no NoveFlix a partir do ID do TMDB, confirmar título e ano, resolver a opção DooPlay e percorrer o gate novefx até o MP4 assinado do capítulo.

## Requirements

### Requirement: Entrada e identidade por título e ano

O provedor SHALL validar `tmdbId` numérico e SHALL aceitar somente `mediaType` `tv`. A identidade SHALL ser obtida com `getMediaInfo` e a busca SHALL consultar `GET https://noveflix.lol/?s=<termo>` com título PT-BR, original e alternativos brasileiros. O provedor SHALL aceitar somente caminhos `/assistir/<slug>/` e SHALL exigir igualdade de ano entre a ficha (`span.date`) e o TMDB quando os dois anos existirem.

#### Scenario: Novela confirmada

- **WHEN** a busca de `Avenida Brasil` devolve `/assistir/avenida-brasil/` e a ficha publica `span.date` 2012
- **THEN** o provedor confirma a ficha para o TMDB de 2012.

#### Scenario: Original contra remake

- **WHEN** a busca de `Vale Tudo` devolve `/assistir/vale-tudo/` (1988) e `/assistir/vale-tudo-2025/` (2025) e o TMDB é de 1988
- **THEN** o provedor escolhe a ficha de 1988 e descarta a de 2025.

#### Scenario: Filme recusado

- **WHEN** `mediaType` é `movie`
- **THEN** o provedor recusa a entrada sem fazer requisições.

#### Scenario: Título ausente

- **WHEN** a busca não devolve `/assistir/<slug>/` ou nenhum candidato confirma título e ano
- **THEN** o provedor devolve lista vazia, sem erro.

### Requirement: Resolução DooPlay

O provedor SHALL ler `li.dooplay_player_option` com `data-post`, `data-type` e `data-nume` e SHALL consultar `POST https://noveflix.lol/wp-admin/admin-ajax.php` com `Content-Type: application/x-www-form-urlencoded`, `Referer` da ficha e corpo `action=doo_player_ajax&post=<post>&nume=<nume>&type=movie`. O `embed_url` SHALL ser HTTP(S) e ausência dele SHALL ser ausência da opção.

#### Scenario: Botão da novela

- **WHEN** a ficha publica `data-post="7059"` e `data-nume="1"`
- **THEN** o provedor envia o formulário e recebe `embed_url` em `novefx.biz`.

#### Scenario: Ficha sem `data-post`

- **WHEN** a ficha não publica `li.dooplay_player_option` com `data-post`
- **THEN** o provedor lança erro de estrutura.

#### Scenario: AJAX sem `embed_url`

- **WHEN** o JSON responde 200 sem `embed_url`
- **THEN** a opção é ausência e a saída é lista vazia.

### Requirement: Capítulo e travessia do gate

O provedor SHALL ler `totalChapters`, o prefixo do template `/video/<PREFIX>-` e a base do redirecionador no embed. O provedor SHALL devolver lista vazia quando `episode > totalChapters` e, caso contrário, SHALL montar o capítulo com três dígitos, codificar a URL em Base64 e seguir o redirecionador até o gate. No gate, SHALL ler `#player-iframe[data-src]` ou `data-src` com `safelink_redirect`, desescapar `&amp;` e pedir a `safelink` em modo manual.

#### Scenario: Capítulo dentro da faixa

- **WHEN** `totalChapters` é 179 e o pedido é o capítulo 179
- **THEN** o provedor monta `AVBR-179`, codifica em Base64 e percorre o gate até a página de vídeo.

#### Scenario: Capítulo acima do total

- **WHEN** `totalChapters` é 179 e o pedido é o capítulo 180
- **THEN** o provedor devolve lista vazia, sem tentar o gate.

#### Scenario: Gate sem iframe

- **WHEN** a página do gate não publica `data-src` com `safelink_redirect`
- **THEN** o provedor lança erro de estrutura.

#### Scenario: Host do gate muda

- **WHEN** `redirectnflix.com` redireciona para outro host
- **THEN** o provedor usa a URL final do redirecionamento como `Referer` do próximo salto.

### Requirement: Página de vídeo e MP4

O provedor SHALL pedir a página de vídeo com `Referer` da `safelink` e SHALL extrair a URL `stream.php?slug=...&e=...&t=...` publicada, sem reconstruir o token. O stream SHALL ser MP4, SHALL usar a URL assinada como veio e SHALL NOT exigir sonda de mídia.

#### Scenario: `stream.php` publicado

- **WHEN** a página de vídeo publica `stream.php` com `slug`, `e` e `t`
- **THEN** o provedor devolve essa URL como stream MP4.

#### Scenario: Página sem `stream.php`

- **WHEN** a página de vídeo responde 200, mas não publica `stream.php`
- **THEN** o provedor lança erro de estrutura.

#### Scenario: Sem sonda

- **WHEN** a URL do `stream.php` é obtida
- **THEN** o provedor não baixa o MP4 nem envia `Range` para descobrir resolução.

### Requirement: Contrato dos streams

O provedor SHALL montar o stream com `buildStream` e `format`, informando `type` `mp4`, `provider` `NoveFlix`, `quality` `Desconhecida` quando a fonte não declarar resolução, `language` `Idioma Desconhecido` enquanto a fonte não declarar áudio/legenda e `format` com título, ano, temporada 1 e episódio. O provedor SHALL NOT informar `name`, `title`, `size`, seeders ou peers e SHALL NOT enviar `headers` de reprodução sem necessidade comprovada.

#### Scenario: Stream da novela

- **WHEN** o capítulo 1 de `Avenida Brasil` resolve
- **THEN** o stream sai com `type: "mp4"`, `quality: "Desconhecida"`, `language: "Idioma Desconhecido"` e `format.season: 1`, `format.episode: 1`.

#### Scenario: Qualidade não declarada

- **WHEN** a página e o arquivo não publicam resolução
- **THEN** a qualidade permanece `Desconhecida`, sem sonda.

#### Scenario: MP4 sem cabeçalhos

- **WHEN** o `stream.php` responde 206 `video/mp4` sem exigir `Referer` ou cookie
- **THEN** o stream não leva `headers`.

### Requirement: Ausência, erros e limites de runtime

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título, `embed_url`, capítulo acima do total ou página de vídeo sem mídia. Falha de rede, HTTP fora de 2xx, layout inesperado ou JSON inválido SHALL subir até `getStreams`, que registra `[NoveFlix]` e devolve lista vazia. O provedor SHALL NOT instalar timeout, retentativa, cache com validade, sonda ou settings.

#### Scenario: Busca fora do ar

- **WHEN** a busca responde HTTP 503
- **THEN** o erro sobe até `getStreams`, é registrado com `[NoveFlix]` e a saída é `[]`.

#### Scenario: Gate indisponível

- **WHEN** a `safelink` responde HTTP 404
- **THEN** o erro da opção sobe e a saída é `[]`.

#### Scenario: Sem retentativa

- **WHEN** uma chamada falha uma vez
- **THEN** o provedor não repete por conta própria; o app decide a espera.
