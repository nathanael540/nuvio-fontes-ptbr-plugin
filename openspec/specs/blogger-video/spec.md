# blogger-video Specification

## Purpose

Extrair, de forma local e sem rede, os MP4 progressivos publicados em `streamingData.formats` no HTML do player do Blogger, oferecendo um contrato único para provedores que chegam a esse player sem repetir o parser. O bloco cobre o JSON escapado em string JavaScript e o objeto JSON embutido, decodifica entidades HTML e devolve `url` e `qualityLabel` na ordem publicada.

## Requirements

### Requirement: Extração de formatos progressivos do Blogger

O bloco SHALL extrair os formatos progressivos de `streamingData.formats` no HTML do player do Blogger e devolver uma lista de objetos com `url` e `qualityLabel`, na ordem publicada. A função SHALL aceitar tanto o JSON escapado em string JavaScript quanto o objeto JSON embutido no HTML.

#### Scenario: streamingData em string escapada

- **WHEN** o HTML contém `"{\"streamingData\"...}` com `formats` contendo um MP4 `https://` e `qualityLabel: "360p"`
- **THEN** o bloco devolve `[{ url: <url>, qualityLabel: "360p" }]`

#### Scenario: streamingData em objeto JSON

- **WHEN** o HTML contém um objeto JSON com `"streamingData"` e `formats` contendo um MP4 `https://`
- **THEN** o bloco devolve os formatos na ordem publicada

#### Scenario: Entidades HTML

- **WHEN** o HTML usa `&quot;`, `&#39;`, `&lt;`, `&gt;` ou `&amp;` dentro do bloco de `streamingData`
- **THEN** o bloco decodifica as entidades antes de interpretar o JSON

#### Scenario: Formato sem qualityLabel

- **WHEN** um item de `formats` tem URL HTTP(S) e não tem `qualityLabel` ou o campo está vazio
- **THEN** o item é devolvido com `qualityLabel: null`

#### Scenario: URL fora de HTTP(S)

- **WHEN** um item de `formats` tem URL `data:`, relativa ou malformada
- **THEN** o item é ignorado; se nenhum item válido restar, o bloco lança erro

#### Scenario: Sem streamingData

- **WHEN** o HTML não contém `streamingData.formats`
- **THEN** o bloco lança erro com mensagem `Player do Blogger sem streamingData.formats`

#### Scenario: JSON inválido

- **WHEN** o bloco de `streamingData` não é JSON válido
- **THEN** o bloco lança erro com mensagem `Player do Blogger com streamingData inválido` e preserva a causa

#### Scenario: Sem MP4 progressivo

- **WHEN** `streamingData.formats` existe, mas nenhum item tem URL HTTP(S)
- **THEN** o bloco lança erro com mensagem `Player do Blogger sem MP4 progressivo`

### Requirement: Isolamento do bloco

O bloco SHALL ser puramente local: não SHALL fazer requisição, importar cheerio, importar módulos de provedor, usar APIs do Node ou registrar log. O bloco SHALL exportar somente `extractBloggerFormats` e SHALL manter helpers privados para a leitura textual.

#### Scenario: Sem dependências de runtime

- **WHEN** o bloco é importado no teste Node e no pacote do AniTube
- **THEN** ele não importa `http`, `cheerio`, `fs`, `crypto`, `Buffer` nem qualquer arquivo de `src/anitube/`

#### Scenario: Não regressão do AniTube

- **WHEN** `src/anitube/players.js` passa a importar o bloco
- **THEN** a suíte `test/anitube.test.js` continua passando sem mudança de expectativa e o pacote do AniTube continua exportando `getStreams`
