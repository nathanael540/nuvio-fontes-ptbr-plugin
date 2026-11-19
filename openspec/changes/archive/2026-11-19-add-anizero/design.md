# Design

## Context

O AniZero (`https://anizero.org`) é um catálogo de animes em PT-BR em WordPress com tema próprio (`AniZero-main`). A investigação ao vivo de 2026-11-19 usou apenas o site público e o código deste repositório; nenhum scraper externo foi consultado. As amostras principais foram Toradora, Baki – O Campeão, One Piece, Attack on Titan S01/S02, Jujutsu Kaisen S02 e Kimetsu no Yaiba S01/S02.

Descobertas que sustentam o desenho:

1. **Busca.** A busca HTML canônica é `/search/<termo>/`; `?s=<termo>` redireciona para ela. O tema também expõe `POST /wp-admin/admin-ajax.php` com `action=buscar_anime_rt&termo=<termo>`, que devolve uma lista JSON de `{ title, url, tipo, count, status, img }` ou `{"error":"Nenhum anime encontrado"}`. A busca é textual e não publica ano.
2. **Ficha.** `/anime/<slug>/` publica `h1[itemprop=name]`, `div[itemprop=copyrightYear]`, `const anime_id = <n>`, os links `a.tempAnterior`/`a.tempProxima` e o contêiner vazio `#episodes_container`.
3. **Episódios.** `POST /api/` com `action=show_videos&anime_id=<id>` devolve `{ episodios, ovas, filmes }`; cada episódio traz `epi_num`, `epi_title`, `epi_id` e `epi_url` (`https://anizero.org/video/<id>/`). As chaves de `episodios` não estão em ordem.
4. **Página do vídeo.** `/video/<id>/` publica um iframe `https://anizero.org/player?id=<id>&season=<s>&num=<e>`; o `season` é o da página sazonal da fonte e o `num` é o número local (ou global, em páginas de numeração única).
5. **Página do player.** `/player/?id=<id>&season=<s>&num=<e>` publica botões `data-index`/`data-label` (`Dublado`, `Legendado`) e o array `playerScripts`, com um script empacotado por opção.
6. **Script por opção.** O script é um packer `eval(function(p,a,c,k,e,d){...}('...',a,c,'...'.split('|'),0,{}))` cujo resultado chama um decodificador próprio; o texto final é `document.getElementById('player-frame').src="https://<host>/player/index.php?data=<hash>"`. O decode é local e determinístico; `eval` não é necessário.
7. **Embed.** O host decodificado (observado `00000221.xyz`) publica outro script empacotado com `FirePlayer(vhash,{...})`; a configuração traz `videoData.videoSources[]` com `file` relativo (`/hls/<hash>/master.txt`), `type: "hls"` e `label: "HD"`; `tracks` contém apenas miniaturas nos exemplos.
8. **Mídia.** O caminho relativo resolve contra a URL do embed e responde `#EXTM3U` com uma variante; o master e os segmentos exigem `Referer` do embed (o segmento responde 403 sem ele e 206 com ele). As variantes de mídia observadas foram 480p e 720p; a fonte só declara o rótulo `HD`.
9. **Temporadas.** As páginas sazonais usam sufixos explícitos (`S2`, `S3`) e se encadeiam por `tempProxima`/`tempAnterior`; o ano repetido é o da série, não o da temporada. Exemplos: Attack on Titan base/S2, Jujutsu Kaisen base/S2, Kimetsu no Yaiba S1..S5, Baki base/S2.
10. **Numeração global.** One Piece publica uma única página com 1175 episódios e o player recebe `season=1&num=1175`; o TMDB tem 23 temporadas e 1180 episódios. Nesse formato, a temporada do TMDB é um arco e o episódio precisa ser convertido para o número absoluto.
11. **Filmes.** O filtro `formato=Filme` de `/lista-de-animes` responde `402` (nenhum post); buscas por “Mugen Train”, “Your Name”, “Akira”, “Chihiro” e “Mononoke” não devolveram ficha de filme, e os arrays `filmes` das fichas amostradas vieram vazios. O acervo observado é de séries.
12. **Ausência anunciada.** O S02 de Attack on Titan anuncia 12 episódios, mas os dois embeds respondem uma página de aviso “O vídeo não está pronto” e o master responde vazio. Isso é ausência reconhecida, não falha de estrutura.

## Goals / Non-Goals

**Goals:**

1. Adicionar o AniZero como provedor `tv` em HLS, com busca, identidade, temporada, episódio e resolução das opções de áudio.
2. Decodificar o player sem executar código remoto, preservando o contrato do app e as restrições do QuickJS.
3. Isolar falha por opção e reconhecer a ausência anunciada pela fonte.
4. Cobrir o fluxo com testes offline e registrar a evidência online do pacote final.

**Non-Goals:**

1. Suportar `movie`, downloads, MP4 ou hosts de player não observados.
2. Mapear temporadas do TMDB que a fonte agrupa em uma única página quando o número absoluto não é compatível com o total do TMDB.
3. Resolver legendas externas que a fonte não publica, sondar a mídia, impor timeout, usar cache ou settings.
4. Criar um bloco compartilhado; o decoder é específico desta fonte e não tem segundo consumidor real.

## Decisions

### D1. Somente `tv`

O filtro de formato `Filme` da própria fonte não tem posts (`402`), as buscas por filmes conhecidos não devolveram ficha e os arrays `filmes` observados vieram vazios. Anunciar `movie` sem um caminho de identidade e mídia comprovado ampliaria o contrato sem cobertura. O manifest declara `supportedTypes: ["tv"]` e o `getStreams` devolve lista vazia para `movie` antes de qualquer rede.

Alternativas:

1. **Suportar `movie` pelo array `filmes` da ficha.** Descartada: não há ficha de filme nem entrada `filmes` nas amostras; a identidade do filme do TMDB não é publicada.
2. **Suportar `movie` por busca textual.** Descartada: as buscas por filmes conhecidos não encontraram página, e o cartão não publica ano para confirmar.
3. **Somente `tv`.** Escolhida.

### D2. Busca JSON e confirmação na ficha

A busca em tempo real é JSON, menor que a página HTML e sem `nonce` obrigatório; devolve título, URL e tipo. O ano não é publicado no cartão, então a confirmação acontece na ficha, que traz `h1`, `copyrightYear` e `anime_id`. A busca usa o título PT-BR, o original, as alternativas brasileiras e os romaji do TMDB; para temporada maior que 1, também tenta `<título> S<n>`. A similaridade usa `titleSimilarity` e o ano é aceito quando coincide com o ano da série ou com o ano da temporada pedida no TMDB (tolerância de um ano).

Alternativas:

1. **Busca HTML `/search/<termo>/`.** Funciona, mas devolve a página completa e também não traz ano; o JSON é mais direto.
2. **WordPress REST `/wp-json/wp/v2/posts`.** Descartada: o acervo é de post types próprios; a busca do tema é a interface pública observada.
3. **Busca JSON + confirmação na ficha.** Escolhida.

### D3. Temporada pela cadeia explícita e numeração absoluta restrita

A fonte numera temporadas em páginas separadas, com marcador no título e links `tempProxima`/`tempAnterior`. O ano é o da série e não distingue temporadas. O provedor:

1. Confirma a ficha base (título, ano, `anime_id`).
2. Para temporada 1, usa a página sem marcador ou com marcador `S1`.
3. Para temporada maior que 1, procura um candidato com o marcador exato; se não houver, percorre a cadeia a partir da base, exigindo que o título sem o marcador continue compatível com a série e que o marcador da próxima página seja o esperado. Um salto para um título diferente (por exemplo, Naruto → Naruto Shippuden) não é tratado como temporada.
4. Se a cadeia não tiver a temporada e a fonte tiver uma única página com numeração global próxima do total do TMDB (razão entre 0,9 e 1,1), converte o par do TMDB para o número absoluto somando `episodeCount` das temporadas anteriores. One Piece é o caso observado (1175 na fonte e 1180 no TMDB).
5. Fora desses casos, devolve lista vazia; não escolhe episódio por posição nem inventa temporada.

Alternativas:

1. **Mapear por posição na lista de resultados.** Descartada: a busca devolve spin-offs e sequências; a posição não é temporada.
2. **Usar o ano da página.** Descartada: o ano é o da série e se repete em todas as temporadas.
3. **Sempre usar numeração absoluta.** Descartada: páginas sazonais reiniciam a numeração em 1.
4. **Marcador + cadeia + absoluta restrita.** Escolhida.

### D4. Episódio pelo `epi_num`

`show_videos` devolve `episodios` como objeto indexado por `epi_num`; a ordem não é confiável. O provedor valida o objeto e escolhe a entrada cujo `Number(epi_num)` é exatamente o episódio local (ou absoluto, no fallback). Episódio ausente é lista vazia. `ovas` e `filmes` não são usados em pedido de série. A URL `epi_url` é obrigatória; sua ausência é erro de estrutura.

### D5. Decode local do player, sem `eval`

O script de cada opção tem duas camadas:

1. **Packer padrão.** O provedor lê os argumentos `p,a,c,k`, reconstrói o dicionário com a mesma função de base do packer e substitui os tokens de `p`. Nada é executado.
2. **Decodificador próprio.** O código desempacotado chama uma função que separa o payload pelo caractere `n[e]`, mapeia cada caractere para o índice no alfabeto `n`, converte da base `e` para decimal e subtrai `t`; o resultado é decodificado como UTF-8 e a URL `https://...` é extraída.

O decoder valida a forma do script e lança erro claro quando o template muda. Não há `eval`, `new Function`, `TextDecoder`, `escape` ou regex construída a partir de dados remotos. A URL final é validada como HTTP(S).

Alternativas:

1. **Executar o script em sandbox.** Descartada: `eval` é proibido no runtime e executaria código remoto.
2. **Usar o bloco `fireplayer`.** Descartada: o bloco cobre plenoflu/PlayerFlix/GStream/myembed/VaiQueCol, não o formato `FirePlayer(vhash, config)` deste site; o embed é um segundo nível, não a cadeia do bloco.
3. **Procurar um endpoint que devolva a URL.** Descartada: a página só publica o array de scripts; não há rota pública observada que devolva o embed.
4. **Decode local em duas camadas.** Escolhida. O código fica em `src/anizero/player.js`, específico da fonte, sem bloco novo.

### D6. Embed FirePlayer e HLS relativo

O embed é aberto com `fetchPage` para preservar a URL final. O HTML pode trazer o script empacotado; o mesmo unpacker é aplicado e a configuração `FirePlayer(vhash,{...})` é extraída por leitura balanceada de chaves e `JSON.parse`, sem executar o script. O provedor lê `videoData.videoSources[]` (ou `videoUrl` como reserva), aceita `type: "hls"`/`.m3u8`/`.txt` e resolve cada `file` contra a URL final do embed. O caminho relativo observado (`/hls/<hash>/master.txt`) responde 200 no host do embed; o host `luffy.00000410.xyz` responde 404 no mesmo caminho e 403 na variante sem `Referer`, então não é usado diretamente.

O stream sai com `headers: playbackHeaders(embedPage.url)`: o master responde sem cabeçalho, mas os segmentos exigem `Referer`; o mesmo `Referer` funciona nos dois. Não há sonda de mídia.

Alternativas:

1. **Devolver a URL no CDN `luffy`.** Descartada: 404 no caminho relativo e 403 na variante sem `Referer`; o caminho do player é o que a fonte entrega ao browser.
2. **Montar a URL a partir de `hostList`/`videoServer`.** Descartada: o player usa o caminho relativo; `hostList` não é aplicado pelo próprio player e não há evidência de que o CDN aceite o caminho.
3. **URL relativa contra o embed + `Referer`.** Escolhida.

### D7. Streams, áudio e qualidade

Cada `videoSources[]` aceito vira um stream com `type: "hls"`, `provider` do host do embed, `languageHints` com o rótulo do player e com o título da página, `qualityHints` com o rótulo da fonte (`HD`) e `format` com `FORMATTER.AUTO`, `addon` `AniZero`, título/ano e temporada/episódio do pedido. `name` e `title` não são informados; o formatador os gera. O bloco `quality-discovery` reconhece `HD` como `720p`; a playlist master pode declarar 480p, mas a fonte só publica o rótulo, então a qualidade da lista é uma dica da fonte, não uma sonda. Fontes repetidas são deduplicadas pela URL resolvida.

`tracks` com `kind: "captions"` são convertidos em `subtitles` com `language` do rótulo; miniaturas (`kind: "thumbnails"`) são ignoradas. Nenhuma legenda de caption foi observada nas amostras; o caminho fica coberto por teste controlado.

### D8. Fronteira de erro e ausência

1. **Ausência.** Título não encontrado, temporada/episódio não publicado, página sazonal ausente, `show_videos` sem o episódio, `playerScripts` vazio ou embed “O vídeo não está pronto” devolvem lista vazia sem `console.error`. A página de aviso é reconhecida pelo texto publicado.
2. **Opção.** Cada script/embed é uma opção independente. A falha de decode, HTTP ou estrutura gera `console.warn('[AniZero] Opção <rótulo> descartada: <causa>')` e preserva as demais. Se nenhuma produzir stream e alguma falhou, sobe um erro agregado com as causas; se todas forem ausência/triagem, a lista é vazia.
3. **Fatal.** Busca, ficha, `show_videos`, página do vídeo e página do player são etapas anteriores às opções e sobem como erro. `getStreams` registra `[AniZero] Falha em tv <id>: <mensagem saneada>` e devolve `[]`.
4. **Logs.** Nenhuma mensagem contém URL de mídia, hash de 32+ caracteres, token ou cookie; o `index.js` saneia URLs e hashes, e os avisos das opções usam o mesmo saneador.

### D9. Sem bloco novo

O decoder é específico do AniZero e tem um único consumidor. Os blocos `tmdb-info`, `title-match`, `slugify`, `http`, `stream-build`, `custom-formatter` e `language-discovery`/`quality-discovery` cobrem o que é comum. `src/_blocks/index.md` e `docs/arch.md` não mudam.

### D10. Testes e evidência

1. **Fixtures.** `test/fixtures/anizero/` com busca, busca vazia, ficha base, ficha S2, `show_videos` de S1/S2, página de vídeo, página do player com uma e duas opções, embed com HLS, página “não pronto”, embed sem configuração e estrutura inválida. As respostas são recortes reais sanitizados; nenhum cookie, token ou URL assinada é mantido.
2. **Offline.** Pacote gerado com `fetch` simulado: S1E1, S2E1, episódio ausente, título ausente, duas opções de áudio, opção não pronta, uma opção falhando, todas falhando, estrutura inválida, decode e contrato dos streams.
3. **Online.** `npm run test:online -- --provider anizero --record` com a chave só no ambiente, perfil `anime`, catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`. A evidência só vale para o pacote e o perfil rodados.
4. **Documentação.** `providers.md` registra a linha/seção; `docs/provider-investigation.md` ganha a seção do player empacotado por opção com referências de código e teste e os limites observados.

## Risks / Trade-offs

1. **O template do player muda.** → O decoder valida a forma e falha de forma explícita; a opção é descartada e a rodada online mede a cobertura. Um novo template exige mudança própria com fixture.
2. **O host do embed muda ou expira o caminho.** → A URL é resolvida a cada pedido, sem cache, e o host vem do script; não há host fixo no código. Um embed sem configuração é falha isolada.
3. **A fonte anuncia episódio sem mídia.** → “O vídeo não está pronto” é ausência reconhecida; o provedor não inventa stream.
4. **Temporadas agrupadas.** → A numeração absoluta só é usada quando a página única tem contagem próxima do total do TMDB e o número existe; temporada 1 do TMDB que abrange várias páginas da fonte (Jujutsu Kaisen) fica sem resolução além da primeira página. O limite fica registrado em `providers.md` e no guia.
5. **Qualidade da lista.** → A fonte só publica `HD`; a lista mostra `720p` pela regra do bloco e pode divergir de uma variante 480p. Não há sonda para corrigir.
6. **Filmes.** → O acervo observado é de séries; `movie` fica fora do manifest e devolve lista vazia.

## Validation

1. **Lint.** `npm run lint` passou sem avisos.
2. **Testes offline.** `npm test` passou com 1737 testes e 0 falhas, incluindo os 18 casos novos de `test/anizero.test.js`: S01E01 com duas opções de áudio, S02E01 não pronto, episódio ausente, título ausente, uma opção falhando, todas falhando, embed sem configuração, `show_videos` inválido, ficha sem `anime_id`, player sem `playerScripts`, numeração absoluta de One Piece, legendas de `tracks`, filme sem rede, entrada inválida, busca fora do esquema, manifest e fixtures sanitizadas.
3. **Build.** `node build.js anizero` gerou `providers/anizero.js`, `gdrive/providers/anizero.js`, `prism/providers/anizero.js` e os dois `<formato>/manifest.json`, sem erro.
4. **Verificação online.** `npm run test:online -- --provider anizero --record`, com `TMDB_API_KEY` apenas no ambiente, perfil `anime`, catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`, semente `b06f27a2cfd5bab579ea77f2d488c1fb`, ID `2026-11-19T18-49-38-344Z-anizero-b06f27a2-1d7f`: **Estável**, `tv 5/5`, 5 resolvidos, 0 sem resultado, 0 falhas e 0 inconclusivos. Títulos: One Piece S01E01 (1/1), Attack on Titan S01E01 (2/2), Demon Slayer S01E01 (2/2), My Hero Academia S01E01 (2/2) e Jujutsu Kaisen S01E01 (2/2).
5. **Fora da evidência.** `movie` fica fora do manifest porque o filtro de formato `Filme` da fonte não tem posts; Attack on Titan S02E01 é anunciado, mas o embed responde “O vídeo não está pronto” e a saída é vazia; a temporada 1 do TMDB que abrange várias páginas sazonais (Jujutsu Kaisen) fica sem resolução além da primeira página; a qualidade é o rótulo `HD` da fonte, sem sonda; a rodada online comprova a resolução e o contrato, não a reprodução no aparelho. Nenhuma URL de mídia, hash completo, token ou cookie aparece em `providers.md` ou em log de teste.
