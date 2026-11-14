# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 13/11/2026 (14/11/2026 UTC) contra `https://animesdigital.org/`. Nenhuma URL assinada, token ou cookie é registrado aqui.

1. A home respondeu HTTP 200 `text/html` em `https://animesdigital.org/`, redirecionando para `/index`; o site usa um tema próprio (`wp-content/themes/animesdigital`), não DooPlay.
2. A busca é `GET /?s=<termo>` e responde com redirecionamento para `/pesquisa/<termo>/`. Para `kimetsu`, a página final respondeu 200 `text/html` com 14 cartões `div.itemA`; para `zzqqxxyyinexistente`, respondeu 200 com `div.header_title` e nenhum cartão.
3. Cada cartão é `div.itemA`/`div.itemE` com um `a[href][title]`; o `title` segue o formato `Assistir <Título> – … Online em HD` e pode declarar `Dublado`/`Legendado`/`Filme`.
4. A página de detalhe é `/anime/a/<slug>`, onde o slug é opaco (`jujutsu-k001r`, `kimetsu-no-yaiba-2`). O `h1` traz o título com decorações (`– Todos os Episódios`, `Dublado`) e `div.info` com `span` `Ano` seguido do ano (`2020`).
5. Séries listam `div.itens_ep` com `div.item_ep`; cada cartão tem `div.title_anime` (`Jujutsu Kaisen Episódio 24`) e um link `/video/a/<id>`. Filmes têm um único link `/video/a/<id>` e o slug termina em `-filme`.
6. A numeração reinicia em 1 por página de arco/temporada: `kimetsu-no-yaiba-yuukaku-hen` listou 11 episódios (`Episódio 01` a `11`), `jujutsu-kaisen-2` listou 23, `jujutsu-kaisen-3-todos-episodios` listou 12. Não há numeração absoluta contínua entre temporadas; o caminho `/anime/a/kimetsu-no-yaiba-2`, apesar do sufixo, abriu uma página `Kimetsu no Yaiba Dublado` com 26 episódios.
7. A página do episódio `/video/a/25344b001` publicou `iframe` para `https://api.anivideo.net/videohls.php?d=https://cdn-sv01.maximaimg.online/stream/j/jujutsu-kaisen/24.mp4/index.m3u8&nocache…`. O manifesto respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U` e segmentos `.webp`, com e sem `Referer`.
8. A página do filme `/anime/a/kimetsu-no-yaiba-movie-mugen-jou-hen-filme` publicou um link `/video/a/130927z`; esse `iframe` apontou para `videohls.php?d=…/01cambr.mp4/index.m3u8`, e o manifesto respondeu 200 `application/vnd.apple.mpegurl`.
9. O segundo `iframe` da página de episódio apontou para a rota interna `aHR0...`, que decodifica para um blogspot e publica `bg.mp4?p=2&q=…` — vídeo de fundo, não o episódio. Fica fora do contrato.
10. O player Anivideo publica `sources: [{ type, label: "720p HD", file: '<m3u8>' }]`. O rótulo não foi usado para qualidade porque exigiria uma requisição extra só para descobrir resolução; a URL `d` já é a mídia.

## Goals / Non-Goals

**Goals:**

1. Confirmar título, ano e tipo antes de resolver a mídia.
2. Selecionar o episódio pelo número declarado e a temporada somente por marcador explícito.
3. Devolver o HLS publicado pelo Anivideo sem sondar, baixar playlist ou inventar qualidade.
4. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online no perfil `anime`.

**Non-Goals:**

1. Mapear temporadas por arco (`Yuukaku-hen`, `Katanakaji-no-sato-hen`) para o número do TMDB: não há correspondência declarada e a inferência poderia tocar o episódio errado.
2. Calcular numeração absoluta: as páginas reiniciam em 1, então o número absoluto não existe na fonte.
3. Resolver a rota `aHR0...` para blogspot: na amostra ela publicava vídeo de fundo, e o conteúdo não era o episódio.
4. Sonar mídia, baixar playlist ou medir reprodução.
5. Adicionar chave, conta, proxy ou serviço externo.

## Decisions

### D1. Raspar o tema próprio em vez de procurar API

1. Usar `fetchPage` do bloco `http` no perfil `page` para `/?s=`, `/anime/a/<slug>` e `/video/a/<id>`.
2. Ler os cartões com a API básica do cheerio: `div.itemA, div.itemE`, `a[href]`, `attr('title')`.
3. Alternativas descartadas:
   1. `/wp-json/wp/v2/posts`: existe, mas não foi observado como fonte da busca do site e não devolve a estrutura de temporada/episódio usada na página.
   2. Jina Reader: desnecessário; o HTML responde direto sem desafio.
   3. Reaproveitar seletores de outro tema: o site não é DooPlay e não tem `result-item`, `se-c` nem `dooplay_player_option`.

### D2. Identidade por título limpo e ano

1. Limpar o título do cartão e do `h1` removendo `Assistir `, `– Todos os Episódios`, `Online`, `Completo`, `Dublado`, `Legendado`, `Filme` e marcadores de temporada.
2. Comparar com `findBestMatch` usando título PT-BR, original e alternativos; aceitar ano de `div.info` com tolerância de 1.
3. Se a página não tiver `Ano`, aceitar somente quando houver um único candidato compatível; dois compatíveis é ambiguidade e vira lista vazia.
4. Alternativas descartadas:
   1. Usar o slug como identidade: os slugs são opacos e não seguem o título (`jujutsu-k001r`).
   2. Confiar no primeiro cartão: a busca por substring devolve temporadas, filmes e arcos do mesmo título.

### D3. Temporada e episódio

1. Aceitar a temporada 1 quando o candidato não declara marcador.
2. Para temporada maior que 1, exigir marcador no título do candidato (`Temporada N`, `Season N` ou sufixo `N`) antes de usar a página.
3. Escolher o episódio pelo número lido de `div.title_anime` com `Episódio\s+0*(\d+)`; nunca pela posição na lista.
4. Devolver lista vazia quando a temporada não é declarada ou o episódio não existe.
5. Alternativa descartada: número absoluto (soma das temporadas anteriores). O site reinicia a contagem por arco; em `kimetsu-no-yaiba-yuukaku-hen`, o episódio 1 da temporada 2 do TMDB aparece como `Episódio 01`, não como 27.

### D4. Player Anivideo

1. Ler `iframe[src*="api.anivideo.net/videohls.php"]` e o parâmetro `d` com `new URL(...).searchParams.get('d')`.
2. Aceitar somente `http:`/`https:`; devolver a URL como está.
3. Não buscar a página do player para ler `label`: seria uma requisição só para qualidade, e a regra do repositório proíbe.
4. Não abrir a playlist: o app reproduz o manifesto.
5. `provider: 'Anivideo'` identifica o player; o tipo é `hls`.

### D5. Streams e idioma

1. Montar com `buildStream`, `format: { template: FORMATTER.AUTO, addon: 'AnimesDigital', title, year, season, episode }`.
2. Idioma: `Dublado` quando o título do cartão ou da página declarar; `Legendado` quando declarar; caso contrário, omitir e deixar a descoberta local. Não promover a `Legendado` só porque o site tem uma seção de legendados: a página individual não declara o áudio.
3. Qualidade: omitir; `buildStream` decide localmente e usa `Desconhecida` sem correspondência.
4. Sem `headers`: o manifesto respondeu 200 sem `Referer`/`Origin`.
5. Ordenar com `sortByQuality` no ponto de entrada.

### D6. Erros e testes

1. Etapas estruturais (entrada, TMDB, busca, detalhe, lista de episódios) lançam erro.
2. Cada iframe Anivideo é uma opção independente; a falha de uma é descartada com `console.warn('[AnimesDigital] Opção <rótulo> descartada: <causa>')`. Se nenhuma produzir stream e alguma falhar, sobe erro agregado; se todas forem triagem, lista vazia.
3. Fixtures: busca com resultado, busca vazia, detalhe de série, detalhe de filme, episódio com Anivideo, página com `bg.mp4` e página sem player. Sem URLs assinadas, tokens ou cookies.
4. Verificação online no perfil `anime` com os títulos já catalogados.

## Risks / Trade-offs

1. **Temporadas por arco** → a fonte não declara o número do TMDB em arcos como `Yuukaku-hen`. O provedor devolve ausência para temporadas não declaradas em vez de arriscar o episódio errado; a cobertura de temporada 1 e filmes é a que a fonte permite comprovar.
2. **Slugs opacos** → a identidade depende do título e do ano da página; um candidato sem ano e com título ambíguo é recusado.
3. **Player sem versão** → o caminho `videohls.php` e o parâmetro `d` não são documentados e podem mudar; a falha sobe como estrutura, não como ausência.
4. **Qualidade desconhecida** → o rótulo `720p HD` existe na página do player, mas exige requisição extra; o stream sai `Desconhecida` até uma mudança que justifique a leitura.
5. **Idioma desconhecido** → páginas sem `Dublado`/`Legendado` não são promovidas; o app mostra `Idioma Desconhecido`.
6. **Mídia efêmera** → a URL do CDN pode expirar; o provedor resolve a cada pedido, sem cache.

## Migration Plan

1. Criar `src/animesdigital/` (`index.js`, `catalog.js`, `player.js`) e os testes com fixtures sanitizadas.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e a entrada no perfil `anime` de `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método do player Anivideo.
4. Rodar `npm run lint`, `npm test` e `node build.js animesdigital`.
5. Executar `npm run test:online -- --provider animesdigital` e registrar a rodada.
6. Rollback: remover a entrada do manifest, os arquivos gerados, o perfil e a seção de `providers.md`.

## Validation

1. Observado: home 200; busca `kimetsu` 200 com 14 cartões; busca inexistente 200 sem cartões; detalhe `jujutsu-k001r` 200 com 26 `item_ep`; episódio `25344b001` com `videohls.php` e manifesto 200 `application/vnd.apple.mpegurl`; filme `mugen-jou-hen-filme` com link `/video/a/130927z` e manifesto 200; manifesto responde sem `Referer`.
2. Não confirmado: reprodução no app, validade dos segmentos `.webp` no player do Nuvio, cobertura de temporadas por arco e frequência de páginas sem Anivideo. A rodada online mede a resolução do contrato, não o vídeo.
3. Implementação e rodada online de 14/11/2026: perfil `anime`, pacote 1.0.0, `movie` 1/5 e `tv` 3/5, status `Estável`. Resolveram Your Name (filme com pseudoepisódio em `/anime/a/`), Demon Slayer, Jujutsu Kaisen e My Hero Academia (S01E01). Akira, Princesa Mononoke e A Viagem de Chihiro só tinham ficha `/filme/`, que não publica link `/video/a/` no HTML inicial; Mugen Train não resolveu. Bleach e One Piece listam apenas os 50 episódios mais recentes, então S01E01 está fora da página.
4. Ajuste observado no código: em série, o ano comparado é o da temporada pedida em `media.seasons`, com fallback para o ano da série. A ficha de filme aceita um único link `/video/a/<id>` com no máximo um cartão `Episódio 01`, mesmo sem o sufixo `-filme`, porque o catálogo publica filmes assim em `/anime/a/`. As páginas `/filme/` ficam fora do método porque não entregam o player no HTML inicial.
5. Limitações abertas: a rota `/filme/` exige um leitor próprio em outra mudança; a lista de episódios das séries longas é truncada em 50 entradas e não há paginação implementada; arcos sem número de temporada continuam sem mapeamento.
