# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:50 e 03:00) contra `https://oxeanimes.com.br`. URLs assinadas do CDN, tokens e cookies não são registrados aqui.

1. A home respondeu HTTP 200 `text/html`. A busca usada pela interface é `GET /api/chat-search?q=<termo>`, com HTTP 200 `application/json` e corpo `{ items: [...] }`; cada item traz `kind`, `title`, `cover` e `href`. Os resultados de anime começam por `/anime/`.
2. As versões dublada e legendada são páginas separadas: `q=kimetsu` devolveu `/anime/kimetsu-no-yaiba`, `/anime/kimetsu-no-yaiba-dublado`, `/anime/demon-slayer-kimetsu-no-yaiba-castelo-infinito` e a versão dublada do arco. O título e o slug carregam `dublado`; o restante é legendado.
3. A página `/anime/<slug>` respondeu HTTP 200 `text/html` e publica cartões com `href="/watch/<id>?anime=...&slug=..."`; o número aparece no texto (`Episódio <!-- -->26`) e no `alt` da imagem (`Kimetsu no Yaiba – Episódio 26 online`). A lista cobre a temporada inteira; não há campo de temporada na página.
4. Páginas de temporadas diferentes são independentes: `jujutsu-kaisen` tem 24 episódios, `jujutsu-kaisen-2` tem 23 e começa no episódio 1, e `jujutsu-kaisen-3` tem 12. O número do episódio é o da temporada da página, não um índice absoluto da franquia.
5. A página não publica ano, ID do TMDB nem tipo de mídia em JSON-LD ou metadados legíveis. A identidade disponível é o título; a confirmação é por similaridade textual. O TMDB de 85937 tem 5 temporadas, mas a fonte publica páginas por arco/temporada com nomes próprios.
6. O episódio é `GET /api/episode/<id>?slug=<slug>` com `Referer`; respondeu HTTP 200 `application/json` com `title`, `streamUrl`, `isEmbed`, `sources[]`, `animeTitle` e `nextEpisode`. O `streamUrl` é relativo (`/api/stream?url=<CDN>`) e as `sources` trazem `label`, `type` (`hls` ou `embed`) e `url`.
7. O proxy `/api/stream?url=...` respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U` e uma variante `1280x720` para `kimetsu-no-yaiba` S01E01 legendado. Sem `Referer`, respondeu HTTP 403 `text/plain` ("Acesso negado"). O CDN de origem respondeu HTTP 403 direto, como a proposta já registrava.
8. `kimetsu-no-yaiba` dublado S01E01 respondeu 200 na API do episódio, mas o proxy devolveu HTTP 502 `text/plain` ("Stream error: fetch failed") em duas tentativas. `jujutsu-kaisen` dublado S01E01 respondeu 200 e a master devolveu `#EXTM3U`, mostrando que o 502 é por episódio/backend, não sistêmico.
9. Filme também resolve: `q=your name` devolveu `/anime/your-name`, a página tinha um único `/watch/22331`, e a API do episódio devolveu `streamUrl` HLS. `q=akira` não devolveu o filme; a busca é textual e depende do título publicado.
10. A master pode ser uma playlist de mídia (sem `RESOLUTION`) ou uma master com variantes; o provedor não precisa abrir a playlist para montar o stream.

## Goals / Non-Goals

**Goals:**

1. Confirmar a obra pelo conjunto de títulos do TMDB, escolhendo dublado e legendado separadamente.
2. Selecionar o episódio pelo número publicado na página da temporada, com ausência explícita.
3. Resolver o HLS do proxy com `Referer` de reprodução e idioma confirmado pela fonte.
4. Manter testes offline com fixtures reais sanitizadas e verificação online no perfil `anime`.

**Non-Goals:**

1. Sondar a master, medir 502 ou baixar segmentos; a URL publicada é o contrato.
2. Mapear temporadas que o TMDB agrupa em uma só ou inferir temporada pelo título do arco quando a busca não confirmar.
3. Resolver `embed` de hosts externos ou o player `Player 1` do Blogger.
4. Adicionar settings de áudio/qualidade, timeout, cache ou proxy próprio.
5. Garantir cobertura de filmes ausentes da busca textual, como Akira.

## Decisions

### D1. Busca por variantes e opções de áudio independentes

1. Chamar `getMediaInfo` uma vez. Montar os termos com `title`, `originalTitle`, `alternativeTitles`, `romajiTitles[].title` e, para `tv` com temporada maior que 1, `title + ' ' + season` e o romaji específico da temporada quando existir. Deduplicar por `normalizeText`.
2. Consultar `/api/chat-search` para cada termo e acumular itens por `href`, sem parar no primeiro termo. A busca de `Demon Slayer` devolveu o arco de 2025; a de `kimetsu` devolveu a série de 2019.
3. Classificar cada item em duas listas: dublado quando `title` ou `href` contém `dublado`; legendado nos demais. O mesmo item não entra nas duas listas.
4. Para cada lista, calcular a maior `titleSimilarity` contra os títulos do TMDB (incluindo romaji e o termo de temporada) e manter candidatos com score `>= 0.60`, ordenados do maior para o menor. Escolher o melhor de cada áudio separadamente.
5. Alternativas descartadas:
   1. Usar `findBestMatch` direto: ele não considera `romajiTitles` e não separa áudio; um objeto sintético resolveria o primeiro ponto, mas a separação por áudio continua necessária.
   2. Aceitar o primeiro resultado: a busca devolve arcos e páginas dubladas misturados.
   3. Exigir ano: a página não publica ano; usá-lo como filtro descartaria todos os candidatos.

### D2. Página da obra e seleção do episódio

1. Buscar a página `/anime/<slug>` com `Referer: https://oxeanimes.com.br/`.
2. Com o cheerio, percorrer `a[href*="/watch/"]`. Para cada link, ler o número do episódio no `alt` da imagem (`Episódio N`) ou no texto do cartão; exigir um número legível. Deduplicar por URL.
3. Para `tv`, escolher o link com o número igual a `episode`. Se não existir, tentar o próximo candidato daquele áudio (até três), porque a busca pode ter escolhido a página de outro arco; se nenhum tiver o episódio, aquele áudio é ausência.
4. Para `movie`, usar a entrada única; se houver mais de uma URL única, preferir a rotulada `Episódio 1`; sem rótulo inequívoco, lançar erro de estrutura.
5. Não usar a posição do link como número. O cartão principal "Assistir Episódio 1" e a lista de episódios duplicam o mesmo link; a deduplicação por URL resolve.
6. Alternativa descartada: calcular número absoluto somando temporadas do TMDB. A fonte publica uma página por temporada e começa cada uma no episódio 1; o cálculo erraria a temporada.

### D3. API do episódio e proxy

1. Consultar `/api/episode/<id>?slug=<slug>` com `Referer` do site. O `slug` é obrigatório: sem ele a API responde 404 "Episode not found". O slug é o último segmento do caminho `/anime/<slug>`, decodificado.
2. Ler `streamUrl`; se ausente, usar a primeira `sources[]` com `type: "hls"`. Preferir o proxy `/api/stream` porque o CDN direto responde 403; uma fonte HLS absoluta só entra quando for a única disponível. Resolver caminhos relativos contra `https://oxeanimes.com.br`.
3. Aceitar somente HTTPS. Fonte `embed` e host externo são triagem, não falha.
4. Confirmar o idioma pelo `tipo`/`title` do episódio (ou pelo rótulo da fonte): "Dublado" vira `LANGUAGE.DUBBED`, "Legendado" vira `LANGUAGE.SUBTITLED`. Não promover português sem região a PT-BR.
5. Cada áudio é uma opção independente; a falha de um não interrompe o outro. Se todos falharem, lançar erro agregado. Se todos forem triagem, devolver lista vazia.
6. Não abrir a master no provedor. O proxy exige `Referer`; a reprodução recebe `headers: { Referer: 'https://oxeanimes.com.br/', 'User-Agent': <navegador> }`. Não transportar `Origin` sem evidência.
7. Alternativas descartadas:
   1. Usar o CDN direto: responde 403.
   2. Sondar a master para filtrar 502: violaria a regra de não instalar sonda; a fonte já publica a URL e o app decide a reprodução.
   3. Reutilizar a cadeia do bloco `fireplayer`: o proxy do OxeAnimes não é um agregador FirePlayer.

### D4. Streams, manifest e verificação

1. Montar cada stream com `buildStream`:
   1. `url` absoluta do proxy.
   2. `quality` só quando o rótulo declarar resolução numérica; "FHD" sem número fica `Desconhecida`.
   3. `language` confirmado.
   4. `provider: 'OxeAnimes'` e `type: 'hls'`.
   5. `headers` de reprodução com `Referer` e `User-Agent`.
   6. `format: { template: FORMATTER.AUTO, addon: 'OxeAnimes', title, year, season, episode }` para série; filme sem temporada/episódio.
2. Ordenar com `sortByQuality`.
3. Manifest: `id` `oxeanimes`, nome `OxeAnimes`, versão `1.0.0`, autor `nathanael540`, tipos `["movie","tv"]`, formatos `["m3u8"]`, `contentLanguage` `["pt"]` e logo `https://www.google.com/s2/favicons?domain=oxeanimes.com.br&sz=128`.
4. Verificação online: adicionar `oxeanimes: { "exclusiveTag": "anime" }` em `test/online/profiles.json`, com `revision` e `curatedAt` atualizados. A tabela de `providers.md` começa em `🟠 Não verificado`.
5. O perfil `anime` tem pelo menos cinco filmes e cinco séries elegíveis; o provedor amostra os dois tipos.

### D5. Testes offline

1. Fixtures reais sanitizadas em `test/fixtures/oxeanimes/`: busca com dublado e legendado, busca com arco de outro ano, busca vazia, página de série com episódios fora de ordem, página de filme, página sem link legível, episódio com `streamUrl`, episódio só com `sources` HLS, episódio só `embed`, resposta 502 e JSON inválido.
2. Casos: série S01E01 resolve dublado e legendado; título exato vence o arco; filme usa a entrada única; temporada sem episódio devolve `[]`; um áudio falha e o outro resolve com `console.warn`; todos falham e o erro agregado sobe; `headers.Referer` e `format` conferidos nos três templates publicados.
3. Nenhuma fixture contém URL assinada do CDN, token de player ou cookie; o `streamUrl` é substituído por um caminho de proxy com URL fictícia.
4. Rodar `node --test test/oxeanimes.test.js` e `node build.js oxeanimes`.

### D6. Documentação e método

1. Atualizar `docs/provider-investigation.md` com a seção “Proxy de streaming próprio com Referer”: busca JSON, página por áudio, API de episódio com slug, master via proxy, 403 sem `Referer`, 502 por episódio.
2. Registrar `src/oxeanimes/`, os testes e a spec na seção.
3. Não alterar `docs/arch.md`.

## Risks / Trade-offs

1. **Identidade só por título** → a página não publica ano nem ID externo. O limiar 0,60 e a preferência pelo título exato reduzem falsos positivos; um título com nome genérico pode escolher a página errada. A lista de candidatos e a checagem do episódio ajudam, mas não substituem ano.
2. **Proxy 502** → episódios específicos podem falhar no backend, como o dublado de Kimetsu S01E01. Sem sonda, o stream é devolvido e a reprodução falha no app; a limitação fica registrada.
3. **Temporadas do TMDB agrupadas** → Jujutsu Kaisen tem 59 episódios na temporada 1 do TMDB, mas a fonte separa em páginas. O par pode não existir; a saída é ausência.
4. **Busca textual** → Akira não apareceu; títulos fora do vocabulário da fonte ficam sem resultado.
5. **Rótulo de qualidade** → "FHD" não é resolução; não inventar 1080p. A qualidade fica `Desconhecida` até a fonte declarar um número.
6. **Proxy não versionado** → o caminho `/api/stream?url=` e o parâmetro `slug` podem mudar. Erros de estrutura sobem e a fixture protege o contrato observado.

## Migration Plan

1. Criar `src/oxeanimes/` e os testes com fixtures sanitizadas; rodar `node --test test/oxeanimes.test.js`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md`.
4. Rodar `npm run lint`, `npm test` e `node build.js oxeanimes`; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider oxeanimes` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar a mudança somente com os testes previstos passando ou com exclusões declaradas.
7. Rollback: remover o provedor, a entrada do manifest, o perfil e a seção de `providers.md`.

## Validation

1. Confirmado online: busca 200 JSON, página 200 com links `/watch/`, API do episódio 200, proxy 200 `application/vnd.apple.mpegurl` com `#EXTM3U` e `1280x720` para Kimetsu legendado, 403 sem `Referer`, 403 no CDN direto, dublado de Jujutsu 200 e filme Your Name 200.
2. Não confirmado: reprodução no aparelho e o comportamento de todos os episódios; o dublado de Kimetsu S01E01 respondeu 502 no proxy.
3. A rodada online e o teste no aparelho são as evidências que faltam; nenhuma delas altera o contrato descrito aqui.

## Open Questions

1. O 502 do dublado de Kimetsu é sazonal ou o backend do proxy está degradado para parte do acervo?
2. A fonte publica ano em alguma outra rota ou metadado que permita confirmação mais forte? A página observada não publicou.
3. O rótulo "FHD" corresponde sempre a 1080p? Sem número, o provedor não afirma.
