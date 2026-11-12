# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://www.anitube.zip/` e orientam as decisões; valores efêmeros de token, URLs assinadas e cookies não são registrados aqui.

1. O site roda WordPress com o tema `newanitubevelho`. A busca é `/?s=<consulta>` e devolve cartões `.aniItem` com link `/video/<id>/`, título decorado (`– Todos os Episódios`, `- Todos Episódios`, `(Dublado)`, `- Filme`) e um rótulo `.aniCC` (`Dublado`, `Legendado` ou `Filme`). Nos exemplos, a busca devolveu de 0 a 18 cartões em uma única página; o bloco `.centerPagination` veio vazio.
2. A página de série (`/video/<id>/`) traz `h1`, `Tipo de Episódio`, `Ano` e a lista `div.pagAniListaContainer` com links cujo título declara `Episódio NN`. A lista de Naruto Shippuden Dublado tinha 500 links na mesma página.
3. Alguns filmes têm uma página agregadora com duas entradas (`– Filme` e `Dublado - Filme`), como `Kimi no Na wa (Your Name)`. Outros têm uma ficha direta de filme, como `A Viagem de Chihiro (Dublado) Filme`. A página agregadora não tem players; a ficha de filme tem.
4. A ficha de episódio ou filme publica os players em iframes. O player FHD aponta para `https://api.anivideo.net/videohls.php?d=<m3u8>`; o Player 1 aponta para um caminho de token no próprio AniTube, que redireciona para `https://api.anivideo.net/file/...`, cuja página contém um iframe do `https://www.blogger.com/video.g?token=...`.
5. O player FHD devolve uma playlist HLS de mídia, com segmentos MPEG-TS servidos como `.webp` (`Content-Type: video/MP2T`) e sem exigir `Referer` ou `Origin` nos testes. O rótulo do player era `720p HD`.
6. O player do Blogger publica `streamingData.formats` com MP4 progressivos `360p` e `720p`, com URLs `googlevideo.com` assinadas, ligadas ao IP de quem requisitou e com validade curta. Não foi necessário cabeçalho especial para baixar um trecho.
7. Episódios antigos, como `Naruto Shippuden (Dublado) – Episódio 001`, publicaram somente o Player 1. Por isso o player do Blogger não pode ser descartado.
8. O `tmdb-info` atual devolve título PT-BR, título original, alternativos do Brasil e ano. Para animes, o título do site costuma ser o romaji (`Shingeki no Kyojin`, `Boku no Hero Academia`, `Kimetsu no Yaiba`), que não está nos alternativos brasileiros. O TMDB registra esses romaji em `alternative_titles` com `type` `Romaji`/`Romanized` e, em alguns casos, com a temporada no próprio tipo (`Season 2 Romaji`). A resposta de detalhes de TV também traz `seasons` com `air_date` e `episode_count`.
9. Restrições do runtime: apenas a API básica do cheerio, sem APIs do Node e sem timeout próprio; cada opção de mídia falha isoladamente; o build transpila para `es2016`.

## Goals / Non-Goals

**Goals:**

1. Confirmar título, temporada, episódio ou filme antes de resolver players, sem aceitar o primeiro resultado parecido.
2. Aproveitar o romaji e os metadados de temporada que o TMDB já entrega na mesma resposta.
3. Tratar os dois players como opções independentes e preservar a cobertura de episódios antigos.
4. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online no perfil `anime`.

**Non-Goals:**

1. Cobrir conteúdo que não seja anime; o site não é um catálogo generalista.
2. Baixar mídia, validar reprodução no aparelho, medir peers ou garantir disponibilidade futura dos players.
3. Resolver temporadas de séries longas que o site publica em uma única página sem separação por temporada; nesses casos, só a temporada cujo ano coincide com a ficha é aceita.
4. Desambiguar “Part 2”/“Parte 2” quando o site e o TMDB discordam da divisão de temporadas; o título específico do TMDB, quando existir, continua sendo a fonte de verdade.
5. Oferecer legendas externas ou tamanho; a fonte não os publica.

## Decisions

### D1. Expor romaji e temporadas no bloco `tmdb-info`

1. Acrescentar ao `MediaInfo`:
   1. `romajiTitles`: lista de `{ title, season }`, extraída de `alternative_titles` cujo `type` contenha `romaji` ou `romanized` (sem diferenciar maiúsculas), com `season` lida de `Season <n>` no tipo; `null` quando o tipo não nomeia temporada. Deduplicar por título e temporada.
   2. `seasons`: lista de `{ number, name, year, episodeCount }` para TV, a partir de `data.seasons`; `[]` em filme ou quando a resposta não trouxer a lista.
2. Aproveitar a mesma requisição de detalhes já feita por `getMediaInfo`, sem `append_to_response` adicional e sem segunda chamada ao TMDB.
3. Alternativas descartadas:
   1. Fazer uma chamada própria ao TMDB em `src/anitube/`: duplicaria leitura de chave, tratamento de erro e formato de `MediaInfo`.
   2. Manter uma tabela local de romaji: envelhece, cresce sem limite e não cobre títulos novos.
   3. Usar apenas os títulos PT-BR/original/BR: falha comprovadamente para `Attack on Titan`, `My Hero Academia` e `Demon Slayer`, cujas páginas no site usam romaji.
4. O campo é aditivo; consumidores atuais continuam lendo só os campos que conhecem. `title-match` não muda: o provedor monta a lista de títulos de busca e usa `titleSimilarity`/aliases localmente.

### D2. Busca, limpeza do título e confirmação

1. Montar uma lista ordenada de variantes de consulta com procedência `{ query, season }`:
   1. Para TV com temporada maior que 1, primeiro o `romajiTitles` cuja `season` é a pedida.
   2. Título PT-BR, título original, alternativos BR e romaji sem temporada (ou temporada 1).
   3. Para temporada maior que 1, variantes geradas a partir de cada título-base: `<base> <n>`, `<base> <ordinal> Season`, `<base> Season <n>`, `<base> <n>ª Temporada`, `<base> Temporada <n>` e `<base> <romano>`.
   4. Deduplicar consultas sem diferenciar maiúsculas; gastar uma requisição de busca por variante.
2. Limpar o título do cartão antes de comparar: remover `– Todos os Episódios`, `- Todos Episódios`, `– Filme Dublado e Legendado`, `- Filme`, `– Filme`, `(Dublado)`, `Dublado`, `(Legendado)` e `Legendado`; normalizar espaços. Guardar o conteúdo dos parênteses como alias, porque o site usa `Kimi no Na wa (Your Name)` e o TMDB pode ter só um dos dois.
3. Ler a temporada do título limpo:
   1. Marcadores explícitos: `Nth Season`, `Season N`, `Nª Temporada`, `Temporada N`.
   2. Sufixo numérico no fim (`Jujutsu Kaisen 2`, `Boku no Hero Academia 7`), apenas quando o título sem o sufixo coincide com um título do TMDB e `N` está entre 2 e 30.
   3. Sufixo em número romano (`Sword Art Online II`, `Mushoku Tensei III`), com a mesma exigência de título-base e limite de 2 a 9.
   4. `Final Season` vira um marcador “final”, aceito somente quando a temporada pedida é a maior de `seasons`.
   5. Sem marcador, a temporada é 1. `Part N`/`Parte N` não é temporada; se o título completo coincidir com um romaji específico de temporada, a procedência da consulta resolve a temporada.
4. Identidade: comparar o título limpo e cada alias entre parênteses com os títulos do TMDB usando `titleSimilarity` (limiar 0,85) ou igualdade normalizada. Para uma consulta de romaji específico de temporada, aceitar a igualdade do título completo mesmo sem marcador. Descartar quando:
   1. O tipo do cartão for `Filme` e o pedido for série, ou o contrário.
   2. A temporada declarada conflitar com a pedida.
   3. O título completo for de outra obra (`One Piece: Heroines` não é `One Piece`) e não houver alias correspondente.
5. Confirmar na ficha: buscar a página do candidato, ler `h1`, `Ano` e `Tipo de Episódio`. Comparar o ano da ficha com o ano da temporada (TV) ou do filme, com tolerância de 1 ano. Ano ausente na ficha não reprova sozinho; título e temporada continuam obrigatórios.
6. Parada: para TV, parar quando houver uma ficha confirmada para cada rótulo de áudio presente nos candidatos; para filme, quando houver entrada de filme para cada rótulo de áudio. Se as variantes acabarem sem confirmação, devolver lista vazia. Isso limita o número de buscas e fichas sem transformar ausência em erro.
7. Alternativa descartada: usar `findBestMatch` diretamente. Ele não entende decorações, temporadas, aliases entre parênteses, `Final Season` nem o tipo filme/série da fonte; usá-lo exigiria pré-processar os mesmos dados e ainda perderia a confirmação por ano.

### D3. Seleção de episódio, filme e áudio

1. A ficha de série é reconhecida pela lista `div.pagAniListaContainer` e pelo `h1` de “Todos os Episódios”. Se a ficha foi confirmada como série e a estrutura da lista não existe, lançar erro de estrutura.
2. Episódio: percorrer os links da lista, ler `Episódio 0*(\d+)` do título e comparar o inteiro com o pedido. Ignorar OVA, especial e filme. Usar o primeiro link com o número exato; se não houver, lista vazia.
3. Filme:
   1. Ficha direta: `h1` contém “Filme” e a página tem players; usar a própria ficha.
   2. Página agregadora: `h1` contém “Filme” e a lista tem entradas com “Filme”; usar todas as entradas de filme.
   3. Página de série com entrada de filme (caso `Kimetsu no Yaiba: Mugen Ressha-hen (Dublado)`): usar as entradas que contêm “Filme”; se não houver, descartar para pedido de filme.
4. Áudio: usar o `Tipo de Episódio` da série/ficha ou o título da entrada (`Dublado`/`Legendado`). Mapear para `LANGUAGE.DUBLADO`/`LANGUAGE.LEGENDADO`. Sem rótulo confiável, omitir `language` e deixar a descoberta local do `buildStream`; não promover português sem evidência.
5. Para série, devolver os streams de todas as fichas de áudio confirmadas (dublada e legendada) quando existirem; para filme, as entradas de filme de cada página confirmada.

### D4. Adaptadores de player

1. Coletar os iframes da ficha na ordem em que aparecem. Classificar:
   1. Host `api.anivideo.net` e caminho `videohls.php` → opção HLS.
   2. Caminho de token no domínio do AniTube (o `src` do iframe) → opção Blogger.
   3. Outro host → opção não suportada, descartada com aviso.
2. Opção HLS:
   1. Ler o parâmetro `d` (URL do HLS) do iframe. Buscar a página `videohls.php` para obter o rótulo e o `file` de `sources`; se a página falhar, ainda usar o `d` com qualidade desconhecida, porque a mídia já está no iframe.
   2. O HLS é devolvido como URL direta, sem cabeçalhos de reprodução.
3. Opção Blogger:
   1. `fetchPage` no `src` do iframe com `Referer` da ficha, seguindo o redirecionamento até `api.anivideo.net/file/...`.
   2. Extrair o iframe `blogger.com/video.g` da página final; buscar com `Referer` da página final.
   3. Decodificar entidades HTML e escapes (`\"`, `\u003d`, `\u0026`, `\/`) e ler `streamingData.formats`: `itag`, `url` e `qualityLabel`. Usar somente os MP4 progressivos; ignorar `serverAbrStreamingUrl` e formatos adaptativos.
   4. Devolver um stream por formato, com a qualidade do `qualityLabel`. Não guardar token nem URL; resolver a cada pedido.
4. Execução: mapear cada opção para uma promessa que resolve `{ ok, stream }` ou `{ ok: false, erro }`, com `Promise.all` sobre essas promessas convertidas (o runtime não confirma `Promise.allSettled`). Aviso `[AniTube] Opção <rótulo> descartada: <causa>` para cada falha. Se nenhuma opção produzir stream e ao menos uma falhou, lançar erro com as causas; se não houver iframe, erro de estrutura.
5. Alternativas descartadas:
   1. Usar só o player FHD: perde episódios antigos que só têm Player 1, como Naruto Shippuden.
   2. Usar só o Player 1: perde o HLS de 720p e a cadeia mais curta.
   3. Reutilizar o bloco `fireplayer`: a cadeia e os hosts são outros; forçar o bloco misturaria contratos.
   4. Baixar o vídeo ou sondar o HLS para confirmar reprodução: proibido pelo contrato e desnecessário para montar o stream.

### D5. Streams, manifest e verificação

1. Cada stream é montado com `buildStream`:
   1. `url` do HLS ou do MP4.
   2. `quality` do rótulo do player/`qualityLabel`; ausente quando desconhecida, deixando o `buildStream` descobrir e preservar.
   3. `language` do rótulo da fonte.
   4. `provider` com o player (`Player FHD` ou `Player 1`), `type` `hls` ou `mp4`.
   5. `format` `{ template: FORMATTER.AUTO, addon: 'AniTube', title, year, season, episode }`.
   6. Sem `headers`, `subtitles`, `size`, `infoHash`, seeders ou peers enquanto a fonte não os fornecer.
2. Ordenar com `sortByQuality` no ponto de entrada, como no template.
3. Manifest: `id` `anitube`, nome `AniTube`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `pt` e o favicon HTTPS do site.
4. Verificação online: `test/online/profiles.json` ganha `anitube: { exclusiveTag: "anime" }`, com revisão e `curatedAt` atualizados; os catálogos já têm 5 filmes e 6 séries com a tag `anime`. A rodada usa o pacote gerado e registra a última rodada em `providers.md`; a tabela começa em `🟠 Não verificado` e só muda com a execução explícita.
5. `docs/provider-investigation.md` recebe os métodos reaproveitáveis: romaji/temporada do TMDB, confirmação por ano, os dois players e o limite dos segmentos `.webp`. O catálogo de blocos atualiza a linha do `tmdb-info`.

## Risks / Trade-offs

1. **Token e URL assinada efêmeros** → resolver sempre a partir da ficha atual; não cachear, não versionar e não registrar valores. Um link expirado falha só na opção; a próxima execução refaz a cadeia.
2. **MP4 do Blogger ligado ao IP** → o provedor e o player rodam no mesmo aparelho; se a rede mudar entre a resolução e a reprodução, a URL pode falhar. O HLS do player FHD continua como opção independente.
3. **HLS com segmentos `.webp`** → a extensão não identifica o conteúdo; o `Content-Type` e o trecho lido confirmaram MPEG-TS. A verificação online valida o contrato da URL, não a reprodução no app; a limitação fica registrada.
4. **Busca limitada a uma página** → nos exemplos não houve paginação; títulos fora do recorte não são encontrados. Se a fonte passar a paginar, será uma nova mudança, com limite explícito.
5. **Temporadas por arco/nome** → cobertas quando o TMDB tem romaji específico da temporada; quando só há uma página contínua, a confirmação por ano rejeita temporadas posteriores em vez de tocar o episódio errado. É uma ausência deliberada, não um falso positivo.
6. **`Part 2` e “Final Season”** → “Final Season” é aceito só para a última temporada conhecida; “Part 2” não é tratado como temporada. Títulos com essa divisão podem ficar ausentes, mas nunca são mapeados para a temporada errada.
7. **Ano divergente ou ausente na ficha** → a tolerância é de 1 ano; sem `Ano`, a confirmação fica só por título/temporada. Fixtures de anos conhecidos cobrem o caminho normal.
8. **Mudança de domínio ou layout** → seletores e host do player são verificados por testes de fixture; a falha de seletor sobe como erro de estrutura, não como ausência. O domínio único é `www.anitube.zip`; espelhos não são presumidos sem evidência.
9. **Mudança do contrato do `tmdb-info`** → os campos são aditivos e os testes dos consumidores atuais continuam rodando; o catálogo de blocos e o teste do bloco são atualizados na mesma mudança.

## Migration Plan

1. Implementar o `tmdb-info` aditivo e seus testes; rodar as suítes dos provedores que o consomem.
2. Criar `src/anitube/`, fixtures e testes; gerar os três formatos com `node build.js anitube`.
3. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil `anime`; rodar `npm run lint`, `npm test` e o build.
4. Executar `npm run test:online -- --provider anitube` com `TMDB_API_KEY` apenas no ambiente; registrar a rodada e ajustar o status conforme o resultado.
5. Atualizar `docs/provider-investigation.md` e `src/_blocks/index.md`; arquivar a mudança somente com os testes previstos passando ou com exclusões declaradas.
6. Rollback: remover a entrada do manifest, os arquivos gerados, o perfil e a seção de `providers.md`; o `tmdb-info` pode manter os campos aditivos sem afetar os demais provedores, ou revertê-los junto se a mudança for descartada por completo.

## Open Questions

1. Confirmar, na primeira rodada online, se a busca do site permanece em página única para consultas com muitos resultados. A resposta não muda o desenho atual; se houver paginação, vira uma mudança própria.
2. Confirmar se o rótulo `720p HD` do player FHD é estável em todo o acervo. Hoje a qualidade é lida do player; um rótulo diferente é normalizado ou vira `Desconhecida`, sem requisição extra.
3. Confirmar se algum episódio antigo publica somente o player FHD ou nenhum dos dois. Os testes cobrem a ausência de player como erro de estrutura; a rodada online mede a frequência real.
