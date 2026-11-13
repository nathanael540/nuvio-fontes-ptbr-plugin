# Proposal

## Why

O Dattebayo BR (`https://www.dattebayo-br.com/`) publica animes, tokusatsus, doramas e donghuas em português do Brasil, com entradas separadas para legendado (`/animes/`) e dublado (`/anime-dublado/`), e entrega MP4 em SD, HD e FULLHD. Nenhum provedor do repositório cobre esse catálogo. A busca, a ficha e o player são públicos, sem conta e sem chave; a mídia final usa URLs assinadas de curta duração obtidas pelo próprio fluxo público da página.

## What Changes

1. Novo provedor `dattebayo` no `manifest.json`, com `supportedTypes` `movie` e `tv`, `formats` `["mp4"]`, idioma `pt` e versão `1.0.0`.
2. Busca por título PT-BR, título original e títulos alternativos do TMDB em `/busca?busca=<termo>`, com paginação limitada, e confirmação na ficha por tipo (`Filme` ou `TV`), pela relação de título e, em filme, pelo ano.
3. Séries: mapeamento da temporada do TMDB para as entradas do catálogo, incluindo temporada explícita, partes de uma mesma temporada e série longa com numeração absoluta em uma única entrada; quando o mapeamento não for inequívoco, o pedido termina sem stream em vez de usar a temporada errada.
4. Episódio localizado pela numeração exibida na ficha, percorrendo a paginação da página do título quando necessário.
5. Player: leitura das opções SD, HD e FULLHD da página `/videos/<id>`, resolução da assinatura pública de cada URL e descarte isolado da opção que falhar, com `console.warn`.
6. Idioma classificado pela seção do catálogo ou pelo sufixo do título: `/anime-dublado/` ou `- Dublado` como `Dublado`; as demais entradas como `Legendado`.
7. Extensão do bloco `tmdb-info` para expor as temporadas da série (número, quantidade de episódios, nome e data de estreia), usadas no mapeamento de temporada; catálogo de blocos e testes atualizados.
8. Testes Node offline com fixtures sanitizadas cobrindo filme legendado, filme dublado, episódio, episódio em página posterior, temporada 2, parte final, série longa com numeração absoluta, ausência e falha isolada de opção.
9. Build dos três formatos, entrada e seção em `providers.md` (inicialmente `🟠 Não verificado`) e registro do método de assinatura pública em `docs/provider-investigation.md`.

## Capabilities

### New Capabilities

- `dattebayo-catalog`: busca, confirmação de identidade, mapeamento de temporada e episódio, classificação de idioma e resolução de streams do catálogo Dattebayo BR.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/dattebayo/` (entrada, catálogo, temporadas e player), `src/_blocks/tmdb-info/index.mjs` e `src/_blocks/index.md`.
2. Manifest e saída: `manifest.json`, `providers/dattebayo.js`, `gdrive/providers/dattebayo.js`, `prism/providers/dattebayo.js` e os manifests de formato.
3. Bloco compartilhado: os provedores que importam `tmdb-info` são reconstruídos e revalidados no mesmo commit, porque o bloco entra no pacote de cada um.
4. Testes: `test/dattebayo.test.js`, `test/blocks/tmdb-info/index.test.mjs` e fixtures em `test/fixtures/dattebayo/`.
5. Documentação: `providers.md` (tabela, seção e rodada online) e `docs/provider-investigation.md` (método de assinatura pública de mídia).
6. Serviço externo novo: endpoint público de assinatura de URLs de mídia, sem conta e sem chave, já usado pelo player da própria fonte; a URL assinada expira em uma hora.
