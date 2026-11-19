# Design

## Context

O TopAnimes.net é um catálogo WordPress com o tema DooPlay (`baka22`), voltado a animes e adaptações live-action. A fonte publica filmes em `/filmes/<slug>/` e séries em `/animes/<slug>/`. A busca é `GET /?s=<termo>` e devolve cartões com título, ano e tipo pela rota. A página de série lista episódios em `ul.episodios`; a página de episódio e a de filme publicam as opções em `li.dooplay_player_option` com o iframe em `#source-player-<nume>`.

A investigação foi feita em 19/11/2026 somente contra a URL pública, com `curl`/`fetch` e leitura de HTML/JSON. Nenhum scraper externo foi consultado.

## Goals / Non-Goals

1. Goal: resolver filmes e séries do catálogo com identidade conferida por título, tipo e ano.
2. Goal: selecionar o episódio pelo par publicado (`numerando`) ou pela numeração absoluta (`epnumber`).
3. Goal: resolver Booonceivu, Blogger, `/antivirus`, Ruplay/IncVideo e Filemoon/Byse sem executar JavaScript remoto, `eval` ou `new Function`.
4. Non-goal: filmes cujo único player é o KojimaCDN desativado.
5. Non-goal: VidGuard, StreamWarp, Streamtape, MixDrop, AON, Tera, Abyss e UP.
6. Non-goal: bypass de WAF, conta, assinatura, DRM ou proteção de player.

## Decisions

### D1. Escopo `movie` e `tv`

O site publica filmes em `/filmes/` e séries em `/animes/`. O provedor aceita os dois tipos e valida `tmdbId`, `mediaType`, temporada e episódio antes de qualquer requisição. Pedido de série sem temporada/episódio inteiros a partir de 1 lança erro.

### D2. Busca HTML e variantes do TMDB

A busca JSON `wp-json/dooplay/search/` exige `nonce` (`no_verify_nonce` sem ele), então a busca pública usada é a HTML `/?s=<termo>`, que não exige token. Os termos vêm de `media.title`, `media.originalTitle`, `alternativeTitles` e `romajiTitles`; para série, os romaji específicos da temporada pedida entram antes dos demais. Os termos são deduplicados por texto normalizado e limitados a oito. A página sem `.search-page` é erro de estrutura; `.no-result` ou zero cartões é ausência.

### D3. Identidade por rota, título, ano e episódio

O cartão traz o tipo pela rota (`/filmes/` ou `/animes/`), o título e o ano em `.year`. O título do cartão é limpo de `Dublado`, `Legendado`, `(TV)`, `(CAM-RIP)`, `Online`, `Filme` e de sufixos de temporada (`Season N`, `Temporada N`, `Nª Temporada`, `Part N`, `Parte N`, número final de 1–2 dígitos em série). A comparação usa `titleSimilarity` com os títulos do TMDB, incluindo romaji. Para filme, exige similaridade ≥ 0,88. Para série, aceita similaridade ≥ 0,88 ou prefixo do título-base quando o par temporada/episódio existe na página e o ano da temporada confere com tolerância de um ano. O prefixo é necessário para arcos publicados como página própria (`Kimetsu no Yaiba: Yuukaku-hen`, `Bleach: Sennen Kessen-hen`); o ano evita aceitar a série live-action `One Piece: A Série` (2023) no lugar do anime de 1999.

O ano esperado em série é o da temporada pedida em `media.seasons`, com fallback para o ano da série. A confirmação final acontece na ficha pelo `h1` limpo; o `span.date` da ficha é título alternativo em série e data em filme, e não é usado como ano de série.

### D4. Temporada e episódio

A página de série publica `.numerando` no formato `temporada - episódio` na maioria dos títulos. O provedor exige o par exato quando esse campo existe. Quando a página não publica `.numerando` (títulos antigos como Naruto Shippuden e One Piece), a numeração de `.epnumber` é absoluta e o episódio é calculado pela soma de `episodeCount` das temporadas regulares anteriores do TMDB, excluindo a temporada 0; se o título da página declara a temporada pedida, usa a numeração local. O `href` publicado é sempre usado; nenhuma URL de episódio é montada.

### D5. Opções DooPlay

Cada `li.dooplay_player_option` com `data-nume` numérico é uma opção independente. O rótulo vem de `.title`; o endereço vem do primeiro `iframe` em `#source-player-<nume>`. O trailer (`data-nume="trailer"`) é descartado por triagem. Opção numérica sem iframe é descartada por triagem, sem derrubar as demais. Não há expansão AJAX nesta versão porque todas as amostras publicaram o iframe inline.

### D6. Resolução dos players

1. **Booonceivu JSON.** O host termina em `booonceivu.shop`; a mesma URL com `mode=to-salvando-seu-ip` devolve JSON `{status, midias[], legendas[]}`. Requer `Referer` de `https://topanimes.net/` em algumas instâncias (`ru-boyceta` devolveu 403 sem ele). As mídias são HLS; `SD`, `LD` e `FD` são mapeados para `1080p`, `720p` e `360p` conforme o próprio script do player. As legendas são VTT públicas e entram no stream.
2. **Booonceivu Zuplay.** A mesma família de host pode publicar um HTML com `jwplayer(...).setup({sources:[{file,type,label}]})` e MP4 assinado no CDN. A descoberta exige `Referer`; a reprodução do MP4 respondeu sem cabeçalhos.
3. **Wrapper `/antivirusN`.** O site publica `topanimes.net/antivirusN/...?id=<caminho>` com jwplayer e um HLS assinado. O `/antivirus5` respondeu sem cabeçalhos; o `/antivirus2` exigiu `Referer` de `topanimes.net` na master. O provedor aplica `User-Agent` e `Referer` à família para cobrir o caso exigido.
4. **Ruplay/IncVideo.** `csst.online`, `fsst.online` e `incvideo*.online` redirecionam para um HTML com `new Playerjs({file:"[360p]https://.../get_file/..."})`. O campo `file` é lido localmente, separado por rótulo entre colchetes e restrito a URLs `/get_file/`. O `/aviso/?url=` às vezes concatena `&poster=...` sem `?` (ex.: `https://csst.online/embed/1025144&poster=...`), e o sufixo é removido antes de abrir o embed. O MP4 responde `HTTP 206` sem cabeçalho ou com `Referer` da origem final (`https://incvideo1.online/`); `Referer` de `topanimes.net` responde 403, então o stream leva `User-Agent` e `Referer` da origem do embed. Não há sonda, cookie ou `redirect: manual` neste fluxo.
5. **Filemoon/Byse.** `filemoon.*` com `/e/<código>` responde `api/videos/<código>/` com `Referer` do embed e `playback` em AES-256-GCM (`version`, `key_parts`, `iv`, `payload`). A decifragem é local, em `src/topanimes/byse.js`, com o mesmo algoritmo clean-room do Byse já usado no repositório; as fontes HLS vêm de `sources` com `height`/`label`, e as legendas de `tracks`. O `.m3u8` responde 200 com ou sem `Referer`, então o stream sai sem cabeçalhos.
6. **Blogger.** O iframe `blogger.com/video.g` é lido pelo bloco `blogger-video`; cada formato progressivo vira um MP4 com `qualityLabel`. A reprodução exige `User-Agent` (sem ele, o Google Video responde 403).
7. **KojimaCDN.** `litch.alibabacdn.net` publica `sources` com `file` vazio e um aviso de player desativado. O provedor lê a página e não gera stream; não é falha.
8. **Triagem.** VidGuard, StreamWarp, Streamtape, MixDrop, AON, Tera, Abyss, UP, `doflix.net` e `api.anivideo.net` não são resolvidos. Os dois últimos não apareceram nas páginas da amostra; entram como hipótese, não como requisito. Host desconhecido e trailer são triagem.

### D7. Idioma, qualidade e legendas

O idioma é `Dublado` quando o título da ficha/cartão contém `Dublado`; é `Legendado` quando a página não é dublada e o player publica legenda `Português`/`Português (BR)`; caso contrário fica desconhecido. A presença de legenda PT em página dublada não rebaixa o áudio para `Legendado`. As legendas externas são preservadas com o rótulo da fonte como `language`, sem `headers` (o proxy respondeu sem cabeçalhos). A qualidade vem do rótulo do player; no Filemoon, de `height` e, sem ele, de `label`; sem rótulo reconhecível, é omitida e `buildStream` descobre localmente, com `Desconhecida` como último caso. Só o Booonceivu tem mapa de qualidade próprio (SD/LD/FD); o restante usa o rótulo publicado. O Ruplay usa o rótulo entre colchetes do `Playerjs` e leva `User-Agent` com `Referer` da origem final; o Filemoon sai sem cabeçalhos.

### D8. Fronteira de erro, ausência e tempo

Busca, TMDB e ficha confirmada são fatais: HTTP fora de 2xx, estrutura sem `.search-page`, ficha sem `h1` ou opção malformada sobem. Ficha 404 e episódio 404 são candidatos removidos e a busca continua. Busca sem cartões, nenhum candidato confirmado, temporada/episódio ausente, página sem opções e player desativado são ausência. Cada opção é resolvida em isolamento com `console.warn('[TopAnimes] Opção <rótulo> descartada: <causa>')`; se nenhuma produzir stream e alguma falhar, o erro agregado sobe. Não há timeout, `AbortController`, retentativa, sonda de mídia, cache ou settings.

## Risks / Trade-offs

1. O `/antivirus2` devolve um master cujos segmentos apontam para `test.apicloudqoogle.com`, que responde com uma página de site encerrado. O provedor devolve a URL publicada porque ela é o contrato da fonte; a reprodução é hipótese e depende de a fonte religar o CDN.
2. O KojimaCDN está desativado; filmes que só têm esse player ficam sem stream. O provedor não tenta contornar o aviso.
3. O Ruplay depende do redirecionamento `csst.online`/`fsst.online` → `incvideo*.online` e do campo `file` do `Playerjs`; uma mudança de host ou de formato derruba a opção isoladamente. O `/aviso/` pode publicar o sufixo `&poster=` malformado, tratado antes da abertura.
4. O Filemoon pode rotacionar domínio e esquema do `playback`; a decifragem falha de forma explícita e a opção é descartada. O algoritmo não verifica a tag GCM, como o player observado.
5. As URLs de mídia são assinadas e efêmeras; nenhuma entra em fixture, log ou documentação. A fixture do Filemoon usa chave e payload controlados para não carregar URL assinada.
6. A busca HTML não tem paginação observada; os 16 resultados da primeira página são o teto. Títulos fora do recorte ficam sem candidato.
7. Páginas de temporadas publicadas como arco/título próprio são aceitas pelo prefixo e pelo par `.numerando`; um arco sem o número do TMDB continua ausente, sem mapeamento por posição.
8. A numeração absoluta depende dos `episodeCount` do TMDB. Para One Piece, os cortes de temporada do TMDB são artificiais; a página única com numeração global resolve as temporadas cobertas pela soma, mas temporadas sem `airDate` podem ser recusadas pelo ano.
9. `doflix.net` e `api.anivideo.net` não apareceram nas páginas da amostra; não entram sem evidência ao vivo de uso pelo TopAnimes.

## Open Questions

1. O `/antivirus2` voltará a servir segmentos? A URL publicada continua válida, mas o CDN responde com página de encerramento.
2. O KojimaCDN será religado? O site diz que o play foi desativado por falta de verba.
3. Algum filme do acervo antigo tem player Booonceivu ainda ativo? A amostra de 19/11/2026 não encontrou.
4. O MixDrop e o Streamtape poderiam ampliar a cobertura, mas não entram nesta versão por não serem necessários à amostra e por duplicarem adaptadores locais de outro provedor.
5. `doflix.net` e `api.anivideo.net` aparecerão em páginas do TopAnimes? Não foram observados na amostra; permanecem em triagem até nova evidência.

## Validation

1. `npm run lint` e `npm test` sem rede.
2. `node build.js topanimes` para o arquivo base e as variantes `gdrive` e `prism`.
3. `npm run test:online -- --provider topanimes --seed 163f594d3926f0441149e54b4b4d35eb --record` com `TMDB_API_KEY` do ambiente, para registrar a evidência online.
4. Testes offline cobrem filme, série, episódio por `numerando`, episódio por numeração absoluta, ausência, busca sem resultado, estrutura inválida, opção de triagem, falha isolada, erro agregado, `/aviso/` com `&poster=` malformado, Ruplay multi-qualidade, Filemoon/Byse decifrado e playback inválido.
