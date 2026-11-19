# Design

## Context

1. A fonte é o catálogo AnimesHD (`https://animeshd.to`), WordPress 7.1.3 com o tema DooPlay 2.5.5, somente séries de anime em PT-BR. A investigação ocorreu em 2026-11-19, somente contra a URL pública e este repositório.
2. O site responde HTTP 200 sem desafio Cloudflare na amostra. O HTML inicial traz a home, a busca e as fichas; não há SPA nem `wp-json` público para o catálogo.
3. O `wp-json` geral existe, mas `/wp-json/dooplay/search/?q=<termo>` responde `{"error":"no_verify_nonce","title":"No data nonce"}`. A busca usada pela página é `GET /?s=<termo>` e foi adotada.
4. Os sitemaps do Yoast listam `tvshows`, `seasons` e `episodes`; não há sitemap de filmes. Buscas por "mugen train", "your name", "chihiro" e "akira" não devolveram filme. A fonte é somente `tv`.
5. A busca devolve cartões `div.result-item` com `div.title a`, `span.year` e imagem. A mesma consulta pode devolver título alheio: "Demon Slayer" devolveu o cartão de Berserk.
6. A ficha é `/animes/<slug>/`, com `h1` em `.sheader`, ano em `.sheader span.date` e `itemtype` `TVSeries`. O `h1` mistura romaji e título em inglês entre parênteses: `Kimetsu no Yaiba (Demon Slayer)`, `Shingeki No Kyojin (Attack on Titan)`.
7. As temporadas ficam em `div.se-c`, o número em `span.se-t` e os episódios em `ul.episodios li`, com `div.numerando` (`S - E`) e `div.episodiotitle a`.
8. A numeração da fonte diverge do TMDB em Demon Slayer: a fonte tem quatro temporadas (26 + 11 + 11 + 8 episódios) e o TMDB tem cinco (26 + 7 + 11 + 11 + 8), porque a fonte não publica o arco Mugen Train. A temporada 2 da fonte é a 3 do TMDB; a 3 é a 4; a 4 é a 5. A data do primeiro episódio de cada temporada da fonte coincide com o `airDate` da temporada correspondente do TMDB.
9. One Piece e Dragon Ball Z são publicados como uma única `Temporada 1` com a numeração global (1170 e 291 episódios). Não há temporada 2 na fonte.
10. A página do episódio publica um ou mais `li.dooplay_player_option` com `data-type`, `data-post` e `data-nume`; o rótulo fica em `span.title` e pode ser `Dublado`, `Legendado`, `Legendado (Parte 1)` ou um rótulo técnico como `P1`.
11. A expansão é `POST /wp-admin/admin-ajax.php` com `action=doo_player_ajax`, `post`, `nume` e `type`. A resposta observada é `{"embed_url":"https://www.blogger.com/video.g?token=...","type":"iframe"}`.
12. O HTML do Blogger publica `streamingData.formats` com MP4 progressivos e `qualityLabel` (144p, 240p, 360p, 480p, 720p). O bloco `blogger-video` já lê esse HTML.
13. A URL do `googlevideo.com` é vinculada ao IP e ao `User-Agent` usado na requisição do HTML do Blogger. Com o mesmo `User-Agent` de navegador, o arquivo respondeu HTTP 206 `video/mp4`; com outro `User-Agent`, respondeu HTTP 403. O `Referer` não foi necessário.
14. A opção `Legendado` de My Hero Academia S01E01 devolveu HTML do Blogger sem `streamingData`; a opção `Dublado` do mesmo episódio devolveu 360p e 720p. A falha de uma opção não pode derrubar a outra.
15. O runtime é QuickJS: `fetch`, `URL`, `URLSearchParams`, `AbortController`, `atob`/`btoa`, `module` e `TMDB_API_KEY`; `require` só para `cheerio-without-node-native` e `crypto-js`. Não há `axios`, APIs do Node, `setTimeout`/`setInterval`, `TextEncoder` ou `TextDecoder`. O provedor não impõe timeout e só `getStreams` captura a falha final.

## Goals / Non-Goals

**Goals:**

1. Resolver séries de anime do AnimesHD pelo ID do TMDB, sem chave adicional e sem raspar endpoints privados.
2. Confirmar título e ano antes de abrir temporada e episódio.
3. Alinhar a temporada do TMDB à temporada publicada pela fonte quando a numeração diverge.
4. Entregar os MP4 do Blogger com qualidade, idioma e cabeçalho de reprodução comprovados.
5. Distinguir ausência reconhecida de falha de rede, HTTP ou estrutura.
6. Introduzir no guia de investigação o método de temporada por data de estreia e a cadeia DooPlay/Blogger.

**Non-Goals:**

1. Implementar filmes, downloads, conta, login, favoritos ou histórico.
2. Baixar mídia, sondar resolução, abrir a playlist ou cachear URL.
3. Mapear temporadas por posição, numeração absoluta ou palpite quando a data e a contagem não confirmarem.
4. Criar bloco novo: a cadeia usa blocos existentes e nenhum padrão novo exige código compartilhado.
5. Contornar bloqueio, captcha, Cloudflare ou restrição de acesso.
6. Extrair legendas externas, tamanho ou metadados que o bloco `blogger-video` não expõe.

## Decisions

### D1. Busca HTML em vez da REST do DooPlay

1. Usar `GET /?s=<termo>` com `fetchPage` do bloco `http`, perfil `page`, e ler `div.result-item`.
2. A REST `/wp-json/dooplay/search/` foi descartada porque exige nonce de sessão e respondeu `no_verify_nonce` sem ele. O nonce aparece no HTML, mas depender dele acoplaria o provedor à sessão e ao script de busca do tema.
3. A REST `wp/v2/posts` foi descartada porque os tipos `animes` e `episodes` não aparecem em `/wp-json/wp/v2/types`; o catálogo não é exposto por ela.
4. A página de busca sem cartões e sem `body.search-no-results` é erro de estrutura, não ausência. A ausência reconhecida usa o marcador `body.search-no-results`.

### D2. Variantes de título e confirmação por partes do `h1`

1. Montar os termos na ordem: romaji geral, título PT-BR, título original, alternativos brasileiros e romaji com temporada. Deduplicar pelo texto normalizado e não impor teto além do que o TMDB fornece.
2. A busca aceita qualquer cartão e acumula por URL. O cartão é apenas candidato; a confirmação acontece na ficha.
3. O `h1` é dividido em partes: o texto inteiro, o texto antes dos parênteses e cada grupo entre parênteses. A confirmação aceita qualquer parte com similaridade mínima de 0,85 contra título PT-BR, original ou alternativos. Isso resolve `Shingeki No Kyojin (Attack on Titan)` e `Kimetsu no Yaiba (Demon Slayer)` sem aceitar um título alheio.
4. Remover sufixos de catálogo do `h1` e do cartão antes da comparação: `Dublado`, `Legendado`, `Online`, `HD`, `Todos os Episódios`, `Anime Completo` e `Dublado e Legendado`.
5. Comparar o ano da ficha com o ano do TMDB com tolerância de um ano. Ano ausente na ficha é erro de estrutura; ano divergente descarta o candidato.
6. Abrir no máximo quatro candidatos, priorizados pela maior similaridade. Candidato 404 é pulado; 403/5xx sobe como falha.
7. Alternativas descartadas:
   1. Aceitar o primeiro resultado: "Demon Slayer" devolveu Berserk e o primeiro cartão não é confirmação.
   2. Comparar só o `h1` inteiro: os títulos compostos com parênteses ficariam abaixo do limiar.
   3. Usar `findBestMatch` isolado: ele compara um título por vez e não cobre as partes entre parênteses sem duplicar a lista de candidatos.

### D3. Temporada pela data de estreia e pela contagem de episódios

1. Ler cada `div.se-c`: número de `span.se-t`, data do primeiro `span.date` e quantidade de `li`.
2. Se a temporada do TMDB tiver `airDate`, comparar com a data do primeiro episódio de cada temporada da fonte com tolerância de um dia. Uma única correspondência vence. Várias correspondências são desempatadas pela contagem de episódios; se continuar ambíguo, a saída é ausência.
3. Sem correspondência por data, aceitar a temporada 1 única como temporada agrupada quando o pedido é da temporada 1. Isso cobre One Piece e Dragon Ball Z, cuja `Temporada 1` contém a numeração global.
4. Sem correspondência por data e sem temporada agrupada, aceitar o número exato apenas quando a contagem de episódios da fonte for igual à do TMDB.
5. Sem `media.seasons` do TMDB, aceitar o número exato da fonte. É o único caso em que a numeração crua é usada; o TMDB normalmente fornece a lista.
6. Alternativas descartadas:
   1. Usar só `span.se-t`: escolheria o arco errado em Demon Slayer (S02 do TMDB cairia na temporada 2 da fonte, que é o arco seguinte).
   2. Somar episódios para numeração absoluta: One Piece tem 23 temporadas no TMDB e 1170 episódios na fonte; a soma não fecha e escolheria episódio errado.
   3. Mapear por posição: a fonte não garante ordem nem quantidade.
   4. Usar o ano da série: o ano é da obra, não da temporada.

### D4. Episódio pelo `numerando` da temporada escolhida

1. Dentro do bloco da temporada escolhida, ler `div.numerando` no formato `S - E` e comparar o segundo número com o episódio pedido.
2. Exigir que o primeiro número também seja o da temporada escolhida; entrada com outra temporada é ignorada.
3. Usar o `href` de `div.episodiotitle a`; sem `href`, erro de estrutura. Não montar a URL por substituição.
4. Quando `div.numerando` faltar, aceitar o número do texto do link (`Episódio N`). Sem episódio correspondente, a saída é ausência.
5. Alternativas descartadas:
   1. Usar a posição na lista: a fonte pode publicar episódios fora de ordem.
   2. Usar numeração absoluta do TMDB: a fonte já publica a numeração local no `numerando`.
   3. Montar `/episodios/<slug>-episodio-<n>/`: o `href` publicado pode ter sufixo ou variar.

### D5. Opções DooPlay e resolução do Blogger

1. Cada `li.dooplay_player_option` com `data-nume` numérico é uma opção independente. Rótulo vazio vira `Opção <n>`; `data-nume` não numérico (trailer) é ignorado.
2. Expandir por `POST /wp-admin/admin-ajax.php` com formulário `action=doo_player_ajax`, `post`, `nume` e `type`, perfil `api` e `Referer` da página do episódio. A resposta precisa ser objeto com `embed_url` texto não vazio.
3. Host fora de `blogger.com`/`www.blogger.com` é triagem, não falha. O host observado é sempre `www.blogger.com`.
4. Abrir o HTML do Blogger com o mesmo `User-Agent` do bloco `http` e ler `streamingData.formats` com `extractBloggerFormats`. Não usar `Referer` na descoberta nem na reprodução: a amostra respondeu sem ele.
5. O `User-Agent` do HTML do Blogger é o mesmo que o da reprodução, porque a URL do `googlevideo.com` é vinculada a ele. Usar `DEFAULT_USER_AGENT` do bloco `http` nos dois passos e informar apenas `{"User-Agent": DEFAULT_USER_AGENT}` em `headers`.
6. Alternativas descartadas:
   1. Abrir `embed_url` e procurar `sources`: o HTML do Blogger não tem `sources`; a mídia está em `streamingData.formats`.
   2. Reutilizar a URL de mídia entre execuções: ela é assinada, vinculada ao IP e ao `User-Agent` e expira.
   3. Usar `Referer: https://www.blogger.com/` como cabeçalho de reprodução: não foi necessário e adicionaria cabeçalho sem evidência.
   4. Tratar host desconhecido como falha: seria triagem, e a ausência de streams não deve virar erro quando nenhuma opção é suportada.

### D6. Contrato dos streams

1. Montar cada formato com `buildStream` e `format`: `template: FORMATTER.AUTO`, `addon: 'AnimesHD'`, título, ano, temporada e episódio.
2. `type: 'mp4'`, `provider: 'Blogger'`, `qualityHints` com o `qualityLabel` do formato e `headers` com o `User-Agent`.
3. Idioma: `languageFromTexts` no rótulo da opção. `Dublado`/`Legendado` (inclusive com `(Parte N)`) viram o membro do enum; rótulo técnico (`P1`, `HD`, `Opção N`) fica para a descoberta local e termina em `Idioma Desconhecido` sem evidência.
4. Não informar `size`, `subtitles`, `infoHash`, `seeders`, `peers` ou `behaviorHints`: a fonte não os publica de forma utilizável no contrato atual. O `contentLength` do `streamingData` não é exposto pelo bloco `blogger-video`; ampliar o bloco por um único consumidor ficou fora do escopo.
5. Deduplicar pela URL exata e ordenar com `sortByQuality`.
6. Alternativas descartadas:
   1. Informar `provider: 'AnimesHD'`: o `addon` já identifica o catálogo; o host da mídia é o Blogger.
   2. Usar `qualityLabel` como `quality` direto: `buildStream` normaliza e trata rótulos vazios.
   3. Presumir `Dublado` por catálogo PT-BR: o catálogo tem as duas variantes e o rótulo é a única prova.

### D7. Isolamento por opção e erros

1. Cada opção é resolvida em isolamento. Falha gera `console.warn('[AnimesHD] Opção <rótulo> descartada: <causa>')` e preserva as demais.
2. Se nenhuma opção produzir stream e alguma tiver falhado, o erro agregado com as causas sobe para `getStreams`.
3. Opção de host não suportado é triagem: não entra no agregado. Se todas forem triagem, a saída é lista vazia.
4. Busca sem cartões e sem marcador, ficha 200 sem `h1`/`span.date`, ficha confirmada sem `div.se-c`, temporada sem `span.se-t` numérico, episódio sem `href` e AJAX sem `embed_url` são erros de estrutura.
5. Ausência reconhecida: busca sem resultado, nenhum candidato confirmado, temporada ou episódio não publicado, página de episódio 404 e página de episódio 200 com `h1` e sem opções.
6. As mensagens de log são saneadas para não conter URL, token ou hash.

### D8. Escopo seriado

1. `getStreams` valida ID, tipo e coordenadas e devolve lista vazia para `movie` sem consultar a fonte.
2. A fonte não tem catálogo de filmes; aceitar `movie` só produziria ausência e requisições inúteis. O manifest declara somente `tv`.
3. Alternativa descartada: tratar um filme como episódio único. Não há página de filme observada e a busca por títulos de filme conhecidos devolveu zero cartões.

## Risks / Trade-offs

1. A data do primeiro episódio é a única âncora para temporadas desalinhadas; uma temporada sem data ou com data errada cai para a contagem de episódios e pode virar ausência.
2. A fonte pode mudar o tema DooPlay, o `data-*` das opções ou o HTML do Blogger; cada mudança vira erro de estrutura, não ausência.
3. A URL do Blogger é efêmera e vinculada ao IP e ao `User-Agent`; não há cache nem sonda, então a reprodução real depende do aparelho.
4. A opção `Legendado` de parte do acervo publica página sem `streamingData`; o provedor mantém a `Dublado` e descarta só a opção quebrada.
5. Temporadas agrupadas em uma única `Temporada 1` só atendem a temporada 1 do TMDB; pedidos de temporadas posteriores de One Piece e Dragon Ball Z ficam sem resultado.
6. O acervo não tem filmes e a cobertura de temporadas antigas depende do que a fonte publica.

## Migration Plan

1. Adicionar o provedor e o manifest; não há migração de dados ou de configuração.
2. Reverter é remover a entrada do manifest e os arquivos gerados pelo build; nenhum provedor existente é alterado.
3. Publicar somente depois da rodada online do pacote final; a aprovação offline não autoriza publicação.

## Open Questions

1. A data de estreia de outras temporadas desalinhadas confirma o mesmo método? A amostra cobre Demon Slayer S01, S03, S04 e S05 (S02 do TMDB), além de One Piece, Bleach, Jujutsu Kaisen, Attack on Titan e My Hero Academia S01.
2. O `Legendado` de outros episódios também vem sem `streamingData`? A amostra viu a falha em My Hero Academia e Attack on Titan; o comportamento é tratado como falha isolada.

## Validation

1. `npm run lint` passou sem avisos.
2. `npm test` passou com 1756 testes, incluindo os 37 casos novos de `test/animeshd.test.js`; a única falha intermediária foi a lista de perfis esperada em `test/online-catalog.test.js`, corrigida com a entrada `animeshd`.
3. `node build.js animeshd` gerou `providers/animeshd.js`, `gdrive/providers/animeshd.js`, `prism/providers/animeshd.js` e os dois `<formato>/manifest.json`.
4. `npm run test:online -- --provider animeshd --seed 20261119 --record` resolveu 5/5 títulos de `tv`, com status **Estável**, pacote 1.0.0, perfil `anime` e catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`. Casos: Demon Slayer S01E01, Bleach S01E01, My Hero Academia S01E01, Jujutsu Kaisen S01E01 e Attack on Titan S01E01.
5. Sondas manuais do pacote final confirmaram 206 `video/mp4` com `Range` e o mesmo `User-Agent` do HTML do Blogger; sem o cabeçalho, a mesma URL respondeu 403.
6. Fora do escopo: filmes, temporadas agrupadas acima da temporada 1, reprodução no aparelho, download de mídia, legendas externas e tamanho. A cobertura além da amostra depende do acervo e da estabilidade do Blogger.
