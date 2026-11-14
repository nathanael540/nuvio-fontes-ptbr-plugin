# Proposal

## Why

O AnimesDigital é um catálogo brasileiro de animes e desenhos, com filmes e séries dublados e legendados, e publica o player Anivideo em iframe com o manifesto HLS no próprio endereço. O repositório ainda não cobre esse catálogo: os provedores de anime atuais usam APIs e players de outras redes, então títulos publicados apenas no AnimesDigital ficam fora do Nuvio. Observado em 13/11/2026 (14/11/2026 UTC): home `https://animesdigital.org/` respondeu HTTP 200 `text/html`; a busca de `kimetsu` respondeu 200 com 14 cartões; a página de episódio de Jujutsu Kaisen publicou `iframe` para `https://api.anivideo.net/videohls.php?d=...`, e o manifesto respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U`; o mesmo ocorreu para o filme de Kimetsu.

## What Changes

1. Adicionar o provedor `animesdigital`, com `movie` e `tv`, em `src/animesdigital/`, empacotado nos formatos publicados e registrado no `manifest.json` como versão `1.0.0`.
2. Localizar o título pelo ID do TMDB com `getMediaInfo` e a busca pública `GET https://animesdigital.org/?s=<termo>`, que redireciona para `/pesquisa/<termo>/`; tentar título PT-BR, título original, alternativos do Brasil e títulos romaji do TMDB, nessa ordem, e confirmar título e ano antes de seguir.
3. Selecionar o candidato do tipo pedido pela estrutura da página de detalhe (`/anime/a/<slug>`): série tem a lista `div.itens_ep` com `div.item_ep`; filme tem um único link `/video/a/<id>` e o sufixo `-filme` no endereço.
4. Selecionar o episódio pelo número declarado em `div.title_anime` (`<Título> Episódio N`), nunca pela posição; aceitar a temporada 1 e temporadas declaradas no título do candidato (`Temporada N`, `Season N` ou sufixo numérico). Não mapear temporada por numeração absoluta: as páginas do site reiniciam a contagem em 1 por arco, como observado em `kimetsu-no-yaiba-yuukaku-hen` (11 episódios) e `jujutsu-kaisen-2` (23 episódios). Temporada não declarada devolve lista vazia.
5. Resolver o player Anivideo: ler `iframe[src*="api.anivideo.net/videohls.php?d="]`, decodificar o parâmetro `d` e devolver a URL HLS publicada. O `iframe` que aponta para a rota interna `aHR0...` do site fica fora: na amostra ele publicava um `bg.mp4` de fundo, não o episódio.
6. Montar cada stream com `buildStream` e `format`, informando `type: 'hls'`, `provider: 'Anivideo'`, idioma somente quando o título do candidato ou da página declarar `Dublado`/`Legendado` e qualidade somente quando o texto já obtido a declarar. Sem sonda, sem `Referer` de reprodução (o manifesto respondeu 200 sem cabeçalhos) e sem download de playlist.
7. Cobrir com testes Node e fixtures reais sanitizadas: busca com resultado, busca sem resultado, série com episódio, temporada não declarada, filme, página sem player suportado e falha estrutural.
8. Registrar a rodada online no perfil `anime` e a seção `## AnimesDigital` em `providers.md` com status `🟠 Não verificado` até a execução explícita do pacote.
9. Atualizar `docs/provider-investigation.md` com o método reaproveitável: player Anivideo em iframe, manifesto no parâmetro `d` e limites de mapeamento de temporada por arco.

## Capabilities

### New Capabilities

- `animesdigital-provider`: localização e confirmação de filmes e séries no AnimesDigital a partir do TMDB, seleção de temporada e episódio pela página de detalhe, resolução do player Anivideo e contrato dos streams HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, apenas com o provedor no perfil `anime`.

## Impact

1. Código: `src/animesdigital/` (novo), `test/animesdigital.test.js` e fixtures em `test/fixtures/animesdigital/`.
2. Configuração: `manifest.json`, `test/online/profiles.json` (entrada `animesdigital` no perfil `anime`), `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/animesdigital.js`, `gdrive/providers/animesdigital.js`, `prism/providers/animesdigital.js` e os `<formato>/manifest.json`, todos pelo build.
4. Blocos: `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract`, `language-discovery`, `quality-discovery`, `custom-formatter` e `stream-build`; nenhum bloco novo.
5. Limite conhecido da fonte: o site organiza temporadas por arco e reinicia a numeração; temporadas posteriores só são atendidas quando o título do candidato declara o número. Não há mapeamento por posição nem por número absoluto.
