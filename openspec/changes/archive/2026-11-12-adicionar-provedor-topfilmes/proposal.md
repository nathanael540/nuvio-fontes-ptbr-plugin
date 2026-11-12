# Proposal

## Why

O TopFilmes (`https://topfilmes.biz/`) publica filmes dublados em português do Brasil com busca, ficha e player públicos, sem conta e sem chave. A fonte entrega MP4 em SD e HD por uma URL própria que redireciona para o arquivo hospedado no MediaFire. Nenhum provedor do repositório cobre esse catálogo.

A investigação de 12/11/2026 não encontrou séries no catálogo observado: a navegação, a busca e as amostras de fichas são de filmes, e as buscas por séries conhecidas não retornaram resultados. O provedor, portanto, cobre somente filme.

## What Changes

1. Novo provedor `topfilmes` no `manifest.json`, com `supportedTypes` `["movie"]`, `formats` `["mp4"]`, idioma `pt` e versão `1.0.0`.
2. Busca por título PT-BR, título original e títulos alternativos do TMDB em `/busca?q=<termo>`, sem paginação porque a fonte devolve no máximo 24 cartões e não publica próxima página.
3. Escolha do candidato por título e ano com `findBestMatch` e confirmação na ficha `/assistir/<slug>` pelo título e pelo ano exibidos; candidato incompatível é descartado.
4. Leitura das opções de player em `.links_dub` e `.links_leg` da ficha, aceitando somente links do próprio domínio em `/player/<slug>?player=<n>`; o bloco comentado de legendado e o embed de YouTube do tema são ignorados.
5. Resolução de cada player em `/player/<slug>?player=<n>`, lendo todos os elementos `<source>` com `src` e `size`; o atributo `size` define a qualidade (`360p`, `720p` etc.) e cada opção vira um stream.
6. Idioma classificado pelo contêiner da ficha (`links_dub` como `Dublado`, `links_leg` como `Legendado`); as amostras observadas são todas dubladas.
7. Falha de um player descarta somente aquela opção, com `console.warn('[TopFilmes] ...')`; se nenhuma opção produzir stream, o erro sobe e `getStreams` devolve lista vazia com `console.error`.
8. Todo stream é montado com `buildStream` e `format` (`FORMATTER.AUTO`, `addon` `TopFilmes`, título e ano), com `provider` `MediaFire`, `type` `mp4` e sem `name`, `title`, `headers`, `size` ou `subtitles` inventados. A URL `/direct/...` respondeu 206 `video/mp4` sem `Referer`, então não há cabeçalho de reprodução.
9. A URL de mídia é obtida a cada execução, nunca cacheada, e seu parâmetro `expires` não aparece em log, fixture ou documentação.
10. Testes Node offline com fixtures sanitizadas cobrindo filme resolvido com duas qualidades, busca vazia, fallback por título original, ano incompatível, ausência de player, falha isolada de player, falha de todos os players e layout alterado.
11. Build dos três formatos, entrada e seção em `providers.md` com status inicial `🟠 Não verificado` e registro do método de mídia por redirecionamento em `docs/provider-investigation.md`.

## Capabilities

### New Capabilities

- `topfilmes-catalog`: busca, confirmação de identidade, seleção de player, classificação de idioma e resolução de MP4 do catálogo TopFilmes.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/topfilmes/` (entrada e extrator), reutilizando `tmdb-info`, `title-match`, `http`, `quality-discovery`, `language-discovery`, `custom-formatter` e `stream-build`; nenhum bloco novo.
2. Manifest e saída: `manifest.json`, `providers/topfilmes.js`, `gdrive/providers/topfilmes.js`, `prism/providers/topfilmes.js` e os manifests de formato.
3. Testes: `test/topfilmes.test.js` e fixtures em `test/fixtures/topfilmes/`.
4. Documentação: `providers.md` (tabela e seção do provedor) e `docs/provider-investigation.md` (redirecionamento de mídia para hospedagem externa, sem cabeçalhos de reprodução).
5. Serviço externo: MediaFire, usado apenas como destino público do redirecionamento da própria fonte, sem conta e sem chave. A URL assinada tem validade não documentada e é obtida por requisição.
6. Sem mudança de contrato global, de build ou de dependências; `docs/arch.md` não muda.
