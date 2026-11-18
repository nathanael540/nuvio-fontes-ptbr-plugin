# Design

## Context

1. A fonte é o catálogo Otakulogia, uma SPA de animes em PT-BR. O HTML inicial não traz catálogo; o site consome `POST https://api.otakulogia.com/graphql`, público, sem conta, chave, token ou cookie.
2. A referência de comportamento é o código publicado do Prisma Stream Addon (GPL-3.0): `prisma_sites.py`, linhas 598–768, e `prisma_core.py`, linhas 63–64. O bloco do Otakulogia define o endpoint, os cabeçalhos, as duas queries, a confirmação de identidade, a seleção de temporada e episódio e o mapeamento de qualidade e áudio.
3. O transporte usa `POST` com JSON `{query, variables}`, `User-Agent` de navegador, `Origin: https://otakulogia.com` e `Referer: https://otakulogia.com/`. A resposta com `errors` não vazio ou sem `data` é rejeitada como erro de estrutura.
4. A query de busca é `query SearchAnimes($input: SearchAnimesInput) { searchAnimes(input: $input) { total items { id upstreamCid name slug nameEn year audioMix } } }`, com variáveis `{"input": {"query": "<título>", "limit": 12}}`. Os itens ficam em `data.searchAnimes.items[]`.
5. A query de detalhe é `query AnimeCatalogDetail($upstreamCid: Int!, $upstreamTid: Int) { animeCatalogDetail(upstreamCid: $upstreamCid, upstreamTid: $upstreamTid) { anime { name year } seasons { upstreamTid name audioType } episodes { episodeNumber upstreamTempId videoUrl videoUrlFhd videoUrlSd videoType audioType } } }`, com variáveis `{"upstreamCid": <inteiro>, "upstreamTid": null}`. O detalhe válido exige `seasons` e `episodes` como listas.
6. A identidade do Prisma compara `name` e `nameEn` normalizados com o título pesquisado e aceita diferença de até um ano quando os dois lados publicam ano. A busca é feita para todos os títulos do contexto e para no primeiro termo com correspondência, limitando a três itens para o detalhe.
7. A temporada é localizada pelo nome: `Temporada N` (com zeros à esquerda e sufixo após `|`) ou `Filme`, nunca pela posição no array. Os episódios são filtrados por `upstreamTempId` igual ao `upstreamTid` da temporada.
8. O Prisma ordena os episódios pelo número extraído da URL (`/(\d+)\.mp4`) e escolhe o índice `episode - 1`. Ele usa `videoUrl` para série e `videoUrl`/`videoUrlFhd`/`videoUrlSd` para filme, mapeia `DUB` para dublado e `LEG` para legendado e monta os candidatos de filme com teto de quatro por detalhe.
9. Observação pontual do endpoint em 2026-11-14, com dois `POST` e sem registrar URLs de mídia: a busca por `Naruto` respondeu HTTP 200, sem `errors`, com 12 itens de 21 no total e os campos `id`, `upstreamCid`, `name`, `slug`, `nameEn`, `year` e `audioMix`; o primeiro item foi `NARUTO Shippuuden` (2007). O detalhe desse item respondeu HTTP 200, com 20 temporadas nomeadas `Temporada 01 | Dublado` até `Temporada 20 | Dublado`, 500 episódios com `episodeNumber` numérico, `videoUrl` preenchido em todos, `videoUrlFhd` e `videoUrlSd` vazios na amostra, `videoType` `server_url` e `audioType` `DUB`.
10. A amostra de 2026-11-14 confirma o envelope, a forma dos campos e a nomenclatura das temporadas; não confirma o formato de filme, o preenchimento de FHD/SD, a semântica de `episodeNumber` em toda a base, a necessidade de `Referer` na reprodução nem o funcionamento do nosso pacote.
11. Sonda de mídia de 2026-11-16, sem registrar URLs assinadas ou conteúdo:
    1. `NARUTO Shippuuden`, `Temporada 01 | Dublado`: 32 episódios, todos com `episodeNumber` 32 e URLs `1.mp4` a `32.mp4`. O primeiro `videoUrl` respondeu HTTP 206, `video/mp4`, com assinatura `ftyp`, tanto com `User-Agent` quanto com `User-Agent` + `Referer`.
    2. `ONE PIECE`, `T01 East Blue | Dublado`: 61 episódios, todos com `episodeNumber` 61 e URLs `ep01.mp4` a `ep61.mp4`; o primeiro `videoUrl` respondeu HTTP 206, `video/mp4`, com `ftyp`.
    3. `Naruto`, `Temporada 04 | Dublado`: todos os episódios com `episodeNumber` 52; `AKIRA` veio em `Temporada 01 | Legendado` com um único episódio e URL terminada em `akira-dublado.mp4`, que respondeu 206 com `User-Agent` + `Referer` e expirou sem o cabeçalho.
    4. Conclusão: `episodeNumber` não é o número do episódio; ele repete o total de episódios da temporada. A numeração confiável está na URL (com ou sem prefixo `ep`). Filme pode aparecer como `Filme` ou como temporada de episódio único.
12. A evidência principal continua sendo o código publicado do Prisma, complementado pelas sondas acima. As sondas provam que a fonte entrega MP4 reproduzível, mas não substituem a rodada online do pacote final.
13. O runtime é QuickJS: `fetch`, `URL`, `URLSearchParams`, `AbortController`, `atob`/`btoa`, `module` e `TMDB_API_KEY`; `require` só para `cheerio-without-node-native` e `crypto-js`. Não há `axios`, APIs do Node, `setTimeout`, `setInterval`, `TextEncoder` ou `TextDecoder`. O provedor não impõe timeout e só `getStreams` captura a falha final.

## Goals / Non-Goals

**Goals:**

1. Resolver filmes e séries de anime pelo GraphQL público, sem raspar HTML e sem chave adicional.
2. Confirmar título e ano antes de abrir o detalhe e escolher temporada/episódio pelo dado declarado, nunca pela posição visual.
3. Entregar MP4 diretos com qualidade e áudio somente quando a fonte os declarar, preenchendo o contrato com `buildStream` e `format`.
4. Distinguir ausência reconhecida de falha de rede, GraphQL ou estrutura, com testes offline determinísticos.
5. Introduzir o método GraphQL no guia de investigação sem criar bloco compartilhado antes de um segundo consumidor real.

**Non-Goals:**

1. Implementar conta, login, favoritos, histórico ou downloads do site.
2. Abrir o player do site, baixar mídia, sondar resolução ou cachear URLs.
3. Contornar bloqueio, captcha, Cloudflare ou restrição de acesso.
4. Criar um bloco GraphQL genérico com um único consumidor, o que contraria a regra de blocos do repositório.
5. Mapear temporadas por posição, numeração absoluta do TMDB ou suposição quando a fonte não declara `Temporada N`/`Filme`.
6. Usar `audioMix`, `videoType` ou o ano de `anime` como prova de idioma, tipo de mídia ou identidade.

## Decisions

### D1. Consumir o GraphQL público em vez de raspar a SPA

1. Usar `fetchJson` do bloco `http` com `method: 'POST'`, `profile: 'api'` e `json: { query, variables }`, acrescentando `Origin` e `Referer` de `https://otakulogia.com`. O perfil já fornece `User-Agent` de navegador e `Accept` JSON.
2. Manter os campos e a estrutura das queries publicadas pelo Prisma; os espaços entre campos não alteram a query. A fonte não documenta o schema e a query é o contrato observado. Mudança de campos deve subir como erro de estrutura, nunca como ausência.
3. Tratar `errors` não vazio, `data` ausente ou `data` que não seja objeto como erro fatal de estrutura. `errors: []` não bloqueia a leitura.
4. Alternativas descartadas:
   1. Raspar o HTML da SPA: o catálogo não está no carregamento inicial.
   2. Usar o Jina Reader: adicionaria intermediário e cota para um endpoint JSON que responde direto.
   3. Consumir uma API REST do site: não foi observada nenhuma; a única interface pública usada pelo site é o GraphQL.

### D2. Identidade por igualdade normalizada, com múltiplos itens por termo

1. Comparar `name` e `nameEn` de cada item com os títulos do TMDB (incluindo o termo consultado) usando `normalizeText` do bloco `slugify`, sem pontuação fuzzy: a fonte publica obras distintas com títulos próximos (`Naruto` e `NARUTO Shippuuden`) e o primeiro resultado parecido não é confirmação. Se a normalização de um dos lados ficar vazia, não há correspondência; `normalizeText` vazio não confirma título.
2. Quando o item e o TMDB tiverem ano, aceitar diferença de até um ano; sem ano em um dos lados, a decisão fica só pelo título. Ano fora da tolerância descarta o item.
3. Devolver todos os itens que passarem no termo, não apenas o melhor: a fonte pode publicar a mesma obra em mais de `upstreamCid` (variantes de áudio ou temporada) e a temporada pedida pode existir em apenas um deles.
4. Alternativas descartadas:
   1. `findBestMatch` do bloco `title-match`: devolve um único candidato e usa similaridade mínima de 0,85; aqui a regra é igualdade normalizada e podem existir vários itens válidos para o mesmo termo.
   2. Aceitar o primeiro resultado da busca: confundiria `Naruto` com `NARUTO Shippuuden` e outros homônimos.
   3. Comparar só com o título PT-BR: perderia obras cujo `nameEn` é o único título correspondente.

### D3. Busca em paralelo, primeiro termo com correspondência e teto de itens

1. Montar os termos na ordem do TMDB: título PT-BR, título original, alternativos brasileiros e romaji; deduplicar pelo texto normalizado e limitar a oito termos para não multiplicar requisições em um endpoint sem rate limit documentado.
2. Disparar as buscas em paralelo e capturar o resultado ou a falha de cada uma individualmente. `Promise.allSettled` não foi confirmado no runtime; cada promessa é convertida em `{ ok, value }` ou `{ ok: false, error }` antes de `Promise.all`.
3. Percorrer os termos na ordem original e parar no primeiro com pelo menos um item confirmado; desse termo, levar no máximo três itens distintos por `upstreamCid` para o detalhe, como o Prisma.
4. Se nenhum termo tiver correspondência e todas as buscas tiverem sucesso, a saída é lista vazia (ausência). Se alguma busca tiver falhado, lançar erro agregado com as causas, porque não é possível distinguir ausência de falha. Termo que falha e não é usado por haver correspondência em outro gera aviso `[Otakulogia] Busca "<termo>" descartada: <causa>`, sem interromper o pedido.
5. Alternativas descartadas:
   1. Buscar sequencialmente e parar no primeiro termo: mais lento, mas foi descartado em favor do paralelismo pedido; a parada continua sendo na leitura dos resultados.
   2. Buscar todos os termos sem teto: títulos com muitos alternativos gerariam dezenas de `POST` simultâneos.
   3. Paginar a busca: a variável observada aceita `limit` e não há `page`; inventar paginação mudaria o contrato sem evidência.
   4. Abortar o pedido quando um termo anterior falha: reduziria o risco de usar um termo posterior, mas transformaria uma falha transitória de um alternativo em ausência do título; a falha fica registrada com aviso e o erro agregado só sobe quando nada corresponde.

### D4. Um detalhe por item confirmado, com isolamento por candidato

1. Consultar `animeCatalogDetail` uma vez por item confirmado, em paralelo, com `upstreamCid` inteiro e `upstreamTid: null`. A resposta traz todas as temporadas e episódios, então não há chamada por temporada nem por episódio.
2. `animeCatalogDetail: null` é ausência daquele item (obra removida), não falha. `seasons` ou `episodes` fora de lista, `upstreamCid` não inteiro ou corpo fora do esquema são falhas daquele candidato.
3. A falha de um detalhe é descartada com `console.warn('[Otakulogia] Opção <upstreamCid> descartada: <causa>')` e os demais seguem. Se nenhum produzir stream e algum tiver falhado, o erro agregado sobe com a causa de cada um.
4. Alternativas descartadas:
   1. Uma consulta por temporada: `upstreamTid: null` já devolve a obra inteira e uma consulta extra só aumentaria a carga.
   2. Tratar falha de detalhe como ausência: esconderia HTTP 5xx, GraphQL ou mudança de schema.
   3. Guardar o detalhe em cache: o processo do plugin não é um daemon e a URL de mídia pode expirar; cache entre chamadas não tem ganho comprovado.

### D5. Temporada pelo nome declarado

1. Selecionar todas as linhas de `seasons` cujo `name`, após aparar espaços, case com `^Temporada\s*0*<season>(?:\s*\|.*)?$` (sem diferenciar maiúsculas) ou, em filme, `^Filme(?:\s*\|.*)?$`. A comparação usa o número pedido, não a posição no array.
2. Aceitar `Temporada 1`, `Temporada 01`, `Temporada 01 | Dublado` e variações com pipe. Não aceitar `Temporada 1.5`, `Season 1`, `1ª Temporada` ou arcos sem o marcador: sem o nome esperado, a saída é lista vazia em vez de um palpite.
3. Várias linhas podem casar (por exemplo, dublado e legendado); cada uma tem seu `upstreamTid` e é uma opção independente. O `audioType` da linha serve de fallback quando o episódio não o declarar. Linha com nome correspondente e `upstreamTid` não inteiro é falha daquele candidato, não ausência.
4. Alternativas descartadas:
   1. Usar o índice da temporada no array: a fonte não garante ordem nem quantidade de linhas.
   2. Usar o ano de `anime` para escolher a temporada: o ano é da obra, não da temporada.
   3. Aceitar qualquer `name` que contenha `N`: confundiria títulos e números de episódios.

### D6. Episódio pela numeração da URL, sem usar `episodeNumber`

1. Filtrar os episódios da temporada escolhida por `upstreamTempId === upstreamTid` e por URL utilizável.
2. Extrair de `videoUrl` o último token numérico antes de `.mp4`, com `/(\d+)\.mp4(?:$|\?)/i`, sem exigir barra antes dos dígitos para aceitar `ep01.mp4`. Todos os episódios da temporada precisam ter número válido; qualquer episódio sem número torna a temporada ambígua e a saída é ausência.
3. Ordenar a temporada por esse número e exigir sequência contígua começando em 1. Selecionar o episódio cujo número seja igual ao pedido; fora da sequência, devolver ausência.
4. Não usar `episodeNumber` para seleção. A sonda de 2026-11-16 viu o mesmo valor repetido em todos os episódios da temporada (32, 21, 61, 16 e 52), compatível com o total de episódios. `episodeNumber` também não substitui a URL quando vem ausente ou não inteiro; ele é ignorado na seleção.
5. A seleção cobre `1.mp4` a `32.mp4` e `ep01.mp4` a `ep61.mp4`; a lista pode vir fora de ordem e a ordenação local resolve.
6. Alternativas descartadas:
   1. Usar `episodeNumber` como número do episódio: a fonte repete o total da temporada e a seleção erraria em toda temporada.
   2. Escolher pela posição na lista: a fonte não garante ordenação.
   3. Usar índice `episode - 1` mesmo quando a sequência não começa em 1: escolheria um episódio errado em temporadas com numeração absoluta ou buracos; a ausência é preferível.
   4. Mapear numeração absoluta do TMDB: a URL já publica a numeração que a fonte usa; uma conta externa introduziria erro sem evidência.

### D7. Filme em `Filme` ou em temporada de episódio único

1. Para `movie`, considerar primeiro todas as linhas de `seasons` cujo `name` case com `^Filme(?:\s*\|.*)?$` e todos os episódios cujo `upstreamTempId` seja igual ao `upstreamTid` da linha. O filme não usa a coordenada de episódio.
2. Se não houver linha `Filme`, considerar as temporadas que tenham exatamente um episódio no detalhe. A aceitação só acontece quando existe exatamente uma temporada candidata; duas ou mais temporadas de episódio único são ambiguidade e resultam em ausência. A sonda de 2026-11-16 viu `AKIRA` em `Temporada 01 | Legendado` com um episódio e URL sem numeração.
3. Aceitar mais de uma linha `Filme` (por exemplo, dublado e legendado) e mais de um episódio por linha; cada URL distinta é uma opção.
4. Deduplicar por URL exata e devolver todas as opções distintas. Não adotar o teto de quatro do Prisma: ele é um limite do addon de origem, não uma regra da fonte, e poderia esconder uma variante de áudio válida.
5. Alternativas descartadas:
   1. Teto de quatro candidatos: reduziria a lista, mas descartaria opções válidas sem critério de triagem documentado.
   2. Exigir exatamente uma temporada `Filme`: a fonte também publica filmes em temporada de episódio único, como `AKIRA`.
   3. Tratar filme como série de temporada 1: a URL de filme pode não ter número (`akira-dublado.mp4`), então a seleção por URL falharia; o caminho de filme usa o episódio diretamente.
   4. Aceitar qualquer temporada de episódio único: um especial ou OVA poderia ser escolhido; a unicidade é exigida.

### D8. URL, qualidade e tipo

1. Escolher o primeiro endereço HTTP(S) válido, nesta ordem: `videoUrl`, `videoUrlFhd`, `videoUrlSd`. `videoUrl` é o preferido; FHD e SD cobrem o caso de campo principal vazio. A ausência de qualquer endereço válido é falha isolada da opção, com aviso.
2. Se a URL usada for exatamente igual a `videoUrlFhd`, informar `quality: 'FHD'`; se for igual a `videoUrlSd`, `quality: 'SD'`. Quando os dois campos forem iguais à URL usada, `FHD` prevalece pela ordem da comparação. O bloco `quality-discovery` normaliza FHD para `1080p` e SD para `480p`; a informação é o rótulo declarado pela fonte, não uma medição. Se a URL não corresponder a nenhum dos dois, omitir `quality` e deixar a descoberta local no arquivo, na pasta e na URL, com `Desconhecida` quando não houver correspondência.
3. Não fazer requisição extra, sonda `Range` ou leitura de playlist para descobrir qualidade. O MP4 é direto e a URL publicada comprova o contrato, não a reprodução.
4. Usar `type: 'mp4'` fixo, porque o formato publicado é MP4. Não usar `videoType` como tipo: na amostra ele é `server_url`, que descreve a entrega do catálogo, não o contêiner.
5. Não informar `provider`: a fonte não publica um servidor de mídia distinto do catálogo e o `addon` do formatador já identifica o Otakulogia. Não informar `size`, `subtitles`, `infoHash`, `seeders`, `peers` ou `behaviorHints`, que a fonte não fornece.
6. Alternativas descartadas:
   1. Usar só `videoUrl` como o Prisma na série: perderia o filme ou o episódio cujo campo principal veio vazio.
   2. Preferir FHD/SD sobre `videoUrl`: inverteria a prioridade publicada pela fonte.
   3. Inferir 1080p/480p diretamente de `FHD`/`SD` no provedor: duplicaria a regra do bloco; a normalização fica nele.

### D9. Idioma declarado, sem suposição

1. Ler o `audioType` do episódio e, quando ele estiver vazio, o `audioType` da temporada. `DUB` vira `LANGUAGE.DUBBED` (`Dublado`) e `LEG` vira `LANGUAGE.SUBTITLED` (`Legendado`), comparando o token normalizado, não uma substring qualquer.
2. Texto vazio, ausente ou fora de `DUB`/`LEG` é omitido; o `buildStream` resolve o idioma por descoberta local e, sem texto, devolve `Idioma Desconhecido`. Não promover `audioMix` (`DUB`, `LEG`, `DUB,LEG`) a idioma do arquivo: ele descreve as faixas do título, não a opção.
3. Alternativas descartadas:
   1. Usar `Dublado (Não PT-BR?)` para DUB: o catálogo é PT-BR e o mapeamento da fonte já distingue dublado de legendado; o `?` ficaria reservado a fonte sem região comprovada.
   2. Usar `audioMix` como fallback: um título com as duas faixas não prova qual delas está na URL.
   3. Deduzir `Legendado` pela ausência de `DUB`: silencioso e sem evidência.

### D10. Cabeçalhos de reprodução

1. Enviar somente `User-Agent` de navegador no campo `headers`, como o Prisma. Não usar `playbackHeaders` porque ele acrescenta `Referer` e `Origin` sem evidência de necessidade.
2. `Origin` e `Referer` de `https://otakulogia.com` ficam restritos à descoberta GraphQL; não são transportados para o arquivo de mídia.
3. A necessidade de `Referer` na reprodução do MP4 será confirmada na implementação com até duas requisições mínimas, com e sem o cabeçalho, sem baixar mídia e sem registrar a URL. Se o arquivo exigir `Referer`, a decisão e o teste serão atualizados; sem essa evidência, o comportamento permanece só `User-Agent`.
4. Alternativas descartadas:
   1. Enviar `Referer`/`Origin` por precaução: cabeçalho inventado pode quebrar CDNs que diferenciam contexto.
   2. Não enviar cabeçalho algum: o Prisma envia `User-Agent` e a fonte pode diferenciar cliente sem ele.

### D11. Fronteira de erro

1. Erros internos são lançados com mensagem clara. Somente `getStreams` captura, registra `console.error('[Otakulogia] Falha em <tipo> <id>: <causa>')` e devolve `[]`.
2. Entrada, TMDB e leitura do envelope GraphQL são fatais. A busca como um todo é fatal quando nenhum termo corresponde e alguma consulta falhou; um termo isolado pode falhar com aviso se outro termo confirmar o título. Cada detalhe é uma opção isolada: falha com `console.warn`, ausência sem aviso, e erro agregado quando nada produz stream e alguma opção falhou.
3. `mediaType` fora de `movie`/`tv` é erro antes de qualquer requisição. Série sem `season`/`episode` inteiros a partir de 1 é erro antes da busca; filme ignora as coordenadas.
4. Não há `AbortController`, `setTimeout`, retentativa, cache ou espera própria. HTTP 429 é falha, não ausência, e não é repetido.
5. Alternativas descartadas:
   1. Capturar erro em cada função: esconderia a causa e impediria o erro agregado.
   2. Retentar 429/5xx: multiplicaria requisições em um endpoint sem cota documentada.
   3. Tratar GraphQL `errors` como ausência: confundiria schema quebrado com título inexistente.

### D12. Sem bloco novo, com atribuição de origem

1. Não criar bloco compartilhado: o Otakulogia é o primeiro consumidor GraphQL e a regra do repositório exige pelo menos dois consumidores reais para extrair um bloco. `http` já cobre POST JSON e `stream-build` cobre a montagem.
2. O trecho portado do Prisma (queries, leitura de `items`/`seasons`/`episodes` e regra de identidade) leva no topo do arquivo o comentário `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`. Nenhum segredo, token ou URL de mídia é copiado.
3. Alternativas descartadas:
   1. Bloco `graphql` genérico: um consumidor só, sem padrão observado em provedores reais.
   2. Copiar a estrutura inteira do Prisma: traria cache, timeout e semântica de daemon incompatíveis com o contrato do app.

### D13. Publicação, perfil e testes

1. Manifest: `id` `otakulogia`, nome `Otakulogia`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `mp4`, `contentLanguage` `["pt"]`, `enabled: true` e logo `https://www.google.com/s2/favicons?domain=otakulogia.com&sz=128`.
2. `providers.md`: linha na tabela e seção `Otakulogia` com `🟠 Não verificado` e `—` até a rodada online; o bloco de verificação só é escrito por `--record`.
3. `test/online/profiles.json`: `otakulogia` com `exclusiveTag: "anime"` e revisão nova. O catálogo tem 5 filmes e 6 séries com a tag `anime`, acima do mínimo de cinco por tipo.
4. Fixtures: `test/fixtures/otakulogia/` com respostas sanitizadas de busca, detalhe de série com duas temporadas, detalhe de filme, ausência, `errors` GraphQL e corpo não JSON. Hosts de mídia viram `cdn.example`; nenhuma URL assinada, cookie, token ou mídia real é versionada.
5. Testes: `test/otakulogia.test.js` empacota com `buildProvider` e executa o pacote gerado com `fetch` simulado, cobrindo os casos do `proposal.md` e do `tasks.md`.
6. `docs/provider-investigation.md` ganha a seção 3.37, “GraphQL público de catálogo de animes”, com queries, variáveis, leitura, confirmação, fallback, limites e referências a `src/otakulogia/` e `test/otakulogia.test.js`.
7. `docs/arch.md` e `AGENTS.md` não mudam: nenhuma regra global, contrato ou convenção nova é adotada; o método GraphQL é específico desta fonte.

## Risks / Trade-offs

1. **Schema GraphQL não versionado** → cada campo lido é validado e a mudança de forma sobe como erro de estrutura; fixtures registram o contrato observado.
2. **Busca sem paginação e com `limit: 12`** → um termo genérico pode encher a janela com obras relacionadas. A amostra de `Naruto` devolveu `NARUTO Shippuuden` em primeiro lugar e 21 no total; os termos alternativos e romaji mitigam, mas títulos fora dos 12 primeiros não são encontrados.
3. **`episodeNumber` não é o número do episódio** → a sonda de 2026-11-16 viu o total da temporada repetido em todos os itens (32, 21, 61, 16 e 52). A seleção usa a numeração da URL; temporada sem numeração contígua começando em 1 é ausência. A fixture cobre `1.mp4`, `ep01.mp4`, lista fora de ordem e buraco.
4. **Campos FHD/SD** → na amostra de 2026-11-14 estavam vazios. A prioridade e o mapeamento de qualidade existem para quando a fonte preencher; sem preenchimento, a qualidade fica `Desconhecida`.
5. **Filmes em `Filme` ou em temporada de episódio único** → `AKIRA` foi observado em `Temporada 01 | Legendado` com um episódio; a linha `Filme` ainda não foi observada online. A seleção cobre os dois formatos, com ausência quando houver mais de uma temporada de episódio único.
6. **Cabeçalho de reprodução** → o MP4 pode exigir `Referer`; a decisão inicial é só `User-Agent`, com verificação mínima na implementação. Se o arquivo exigir `Referer`, o ajuste precisa de evidência e teste.
7. **Rate limit não documentado** → até oito buscas e três detalhes em paralelo podem ser limitados. Não há retentativa; 429 sobe como falha.
8. **Payload grande do detalhe** → uma série longa devolve centenas de episódios de todas as temporadas em uma resposta. O limite de três itens controla o fan-out, mas não o tamanho de cada resposta.
9. **Ano divergente ou ausente** → o ano do catálogo pode ser o de estreia da obra, não o da temporada pedida. A tolerância de um ano reduz falsos negativos; sem ano, a decisão fica só pelo título.
10. **Homônimos e traduções** → a igualdade normalizada exige que o título do TMDB bata com `name`/`nameEn`; uma tradução própria da fonte pode deixar o título sem correspondência. Ausência é preferível a escolher a obra errada.
11. **`audioType` combinado** → se a fonte publicar `DUB,LEG` no episódio, o token não será classificado e o idioma fica `Idioma Desconhecido` em vez de um palpite.
12. **URL de mídia efêmera ou indisponível** → o provedor devolve a URL publicada sem sonda; a rodada online comprova o contrato, não a reprodução no aparelho.

## Open Questions

1. Resolvida em 2026-11-18: a verificação mínima com `Range: bytes=0-63` no MP4 de Akira respondeu HTTP 206 e `video/mp4` com e sem `Referer`, então a reprodução continua somente com `User-Agent`. A URL não foi registrada.
2. Resolvida em 2026-11-16: `episodeNumber` não é por episódio; ele repete o total de episódios da temporada. A seleção passou a usar a numeração da URL. A fixture cobre o valor repetido e a lista fora de ordem.
3. `videoUrlFhd`/`videoUrlSd` chegam a ser preenchidos? A amostra não os viu; a suíte cobre o caso e a rodada online pode revelar o contrário.
4. O detalhe de filme publica `Filme` com `upstreamTid` e episódio correspondente em todos os títulos? `AKIRA` foi visto em temporada de episódio único; a linha `Filme` ainda não foi observada. A fixture e a rodada online respondem.
5. Há rate limit por IP? Não foi observado cabeçalho de cota; a implementação começa sem retentativa e sem paralelismo além do descrito.
6. O endpoint devolve `searchAnimes: null` em busca sem resultado ou sempre `items: []`? As duas formas são aceitas como ausência; a implementação registra a observada.

## Implementation Notes

1. A seção do método GraphQL entrou em `docs/provider-investigation.md` como 3.38, porque a 3.37 já pertence ao AnimesOnlineCC, arquivado em 2026-11-18, depois da proposta desta mudança.
2. `docs/tests.md` enumerava como exclusivos apenas Doramogo, Doramas Online, SeuDorama e NoveFlix, omitindo os provedores de anime já configurados em `test/online/profiles.json`; a enumeração foi substituída pela regra genérica, sem mudar o comportamento.
3. A rodada online de 2026-11-18T22:10:20.997Z, com o perfil `anime`, resolveu 2/5 filmes (Akira e A Viagem de Chihiro) e 2/5 séries (Jujutsu Kaisen e Demon Slayer), sem falha nem caso inconclusivo. O status ficou `🟢 Estável` em `providers.md`.

## Validation

1. `openspec validate adicionar-provedor-otakulogia --strict` passa com todos os artefatos.
2. `npm run lint`, `npm test` e `node build.js otakulogia` passam após a implementação; o build gera o arquivo base e as variantes `gdrive/` e `prism/`.
3. `node --test test/otakulogia.test.js` cobre os casos do `tasks.md` sem internet, com `fetch` simulado e fixtures sanitizadas.
4. `node --test test/manifest.test.js`, `node --test test/providers-catalog.test.js` e `node --test test/online-catalog.test.js` confirmam manifest, `providers.md` e o perfil `anime`.
5. `npm run test:online -- --provider otakulogia --record` roda com `TMDB_API_KEY` apenas no ambiente, usa o perfil `anime` e registra a rodada em `providers.md`; sem resultado em um tipo, o status e o motivo ficam explícitos e a mudança não é arquivada automaticamente.
6. A verificação de reprodução se limita a até duas requisições mínimas ao MP4, com e sem `Referer`, sem baixar mídia e sem registrar a URL; o resultado entra no design e não em fixture ou log público.
7. Nenhum artefato, fixture ou log contém URL de mídia real, cookie, token, segredo ou chave.
