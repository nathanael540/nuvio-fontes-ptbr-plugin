# vaqueirofilmes-player-chain Specification

## Purpose
Transformar um filme confirmado da VaqueiroFilmes em streams HLS pela opção EmbedPlay, preservando idioma, qualidade e legendas comprovados pela cadeia.

## Requirements

### Requirement: Descoberta das opções de player

Ao abrir a página do filme com `?video=0`, o provedor SHALL ler os botões de origem e seguir apenas o botão cujo rótulo identifica EmbedPlay. A variante correspondente SHALL ser aberta e o iframe ativo SHALL usar `embedplayapi.top`; iframe de outro host SHALL falhar a opção. As demais opções SHALL ser descartadas com triagem, sem interromper a EmbedPlay. Ausência do botão EmbedPlay SHALL ser ausência reconhecida, não falha de rede.

#### Scenario: EmbedPlay presente

- **WHEN** a página lista o botão EmbedPlay e a variante correspondente ativa um iframe `embedplayapi.top`
- **THEN** o provedor segue a cadeia EmbedPlay e ignora as demais opções com triagem.

#### Scenario: Iframe de outro host

- **WHEN** o botão EmbedPlay é seguido, mas o iframe ativo usa outro host
- **THEN** a opção falha com mensagem explícita e não produz stream.

#### Scenario: EmbedPlay ausente

- **WHEN** a página não lista o botão EmbedPlay
- **THEN** o provedor reconhece ausência e não produz streams.

#### Scenario: Opção desconhecida

- **WHEN** a página lista VidSrc, Superflixapi ou outro botão não suportado
- **THEN** a opção é descartada com triagem e não vira falha da cadeia EmbedPlay.

### Requirement: Cadeia EmbedPlay até as opções de áudio

O provedor SHALL ler o identificador interno e o servidor no HTML de `embedplayapi.top/embed/<tmdb>` e consultar `ajax/get_stream_link` com `id`, `movie`, `is_init=false`, `captcha=` e `ref=`. A resposta SHALL conter `success` verdadeiro e `data.link` HTTP(S); qualquer outro resultado SHALL falhar a opção. O link SHALL ser aberto no `embedplay.vip` para leitura das opções de áudio.

#### Scenario: Link de player obtido

- **WHEN** o HTML contém `data-movie-id` e um servidor, e a API responde `success` com `data.link`
- **THEN** o provedor abre o link e lê as opções de áudio.

#### Scenario: API recusa

- **WHEN** a API responde `success` falso, erro ou sem `data.link`
- **THEN** a opção EmbedPlay falha com mensagem explícita e não produz stream.

### Requirement: Seleção das opções dubladas

Na página do `embedplay.vip`, o provedor SHALL considerar somente as opções do grupo Dublado. Opções do grupo Legendado que apontam para VidSrc SHALL ser descartadas com triagem. Cada opção dublada SHALL ser consultada em `api` com `action=getPlayer` e `video_id`; a resposta SHALL conter `errors` igual a `0` (número ou texto) e `data.video_url` HTTP(S).

#### Scenario: Opção dublada resolvida

- **WHEN** a opção dublada responde com `video_url` válido
- **THEN** o provedor segue para o host indicado pelo `video_url`.

#### Scenario: Opção dublada sem player

- **WHEN** a resposta não tem `errors` igual a `0` ou não tem `video_url`
- **THEN** somente essa opção falha e as demais opções dubladas continuam.

### Requirement: Resolução Byse com decifragem local

Quando o `video_url` apontar para `embedplaybyse.top/e/<código>`, o provedor SHALL consultar `api/videos/<código>/` e obter `playback` com `version`, `key_parts`, `iv` e `payload`. A decifragem SHALL ser local, sem serviço externo, chave ou conta, e o JSON resultante SHALL conter ao menos uma fonte HTTP(S). `video_url` de outro host SHALL ser descartado com triagem.

#### Scenario: Playback Byse decifrado

- **WHEN** o `playback` contém as partes e a decifragem produz JSON com `sources`
- **THEN** cada fonte HTTP(S) se torna um stream HLS.

#### Scenario: Playback inválido

- **WHEN** o `playback` está ausente, a decifragem falha ou o JSON não tem fonte HTTP(S)
- **THEN** a opção falha com mensagem explícita e não produz stream.

#### Scenario: Host não suportado

- **WHEN** o `video_url` aponta para Abyss, Loadvid ou outro host fora da cadeia Byse
- **THEN** a opção é descartada com triagem, sem ser confundida com ausência do título.

### Requirement: Streams e metadados

Cada fonte Byse SHALL virar um stream com `format` do formatador, `addon` VaqueiroFilmes, título e ano do TMDB e idioma `Dublado` somente quando o grupo Dublado for a evidência. Qualidade SHALL vir do `height` ou rótulo da fonte; sem evidência, `Desconhecida`. Legendas Byse SHALL ser incluídas somente com URL HTTP(S) e idioma normalizado. `name` e `title` não SHALL ser definidos pelo provedor.

#### Scenario: Fonte 1080p dublada

- **WHEN** a fonte declara 1080p no grupo Dublado
- **THEN** o stream sai com qualidade 1080p e idioma Dublado.

#### Scenario: Qualidade desconhecida

- **WHEN** a fonte não declara altura nem rótulo de qualidade
- **THEN** o stream sai com qualidade Desconhecida, sem inventar resolução.

#### Scenario: Legendas presentes

- **WHEN** o Byse devolve faixas de legenda com URL e idioma válidos
- **THEN** as faixas entram no stream com seus cabeçalhos aplicáveis.

### Requirement: URL assinada por pedido

A URL HLS do Byse SHALL ser obtida e decifrada a cada pedido do app; o provedor não SHALL reutilizar URL assinada de pedido anterior. Falha de expiração ou assinatura SHALL ser tratada como falha da opção, não como ausência do título.

#### Scenario: Dois pedidos do mesmo filme

- **WHEN** o app pede o mesmo filme duas vezes
- **THEN** cada pedido executa a cadeia e obtém sua própria URL assinada.

#### Scenario: Assinatura expirada

- **WHEN** a URL assinada responde erro de autorização ou expiração
- **THEN** a opção falha com mensagem explícita e o provedor não devolve a URL antiga.
