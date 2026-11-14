# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 02:50) contra `https://animesonline.blue`. Tokens de player, URLs assinadas e cookies não são registrados aqui.

1. A home respondeu HTTP 200 `text/html` e a busca interna é `GET /api/search?q=<termo>`, com HTTP 200 `application/json` e corpo `{ results: [...] }`. Cada item traz `slug`, `title`, `cover`, `tipo`, `audios[]`, `year` e `episodeCount`.
2. A busca é textual e não é tolerante a título PT-BR composto: `q=Demon Slayer` devolveu a página `kimetsu-no-yaiba-movie-1-mugenjou-hen-akaza-sairai` (2025) e `berserk-2016`, sem a série de 2019. `q=kimetsu` devolveu `kimetsu-no-yaiba` (2019, 26 episódios) e o filme de 2025. O título romaji do TMDB (`Kimetsu no Yaiba`, tipo `Romaji`) é o termo que encontra a série.
3. A página do anime responde HTML 200 e a mesma URL com `?_rsc=1` responde HTTP 200 `text/x-component` com o bloco `"temporadas":[{"numero":1,"nome":"...","eps":[{"num":1,"leg":{"id":...},"dub":null}, ...]}]`. O HTML normal também contém o mesmo JSON escapado, mas o RSC entrega o bloco íntegro e menor.
4. O episódio é `GET /api/episodio/<id>` com `Referer` da página do anime; respondeu HTTP 200 `application/json` com `id`, `num`, `tipo`, `tempo`, `capa`, `title`, `playerUrl` e `embed`. Em `kimetsu-no-yaiba` S01E01 o `playerUrl` era `https://www.blogger.com/video.g?token=...`; `embed` estava vazio.
5. `jujutsu-kaisen` S01E01 publicou `leg.id` e `dub.id`; as duas consultas responderam 200 com `tipo` "Legendado" e "Dublado" e `playerUrl` do Blogger. O par de áudios é mutuamente exclusivo por identificador e confirma o idioma.
6. O HTML do Blogger respondeu HTTP 200 `text/html` com `streamingData.formats` em uma string JavaScript escapada. O formato observado foi `itag: 18`, `mimeType: video/mp4; codecs="avc1.42001E, mp4a.40.2"`, `qualityLabel: "360p"` e URL em `rr1---sn-....googlevideo.com/videoplayback`. Não foi necessário `batchexecute`; o `play_url` não existia no HTML.
7. A URL de `googlevideo.com` respondeu HTTP 403 `text/plain` com corpo vazio na rede da triagem, com e sem `Range`, `Referer` e `User-Agent`. O HTML publica o formato, mas a reprodução não foi confirmada. O mesmo caminho é usado pelo AniTube publicado, que devolve MP4 do Blogger; a limitação fica registrada e não vira sonda.
8. O site não publica filmes como tipo próprio: há páginas de "Movie" com vários episódios. O provedor atende só `tv` e recusa `movie` antes de qualquer requisição.
9. Não há cota, chave, cookie ou desafio observado; a resposta veio de Cloudflare sem interstício.

## Goals / Non-Goals

**Goals:**

1. Confirmar título e ano antes de abrir a grade, usando romaji quando o título PT-BR não encontra a série.
2. Selecionar temporada e episódio pelo par declarado no RSC, sem posição visual.
3. Resolver dublado e legendado como opções independentes até os MP4 do Blogger.
4. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online no perfil `anime`.
5. Reutilizar a extração do Blogger em um bloco, em vez de duplicar o código do AniTube.

**Non-Goals:**

1. Cobrir filmes ou páginas de "Movie" da fonte; outros provedores já cobrem filmes de anime.
2. Sondar `googlevideo.com`, baixar MP4 ou medir reprodução; a URL publicada é o contrato.
3. Mapear temporadas que o TMDB agrupa em uma só; o RSC publica a temporada com o número da fonte.
4. Adicionar settings de áudio/qualidade, timeout, cache ou proxy.
5. Resolver `embed` de hosts que não sejam Blogger ou mídia direta.

## Decisions

### D1. Identidade por TMDB, com romaji e ano

1. Chamar `getMediaInfo` uma vez e montar os termos: `title`, `originalTitle`, `alternativeTitles` e `romajiTitles[].title`, deduplicados por `normalizeText`.
2. Consultar `/api/search` para cada termo, acumulando candidatos por `slug`. Não parar no primeiro termo: a busca por título PT-BR pode devolver um arco de ano diferente.
3. Passar a `findBestMatch` um objeto sintético com `title`, `originalTitle`, `alternativeTitles` acrescido dos romaji e `year`; o candidato leva `title` e `year` da fonte. `minScore` 0,85 e `yearTolerance` 1.
4. Alternativas descartadas:
   1. Parar na primeira consulta: escolheria o filme de 2025 para Demon Slayer S01.
   2. Usar só o título original japonês: a busca não encontrou `鬼滅の刃`.
   3. Confiar no `tipo` do resultado: ele descreve o áudio da ficha, não o tipo de mídia do pedido.

### D2. Grade por RSC e seleção do episódio

1. Buscar `GET /anime/<slug>?_rsc=1` com `RSC: 1`, `Accept: text/x-component` e `Referer` da página do anime.
2. Localizar `"temporadas":`, balancear colchetes a partir do primeiro `[` e fazer `JSON.parse` do bloco. Validar que é lista e que cada temporada tem `numero` e `eps` lista.
3. Escolher a temporada com `numero === season`; se não existir, devolver lista vazia. Dentro dela, escolher `eps[]` com `num === episode`; se não existir, lista vazia.
4. Não usar `episodeCount`, posição do array nem número absoluto: a fonte publica várias temporadas no mesmo bloco RSC (`jujutsu-kaisen` tem 3) e o número do episódio é o da temporada.
5. Se o TMDB tiver temporadas agrupadas (por exemplo, Jujutsu Kaisen com 59 episódios na temporada 1), o par pedido pode não existir na fonte; a saída é ausência, não um palpite.

### D3. Áudios e player do episódio

1. Para cada campo não nulo `leg` e `dub`, consultar `/api/episodio/<id>` com `Referer` da página do anime. Cada áudio é uma opção independente.
2. Validar o idioma pelo `tipo`/`title` da resposta: "Dublado" vira `LANGUAGE.DUBBED`, "Legendado" vira `LANGUAGE.SUBTITLED`. Texto fora do vocabulário vira dica local, sem inventar PT-BR.
3. Aceitar `playerUrl` do Blogger (`blogger.com` ou `www.blogger.com`, caminho `/video.g`) e URLs de mídia direta (`m3u8`, `mp4`, `mkv`). Host desconhecido é triagem, registrada com `console.log`, não falha.
4. Se os campos `leg` e `dub` existirem e ambos forem nulos, a saída é lista vazia: a fonte não publicou áudio para o episódio. Se a resposta não tiver os campos, lançar erro de estrutura.
5. Isolar a falha de cada áudio com uma promessa convertida em `{ ok, stream }` ou `{ ok, error }`; usar `Promise.all`, porque `Promise.allSettled` não foi confirmado. Se um áudio falhar e outro resolver, avisar `[Animes Online Blue] Opção <áudio> descartada: <causa>`. Se todos falharem, lançar erro agregado.

### D4. Extração do Blogger em bloco reutilizável

1. Criar `src/_blocks/blogger-video/index.mjs` com `extractBloggerFormats(html)`, movendo a função de mesmo nome e os auxiliares privados de `src/anitube/players.js`.
2. O bloco recebe o HTML, decodifica entidades, localiza `"streamingData"` pela string escapada ou pelo objeto, valida `formats` e devolve `{ url, qualityLabel }[]`; lança erro quando não há formato progressivo HTTP(S).
3. O AniTube passa a importar `extractBloggerFormats` do bloco; nenhum comportamento ou seleção muda. A suíte do AniTube continua verde.
4. O Animes Online Blue chama o bloco com o HTML de `playerUrl`, sem `batchexecute`, sem `eval` e sem chamada extra quando o HTML já traz os formatos.
5. Alternativas descartadas:
   1. Copiar a função para o novo provedor: duplicaria um padrão já real no repositório.
   2. Implementar `batchexecute`: o HTML observado já publica `streamingData.formats`; a chamada RPC adicionaria dependência e fragilidade sem ganho.
   3. Usar `jina-reader`: o Blogger respondeu direto, sem bloqueio.

### D5. Streams, manifest e verificação

1. Montar cada stream com `buildStream`:
   1. `url` do formato do Blogger, resolvida contra a URL do player.
   2. `quality` de `qualityLabel` quando reconhecível; sem ele, omitir e deixar `Desconhecida`.
   3. `language` confirmado pelo áudio.
   4. `provider: 'Animes Online Blue'` e `type: 'mp4'`.
   5. `headers` ausentes: o Blogger/googlevideo não exigiu cabeçalho na descoberta; não transportar `Referer` sem evidência de necessidade.
   6. `format: { template: FORMATTER.AUTO, addon: 'Animes Online Blue', title, year, season, episode }`.
2. Ordenar com `sortByQuality` no ponto de entrada.
3. Manifest: `id` `animesonlineblue`, nome `Animes Online Blue`, versão `1.0.0`, autor `nathanael540`, tipos `["tv"]`, formatos `["mp4"]`, `contentLanguage` `["pt"]` e logo `https://www.google.com/s2/favicons?domain=animesonline.blue&sz=128`.
4. Verificação online: adicionar `animesonlineblue: { "exclusiveTag": "anime" }` em `test/online/profiles.json`, com `revision` e `curatedAt` atualizados. A tabela de `providers.md` começa em `🟠 Não verificado`.
5. O perfil `anime` já tem pelo menos cinco séries elegíveis; o provedor só amostra `tv`.

### D6. Testes offline

1. Fixtures reais sanitizadas em `test/fixtures/animesonlineblue/`: busca com resultado do filme e da série, busca vazia, RSC de duas temporadas, RSC sem `temporadas`, episódio com um áudio, episódio com dois áudios, episódio sem player, HTML do Blogger com um formato, HTML sem `formats` e estrutura de episódio inválida.
2. Casos: filme devolve `[]` sem rede; busca PT-BR + romaji escolhe a série de 2019; temporada/episódio ausente devolve `[]`; dois áudios geram dois streams com idiomas corretos; um áudio falha e o outro resolve com `console.warn`; todos falham e o erro agregado sobe; Blogger sem formato descarta só a opção; `format` e `name`/`title` conferidos nos três templates publicados.
3. Testar o bloco em `test/blocks/blogger-video/index.test.mjs` com os mesmos HTMLs, sem rede, e rodar `test/anitube.test.js` para garantir que o refactor não mudou o comportamento.
4. Nenhuma fixture contém token do Blogger, URL assinada de `googlevideo.com` ou cookie; a URL do player é substituída por um host/identificador fictício.

### D7. Documentação e método

1. Atualizar `docs/provider-investigation.md` com a seção “Next.js RSC e player do Blogger”: busca JSON, `?_rsc=1` com `RSC: 1`, balanceamento do bloco `temporadas`, `streamingData.formats` e o limite de `googlevideo.com` 403.
2. Registrar `src/animesonlineblue/`, o bloco, os testes e a spec na seção.
3. Não alterar `docs/arch.md`; nenhuma convenção global muda.

## Risks / Trade-offs

1. **Mídia 403 na triagem** → a URL do `googlevideo.com` não foi confirmada. O provedor devolve a URL publicada, como o AniTube; a rodada online não baixa mídia e a reprodução fica como hipótese até teste no aparelho.
2. **Busca textual frágil** → o título PT-BR pode apontar para um arco de outro ano. O acúmulo de variantes com romaji e a checagem de ano reduzem o risco; títulos sem romaji no TMDB podem ficar sem resultado.
3. **Temporadas agrupadas no TMDB** → o par pode não existir na fonte. A saída é ausência, não mapeamento por posição.
4. **Player do Blogger muda** → `streamingData.formats` é um contrato não documentado. O bloco lança erro de estrutura e a falha é visível; a fixture protege apenas o formato observado.
5. **Um áudio sem player** → o outro é preservado. Se ambos falharem, o erro agregado sobe e `getStreams` devolve `[]`.
6. **RSC não versionado** → mudanças de chave quebram o parsing. O erro sobe como estrutura, não como ausência, e o teste de bloco inválido cobre o caso.

## Migration Plan

1. Criar o bloco `blogger-video`, mover a função do AniTube e ajustar o import; rodar `node --test test/anitube.test.js` e o novo teste do bloco.
2. Criar `src/animesonlineblue/` e os testes com fixtures sanitizadas; rodar `node --test test/animesonlineblue.test.js`.
3. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil em `test/online/profiles.json`.
4. Atualizar `src/_blocks/index.md` e `docs/provider-investigation.md`.
5. Rodar `npm run lint`, `npm test`, `node build.js animesonlineblue` e `node build.js anitube`; confirmar os arquivos gerados.
6. Executar `npm run test:online -- --provider animesonlineblue` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
7. Arquivar a mudança somente com os testes previstos passando ou com exclusões declaradas.
8. Rollback: remover o provedor, a entrada do manifest, o perfil, a seção de `providers.md` e a seção do guia; o bloco pode permanecer se o AniTube já o consome.

## Validation

1. Confirmado online: home 200, busca 200 JSON, RSC 200 `text/x-component` com `temporadas`, episódio 200 JSON com `playerUrl` do Blogger, HTML do Blogger 200 com `streamingData.formats` (itag 18, 360p), dois áudios em Jujutsu Kaisen S01E01.
2. Rodada online de 2026-11-14T06:04:32.782Z (ID `2026-11-14T06-04-13-252Z-animesonlineblue-0dbed80b-2cfd`, pacote 1.0.0, perfil `anime`, semente `0dbed80bedf90e1718d6e3cca8530463`): **Estável**, 3/5 séries resolvidas. Jujutsu Kaisen S01E01 devolveu 4 streams (720p e 360p, dublado e legendado); Bleach e Demon Slayer devolveram 1 stream cada. Attack on Titan e My Hero Academia falharam porque o player do Blogger respondeu 200 com "O vídeo está indisponível" e sem `streamingData.formats`; a fonte publica o áudio, mas a mídia não existe mais. A rodada confirma o contrato dos streams, não a reprodução.
3. Não confirmado: reprodução do MP4 de `googlevideo.com` (HTTP 403 na triagem) e comportamento em outros títulos além dos cinco da rodada. A limitação de mídia 403 persiste como hipótese de rede/dispositivo; o provedor continua sem sonda e devolve a URL publicada.
4. O teste no aparelho é a evidência que falta para reprodução; nenhuma das rodadas altera o contrato descrito aqui.

## Open Questions

1. O 403 do `googlevideo.com` é específico da rede da triagem ou o Blogger passou a exigir algum contexto? O teste no aparelho responde.
2. Quantos títulos do acervo têm romaji no TMDB? Os que não tiverem podem não ser encontrados pela busca textual.
3. O RSC continua publicando `temporadas` no HTML normal? Se o `?_rsc=1` mudar, o fallback pelo HTML escapado é uma alternativa a avaliar com nova evidência.
