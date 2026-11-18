# Design

## Context

Ver `proposal.md` para a motivação. Este documento registra as observações, as decisões e o que ainda depende da implementação.

1. O OverFlix roda na plataforma VideoBox, a mesma do Pobreflix HD. A busca, a lista de episódios e o `playerData` usam o mesmo `index.php` com `app=videobox&module=video&controller=...`; o catálogo, a rede e a política de domínio são diferentes.
2. A referência de implementação é o código publicado do Prisma Stream Addon (GPL-3.0): a fonte `f2` está em `prisma_sites.py` linhas 316-535 e as constantes `OVERFLIX_SEED`, `OVERFLIX_FALLBACK` e `OVERFLIX_TTL` em `prisma_core.py` linhas 59-61. Os resolvedores de hospedagem estão em `prisma_hosts.py`.
3. O Prisma não implementa busca para o OverFlix: ele resolve o título por um catálogo VOD pré-computado (`vod/movies.txt` e `vod/series.txt`) com opções `movie2=<slug>` e `serie3=<slug>`. A busca por `buscarContent` é a interface da plataforma VideoBox já usada pelo Pobreflix HD; para o OverFlix ela foi observada em 2026-11-14.
4. Reconhecimento de contrato feito em 2026-11-14, com 1 a 2 GETs por endpoint, sem gravar cookies, tokens ou URLs de mídia:
   1. `GET https://www.overflix.win` respondeu HTTP 200 com 74.782 bytes, marcação VideoBox, sem `domainAlertPayload` e sem redirecionamento.
   2. `buscarContent` na semente, com `q=duna&type=filmes`, respondeu HTTP 200 `application/json` com `{redirect, message}` para o host `www.overflix.center`, preservando a query.
   3. A mesma busca no host de destino respondeu `{html}` com 4 cartões `a.block`; os endereços seguem `/filmes/online/<slug>-<id>/`.
   4. A ficha de filme respondeu `data-tmdb-id="438631"` e `data-video-id="171"`; o `h1` é "Assistir Duna Online". `data-temp` e `data-ep` existem vazios.
   5. `playerData` do mesmo vídeo respondeu `players`, `servers_dub`, `servers_leg`, `is_episode`, `navigation` e `current_audio`. `players` trouxe Byse, DoodStream, MixDrop e Streamtape; as URLs de `players` apontam para `bysebuho.com`, `playmogo.com`, `mxdrop.click` e `streamtape.com`, ou seja, substituem as bases fixas em pelo menos um caso. `servers_dub` e `servers_leg` trouxeram os quatro mesmos rótulos separados por `&amp;`.
   6. A ficha da série `112263-dublado-30207` respondeu `<section class="vbEpisodes" data-current-season="1" data-current-audio="Dublado" data-video-id="30207" data-tmdb-id="64464">`, com `data-season` nos controles da seção e sem `vbAudioSelect`. O seletor `.vbEpisodes` é o contrato observado.
   7. `episodesList` com `id=30207&season=1&audio=Dublado` respondeu `{canEdit, episodes}` com 8 itens; `number` veio como texto; as chaves do item são `number`, `title`, `thumb`, `duration`, `synopsis` e `url`; o primeiro item não trouxe o prefixo `serie3=`.
   8. O embed do Byse com um identificador real respondeu HTTP 200 com 1.972 bytes, sem `.m3u8` e sem script empacotado. O resolvedor simples do Prisma (`_byse`) não teria mídia para devolver nessa amostra.
5. O Pobreflix HD já implementa localmente o que é reaproveitável como contrato: `src/pobreflixtv/site.js` (busca, confirmação por `data-tmdb-id`, `episodesList` e `playerData`), `src/pobreflixtv/hosts.js` (MixDrop, Streamtape e DoodStream) e `src/pobreflixtv/extractor.js` (isolamento por opção e erro agregado). A política de domínio, porém, é incompatível: o Pobreflix HD usa allowlist de bases e laço de aliases; o OverFlix muda de host sem lista fechada.
6. Restrições do runtime: `fetch`, `atob`, `URL`, `URLSearchParams`, `console` e `cheerio-without-node-native` com a API básica (`load`, seleção CSS, `eq`, `find`, `text`, `html`, `attr`). Sem `setTimeout`, sem APIs do Node, sem `TextDecoder` e sem timeout próprio. O app gerencia a espera.
7. O host do `playerData` e das páginas responde à primeira requisição; o redirecionamento de domínio aparece como JSON na busca. Isso torna o tratamento de `{redirect}` obrigatório para o funcionamento atual, mesmo quando a descoberta pela semente não encontra nada.
8. As consultas acima são reconhecimento de contrato, não a rodada online. A aprovação de funcionamento exige `npm run test:online -- --provider overflix` sobre o pacote final, com `TMDB_API_KEY` apenas no ambiente.
9. Sondagem de viabilidade de 2026-11-16, sem registrar cookies, tokens ou URLs de mídia:
    1. A home redirecionou para `www.overflix.center`. A busca `type=filmes` por `vingadores` devolveu 18 cartões e a busca por `matrix` devolveu 10; `type=series` por `breaking bad` devolveu 4 cartões e 2 fichas de série, confirmando a busca de série.
    2. A busca por `duna` não devolveu cartão neste host. Isso é ausência de catálogo para o termo, não falha da busca; o título usado antes estava no host anterior.
    3. A ficha `vingadores-era-de-ultron-dublado-70` respondeu `data-tmdb-id="99861"` e `data-video-id="70"`.
    4. O `playerData` devolveu `players` e as duas listas de servidores. MixDrop entregou MP4 com HTTP 206, `video/mp4` e assinatura `ftyp`, tanto em dublado quanto em legendado. Streamtape veio com identificador `hide` e respondeu 404; DoodStream respondeu 403; Byse seguiu sem mídia extraível.
    5. A série `breaking-bad-dublado-3424` respondeu `episodesList` com 7 episódios na temporada 1, `number` em texto; o episódio 1 apontou para `/episodios/online/breaking-bad-1x1-dublado-3425/`, o `playerData` do episódio devolveu MixDrop e o MP4 respondeu 206 com `ftyp`.
    6. Conclusão: a fonte é viável pelo MixDrop em filme e série. Streamtape e DoodStream continuam implementados como opções, mas a amostra não os confirmou; o Byse é triagem.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e episódio no catálogo OverFlix com confirmação pelo ID do TMDB, sem busca por ID inexistente e sem escolher o primeiro resultado parecido.
2. Acompanhar a troca de domínio a cada chamada, sem cache, sem estado entre chamadas e sem serviço intermediário.
3. Ler o `playerData` e devolver as opções MP4 dubladas e legendadas das três hospedagens comprovadas, com qualidade `Desconhecida` quando a fonte não declarar resolução.
4. Distinguir ausência de falha: título não encontrado, ambiguidade, episódio ausente e ficha sem servidor são lista vazia; rede, layout e contrato quebrado sobem para `getStreams`.
5. Manter o provedor isolado, sem alterar o Pobreflix HD e sem criar bloco novo.

**Non-Goals:**

1. Portar o cache de 6 h, o timeout de 8 s, o aquecimento paralelo ou o catálogo VOD pré-computado do Prisma.
2. Resolver o Byse, acrescentar um quarto resolvedor de hospedagem ou prometer HLS nesta versão.
3. Sondar mídia, baixar playlist, medir resolução ou validar reprodução.
4. Implementar login, VIP, assinatura, bypass, captcha ou qualquer contorno de bloqueio.
5. Extrair um bloco `videobox` ou `video-hosts` nesta mudança.
6. Criar settings, chave própria ou dependência nova.

## Decisions

### D1. Cliente VideoBox próprio em `src/overflix/` (opção A)

1. Criar `src/overflix/index.js` (fronteira do contrato), `extractor.js` (orquestração e streams), `domain.js` (descoberta do host), `site.js` (busca, ficha, episódios e `playerData`) e `hosts.js` (MixDrop, Streamtape e DoodStream).
2. A escolha é a opção A porque só o formato dos endpoints é comum. As diferenças são de contrato: descoberta de domínio sem allowlist, aceitação de um `{redirect}` de busca que troca o host, seleção de áudio pela ficha da série, bases padrão de hospedagem e triagem do Byse. Um bloco `videobox` precisaria de opções para cada diferença e tocaria o Pobreflix HD (publicado e estável), seus testes e suas fixtures.
3. A cópia dos três resolvedores de hospedagem é consciente e limitada; eles mantêm o mesmo contrato de `src/pobreflixtv/hosts.js` e recebem comentário de origem. A extração de um bloco `video-hosts` fica registrada como candidata a uma mudança própria, com os dois provedores revalidados, quando houver um terceiro consumidor ou quando os contratos se estabilizarem.
4. Alternativas descartadas:
   1. Opção B, bloco `videobox` usado pelos dois provedores: abstração especulativa para contratos que divergem, mudança maior e revalidação do Pobreflix HD.
   2. Opção C, OverFlix como catálogo do Pobreflix HD: mistura catálogos e redes diferentes, além de permitir que a ausência em um catálogo esconda a presença no outro.
   3. Importar `../pobreflixtv/site.js` diretamente: acoplaria dois provedores e aplicaria ao OverFlix a allowlist e o laço de aliases do Pobreflix, que não valem para a fonte.

### D2. Descoberta do domínio por chamada, sem cache

1. No início de `extractStreams`, fazer `fetchPage('https://www.overflix.win', { profile: 'page' })`.
2. Se `response.url` tiver host diferente da semente, usar esse host. Aceitar somente HTTPS e host não vazio.
3. Sem redirecionamento, ler `window.domainAlertPayload` com `extractScriptString`. Decodificar o Base64, interpretar o JSON, ler `baseUrl` e decodificar o Base64 outra vez. Se `baseUrl` já começar por `http(s)://`, usá-lo como veio, sem segunda decodificação. Extrair o host da URL e exigir HTTPS.
4. Qualquer falha na descoberta (rede, HTTP fora de 2xx, Base64 inválido, JSON inválido, host vazio ou HTTP) cai no fallback `www.overflix.download`. A descoberta nunca lança: ela sempre devolve um host.
5. O host escolhido vale para todas as requisições daquela chamada. Não há cache de módulo, TTL, `kickoff` ou segunda descoberta no meio do fluxo.
6. Alternativas descartadas:
   1. Portar o TTL de 6 h: o plugin roda no aparelho, o app chama `getStreams` por pedido e um host guardado pode apontar para um domínio morto sem nova evidência.
   2. Usar o fallback como primeira opção: hoje o domínio observado é outro; a semente e o redirecionamento são os sinais públicos da fonte.
   3. Consultar um serviço de encurtador ou de status de domínio: dependência externa sem necessidade.
7. A semente não redirecionou e não publicou o payload em 2026-11-14; o caminho que funcionou foi o `{redirect}` da busca. O payload é implementado pelo contrato publicado do Prisma e coberto por fixture, mas sua disponibilidade atual é uma questão em aberto.

### D3. Requisições AJAX e um único redirecionamento JSON

1. Toda requisição ao VideoBox usa `fetchJson` com perfil `api`: `X-Requested-With: XMLHttpRequest`, `Accept` de JSON, `User-Agent` e `Accept-Language` do bloco `http`. O `Referer` é a página correspondente: a raiz do host na busca, a ficha do filme, a página da série em `episodesList` ou a URL do episódio publicada na lista em `playerData`.
2. Se a resposta for um objeto com `redirect` em texto, validar HTTPS, pedir o endereço indicado uma única vez e adotar o host de destino para as requisições seguintes. Se a segunda resposta também trouxer `redirect`, lançar erro de cascata; não seguir uma terceira.
3. Na busca, a resposta precisa ser um objeto com `html` em texto. `html: ''` significa zero resultados para aquele termo e o próximo termo é tentado. Objeto sem `html`, JSON inválido ou HTTP fora de 2xx são erro.
4. Alternativas descartadas:
   1. Ignorar `redirect`: a busca na semente devolveu exatamente esse envelope e não chegou ao catálogo.
   2. Seguir redirecionamentos sem limite: permite cascata e mistura de catálogos.
   3. Restringir a uma allowlist fixa: o OverFlix muda de domínio sem lista pública estável; a allowlist bloquearia a troca legítima.
5. O redirecionamento é aceito como parte do protocolo da fonte, mas não é usado para trocar de catálogo depois de uma ausência válida: a troca só acontece em resposta a um `redirect` explícito.

### D4. Hospedagens e formatos: MP4 nas três comprovadas, Byse em triagem

1. Bases padrão: `mixdrop` → `https://mixdrop.top/e/`, `streamtape` → `https://streamtape.com/e/`, `doodstream` → `https://playmogo.com/e/`, `byse` → `https://bysebuho.com/e/`. Cada item de `players` com rótulo e URL HTTPS substitui ou acrescenta a base do rótulo normalizado.
2. Resolvedores portados do Pobreflix HD, com o mesmo contrato observado: MixDrop (`unpackPacker` + `MDCore.wurl`), Streamtape (`robotlink`) e DoodStream (`pass_md5`, token e `expiry`). Todos devolvem `{ url, headers }` com `User-Agent` e o `Referer` que o host espera. Na sondagem de 2026-11-16, só o MixDrop entregou mídia; Streamtape veio com `hide` (404) e DoodStream respondeu 403, então as duas opções continuam implementadas, mas a cobertura prática é do MixDrop.
3. O Byse é triagem, não falha: o embed observado em 2026-11-14 não publicou `.m3u8` nem script empacotado. O resolvedor simples do Prisma também não teria mídia. Host novo em `players` sem resolvedor segue a mesma regra.
4. O manifest declara `formats: ["mp4"]`. As opções resolvidas entregam MP4; a amostra confirmou o MixDrop e não confirmou Streamtape/DoodStream. Declarar `m3u8` sem um resolvedor de HLS seria uma promessa sem entrega.
5. Alternativa descartada: manter `["mp4", "m3u8"]` e portar o `_byse` do Prisma. O embed não respondeu ao método, e uma cadeia nova exigiria fixture, teste e evidência própria. Se a rodada online mostrar HLS em outro host, uma mudança seguinte revisa `formats` com evidência.
6. Não há sonda de mídia nem requisição para descobrir qualidade. O selo "HD" do cartão não comprova 720p; a qualidade sai de `qualityHints`, do arquivo ou da URL quando existir, senão `Desconhecida`.

### D5. Busca, identidade e ambiguidade

1. Montar os termos com `media.title`, `media.originalTitle` e `media.alternativeTitles`, sem repetir (comparação sem diferenciar maiúsculas). Usar `URLSearchParams` para a query e `type=filmes` ou `type=series`.
2. Ler `html` com cheerio básico: `a.block`, `href`, `h3`, ano em `.info p` e, quando esse texto vier vazio, em `p`. Aceitar somente `href` cujo caminho contenha `/filmes/online/` ou `/series/online/`, conforme o tipo.
3. Ano: extrair o primeiro ano de quatro dígitos do texto de `.info p`/`p`; quando o TMDB e o cartão tiverem ano, exigir igualdade. Título: `titleSimilarity` contra título PT-BR, original e alternativos, com limiar 0,85, como no Pobreflix HD. Ordenar por nota e abrir no máximo três fichas por termo.
4. Confirmar a ficha somente quando `data-tmdb-id` for igual ao ID pedido. Ficha sem o marcador é erro de estrutura, porque o marcador é o contrato de identidade observado; ficha com outro ID é candidato descartado.
5. Mais de uma ficha confirmada no mesmo termo é ausência por ambiguidade, com lista vazia. Nenhum candidato em nenhum termo é ausência simples. Não escolher o primeiro por posição.
6. Alternativas descartadas:
   1. `findBestMatch` sozinho: devolve um candidato e não permite detectar duas fichas com o mesmo TMDB.
   2. Confirmar só por título e ano: homônimos e remakes escapam; o `data-tmdb-id` está disponível.
   3. Buscar pelo ID do TMDB: o VideoBox busca por texto; o ID não é aceito como termo.

### D6. Série: `vbEpisodes`, áudio e `episodesList`

1. Na ficha de série, ler a seção `vbEpisodes`: `data-video-id` (ID da série), todos os `data-season` e `data-current-audio`.
2. Se `.vbAudioSelect` existir e oferecer uma opção com "Dublado", preferir `Dublado`; senão usar `data-current-audio`. Sem `data-current-audio` e sem opção no seletor, lançar erro de estrutura; não inventar `Dublado`.
3. Se a lista de temporadas não estiver vazia e a temporada pedida não estiver nela, devolver ausência sem consultar `episodesList`.
4. Consultar `episodesList` com `id`, `season` e `audio`. Exigir `episodes` como lista; comparar `number` como inteiro (a API devolve texto) e escolher a coordenada exata. Episódio ausente é ausência.
5. Remover o prefixo `serie3=` do `url` quando existir, resolver o endereço contra o host e extrair o ID do vídeo do número final do endereço. Não abrir a página do episódio: a lista já está limitada pela série, temporada e número, e uma requisição extra não acrescenta identidade confirmada. Uma ficha confirmada sem `data-video-id` nem número final é erro de estrutura, não ausência; "página sem player" no sentido de ausência é a ficha cujo `playerData` não anuncia nenhum servidor (D7.5).
6. Alternativas descartadas:
   1. Abrir a página do episódio e conferir `data-tmdb-id`/`data-temp`/`data-ep` como o Pobreflix HD faz: mais uma requisição por episódio; a lista já está limitada pela série, temporada e número.
   2. Tentar Dublado e depois Legendado quando o episódio não aparece: dobra a consulta em toda ausência. O `playerData` observado devolve as duas listas de servidores no mesmo vídeo.
   3. Escolher pela posição na lista: a numeração pode começar em outro valor ou ter buracos.

### D7. `playerData`, bases e opções

1. Consultar `playerData` com `id=<videoId>` e `Referer` da ficha do filme ou da URL do episódio publicada por `episodesList`. Exigir um objeto; `players` pode faltar e, nesse caso, valem só as bases padrão. Se `players` existir e não for lista, lançar erro de contrato; `servers_dub` e `servers_leg` ausentes ou nulos valem como vazios, e número, objeto ou lista lançam erro.
2. Normalizar o rótulo de `players` em minúsculas e sem caracteres não alfanuméricos; exigir URL `https://`; usar `label` (ou `name`, quando existir) como nome de exibição.
3. Decodificar `&amp;` e separar `servers_dub`/`servers_leg` manualmente por `&` e pelo primeiro `=`. Não usar `URLSearchParams` para os identificadores: o polyfill dos apps não é iterável e normaliza a codificação, enquanto o identificador do arquivo é opaco e deve chegar ao host como veio.
4. Montar `base + fileId`, com uma barra entre os dois quando a base não terminar em `/`. Cada par vira uma opção com `language` `Dublado` (de `servers_dub`) ou `Legendado` (de `servers_leg`).
5. Rótulo de servidor sem base ou sem resolvedor é triagem silenciosa. `servers_dub` e `servers_leg` vazios (ou ausentes) são ausência; não é erro.
6. O idioma vem do nome do campo, não do host nem do identificador. Se a fonte trocar os campos, a classificação acompanha a fonte; isso é uma limitação registrada, não uma inferência local.

### D8. Montagem dos streams

1. Para cada opção resolvida, montar um `buildStream` com `url`, `language` do campo, `provider` do nome do host, `type: 'mp4'`, `headers` do resolvedor e `format` com `FORMATTER.AUTO`, `addon: 'OverFlix'`, `title`, `year` quando existir e `season`/`episode` em série. Não passar `name` nem o `title` do stream; o `title` citado acima é o campo de `format`.
2. Não preencher `quality` com o selo "HD" do cartão. Deixar `buildStream` descobrir em `qualityHints`, no arquivo, na pasta e na URL; sem correspondência, `Desconhecida`.
3. Deduplicar por `url|language`, mantendo a primeira ocorrência. A mesma URL em dublado e legendado permanece como dois streams; a mesma URL e o mesmo idioma viram um.
4. Ordenar no ponto de entrada com `sortByQuality`.
5. Não preencher `size`, `seeders`, `peers` nem `subtitles`: a fonte não os fornece no `playerData` observado. Se um host publicar legenda ou tamanho em outra resposta, isso exige evidência e mudança própria.
6. Alternativas descartadas:
   1. Devolver uma playlist master por qualidade: não há HLS no escopo e o master deve ser devolvido inteiro quando existir, nunca fragmentado.
   2. Usar `current_audio` para classificar todos os streams: ele descreve a ficha, não cada servidor.
   3. Ordenar por host ou por tamanho: não há tamanho e a ordem de qualidade é a do contrato.

### D9. Fronteira de erro, avisos e ausência

1. Validar `tmdbId` numérico, `mediaType` `movie`/`tv`, `season`/`episode` inteiros a partir de 1 em série e `TMDB_API_KEY` antes de qualquer requisição. Chamar `getMediaInfo` antes da fonte.
2. Busca, ficha, lista de episódios e `playerData` são etapas fatais: a falha sobe com mensagem clara. A descoberta tem fallback e nunca lança.
3. Cada servidor é uma opção independente. A falha descarta só aquela opção, com `console.warn('[OverFlix] Opção <host> (<idioma>) descartada: <causa>')`. Se nenhuma opção produzir stream e alguma tiver falhado, lançar um erro agregado com a causa de cada uma. Se todas forem triagem, devolver lista vazia sem aviso.
4. `getStreams` é o único ponto de captura: registra `console.error('[OverFlix] Falha em <tipo> <id>: <causa>')` e devolve `[]`.
5. Sanitizar mensagens antes de logar: remover a chave do TMDB, remover a query de URLs HTTP(S) e redigir os valores de `token=`, `expires=`, `key=`, `sig=` e `md5=`. O DoodStream monta a URL final com token e `expiry`; nenhum dos dois pode aparecer em log.
6. Não há timeout, retentativa por lentidão, cache de host ou cache de mídia. A falha de um host não aciona outro host; a troca de host só acontece por `redirect` explícito da fonte.
7. Alternativas descartadas:
   1. Capturar erro em cada módulo: espalha log e esconde a causa; o contrato quer um único ponto.
   2. Tratar `playerData` vazio como erro: ficha confirmada sem servidor anunciado é ausência reconhecida.
   3. Repetir a busca em outro host depois de uma falha: mascararia a falha e misturaria catálogos.

### D10. Testes, manifest e documentação

1. `test/fixtures/overflix/` guarda respostas reais sanitizadas: home sem payload, home com payload (quando observável) e payload montado a partir do contrato do Prisma, busca de filme, ficha de filme, ficha de série com `vbEpisodes`, `episodesList` dublado e legendado, `playerData` com `players` e as duas listas de servidores, e os embeds de MixDrop, Streamtape e DoodStream com identificadores sintéticos. Nenhuma fixture contém cookie, token, URL assinada ou mídia real.
2. `test/overflix.test.js` empacota o provedor com `buildProvider` nos formatos publicados e executa o pacote com `fetch` simulado, cobrindo os casos do item 2 da seção de validação.
3. Manifest: `id` `overflix`, nome `OverFlix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, descrição "Filmes e séries em MP4 do catálogo OverFlix (VideoBox), dublados e legendados conforme os servidores anunciados, com descoberta automática do domínio vigente." e logo `https://www.google.com/s2/favicons?domain=overflix.win&sz=128`. A logo é identificação visual e não participa da descoberta.
4. `providers.md` ganha a linha e a seção `OverFlix` com status `🟠 Não verificado` e data `—`; o perfil é generalista e `test/online/profiles.json` não muda.
5. `docs/provider-investigation.md` §3.10 ganha uma variação sobre descoberta por `domainAlertPayload` e uma referência ao cliente VideoBox em `src/overflix/`, com os limites: nome do payload, Base64 duplo, fallback, redirect de busca, ausência de cache e Byse fora.
6. Nenhum bloco novo e nenhuma alteração em `src/_blocks/index.md`, `README.md` ou `docs/arch.md`: as regras globais e o catálogo de blocos não mudam.
7. As referências de código portado levam o comentário de origem no topo do trecho, incluindo `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)` e a referência ao arquivo local do Pobreflix quando for o caso.

## Risks / Trade-offs

1. **Domínio muda com frequência e a semente pode ficar só na home** → a busca segue um `{redirect}` e adota o host; o fallback cobre a descoberta; a rodada online mede o caminho real. O risco residual é a semente e o fallback caírem juntos.
2. **`domainAlertPayload` pode mudar de nome ou de codificação** → a leitura usa `extractScriptString`, normaliza Base64 URL-safe e aceita `baseUrl` simples ou duplo; qualquer falha cai no fallback. O payload não foi observado hoje, então a fixture cobre o contrato publicado, não uma resposta atual.
3. **`buscarContent` pode exigir `X-Requested-With` ou bloquear IP de datacenter** → o perfil `api` já envia o cabeçalho; HTTP fora de 2xx e HTML de desafio viram erro, não ausência. A rodada online é a evidência.
4. **A busca de séries (`type=series`) não foi observada** → o caminho esperado `/series/online/` vem da ficha de série e do Pobreflix HD; a implementação captura a fixture e confirma o caminho. Se o cartão usar outro caminho, só a constante de triagem muda.
5. **`data-tmdb-id` pode faltar em fichas antigas** → ficha sem o marcador vira erro de estrutura; o provedor não confirma por título e ano para não aceitar homônimo. A rodada online mostra a cobertura.
6. **`servers_dub`/`servers_leg` podem vir trocados ou parciais** → o idioma segue o nome do campo, sem inferência; se a fonte trocar, a classificação acompanha a fonte. Não há como provar o áudio do arquivo sem sonda.
7. **Novo host em `players` sem resolvedor** → triagem; a cobertura por título cai. O Byse já é o caso conhecido e responde por cerca de uma das quatro opções observadas.
8. **Byse fora do escopo** → a decisão evita prometer HLS sem cadeia comprovada; títulos com mídia só no Byse ficam sem stream. Uma mudança futura pode adicionar o resolvedor com fixture e evidência.
9. **DoodStream monta URL com token e `expiry`** → resolvida a cada pedido, sem cache, fixture ou log. A validade curta é da fonte; o app busca a mídia na hora.
10. **Seleção de áudio da série** → a lista usa o áudio declarado na ficha; um episódio publicado só no outro áudio fica ausente. A alternativa de tentar os dois áudios acrescenta requisição em toda ausência e fica para evidência online.
11. **Logo presa a `overflix.win`** → é só identificação visual; o favicon do Google responde mesmo quando o domínio do catálogo muda. Não afeta a descoberta.
12. **Evidência** → o reconhecimento de 2026-11-14 não substitui a rodada online; ele só confirma o contrato usado no desenho.

## Migration Plan

1. Criar `src/overflix/index.js`, `extractor.js`, `domain.js`, `site.js` e `hosts.js` a partir de `src/_template/` e dos contratos de `src/pobreflixtv/`, com os comentários de origem.
2. Adicionar a entrada `overflix` ao `manifest.json` e rodar `node build.js overflix`.
3. Capturar as fixtures sanitizadas e escrever `test/overflix.test.js`.
4. Adicionar a linha e a seção em `providers.md` e a variação em `docs/provider-investigation.md`.
5. Rodar `npm run lint`, `npm test` e `node build.js overflix`.
6. Executar `npm run test:online -- --provider overflix --record` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada em `providers.md`; sem ela, o status permanece `🟠 Não verificado`.
7. Arquivar somente com os casos de teste previstos passando ou com as exclusões declaradas.
8. Rollback: remover a entrada do manifest, `src/overflix/`, o teste, as fixtures, os arquivos gerados e a seção de `providers.md`; nenhum dado persistente é migrado.

## Open Questions

1. Resolvida em 2026-11-16: a busca `type=series` devolveu cartões e fichas `/series/online/`; a fixture ainda confirma o seletor de ano e o cartão de série.
2. O `domainAlertPayload` ainda existe quando a semente está fora do ar? Hoje a semente respondeu 200 sem payload; o fallback e o redirect de busca cobrem o caminho observado, mas o payload só será comprovado com uma resposta real.
3. `www.overflix.download` ainda responde? Não foi consultado nesta rodada para respeitar o limite de requisições; a implementação confirma na rodada online.
4. Vale a pena tentar o outro áudio quando o episódio não aparece na lista? A decisão atual segue o Prisma e evita uma requisição extra em toda ausência; a rodada online pode mostrar episódios publicados em um só áudio.
5. O Byse pode ser resolvido por uma cadeia HLS estável? O embed observado não publicou mídia; fica para uma mudança própria com fixture e evidência.

## Validation

1. `npm run lint` deve passar sem desativar regras; `src/overflix/` não pode usar APIs do Node, `axios`, `setTimeout` ou `TextDecoder`.
2. `node --test test/overflix.test.js` deve cobrir, sem internet:
   1. descoberta por redirect da semente para outro host;
   2. descoberta por payload Base64 com `baseUrl` codificado (dupla decodificação);
   3. descoberta por payload com `baseUrl` já em HTTP(S) (decodificação simples);
   4. fallback quando a semente falha ou o payload é inválido;
   5. busca com um cartão confirmado, com ambiguidade (duas fichas com o mesmo TMDB) e vazia;
   6. ficha com `data-tmdb-id` divergente ou ausente;
   7. filme resolvido por `data-video-id` e por sufixo numérico do endereço;
   8. série com `vbEpisodes`, `data-season`, áudio e `episodesList` com `number` em texto;
   9. episódio ausente na temporada e temporada não listada;
   10. `playerData` com `players` sobrescrevendo a base padrão do MixDrop;
   11. opções dublada e legendada;
   12. um host falhando e outro funcionando, com `console.warn` só da opção descartada;
   13. todos os hosts falhando, com erro agregado e `[]` na fronteira;
   14. ficha confirmada sem servidor anunciado, com lista vazia;
   15. HTTP 503, JSON inválido, `playerData` que não é objeto e `players` de tipo inválido como erro, não ausência;
   16. entrada inválida e `TMDB_API_KEY` ausente sem requisição;
   17. logs sem chave, token, `expires` ou query de URL.
3. `node build.js overflix` deve gerar o arquivo base e as variantes `gdrive/` e `prism/`, e os `<formato>/manifest.json` devem listar a entrada.
4. `npm test` deve passar com as suítes de manifest, catálogo de provedores, blocos e provedores existentes.
5. `npm run test:online -- --provider overflix --record` deve rodar sobre o pacote final, com `TMDB_API_KEY` só no ambiente e sem gravar mídia; o resultado e a data vão para `providers.md`.
6. O reconhecimento de 2026-11-14 registrado no Contexto comprova `buscarContent`, `data-tmdb-id`, `data-video-id`, `playerData` e `episodesList` no nível do contrato. Ele não comprova reprodução, não mede cobertura do catálogo e não substitui a rodada online.
7. A sondagem de 2026-11-16 confirmou busca de filme e de série, ficha, `playerData` e MixDrop com MP4 206; ela comprova o caminho principal, mas não a cobertura de todos os títulos nem a reprodução no aparelho.
8. **Resultado em 2026-11-18.** `npm run lint` passou sem desativar regras; `node --test test/overflix.test.js` passou com 38 testes offline; `npm test` passou com 1.608 testes; `node build.js overflix` gerou os três pacotes e os manifests de formato. A rodada online `2026-11-18T21-24-00-592Z-overflix-a10ae1ba-f7de` resolveu 4/5 filmes e 3/5 séries e registrou o status 🟢 Estável: o MixDrop entregou dublado e legendado nos títulos resolvidos, o Streamtape respondeu 404 e o DoodStream 403 nas opções da amostra. Ficaram fora a reprodução no aparelho, o Byse sem resolvedor e os títulos sem resultado na busca da fonte (A Vilã, A Favorita e A Usurpadora); a busca de série foi observada na sondagem e na rodada, ao contrário do reconhecimento inicial.
