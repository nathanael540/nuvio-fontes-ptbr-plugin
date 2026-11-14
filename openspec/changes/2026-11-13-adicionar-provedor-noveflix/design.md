# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03) contra `https://noveflix.lol`. URLs com token de `stream.php`, cookies e URLs assinadas não são registrados aqui.

1. A home respondeu HTTP 200 `text/html; charset=UTF-8` com 147.589 bytes. A busca `GET /?s=Avenida%20Brasil` respondeu 200 com 119.250 bytes e um `article` em `.search-page`; o cartão `.title a` aponta para `/assistir/avenida-brasil/`. A busca de `Caminho da Vinganca` devolveu 0 cartões e o marcador de ausência do tema.
2. A ficha de `Avenida Brasil` respondeu 200 com 140.981 bytes, `h1` `Avenida Brasil`, `span.date` `2012` e um único `li.dooplay_player_option` com `data-post="7059"`, `data-type="movie"` e `data-nume="1"`. Não há campo `dateCreated`.
3. `Vale Tudo` publicou `span.date` 1988 e `Vale Tudo (2025)` publicou 2025; a busca de `Vale Tudo` devolveu os dois cartões, com o ano no título do primeiro e sem `.year` no cartão. O ano da ficha é o discriminante.
4. O POST em `/wp-admin/admin-ajax.php` com `Referer` da ficha e `Content-Type: application/x-www-form-urlencoded` respondeu 200 `application/json` (77 bytes) com `{ embed_url, type }`; `embed_url` fica em `novefx.biz` e o caminho é derivado do título (`/nov%2Favenidabrasil.php`).
5. O embed respondeu 200 com 4.551 bytes e publicou `totalChapters = 179`, `originalUrl = https://nflixpainel.cc/video/AVBR-${chapterStr}`, `encodedUrl = btoa(originalUrl)` e `finalUrl = https://redirectnflix.com/?<encodedUrl>`; `chapterStr` é `("00" + i).slice(-3)`.
6. O capítulo 1 percorreu: gate 200 em `esportesdavez.com` (a URL `redirectnflix.com` redireciona para esse host), `#player-iframe[data-src]` com `safelink_redirect`, HTTP 302 para `nflixpainel.cc`, página de vídeo 200 com 48.713 bytes e `stream.php?slug=...&e=...&t=...` 206 `video/mp4` com `Content-Range` e `ftyp`. O capítulo 179 também respondeu 206.
7. O MP4 respondeu 206 sem `Referer`, sem cookie e sem `User-Agent` especial; a página de vídeo e o gate usaram os cabeçalhos de navegador da descoberta.
8. O arquivo tem 355.834.264 bytes no capítulo 1 e 415.698.750 no 179. Não há `RESOLUTION` na página nem metadado de altura no trecho público; a qualidade não foi medida.
9. `Avenida Brasil` tem 179 episódios no TMDB (45815) e 179 capítulos no site; a correspondência 1:1 foi confirmada no primeiro e no último. `A Usurpadora` também está no catálogo.
10. A ficha não publica ID do TMDB nem IMDb; a identidade é título + ano. A busca é textual e não tem paginação observada.

## Goals / Non-Goals

**Goals:**

1. Confirmar a novela por título e ano, separando original e remake.
2. Ler a única opção DooPlay e obter o embed novefx.
3. Validar o capítulo contra `totalChapters` e percorrer gate, safelink e `stream.php`.
4. Entregar MP4 com `buildStream` e `format`, sem `name`/`title`, sem sonda e sem timeout.
5. Manter testes offline com fixtures reais sanitizadas e verificação online no perfil `generalista`.

**Non-Goals:**

1. Afirmar 480p sem rótulo ou medição.
2. Implementar retentativa, pausa progressiva, cache ou timeout.
3. Mapear capítulos que não sejam 1:1 com o episódio do TMDB; o par ausente é ausência.
4. Resolver outros players ou hosts que não o gate novefx observado.
5. Garantir novelas fora da busca textual ou remakes cujo ano não esteja na ficha.

## Decisions

### D1. Busca e identidade por título e ano

1. Chamar `getMediaInfo({ tmdbId, mediaType: 'tv' })`; rejeitar `movie` na validação, porque o catálogo é de novelas.
2. Montar os termos com `title`, `originalTitle` e `alternativeTitles`, deduplicados por `normalizeText`.
3. Consultar `GET https://noveflix.lol/?s=<termo>` com `fetchPage`; ler `.search-page article`, `.title a` e `href`; aceitar somente caminhos `/assistir/<slug>/`. O `.year` do cartão veio vazio nas amostras; não usá-lo como filtro.
4. Para cada candidato (até três por termo), abrir a ficha e ler `h1`/`title` e `span.date`. O ano é o primeiro `span.date` da ficha.
5. Quando o TMDB e a ficha têm ano, exigir igualdade exata. `Vale Tudo` (1988) e `Vale Tudo (2025)` são obras distintas; aceitar o remake para o original entregaria a novela errada.
6. Quando a ficha não tem ano, aceitar somente título com similaridade alta (limiar 0,85) e registrar a ausência de ano como limite.
7. Alternativas descartadas:
   1. `dateCreated` da proposta: o campo não existe na página observada.
   2. Ano do cartão: veio vazio em `Avenida Brasil`, `Vale Tudo` e `A Usurpadora`.
   3. Aceitar o primeiro resultado: a busca de `Vale Tudo` devolve original e remake.

### D2. DooPlay e embed

1. Ler o botão `li.dooplay_player_option`: `data-post`, `data-type`, `data-nume` e o rótulo. A ficha de novela tem um botão; a ausência de `data-post` é erro de estrutura, não ausência.
2. Consultar `POST https://noveflix.lol/wp-admin/admin-ajax.php` com `Content-Type: application/x-www-form-urlencoded`, `Referer` da ficha e corpo `action=doo_player_ajax&post=<post>&nume=<nume>&type=movie`.
3. Exigir HTTP 2xx e JSON com `embed_url` HTTP(S); `embed_url` ausente é ausência da opção, JSON inválido é falha.
4. Não usar `data-type` como `movie`/`tv` do contrato: o site grava `movie` para novelas; o tipo do pedido continua `tv`.
5. Alternativa descartada: chamar `/wp-json/dooplayer/v2/...`; o fluxo observado na ficha é o `admin-ajax.php`.

### D3. Capítulo e gate novefx

1. Abrir o embed com `fetchPage` e `Referer` da ficha.
2. Ler `totalChapters` com expressão específica (`totalChapters = <n>`); valor ausente ou não inteiro é erro de estrutura.
3. Se `episode > totalChapters`, devolver lista vazia (capítulo não publicado).
4. Ler o prefixo do template `/video/<PREFIX>-` e a base do redirecionador. A base observada foi `https://redirectnflix.com/?`, mas ela deve ser lida da página, não fixada.
5. Montar `https://nflixpainel.cc/video/<PREFIX>-<NNN>` com três dígitos, codificar em Base64 (UTF-8, `btoa(unescape(encodeURIComponent(...)))`) e concatenar à base do redirecionador.
6. Pedir a URL do redirecionador com `fetchPage` e `Referer` do embed. O host final pode mudar (`esportesdavez.com` na amostra); usar a URL final como `Referer` do próximo salto.
7. No gate, ler `#player-iframe[data-src]` ou qualquer `data-src` com `safelink_redirect`; desescapar `&amp;` e exigir URL HTTP(S).
8. Pedir a `safelink` com `redirect: manual` e `Referer` do gate. Aceitar 3xx com `Location`; 200 direto também é aceito. A URL final é a página de vídeo.
9. Alternativa descartada: pular o gate e montar `stream.php` diretamente. O token `t` e o `e` só são publicados na página de vídeo.
10. Alternativa descartada: adicionar o site como fonte do `dooplay`. O `dooplay` já tem seis domínios e um resolvedor de players próprio; o gate novefx e o `stream.php` são um caminho novo, e um provedor separado preserva o agregador estável.

### D4. Página de vídeo e MP4

1. Pedir a página de vídeo com `Referer` da `safelink`; aceitar 200 e ler a URL `stream.php?slug=<PREFIX>-<NNN>&e=<timestamp>&t=<hash>` por expressão específica.
2. Resolver a URL relativa contra a página de vídeo e devolver exatamente o endereço publicado; não reconstruir `slug`, `e` ou `t`.
3. Não baixar o MP4 no provedor, não sondar `Range` e não abrir o arquivo para descobrir resolução.
4. O MP4 respondeu 206 sem cabeçalhos; o stream não leva `headers`.
5. Alternativa descartada: guardar a URL de `stream.php` em cache. O token expira e é específico do capítulo.

### D5. Streams, idioma e qualidade

1. Montar o stream com `buildStream`:
   1. `url` do `stream.php`.
   2. `type: 'mp4'`.
   3. `provider: 'NoveFlix'`.
   4. `quality`: `Desconhecida`, porque a fonte não declara resolução; se um dia a página ou o arquivo declarar um número, usar o número.
   5. `language: LANGUAGE.UNKNOWN`: a ficha não tem seletor de áudio nem rótulo `Dublado`/`Legendado`, e o catálogo ser PT-BR não comprova a faixa do arquivo. O idioma fica desconhecido até a fonte declarar.
   6. `format: { template: FORMATTER.AUTO, addon: 'NoveFlix', title, year, season: 1, episode }`.
2. Não informar `size`, `infoHash`, `seeders`, `peers` ou `subtitles`: a fonte não os publica.
3. Ordenar com `sortByQuality` (um stream não muda de posição).
4. Alternativa descartada: fixar `480p` como a proposta. O arquivo não expõe altura no trecho público e a página não rotula resolução; afirmar 480p seria inventar.

### D6. Erros, ausência e tempo

1. Entrada, TMDB, busca, ficha e AJAX são fatais: erro sobe até `getStreams`, que registra `[NoveFlix] <etapa>: <mensagem>` e devolve `[]`.
2. Gate, `safelink` e `stream.php` pertencem à única opção do título; a falha sobe como erro da opção e, sem stream, o erro agregado sobe.
3. Ausência reconhecida: nenhum cartão confirmado, `episode > totalChapters`, `embed_url` ausente ou página de vídeo sem `stream.php` por ausência explícita.
4. Não há `setTimeout`, `AbortController`, retentativa, pausa progressiva ou cache; o app controla a espera.
5. `console.warn` somente para opção descartada; `console.error` somente em `getStreams`.

### D7. Testes, manifest e documentação

1. Fixtures reais sanitizadas em `test/fixtures/noveflix/`: busca de `Avenida Brasil`, busca de `Vale Tudo` com original e remake, busca vazia, ficha 2012, ficha 1988, ficha sem `data-post`, AJAX com `embed_url`, embed com 179 capítulos e prefixo, gate com `#player-iframe`, página de vídeo com `stream.php`, gate sem iframe, capítulo acima do total e JSON inválido.
2. Casos: S01E01 e S01E179 de `Avenida Brasil` resolvem; `Vale Tudo` 1988 escolhe a ficha de 1988; `Vale Tudo` 2025 escolhe a de 2025; pedido de 180 devolve `[]`; gate sem iframe é erro; busca vazia devolve `[]`; `fetch` simulado só recebe busca, ficha, AJAX, embed, gate, página de vídeo e `stream.php`.
3. Manifest: `id` `noveflix`, nome `NoveFlix`, versão `1.0.0`, autor `nathanael540`, tipos `["tv"]`, formatos `["mp4"]`, `contentLanguage` `["pt"]`, logo `https://www.google.com/s2/favicons?domain=noveflix.lol&sz=128`.
4. Verificação online: sem entrada em `test/online/profiles.json` (perfil `generalista`); a linha e a seção em `providers.md` começam em `🟠 Não verificado`. O catálogo de referência não tem tag `novela`, então a amostra generalista pode não conter novelas; a rodada mede o contrato, não a cobertura do acervo. Uma tag `novela` com cinco títulos é hipótese para outra mudança.
5. `docs/provider-investigation.md`: nova seção “DooPlay de novela com gate novefx e safelink”, com `totalChapters`, prefixo, Base64, gate e `stream.php`; registrar a ausência de `dateCreated` e de resolução.

## Risks / Trade-offs

1. **Correspondência capítulo/episódio** → `Avenida Brasil` tem 179 nos dois lados; outras novelas podem ter contagem diferente. O provedor valida `episode <= totalChapters` e usa o capítulo de mesmo número; sem prova de 1:1, o par pode não existir.
2. **Ano da ficha** → `span.date` foi o ano de produção em `Avenida Brasil`, `Vale Tudo` e `Vale Tudo (2025)`. Se uma ficha usar a data de publicação, o filtro exato pode rejeitar uma obra válida.
3. **Gate volátil** → `redirectnflix.com` redirecionou para `esportesdavez.com`; o host do gate e a `safelink` podem mudar. O código lê a base do embed e usa a URL final como `Referer`.
4. **Token de `stream.php`** → expira e é específico do capítulo; não pode ser cacheado, logado ou usado em fixture.
5. **Qualidade** → não há 480p comprovado; o stream sai `Desconhecida` até a fonte declarar um número.
6. **Idioma** → a ficha não tem seletor de áudio nem rótulo; `Dublado` não é comprovado. O stream sai `Idioma Desconhecido` até a fonte declarar a faixa. O catálogo PT-BR sugere áudio português, mas a regra do repositório exige evidência.
7. **Busca sem paginação** → títulos fora da primeira página não são encontrados; não foi observada paginação para inventar.
8. **Amostra online sem novelas** → o catálogo de referência não tem tag `novela`; a rodada generalista pode concluir sem resolução mesmo com a cadeia funcionando. O status inicial fica `🟠 Não verificado` e a curadoria de uma tag `novela` fica para outra mudança.

## Migration Plan

1. Criar `src/noveflix/` com `catalog.js`, `dooplay.js`, `gate.js`, `streams.js` e `index.js`; rodar `node --test test/noveflix.test.js`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md`.
3. Atualizar `docs/provider-investigation.md` com o método.
4. Rodar `npm run lint`, `npm test` e `node build.js noveflix`; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider noveflix` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar a mudança somente com os testes previstos passando ou com as exclusões declaradas.
7. Rollback: remover o provedor, a entrada do manifest e a seção de `providers.md`.

## Validation

1. Confirmado online: home 200, busca 200 com cartão, ficha 2012 e 1988, `data-post` 7059, AJAX 200 com `embed_url`, embed 200 com `totalChapters = 179` e prefixo `AVBR-`, gate 200 com `safelink`, 302 para `nflixpainel.cc`, página de vídeo 200 e `stream.php` 206 `video/mp4` com `ftyp` para os capítulos 1 e 179.
2. Confirmado que o MP4 responde 206 sem `Referer` e sem cookie.
3. Não confirmado: reprodução no aparelho, todos os capítulos, a resolução real do MP4 e a correspondência 1:1 em novelas além de `Avenida Brasil`.
4. A rodada online e o teste no aparelho são as evidências que faltam; nenhuma delas altera o contrato descrito aqui.

## Open Questions

1. Todas as novelas têm `totalChapters` igual ao número de episódios do TMDB? `Avenida Brasil` tem 179 nos dois lados; a amostra não cobre as demais.
2. O `span.date` é sempre o ano de produção ou pode ser a data de publicação em novelas recém-cadastradas?
3. O MP4 é 480p como a proposta afirma? O trecho público não publica altura e não foi medido.
4. O gate `redirectnflix.com` continuará redirecionando para `esportesdavez.com` ou o host muda por campanha?
