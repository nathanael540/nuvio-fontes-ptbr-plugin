# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 13/11/2026 (14/11/2026 UTC) contra `https://amyflix.net/`. Nenhuma URL assinada, token ou cookie é registrado aqui.

1. A home respondeu HTTP 200 `text/html` (cerca de 241 KB), com tema `wp-content/themes/dooplay`, WordPress 7.1.4 e configuração `dtGonza` de busca dinâmica.
2. O acervo observado é de doramas GL e filmes: o menu tem `GL's Em Lançamento`, `GL's Completo`, `Filmes Sóficos` e `Só Finais Felizes`. Buscas por `demon slayer`, `jujutsu kaisen`, `naruto` e `one piece` devolveram `div.no-result`.
3. A busca `GET /?s=<termo>` respondeu 200 `text/html` com `div.search-page`; `amor que machuca` devolveu 2 cartões, `aluga-se um amor` 1 e `a marca do destino` 1. Os cartões são `div.result-item article` com `.title a`; o ano pode estar ausente (o cartão de série só trouxe `IMDb 9`).
4. Há três rotas de conteúdo: `/filme/<slug>`, `/serie/<slug>` e `/episodio/<slug>`. A busca devolveu séries nos testes; cartões de episódio, se aparecerem, precisam ser descartados na busca inicial para não confundir a identidade.
5. A página de série `/serie/khom-khlang-the-series-legendado/` publicou `ul.episodios` com `li.mark-1`, `div.numerando` `1 - 1` e `div.episodiotitle a` para `/episodio/...`. O `h1` traz a decoração `– Dublado e Legendado`; o `span.date` é a data do episódio, não o ano de estreia.
6. A página de filme `/filme/ammonite-legendado/` e a de episódio `/episodio/amor-que-machuca-episodio-2-legendado/` publicaram `li.dooplay_player_option` com `data-post`, `data-nume` e `data-type`; o rótulo fica em `span.title`.
7. O `POST /wp-admin/admin-ajax.php` com `action=doo_player_ajax&post=38314&nume=3&type=tv` devolveu 200 `application/json` com `{ "embed_url": "https://amyflix.net/jwplayer/?source=<m3u8>", "type": "mp4" }`. O mesmo padrão apareceu para `Rum MP4` (MP4 direto) e para `VID`, `VST`, `VK`, `Dailymotion`, `Secvideo1` e `Presto`.
8. O `source` do `Rum HLS`, decodificado, foi um master `https://rumble.com/hls-vod/<id>/playlist.m3u8?key=...` que respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U` e variantes `RESOLUTION=1920x1080` e `1280x720`, com e sem `Referer`.
9. O `Rum MP4` foi um MP4 em `hugh.cdn.rumble.cloud` que respondeu HTTP 206 `video/mp4`, `Content-Range` de 1 KB sobre 851 MB e assinatura `ftypisom`, sem `Referer`.
10. O filme `Ammonite` não tinha `Rum HLS`: a opção `Rum` devolveu `https://rumble.com/embed/v6xafmq/?pub=...`. A página do embed respondeu 200 `text/html` e publicou `p.f["v6xafmq"].u.hls.url = https://rumble.com/hls-vod/SHCFq3GEOak/playlist.m3u8`; esse master respondeu HTTP 206 `application/vnd.apple.mpegurl` com `RESOLUTION=1280x694`, sem `Referer`. O mesmo objeto traz `u.ua.tar.{360,480,720,1080}` com `meta.w/h`.
11. O `jwplayer/?source=` devolveu `type: "mp4"` no JSON mesmo quando o `source` era `.m3u8`; o campo `type` do AJAX não é confiável para classificar a mídia.
12. Não foram observados AnimeQ, `se-c`, Streamcash, `window.__PCr`, Google Drive obrigatório, sonda de mídia, TMDB hardcoded, AniList/Kitsu, `audioPreference`, `minQuality` ou `qualityFallback`.

## Goals / Non-Goals

**Goals:**

1. Adicionar o acervo GL/filmes da AmyFlix ao repositório sem tocar no provedor `dooplay` existente.
2. Confirmar o título antes de resolver a mídia, apesar de a fonte não publicar ano.
3. Resolver as duas famílias públicas que entregam mídia e descartar o resto por triagem.
4. Manter testes offline com fixtures sanitizadas e verificação online explícita.

**Non-Goals:**

1. Cobrir anime: o site não tem o acervo dos exemplos da proposta original, e o nome "animes" no título não se reflete na busca.
2. Resolver Google Drive, Ok.ru, Vidmoly, VK, Dailymotion, Secvideo1 ou Presto.
3. Sondar mídia, baixar playlist ou impor timeout, concorrência ou filtros de qualidade/áudio.
4. Adicionar conta, chave, proxy ou serviço pago.

## Decisions

### D1. Provedor novo em vez de catálogo do `dooplay`

1. O `dooplay` é um agregador de sites DooPlay de filmes e séries; a AmyFlix usa o mesmo tema, mas o acervo é GL, a busca não publica ano e os players são de uma família que o bloco `fireplayer` não cobre.
2. Um provedor próprio mantém o `dooplay` estável e permite tratar a identidade sem ano e os players Rumble sem alterar o comportamento dos seis catálogos atuais.
3. Alternativa descartada: acrescentar `amyflix.net` a `src/dooplay/sources.js`. Exigiria mudar `accepts`, o ranking (título com decoração de áudio) e a cadeia de players, com risco para os catálogos existentes sem ganho de reutilização.

### D2. Identidade sem ano

1. Limpar o título do cartão e do `h1` com uma lista fechada de decorações: `Assistir`, `– Legendado`, `– Dublado`, `– Dublado e Legendado`, travessões e espaços.
2. Comparar com `findBestMatch` usando título PT-BR, original e alternativos; como os cartões observados não publicam ano, passar candidatos com `year: null` e exigir um único candidato acima de `minScore`.
3. Dois candidatos compatíveis sem desempate viram lista vazia; não escolher o primeiro.
4. Não usar `span.date`: ele é a data de publicação do episódio (ex.: `Sep. 07, 2026`) e não o ano da obra.
5. Alternativas descartadas:
   1. Usar o ano do `span.date`: produz falso negativo em obra antiga e falso positivo em relançamento.
   2. Aceitar o primeiro cartão: a busca devolve episódios e séries do mesmo título.

### D3. Filme, série e episódio

1. Filme: aceitar `/filme/<slug>` e usar a própria página; a lista de players fica no corpo.
2. Série: aceitar `/serie/<slug>`, ler `ul.episodios li.mark-*`, extrair `div.numerando` com `(\d+)\s*-\s*(\d+)` e escolher o par exato; abrir o `/episodio/` correspondente.
3. `ul.episodios` ausente é erro de estrutura; par ausente é ausência.
4. Alternativa descartada: escolher o episódio pelo texto `Episódio N`. O `numerando` já traz temporada e episódio no formato do tema e evita confundir episódio especial.

### D4. Expansão DooPlay e famílias de player

1. Ler `li.dooplay_player_option` e ignorar `data-nume` não numérico (trailer).
2. Expandir com `POST /wp-admin/admin-ajax.php`, formulário `action=doo_player_ajax&post=<post>&nume=<nume>&type=<type>`, cabeçalho `X-Requested-With: XMLHttpRequest` e `Referer` da página.
3. Classificar cada `embed_url`:
   1. `jwplayer/?source=<valor>`: decodificar `source`; aceitar `http(s)`; tipo `hls` se o caminho contiver `.m3u8`, senão `mp4`. O `type` do JSON não é usado.
   2. `rumble.com/embed/<id>`: buscar a página, localizar `p.f["<id>"]` e ler `u.hls.url`; a qualidade é a maior chave numérica de `u.ua.tar` (`360`, `480`, `720`, `1080`), quando existir.
   3. Demais hosts: triagem.
4. Cada opção é resolvida em isolamento; falha gera `console.warn('[AmyFlix] Opção <rótulo> descartada: <causa>')`. Se nenhuma produzir stream e alguma falhar, sobe erro agregado; se todas forem triagem, lista vazia.
5. Alternativas descartadas:
   1. Seguir o `jwplayer/?source=` como página: o `source` já é a mídia; abrir a página adicionaria requisição sem dado novo.
   2. Construir `hls-vod/<id>` a partir do id do embed: o id do vídeo (`v6xafmq`) não é o id do HLS (`SHCFq3GEOak`); a URL só existe no objeto da página.
   3. Sondar a mídia para provar que reproduz: proibido pelo contrato; a evidência fica na rodada online.

### D5. Streams, idioma e qualidade

1. `buildStream` com `format: { template: FORMATTER.AUTO, addon: 'AmyFlix', title, year, season, episode }`.
2. Idioma: `Legendado`/`Dublado` quando o rótulo declarar; caso contrário, omitir.
3. Qualidade: Rumble usa a maior chave de `u.ua.tar`; `jwplayer` não tem evidência e fica `Desconhecida`.
4. Sem `headers`: as duas famílias responderam 200/206 sem `Referer`.
5. `provider` identifica o player (`Rumble` ou `JWPlayer`), não o host da CDN.

### D6. Erros e testes

1. Entrada, TMDB, busca, detalhe, listagem de episódios e JSON de opções são estruturais e lançam.
2. Cada opção de mídia é independente.
3. Fixtures: busca com resultado, busca vazia, série, filme, AJAX com `jwplayer` HLS, AJAX com `jwplayer` MP4, AJAX com Rumble embed, AJAX com host não suportado e resposta inválida.
4. Sem cookies, tokens ou URLs assinadas nas fixtures; o `source` do Rumble tem `key` e não pode ser versionado — usar placeholder no fixture.

## Risks / Trade-offs

1. **Sem ano** → títulos com tradução própria ou homônimos podem gerar ambiguidade. O provedor recusa em vez de arriscar.
2. **Catálogo GL** → nicho menor que o de um provedor generalista; a descrição do manifest precisa deixar claro que é GL/dorama.
3. **Rumble assinado** → o `key` do `playlist.m3u8` é efêmero; o provedor resolve a cada pedido, sem cache.
4. **Estrutura DooPlay** → mudanças de tema podem alterar `ul.episodios`/`li.mark-*`; a falha sobe como estrutura.
5. **`p.f[...]` sem versão** → o objeto do embed pode mudar; a falha é isolada na opção Rumble e as demais continuam.
6. **Sem sondagem** → a URL devolvida comprova o contrato, não a reprodução no aparelho.

## Migration Plan

1. Criar `src/amyflix/` (`index.js`, `catalog.js`, `players.js`, `embeds.js`) e os testes com fixtures sanitizadas.
2. Adicionar a entrada no `manifest.json` e a seção em `providers.md` com status `🟠 Não verificado`.
3. Atualizar `docs/provider-investigation.md` com o método Rumble/jwplayer.
4. Rodar `npm run lint`, `npm test` e `node build.js amyflix`.
5. Executar `npm run test:online -- --provider amyflix` e registrar a rodada.
6. Rollback: remover a entrada do manifest, os arquivos gerados e a seção de `providers.md`.

## Validation

1. Observado: home 200; busca com e sem resultado; série `khom-khlang-the-series-legendado` com `ul.episodios`; AJAX com `Rum HLS`, `Rum MP4` e `Rum` embed; master Rumble 200 `application/vnd.apple.mpegurl` com 1080p/720p; MP4 206 `video/mp4` com `ftyp`; embed Rumble 200 com `p.f` e HLS 206 sem `Referer`.
2. Não confirmado: reprodução no app, cobertura de todos os títulos GL, frequência de opções apenas em hosts não suportados e comportamento de títulos cuja tradução da fonte difere do TMDB. A rodada online mede a resolução do contrato, não o vídeo.
