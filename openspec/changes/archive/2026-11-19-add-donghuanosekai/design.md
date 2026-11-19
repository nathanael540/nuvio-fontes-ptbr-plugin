# Design: provedor Donghua No Sekai

## 1. Contexto e escopo

A investigação foi feita em 19/11/2026 somente com requisições HTTP às URLs públicas `https://donghuanosekai.com` e `https://donghuanosekai.com/donghuas`, leitura do HTML e dos scripts públicos do próprio site. Nenhum scraper, plugin ou repositório de terceiros foi consultado. A fonte é um WordPress com tema próprio `donghuanosekai`, servido por Cloudflare e com cache FastCGI/Redis; as respostas observadas foram HTML 200 sem desafio interativo.

O recorte do provedor é o catálogo público: busca, ficha, episódios, players e mídia. Conta, login, favoritos, histórico, comentários, downloads, anúncios, enquetes e o portal `Patreon` ficam fora.

## 2. Reconhecimento da fonte

1. A home publica o formulário `form#searchform` com `GET /?s=<termo>` e um script `livesearch.js` que consulta `GET /wp-json/site/search/?keyword=<termo>&type=&nonce=<nonce>`.
2. A busca JSON devolve um objeto por ID de post com `title`, `url`, `img` e `status`; o `nonce` muda por página e é publicado no HTML. A busca HTML `?s=` não exige nonce e devolve os mesmos títulos em cartões, por isso foi a escolha do provedor.
3. A listagem `/donghuas` é montada por JavaScript e não publica os cartões no HTML inicial; não foi usada.
4. O sitemap `anime-sitemap.xml` lista 323 fichas canônicas e foi usado apenas para reconhecimento e para localizar os padrões de temporada (`-1a-temporada`, `-2a-temporada`, `-4a-temporada-final`), não como contrato do provedor.

## 3. Catálogo, busca e identidade

1. A busca HTML devolve até cerca de 10 a 20 cartões `div.itemE.capa`; cada cartão traz `div.selos[data-ona]` (`Movie`, `ONA`, `TV` ou `Special`), o título em `h3 span.sxcd` e o link absoluto da ficha.
2. A busca é textual e não tolera título composto com pontuação: `Douluo Dalu (Soul Land)` e `Swallowed Star [Tun Shi Xing Kong]` devolveram 0 cartões, enquanto as formas sem parênteses/colchetes devolveram os cartões certos. Por isso o provedor limpa o título do TMDB e pesquisa primeiro a forma limpa.
3. Títulos chineses longos devolvem resultados irrelevantes: `白蛇：缘起` devolveu 44 cartões e não trouxe a ficha correta na primeira janela; `白蛇` devolveu 1 cartão, a ficha certa. O mesmo ocorreu com `枕刀歌之尘世行` (44) contra `枕刀歌` (4, com o filme). O provedor monta a forma curta cortando a pontuação (`：`, `:`, `，`, `,`, `（`, `(`) e o separador `之`, além do original completo.
4. A ficha publica `<h1>`, uma lista `li` com `Titulo Alternativo`, `Status`, `Ano`, `Duração`, `Estúdio`, `Tipo`, `Episódios` e os gêneros. A confirmação usa `h1`, `Titulo Alternativo`, `Ano` e `Tipo`.
5. Títulos não latinos não são comparáveis pelo `normalizeText` do repositório, que remove caracteres chineses. O provedor faz igualdade bruta dos títulos chineses (após remover pontuação e espaços) e usa a similaridade latina nos demais.
6. O ano da ficha é o da obra ou da temporada; em filme de coleção (`White Snake (Filme)`, `The King's Avatar Movie`) ele está na ficha da coleção. Em páginas de filme direto (`Swallowed Star: Xueluo Continent – O Filme`) não há lista de informação e o ano não é publicado; nesse caso a identidade fica só pelo título, e o ano do TMDB não é usado como rejeição.
7. O tipo da ficha (`Movie`, `ONA`, `TV`) separa filme de série. `Special` é descartado: especiais e OVAs não correspondem à temporada regular pedida pelo app.

## 4. Temporada e episódio

1. A fonte organiza a maioria das séries longas em uma ficha por temporada, com sufixo no título (`Doupo Cangqiong – 2ª Temporada`, `Quanzhi Fashi – 1ª Temporada`, `A Will Eternal – 4ª Temporada Final`) e episódios locais começando em 1 (`doupo-cangqiong-2-episodio-01`).
2. Outras séries usam uma ficha única com numeração contínua (`Swallowed Star` 1..248, `Douluo Dalu` 1..263, `Perfect World` 1..30, `Renegade Immortal` 1..20, `A Will Eternal` 1..52). O TMDB dessas obras tem uma única temporada regular com muitos episódios (Swallowed Star 260, Douluo Dalu 264, Perfect World 338, Renegade Immortal 200, A Will Eternal 200), então o episódio local do site é o mesmo número da temporada 1.
3. A ficha de série lista os episódios em `div.episode_list div.item`, com o número em `span.episode` no formato `Episódio N`, `Episódio N (global)` ou `Episódio N Final`. O número local é o primeiro inteiro após `Episódio`; o parêntese é a numeração global e não entra na seleção. Faixas `Episódios 34-35` são descartadas para não entregar dois episódios como se fossem um.
4. O site publica links `__trashed-*` para posts removidos; o provedor ignora esses links para não transformar uma remoção em falha.
5. A temporada pedida é comparada ao marcador do `h1` (`2ª Temporada`, `Temporada 2`, `Season 2`, `2nd Season`, `第2季`). Sem marcador, só a temporada 1 é aceita quando o TMDB tem uma única temporada regular ou quando o episódio pedido cabe na contagem da temporada 1; temporada maior sem marcador é ausência, sem mapeamento por posição.

## 5. Players e mídia

1. Cada ficha de episódio ou filme publica `div.slideItem[data-video-url]` com o rótulo `Player N` e uma URL `https://donghuanosekai.com/player?file=<base64>&type=N`. Não há AJAX: a lista inteira está no HTML.
2. O parâmetro `file` é Base64 do ID do post, mas o provedor não precisa decodificá-lo: usa a URL publicada.
3. A página `/player` responde HTML e escolhe o player pelo `type`. O índice do tipo não tem host fixo: no mesmo filme, `type=2` foi nativo em `White Snake` e Dailymotion em `Swallowed Star: Showdown`. Por isso o provedor classifica pelo conteúdo da página, não pelo número.
4. Famílias observadas:
   1. Nativo DNSK: `<iframe src="https://player.donghuanosekai.com/player-nativov2.php?v=<HLS>&720=<HLS>">`. O parâmetro `v` é o HLS principal e `720` o alternativo. Em `Swallowed Star` E01 aparece `&I=0:01&F=0:29`; o leitor usa `URLSearchParams` e pega só `v`/`720`.
   2. Player novo: `<iframe src="https://donghuanosekai.com/player-new/?url=<HLS>&pic=...">`. Em alguns títulos o valor termina com `+` ou espaço; o leitor apara o valor depois de decodificar.
   3. `<video><source src="<HLS>" size="720" type="video/mp4">`. O `type` não é confiável: o `src` era `.m3u8`. O `size` informa a altura.
   4. Blogger: `<iframe src="https://www.blogger.com/video.g?token=...">`. O HTML do Blogger traz `streamingData.formats` com MP4 progressivos; o bloco `blogger-video` já lê e decodifica.
   5. Triagem: Dailymotion (`dailymotion.com/embed/video/<id>`), wrapper `player.donghuanosekai.com/dly.php?key=<id>` (Dailymotion), StreamSB (`dnsk.streamsb.to`), Fembed, Wolfstream e Short.ink.
5. Todas as mídias nativas são HLS servidas por `cdn-s02.star-wallpaper-4k.pictures`, com caminho `.../<slug>/seasonN/<arquivo>.mp4/index.m3u8`. A playlist é VOD, sem `RESOLUTION`, com segmentos `.webp`; o HLS respondeu 200 com e sem `Referer`/`User-Agent` na observação, então o stream sai sem cabeçalhos. A qualidade vem do nome do arquivo (`1080p`, `816p`, `800p`, `720p`) e o `buildStream` a descobre localmente.
6. O player nativo pode publicar duas qualidades no mesmo iframe (`v` e `720`); o player `<source>` publica uma; o Blogger publica 360p/720p. O provedor deduplica por URL e ordena com `sortByQuality`.
7. O Blogger devolve MP4 `googlevideo.com` assinados e ligados ao IP; na rede da investigação responderam HTTP 403 mesmo com `User-Agent`, como já registrado em outros provedores. A URL publicada é devolvida sem sonda, e a reprodução no aparelho continua sendo hipótese.

## 6. Hipóteses testadas e descartadas

1. **Busca JSON `wp-json/site/search/` como transporte principal.** Funciona, mas exige o `nonce` publicado no HTML e muda por página; a busca HTML `?s=` entrega os mesmos cartões sem nonce e foi preferida.
2. **Listagem `/donghuas` como catálogo.** O HTML inicial não traz os cartões; a grade é montada por JavaScript. Descartada.
3. **Player pelo índice `type`.** O mesmo `type` aponta para hosts diferentes em títulos diferentes; a classificação por conteúdo foi adotada.
4. **Download `download.donghuanosekai.com`.** A página exige um contador JavaScript e devolve um link com token de curta duração; não é necessária porque os players já entregam HLS/MP4. Descartada.
5. **Mapear temporada por posição na lista de temporadas.** A fonte publica fichas separadas e títulos com marcador; posição não é identidade. Descartada.
6. **Mapear episódio pelo número global do parêntese.** `A Will Eternal 4 – Episódio 19 (184)` mostra que o número local é o 19; o global é só apresentação. Descartada a numeração absoluta.
7. **Usar `jina-reader`.** O `fetch` direto respondeu 200 com o HTML completo em todas as etapas; não há bloqueio observado. Descartado.
8. **Sondar a mídia para descobrir qualidade.** A qualidade está no nome do arquivo e no `size`/`qualityLabel`; sondagem seria requisição extra. Descartada.

## 7. Decisões de implementação

1. **Sem bloco novo.** O fluxo reutiliza `http`, `tmdb-info`, `title-match` (`titleSimilarity`), `slugify` (`normalizeText`), `blogger-video`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`. A leitura de `div.slideItem` e dos players é local ao provedor e não representa um padrão observado em outra fonte.
2. **Idioma `Legendado`.** O site se declara "legendados em português" na home, no título e na descrição de cada ficha; não há seletor de áudio. O valor `Legendado` é a classificação confiável do catálogo, sem promover `Dublado`.
3. **Sem `headers` na reprodução.** O HLS e o MP4 do Blogger responderam sem `Referer` (o Blogger com 403 por assinatura de IP, não por cabeçalho). Não se transporta `Referer` de descoberta para a mídia sem evidência.
4. **Qualidade.** Para `<source size>` e `qualityLabel`, o valor é passado como dica; para HLS nativo, o `buildStream` descobre no caminho. Não há requisição extra.
5. **Filme em coleção.** A ficha `Movie` com um único episódio e nenhum player é um índice; o provedor segue o único link. A ficha direta com players é usada como está. Coleção com mais de um item é ausência, porque não há como escolher o filme do TMDB sem um identificador.
6. **Erros.** Busca, TMDB, ficha e episódio são fatais; cada player é uma opção independente. Um player que falha gera `console.warn` e não derruba os demais; se todos falharem, sobe o erro agregado. Um candidato 404 é descartado; 403/5xx conta como falha.
7. **Sem timeout, retentativa, cache ou settings.** O app gerencia a espera; as URLs de mídia são resolvidas a cada pedido.

## 8. Catálogo online e perfil

1. O catálogo de referência não tinha títulos de donghua; um perfil generalista mediria 48 filmes e 43 séries, quase todos fora do acervo.
2. Foi criada a tag `donghua` e o perfil `donghuanosekai: { exclusiveTag: "donghua" }`, com cinco títulos verificados por tipo em 19/11/2026:
   1. Filmes: `573699` (A Lenda da Serpente), `613200` (The King's Avatar: Pela Glória), `933379` (A Song of Sword as Pillow: Practice Travel), `635389` (Jiang Ziya) e `1398725` (Swallowed Star The Movie: Xueluo Continent).
   2. Séries: `101172` (Swallowed Star, S1E1), `76572` (Douluo Dalu, S1E1), `124003` (Perfect World, S1E1), `223911` (Renegade Immortal, S1E1) e `79481` (Doupo Cangqiong, S2E1).
3. Cada coordenada foi conferida na ficha e no player: filmes e séries entregaram HLS nativo; nenhum depende de Blogger ou de host de triagem. A escolha de S2E1 em Doupo Cangqiong exercita a ficha de temporada separada; as demais exercitam a ficha única.
4. A tag `donghua` não foi aplicada a títulos `anime` para não alterar a amostra dos provedores de anime.

## 9. Validação

1. `npm run lint`, `npm test` e `node build.js donghuanosekai` devem passar antes da rodada online.
2. `npm run test:online -- --provider donghuanosekai` usa a chave TMDB do ambiente e os cinco títulos por tipo do perfil `donghua`.
3. A aprovação offline não comprova funcionamento; a evidência online fica em `providers.md` e só vale para o pacote e o perfil avaliados.
4. A reprodução no QuickJS, o download e a disponibilidade futura das URLs assinadas não são medidos pelo harness.
