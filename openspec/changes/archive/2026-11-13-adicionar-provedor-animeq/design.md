# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 13/11/2026 (14/11/2026 UTC) contra `https://animeq.cloud/`. Nenhuma URL assinada, token ou cookie é registrado aqui.

1. A home respondeu HTTP 200 `text/html`; a primeira requisição devolveu corpo vazio com `200` e `x-cache-status: STALE`, e as seguintes responderam normalmente. O site usa WordPress 7.1.4 e tema `dooplay` com componentes próprios `animeq-player`.
2. A busca `GET /?s=<termo>` respondeu 200 `text/html` com `div.search-page`, cartões `div.result-item` (9 para `demon slayer`) e, na ausência, `div.no-result` (`zzqqxxyyinexistente`, 200, 0 cartões).
3. A página de série `/anime/kimetsu-no-yaiba-hashira-geiko-hen` publicou `div.se-c`, `span.se-t` (`1`), `div.episode-card[data-episode-number]` e links `/episodio/...`.
4. A página de episódio publica `div.animeq-player__source[data-animeq-source]` com `<source src>` ou `<iframe src>`, e os botões `data-animeq-switch`/`data-source-name` (`SD / HD`, `FHD`, `Dublado`, `FullHD / HLS`). Os blocos trazem `hidden` nos não ativos; o HTML os contém mesmo assim.
5. Fontes observadas:
   1. `https://animeflix.blog/Animes/Letra-K/Kimetsu%20no%20Yaiba%3A%20Hashira%20Geiko-hen/01-sd.mp4` respondeu HTTP 206 `video/mp4`, assinatura `ftypmp42`, 105 MB, sem `Referer`.
   2. `https://mangas.cloud/Animes/.../01.mp4` respondeu 404 `text/html` em todos os testes (Kimetsu e Jujutsu).
   3. `https://cldup.com/...mp4` respondeu 404 `text/html`.
   4. `https://www.blogger.com/video.g?token=...` respondeu 200 `text/html` e publicou `streamingData.formats` com um MP4 progressivo `itag 18`, `qualityLabel: 360p`, em `googlevideo.com`; a URL respondeu HTTP 206 `video/mp4` com `ftypmp42`, 89 MB, sem `Referer`.
   5. `https://animeshd.cloud/#...` (Embed69/Proof-of-Work) e `https://animes.strp2p.com/#...` (Vidstack) não foram resolvidos.
6. A página de filme `/filme/jujutsu-kaisen-0-o-filme` publicou `li.dooplay_player_option` (`FullHD / HLS`, `FHD`) e não o player AnimeQ. A opção 1 expandiu para `jwplayer?source=https%3A%2F%2Faniplay.online%2F...%2F01.mp4`, que respondeu HTTP 200 `video/mp4` com `ftypisom` (714 MB) **somente com** `Referer: https://animeq.cloud/`; sem o cabeçalho, respondeu 403 `text/html`.
7. O mesmo token do Blogger e a mesma URL `mangas.cloud` de Jujutsu Kaisen S01E01 apareceram em `animeshd.to` e `animesdrive.cloud`, o que sustenta tratá-los como o mesmo acervo/rede e não como provedores separados.
8. Não foram observados `window.__PCr`, Streamcash, Google Drive, Mail.ru, sonda de mídia, TMDB hardcoded, AniList/Kitsu, `audioPreference`, `minQuality` ou `qualityFallback`.

## Goals / Non-Goals

**Goals:**

1. Confirmar título e ano antes de resolver a mídia.
2. Selecionar temporada e episódio pela estrutura declarada da página.
3. Resolver as fontes que entregam mídia e descartar as demais por triagem, preservando as opções válidas.
4. Reutilizar a leitura do Blogger em um bloco, em vez de duplicar o código do AniTube.

**Non-Goals:**

1. Resolver Embed69/Proof-of-Work ou Vidstack.
2. Provar que uma fonte direta morta "funciona" por sonda; o provedor entrega a URL publicada e a rodada online mede a resolução.
3. Mapear temporadas do TMDB para arcos que o site não declara.
4. Adicionar conta, chave, proxy ou serviço externo.

## Decisions

### D1. Provedor novo

1. O `dooplay` existente não cobre o player AnimeQ, os blocos `se-c`/`episode-card` nem as fontes diretas; acrescentá-lo ao agregador misturaria dois contratos de página.
2. O AnimeQ recebe um provedor próprio, com `animeq` como id.
3. Alternativa descartada: incluir `animeshd.to`/`animesdrive.cloud` como catálogos. Eles entregam o mesmo token do Blogger e a mesma URL direta; um catálogo extra só multiplicaria requisições sem novo acervo.

### D2. Identidade e seleção

1. Buscar por título PT-BR, original, alternativos e romaji; confirmar com `findBestMatch` usando `.year` do cartão.
2. Série: iterar `div.se-c`, ler `span.se-t` e escolher `div.episode-card[data-episode-number="<episódio>"]`; o link é o `a[href*="/episodio/"]`.
3. Filme: usar `/filme/<slug>` e as opções DooPlay.
4. Temporada ausente ou episódio ausente é lista vazia; página sem `se-c`/`episode-card` é erro de estrutura.
5. Alternativa descartada: usar o `data-source-name` para inferir temporada — o rótulo é de fonte, não de temporada.

### D3. Player AnimeQ e opções DooPlay

1. Ler todos os `div.animeq-player__source[data-animeq-source]` (inclusive `hidden`), porque o HTML já traz todas as fontes.
2. Associar o rótulo pelo índice `data-animeq-switch`.
3. Cada `<source src>` é uma opção MP4; cada `<iframe src>` é classificado por host.
4. Para filme, expandir `li.dooplay_player_option` por AJAX, ignorando `trailer`.
5. Ordem de tentativa: manter a ordem da página; o app reordena por qualidade.

### D4. Bloco `blogger-video`

1. Criar `src/_blocks/blogger-video/index.mjs` com `extractBloggerFormats(html)`, extraído de `src/anitube/players.js` (mesmo repositório, GPL-3.0), com JSDoc completo e teste em `test/blocks/blogger-video/index.test.mjs`.
2. O bloco decodifica entidades HTML, localiza o objeto de `streamingData` (string JS escapada ou objeto), valida `formats` como lista e devolve `{ url, qualityLabel }[]`; lança erro quando não há MP4 progressivo.
3. `src/anitube/players.js` passa a importar o bloco e remove as funções locais; o comportamento observável é o mesmo e os testes do AniTube continuam verdes.
4. `src/animeq/players.js` usa o mesmo bloco.
5. Alternativa descartada: manter duas cópias locais. A regra do repositório manda compartilhar padrão observado em provedores reais, e o AniTube já é o primeiro consumidor.
6. O bloco não faz rede; recebe o HTML já baixado, como o código atual.

### D5. Cabeçalhos por host

1. `animeflix.blog` e `googlevideo.com` responderam sem `Referer`: nenhum cabeçalho.
2. `aniplay.online` respondeu 403 sem `Referer` e 200 com `Referer: https://animeq.cloud/`: o cabeçalho entra somente para esse host.
3. Nenhum `Origin` ou cookie é transportado.

### D6. Streams, idioma e qualidade

1. `buildStream` com `format: { template: FORMATTER.AUTO, addon: 'AnimeQ', title, year, season, episode }`.
2. Idioma: `Dublado`/`Legendado` pelo rótulo; rótulos técnicos (`FHD`, `SD / HD`) não classificam áudio.
3. Qualidade: `qualityLabel` do Blogger (`360p`); fontes diretas sem resolução ficam `Desconhecida`.
4. `provider`: `AnimeQ` para as fontes lidas do player AnimeQ (diretas e `jwplayer`) e `Blogger` para o MP4 vindo de `video.g`.
5. Tipos: `mp4` para arquivos progressivos e `hls` quando a URL for `.m3u8`.

### D7. Erros e testes

1. Entrada, TMDB, busca, detalhe e opções DooPlay são estruturais.
2. Cada fonte é independente; falha com aviso; erro agregado quando todas falham e alguma falhou; lista vazia quando todas são triagem.
3. Fixtures: busca, busca vazia, série, episódio com fonte direta, episódio com Blogger, filme, iframe Embed69, iframe Vidstack e HTML inválido. O token do Blogger e as URLs de mídia não entram em fixture: usar placeholder.

## Risks / Trade-offs

1. **Fontes diretas mortas** → `mangas.cloud` e `cldup.com` responderam 404; o provedor não sonda, então a rodada online pode devolver a URL e o app falhar. A limitação fica registrada; não há promessa de reprodução.
2. **Blogger 360p** → é a qualidade real do MP4 progressivo observado; o stream sai com `360p`.
3. **URL do Blogger ligada ao IP** → o `googlevideo` inclui `ip=` e expira; como a requisição parte do aparelho, o contexto é o mesmo, mas a URL não pode ser cacheada nem versionada.
4. **Embed69/Vidstack** → ficam fora; títulos só com esses hosts saem vazios.
5. **Estrutura do tema** → `se-c`, `episode-card` e `animeq-player__source` podem mudar; a falha sobe como estrutura.
6. **Home instável** → a primeira requisição devolveu 200 com corpo vazio; o provedor não usa a home, só a busca e as páginas de conteúdo, então o risco é limitado.

## Migration Plan

1. Criar o bloco `blogger-video` e sua suíte; ajustar `src/anitube/players.js` e rodar `node --test test/anitube.test.js` e `node --test test/blocks/blogger-video/index.test.mjs`.
2. Criar `src/animeq/` (`index.js`, `catalog.js`, `players.js`, `embeds.js`) e os testes com fixtures sanitizadas.
3. Adicionar a entrada no `manifest.json`, a seção em `providers.md`, a linha em `src/_blocks/index.md` e a seção em `docs/provider-investigation.md`.
4. Rodar `npm run lint`, `npm test`, `node build.js animeq` e `node build.js anitube`.
5. Executar `npm run test:online -- --provider animeq` e registrar a rodada.
6. Rollback: remover o provedor, o bloco e a linha do catálogo; restaurar `src/anitube/players.js`; reconstruir o AniTube.

## Validation

1. Observado: home 200; busca com 9 cartões e busca vazia com `no-result`; série com `se-c`/`episode-card`; episódio com fonte direta 206 `video/mp4` `ftyp`; Blogger com `streamingData.formats` 360p e MP4 206; filme com AJAX `jwplayer` e MP4 200 `video/mp4` (714 MB) com `Referer` e 403 sem; Embed69 e Vidstack não resolvidos.
2. Não confirmado: reprodução no app, validade das URLs do Blogger ao longo do tempo, frequência de fontes diretas vivas, cobertura de temporadas e comportamento dos hosts `animeshd.cloud`/`animes.strp2p.com` no futuro.
