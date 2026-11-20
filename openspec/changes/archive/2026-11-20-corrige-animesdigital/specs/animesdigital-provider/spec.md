# Spec Delta

## MODIFIED Requirements

### Requirement: Resolução do player Anivideo

O provedor SHALL tratar cada iframe Anivideo como opção independente e aceitar duas formas: `videohls.php?d=<url>`, cujo `d` SHALL ser `http(s)`, e `/cdn/<token>`, cuja página SHALL ser aberta com `Sec-Fetch-Dest: iframe` e `Referer` da fonte para ler `sources[].file`; nessa forma, SHALL aceitar somente manifesto HLS `.m3u8` `http(s)`. SHALL NOT sondar a mídia, baixar a playlist nem resolver o iframe `aHR0...`.

#### Scenario: Iframe Anivideo com manifesto no parâmetro

- **WHEN** a página publica `videohls.php?d=https%3A%2F%2Fcdn...%2Findex.m3u8`
- **THEN** o stream usa a URL decodificada do parâmetro `d`, sem abrir o iframe.

#### Scenario: Iframe `/cdn/` com manifesto nas sources

- **WHEN** a página publica `iframe[src*="api.anivideo.net/cdn/"]` e o player responde 200 com `sources[].file` em `.m3u8`
- **THEN** o provedor abre o player com `Sec-Fetch-Dest: iframe` e monta um stream HLS com a URL publicada.

#### Scenario: Página `/cdn/` sem fonte HLS

- **WHEN** o player responde 2xx sem `sources` ou sem nenhuma fonte `.m3u8` http(s)
- **THEN** a opção é descartada com aviso; se não houver outra, o erro agregado sobe.

#### Scenario: Página `/cdn/` fora de 2xx

- **WHEN** o player responde fora de 2xx, inclusive 403 sem o contexto de iframe
- **THEN** a opção é descartada com aviso saneado, sem expor o token do iframe.

#### Scenario: Parâmetro `d` inválido

- **WHEN** o iframe legado existe mas o parâmetro `d` está vazio ou fora de `http(s)`
- **THEN** a opção é descartada com aviso; se nenhuma outra produzir stream, o erro agregado sobe.

#### Scenario: Uma opção falha e outra resolve

- **WHEN** um iframe `/cdn/` falha e um iframe legado válido existe na mesma página
- **THEN** o provedor devolve o stream do iframe legado e registra o aviso do iframe descartado.

#### Scenario: Página sem Anivideo

- **WHEN** a página não tem iframe Anivideo
- **THEN** o provedor devolve lista vazia, porque a fonte reconheceu a página e não ofereceu opção no contrato.

### Requirement: Contrato dos streams devolvidos

O provedor SHALL montar cada stream com `buildStream` e `format`, com `type: 'hls'`, `provider: 'Anivideo'`, título, ano, temporada e episódio quando aplicáveis. O stream do iframe `/cdn/` SHALL trazer `headers` com `Referer: https://animesdigital.org/`; o do iframe legado SHALL omitir `headers`.

#### Scenario: Stream novo com Referer

- **WHEN** o iframe `/cdn/` entrega um manifesto HLS
- **THEN** o stream sai com `headers.Referer` igual à raiz do site.

#### Scenario: Cabeçalhos omitidos

- **WHEN** o iframe legado entrega um manifesto HLS que respondeu 200 sem `Referer` e sem `Origin`
- **THEN** o stream não traz `headers`.

#### Scenario: Stream HLS formatado

- **WHEN** qualquer forma entrega um manifesto de um episódio de série
- **THEN** o stream sai com `type` HLS, `provider` "Anivideo" e `format` com título, ano, temporada e episódio.
