# Design

## Context

Ver `proposal.md` para a motivação. A evidência principal do método é o código publicado do Prisma; as observações abaixo, feitas em 14/11/2026 contra `https://animesonlinecc.to/`, confirmam a existência da busca e a estrutura das páginas, mas não comprovam o funcionamento do pacote. A prova de funcionamento é a rodada online da tarefa 7. Nenhuma observação registrou cookies, tokens, URLs assinadas ou mídia real.

1. O site é WordPress com tema DooPlay e catálogo somente de animes: as rotas públicas são `/anime/<slug>/`, `/episodio/<slug>/`, `/genero/<genero>/` e a busca por formulário `GET /?s=<termo>`. Não foi observada rota `/filme/`.
2. `GET /` respondeu 200 e listou animes, episódios recentes, populares e a lista por letra. Não há seção de filmes.
3. `GET /?s=Naruto` respondeu 200 com três cartões: "Boruto: Naruto Next Generations", "Naruto Shippuden" e "Naruto Clássico Dublado". `GET /?s=Demon+Slayer` respondeu 200 com um único cartão, "Berserk", sem relação com a consulta. A busca existe, mas pode devolver resultado alheio ao termo; a confirmação na ficha é obrigatória.
4. A estrutura HTML dos cartões da busca não foi inspecionada nesta rodada (a leitura foi em texto). O seletor exato é a única pendência da investigação e será confirmado com a fixture capturada na implementação.
5. `GET /anime/naruto-shippuden/` respondeu 200 com `div.sheader h1` "Naruto Shippuden Todos os Episodios Online", `span.date` "2007", `div.se-c` com `span.se-t` "1" e `ul.episodios` com `div.numerando` "Ep - 1" e `div.episodiotitle a` apontando para `/episodio/naruto-shippuden-episodio-1/`. Nessa amostra todos os episódios ficam na temporada 1, com numeração contínua, e nenhum `href` contém `temporada-`.
6. `GET /episodio/naruto-shippuden-episodio-1/` respondeu 200 com `#playex` e dois blocos `div#option-1` e `div#option-2`; cada bloco contém um `iframe[src]` para `https://www.blogger.com/video.g` com um token na query. Os rótulos estão em `ul.idTabs a[href="#option-1"]` ("Dublado") e `a[href="#option-2"]` ("Legendado"). O `div` em si não traz `src` nesta amostra, ao contrário da expressão regular do Prisma.
7. A página `/anime/<slug>/` não publica `option-*`; o fallback do Prisma para ela existe, mas nesta amostra a página só lista temporadas e episódios.
8. As cinco requisições acima responderam 200 no ambiente do agente, sem cookie. Não foi possível determinar se o IP de saída é residencial ou de datacenter; o Prisma registra que a fonte responde 403 a IP de datacenter, como o RedeToons. O risco de WAF permanece e só a rodada online do pacote final pode medi-lo.
9. Código publicado do Prisma: `ANIMESONLINECC_BASE = 'https://animesonlinecc.to'` e `ANIMESONLINECC_TIMEOUT = 6.0` em `prisma_core.py`; `aocc_find_movie` devolve `[]`; `_aocc_resolve_page` lê `src` de `<div id="option-X" src="...">` e resolve os embeds; `_aocc_resolve_episode` tenta `/episodio/<slug>-temporada-<season>-episodio-<episode>/` e, sem candidatos, `/anime/<slug>/`; `resolve_embeds` limita a seis embeds e resolve MixDrop, Streamtape, Dood e Byse.
10. O `slug` do Prisma vem da base XML do addon (`animes3=`), não do TMDB. Nós recebemos TMDB; a busca e a confirmação de identidade são a parte nova do fluxo.
11. Só o Blogger foi observado como host nesta amostra. MixDrop, Streamtape, Dood e Byse vêm do código compartilhado do Prisma, não de uma observação própria nesta fonte; entram como suporte previsto, com o limite declarado.
12. O código publicado do Prisma é GPL-3.0, compatível com este repositório. O trecho portado do Prisma levará `Origem: codeberg.org/prismastream/install, prisma_sites.py (GPL-3.0)`; o de hosts, `Origem: codeberg.org/prismastream/install, prisma_hosts.py (GPL-3.0)`, e os adaptadores aproveitados de `src/pobreflixtv/hosts.js` serão identificados no topo do arquivo.
13. Sondagem de viabilidade de 2026-11-16, sem registrar tokens ou URLs de mídia:
    1. `GET /?s=Naruto` devolveu 3 elementos `article` com links `/anime/`; `div.result-item` e `div.search-page` não apareceram. O leitor de cartões pode usar `article a[href*="/anime/"]` como seletor observado, com a fixture confirmando título e ano.
    2. A página do episódio de Naruto Shippuden publicou dois `div#option-*`, cada um com um `iframe` do Blogger; o `div` não tinha `src`.
    3. O bloco `blogger-video` extraiu dois formatos do primeiro iframe (144p e 360p); o MP4 de 360p respondeu HTTP 206, `video/mp4`, com assinatura `ftyp`.
    4. O segundo iframe (legendado) não publicou `streamingData`; é falha isolada da opção, não da fonte.
    5. Conclusão: a fonte é viável pela opção Blogger dublada. MixDrop, Streamtape, Dood e Byse continuam sem observação própria nesta fonte; a implementação os mantém como opções isoladas e a rodada online mede a cobertura.

## Goals / Non-Goals

**Goals:**

1. Localizar séries de anime pelo ID do TMDB, sem depender de slug externo, e confirmar título e ano na ficha.
2. Selecionar temporada e episódio pela estrutura publicada e pelo `href` da fonte, nunca por posição.
3. Ler as opções `option-*` nas duas formas observadas e resolver cada host em isolamento.
4. Devolver streams com qualidade, idioma, tipo, provedor e formato coerentes com a fonte.
5. Distinguir ausência reconhecida, triagem e falha, com testes offline determinísticos e sem dados efêmeros.
6. Manter o provedor cirúrgico: blocos existentes, adaptadores locais e nenhum novo serviço ou chave.

**Non-Goals:**

1. Atender filmes ou fichas de filme; a extração de filme não foi confirmada na fonte e o Prisma não a implementa.
2. Mapear temporadas do TMDB para páginas de arco/título próprio (por exemplo, "Nanatsu no Taizai: Kamigami no Gekirin") na primeira versão.
3. Mapear temporada por posição, numeração absoluta ou soma de episódios.
4. Contornar WAF, Cloudflare, captcha ou bloqueio por IP; não há bypass, proxy ou conta.
5. Criar bloco compartilhado novo, refatorar `pobreflixtv` ou extrair um resolvedor universal de hosts.
6. Sondar mídia, baixar playlist, medir resolução ou guardar URL assinada/token em fixture, cache, relatório ou log.
7. Implementar login, downloads, legendas externas, favoritos ou qualquer recurso de conta do site.
8. Impor timeout, retentativa ou espera própria; o app gerencia o tempo.

## Decisions

### D1. Escopo somente `tv`

1. `supportedTypes` será `["tv"]`. O Prisma devolve `[]` em `aocc_find_movie`, e a extração observada é a de episódio em `/episodio/<slug>/` com fallback para `/anime/<slug>/`. A home lista animes e também títulos que são filmes (por exemplo, "Dragon Ball Super: Beerus"), mas não foi verificada uma página de filme com player; a rota observada continua sendo `/anime/<slug>/`.
2. `getStreams` validará `tmdbId` numérico e `mediaType`; `movie` devolve lista vazia sem requisição, como ausência por escopo, e `mediaType` fora de `movie`/`tv` lança erro antes de qualquer acesso à fonte.
3. Alternativas descartadas:
   1. Incluir `movie` e usar a mesma busca e a rota `/anime/<slug>/`: a home sugere que filmes de anime existem no catálogo, mas não há evidência de player na ficha de filme nem de extração no Prisma; prometer `movie` sem essa prova geraria ausência e falsos positivos.
   2. Incluir `movie` só quando o TMDB classificar `kind` como anime: a classificação não prova que a fonte publica o filme nem que a página tem `option-*`.
4. Um filme de anime no TMDB (`mediaType` `movie`) fica fora do provedor até haver evidência de rota e extração próprias. Se a implementação encontrar uma ficha de filme com `option-*` na mesma rota, isso vira uma mudança posterior com teste e evidência, não um default.

### D2. Identidade por busca HTML e confirmação na ficha

1. O fluxo será `getMediaInfo` → variantes de título → `GET /?s=<termo>` → cartões → até quatro fichas `/anime/<slug>/` no total → confirmação por `h1` limpo e `span.date`.
2. As variantes serão o título PT-BR, o original, os alternativos brasileiros e os romaji/romanizados, deduplicadas por `normalizeText`, na ordem de `animesonlineblue` e `anitube`. O romaji é essencial: a fonte publica "Darling in the Franxx", "Hunter x Hunter 2011" e outros títulos pelo nome original/romanizado.
3. O `h1` da ficha será limpo de sufixos de catálogo ("Todos os Episodios Online", "Todos os Episódios Online", "Anime Completo", "Dublado", "Legendado", "Clássico", "Classic", "Online") antes da comparação. O ano de `span.date` entra com tolerância de um ano. Sem `h1` ou sem `span.date` em uma ficha 200, o provedor lança erro de estrutura; ficha 404 é candidato removido e é pulada.
4. A escolha usa `findBestMatch` com score mínimo 0,85 e tolerância de um ano, com os romaji acrescentados aos `alternativeTitles` na comparação. O primeiro cartão nunca é aceito sem confirmação; a busca de "Demon Slayer" devolveu "Berserk" e comprova o risco.
5. Os cartões serão lidos de `article` com link `/anime/` (seletor observado em 2026-11-16; 3 cartões para `Naruto`), com título em `h2`/`.title a` e ano em `.year`/`.meta span.year` quando existir. Não foram observados `div.result-item` nem `div.search-page` nesta amostra; a fixture confirma o seletor de título e ano. Se a página tiver o marcador de "nenhum resultado", a ausência é reconhecida; se não tiver cartões nem marcador, é erro de estrutura. O teto de quatro fichas é total, não por termo.
6. Alternativas descartadas:
   1. Derivar o slug do título e abrir `/anime/<slug>/` diretamente: a fonte usa slug próprio e romaji; seriam necessárias muitas variantes, e um 404 não distingue ausência de slug diferente. O Prisma só consegue isso porque recebe o slug pronto da base XML.
   2. Usar a REST do WordPress (`/wp-json/wp/v2/search`) para buscar: não foi confirmada para o tipo `tvshows` nem para os campos necessários; adotá-la sem evidência violaria o roteiro de investigação.
   3. Aceitar o primeiro resultado por similaridade alta: a amostra com resultado alheio mostra que similaridade isolada não confirma identidade.
   4. Abrir todas as fichas da busca: custo desnecessário; o teto de quatro candidatos é o mesmo de outros provedores e cobre a busca textual.
7. A busca é a única etapa que pode devolver resultado alheio; a confirmação na ficha é o ponto de decisão. Sem confirmação, a saída é lista vazia, não erro.

### D3. Temporada e episódio pela lista publicada

1. A temporada será escolhida por `div.se-c` com `span.se-t` igual ao número pedido, e o episódio por `div.numerando` ("Ep - N") ou pelo texto de `div.episodiotitle a` ("Episodio N"), usando o `href` publicado.
2. O `href` publicado é a fonte da verdade. O provedor não monta `/episodio/<slug>-temporada-<season>-episodio-<episode>/` como caminho primário: a amostra da temporada 1 não tem `temporada-` no endereço, e a construção por padrão pode apontar para página inexistente em títulos agrupados.
3. Temporada não publicada ou episódio não publicado devolve lista vazia, sem escolher o episódio mais próximo, a posição seguinte ou a numeração absoluta.
4. A página agrupa temporadas em uma lista contínua em parte dos títulos: Naruto Shippuden aparece como `Temporada 1` com centenas de episódios. Para um pedido de temporada 2 do TMDB, a saída é ausência; não há soma de temporadas anteriores nem mapeamento por posição.
5. Alternativas descartadas:
   1. Ordem do Prisma (URL construída primeiro): assume o padrão `-temporada-<n>-episodio-<m>` e não confirma o ano; na amostra o padrão não aparece na temporada 1. A URL construída pode ser usada só como hipótese futura, com evidência.
   2. Mapear temporada por número absoluto de episódio: a fonte agrupa temporadas e reinicia numeração em páginas de arco; o risco de episódio errado é maior que a ausência.
   3. Mapear páginas de arco pelo título romaji da temporada: é o método de `anitube`/`animesfhd`, mas depende de o TMDB registrar o romaji específico da temporada e de a página ter uma única temporada. Fica fora da primeira versão e registrado como questão em aberto.
6. A confirmação de tipo é implícita: só `/anime/<slug>/` é aceita; uma página de outra rota não é candidata.

### D4. Leitura das opções `option-*`

1. Na página do episódio, cada `div[id^="option-"]` dentro de `#playex` é uma opção independente. O `src` será lido primeiro do próprio `div` (formato do Prisma) e, se ausente, do primeiro `iframe[src]` interno (formato observado).
2. O rótulo será o texto do `ul.idTabs a[href="#<id>"]` correspondente, aparado. Sem âncora, o rótulo será `Opção <n>`; o idioma só é confirmado quando o rótulo declarar "Dublado" ou "Legendado".
3. Marcadores de estrutura: `h1.epih1` (ou `#info h1`) confirma que a página é de episódio; `#playex` é o contêiner do player. `h1` ausente é erro de layout. `#playex` ausente ou presente sem `option-*` é ausência de opções, não falha.
4. Sem opções na página do episódio, o provedor tenta uma vez `/anime/<slug>/` e lê `option-*` no HTML inteiro. Sem opções nas duas páginas, a saída é lista vazia. O fallback é o mesmo do Prisma e cobre páginas de obra única/OVA que publicam o player na ficha.
5. Episódio listado que responde 404 é tratado como página removida: o provedor registra a tentativa e usa o fallback. A detecção usa o padrão `^HTTP 404` da mensagem do bloco `http`, como em `anibunker`/`animesfhd`. HTTP 403 ou 5xx na página do episódio é falha, não ausência, porque pode ser WAF ou indisponibilidade.
6. Alternativas descartadas:
   1. Usar só a expressão regular do Prisma (`<div id="option-..." ... src="...">`): não encontra o `src` no `iframe` interno, que é a forma observada.
   2. Usar só `iframe[src]`: perderia a forma com `src` no `div` que o Prisma documenta.
   3. Tratar `#playex` ausente como ausência sem verificar o `h1`: mascararia mudança de layout.
   4. Ler o `href` da âncora `#option-N` como mídia: ele é só a aba interna, não o embed.

### D5. Resolução de hosts

1. A classificação será por hostname e caminho, não por substring solta:
   1. Blogger: host `blogger.com`/`www.blogger.com` com caminho `/video.g`; o HTML é lido por `extractBloggerFormats` do bloco `blogger-video`, que devolve um MP4 progressivo por formato.
   2. Mídia direta: caminho terminado em `.mp4` ou `.m3u8`; `.m3u8` vira `type: 'hls'` e o restante `type: 'mp4'`.
   3. MixDrop, Streamtape e DoodStream: adaptadores locais aproveitados de `src/pobreflixtv/hosts.js`, com desempacotamento por `unpackPacker` (MixDrop), recomposição de `robotlink` (Streamtape) e fluxo `pass_md5` (Dood).
   4. Byse: adaptador local com `unpackPacker` e busca de `.m3u8` no HTML desempacotado ou no HTML bruto, conforme `prisma_hosts.py`; a cadeia cifrada de `vaqueirofilmes/byse.js` é específica de outra fonte e não será copiada.
   5. Host desconhecido é triagem com `console.log`, sem stream e sem falha.
2. Cada opção é resolvida em isolamento. Falha de resolução ou de montagem gera `console.warn('[AnimesOnlineCC] Opção <rótulo> descartada: <causa>')` e preserva as demais. Se nenhuma opção produzir stream e ao menos uma tiver falhado, sobe um erro agregado com as causas; se todas forem triagem ou ausência, a lista é vazia.
3. Alternativas descartadas:
   1. Criar um bloco `file-hosts` agora, com `pobreflixtv` e `animesonlinecc` como consumidores: os conjuntos não são idênticos (Byse só aqui; Dood com variações de domínio), e refatorar um provedor publicado exigiria nova rodada online. O gatilho para promover é um terceiro consumidor real ou a convergência dos adaptadores.
   2. Resolver só Blogger e mídia direta: reduziria a cobertura aos hosts observados, mas o Prisma documenta os quatro hosts e a fonte pode alterná-los; o suporte local é barato e isolado.
   3. Usar `detect_host` do Prisma com `'stp' in host` e `'file'`/`'moon'`: a busca por substring classifica host alheio; a implementação usa sufixos explícitos.
   4. Copiar a cadeia `vaqueirofilmes/byse.js`: ela espera o player EmbedPlay/Byse com playback AES-GCM, não o Byse genérico do Prisma.
4. O limite é declarado: MixDrop, Streamtape, Dood e Byse não foram vistos nesta fonte; se a rodada online mostrar que só o Blogger aparece, os adaptadores podem ser removidos em uma mudança posterior, sem alterar o contrato. O Prisma limita a seis embeds por página; o provedor resolve todas as opções publicadas, porque a amostra tem duas e o app gerencia a espera.

### D6. Fronteira de erro, ausência e tempo

1. Etapas fatais: entrada, TMDB, busca, ficha do anime e página do episódio. Falha de rede, HTTP 403/5xx ou estrutura inesperada sobe até `getStreams`, que registra `console.error('[AnimesOnlineCC] Falha em <tipo> <id>: <causa>')` e devolve `[]`.
2. Ausência reconhecida: `movie` por escopo, busca sem resultado, nenhum candidato confirmado, temporada/episódio não publicado, página de episódio 404 com fallback sem opções, `#playex` sem `option-*`, e todas as opções triadas. Nesses casos a saída é `[]` sem erro.
3. Falha isolada: host conhecido que não resolve, Blogger sem formatos, URL inválida ou montagem que falha. A opção é descartada com aviso; as demais continuam.
4. Se todas as opções falharem e nenhuma produzir stream, o erro agregado cita cada causa e sobe para `getStreams`.
5. O provedor não instala `AbortController`, `setTimeout`, retentativa, espera ou cache. O `6.0` do Prisma é timeout do addon dele e não será portado; o app gerencia a espera e a verificação online usa limite externo.
6. Alternativas descartadas:
   1. Tratar 403 como ausência: mascararia WAF e impediria distinguir bloqueio de acervo.
   2. Tratar 404 de episódio listado como falha fatal: impediria o fallback que o próprio Prisma usa; o 403/5xx continua falha.
   3. Devolver lista vazia quando todas as opções conhecidas falham: esconderia a causa e contrariaria a regra de erro agregado.

### D7. Contrato dos streams

1. Todo stream é montado com `buildStream` e `format: { template: FORMATTER.AUTO, addon: 'AnimesOnlineCC', title: media.title, year: media.year, season, episode }`; `name` e `title` não são informados. O `title` do formatador é o título do TMDB, não o `h1` da fonte.
2. `language`: "Dublado" ou "Legendado" quando o rótulo da opção declarar; caso contrário, `languageHints` com o rótulo e descoberta local. Rótulo técnico (`HD`, `SD`, `FHD`) não classifica áudio.
3. `quality`: o `qualityLabel` do Blogger vira `qualityHints`; MixDrop, Streamtape, Dood, Byse e mídia direta não declaram resolução, então o stream fica `Desconhecida` até a descoberta local. Não há sonda de playlist nem requisição extra.
4. `type`: `mp4` para Blogger, MixDrop, Streamtape, Dood e mídia `.mp4`; `hls` para Byse e mídia `.m3u8`. `provider`: `Blogger`, `MixDrop`, `Streamtape`, `DoodStream`, `Byse` ou `AnimesOnlineCC` (mídia direta).
5. `headers`: os cabeçalhos devolvidos pelo adaptador (MixDrop, Streamtape, Dood). Blogger e mídia direta não recebem cabeçalho sem evidência de necessidade. Não há `size`, `subtitles`, `infoHash`, `seeders` ou `peers` porque a fonte não os fornece.
6. Deduplicação por URL resolvida, mantendo a primeira ocorrência; ordenação final com `sortByQuality`.
7. Alternativas descartadas:
   1. Criar um stream por qualidade do master HLS: o master é adaptativo e deve ser devolvido inteiro; não há fragmentação.
   2. Usar o rótulo da aba "Dublado"/"Legendado" como qualidade: são eixos diferentes.
   3. Propagar `Referer`/`Origin` para toda mídia: só os adaptadores que exigem cabeçalho os enviam; o resto fica sem cabeçalho até evidência.

### D8. Manifest, testes, perfil e documentação

1. `manifest.json`: `id` `animesonlinecc` (kebab-case de uma palavra, único no manifest), `name` `AnimesOnlineCC`, `version` `1.0.0`, `author` `nathanael540`, `supportedTypes` `["tv"]`, `formats` `["mp4", "m3u8"]`, `contentLanguage` `["pt"]`, `logo` `https://www.google.com/s2/favicons?domain=animesonlinecc.to&sz=128`, `filename` `providers/animesonlinecc.js` e `enabled` `true`.
2. `test/online/profiles.json`: entrada `animesonlinecc` com `exclusiveTag: "anime"`, porque a fonte é exclusiva de anime e a amostra generalista de `tv` mediria títulos que ela não publica.
3. `providers.md`: linha na tabela e seção `AnimesOnlineCC` com status inicial `🟠 Não verificado` e data `—` até a rodada online.
4. `docs/provider-investigation.md`: nova seção `Página de episódio com embeds em <div id="option-X" src>`, com busca `/?s=`, confirmação `h1`/`span.date`, temporada `se-t`, opções e hosts, referenciando `src/animesonlinecc/` e `test/animesonlinecc.test.js`, e registrando os limites (WAF, busca com resultado alheio, temporadas agrupadas, forma do embed, hosts não observados).
5. Fixtures em `test/fixtures/animesonlinecc/`: busca com resultado, busca vazia, ficha do anime, ficha com duas temporadas, episódio com duas opções, episódio sem opções, ficha sem opções, host desconhecido e respostas de host. Tokens do Blogger viram `token=EXAMPLE`; URLs de mídia viram `cdn.example`; nada de cookie, token real ou mídia.
6. Nenhum bloco novo e nenhuma mudança em `docs/arch.md`; `README.md` só muda se a lista de provedores for mantida lá, o que será conferido na implementação. `script-extract` não é usado na primeira versão porque o `src` está em atributo HTML; a leitura por script fica como hipótese se a fonte mudar.
7. Revisão de 2026-11-18: `README.md` não mantém lista nominal de provedores (aponta para `providers.md`) e `docs/arch.md` descreve só convenções globais, que não mudaram. Nenhum dos dois foi alterado.

## Risks / Trade-offs

1. **WAF por IP de datacenter** → o Prisma registra 403 em nuvem e sucesso em IP residencial; nossas requisições de 14/11/2026 responderam 200, mas não sabemos a natureza do IP. A rodada online pode ser inconclusiva ou falhar; o status ficará `🟠 Não verificado` e o motivo será registrado em `providers.md`.
2. **Busca com resultado alheio** → "Demon Slayer" devolveu "Berserk"; a confirmação por `h1` e ano é obrigatória. Um candidato único com título parecido ainda é rejeitado se o ano divergir.
3. **Seletor dos cartões de busca não inspecionado** → a implementação deve capturar uma fixture real e confirmar o contêiner antes de fechar o parser. Se não houver seletor estável, a implementação para e a mudança fica bloqueada, sem inventar caminho.
4. **Recorte da busca** → não foi observada paginação em `/?s=`; o provedor lê a primeira página devolvida, e títulos fora desse recorte não são encontrados.
5. **Temporadas agrupadas** → Naruto Shippuden tem uma única `Temporada 1` com numeração contínua; pedidos de temporada 2+ do TMDB ficam sem resultado. É ausência declarada, não erro, e reduz a cobertura em séries longas.
6. **Páginas de arco/temporada própria** → "Nanatsu no Taizai: Kamigami no Gekirin" é uma página separada para a temporada 2; a primeira versão não a mapeia. Mapear exigiria o romaji específico da temporada e confirmação adicional.
7. **Forma do embed variável** → o Prisma lê `src` no `div`; a amostra traz `iframe[src]`. O leitor cobre as duas formas, mas uma terceira forma (script, `data-src`) não é suportada e vira ausência de opção.
8. **Hosts não observados** → MixDrop, Streamtape, Dood e Byse vêm do código do Prisma; os adaptadores podem ficar sem uso ou falhar se os domínios mudarem. O Blogger é o único host confirmado na amostra.
9. **Tokens efêmeros do Blogger** → as URLs são assinadas, ligadas ao IP e de curta duração; não podem ir para fixture, cache, log ou documentação. A resolução acontece a cada pedido.
10. **Mudança de domínio da fonte** → a base está fixa em `animesonlinecc.to`; se o site mudar de domínio, o provedor falha e exige atualização. Não há espelho automático nem troca de domínio sem evidência.
11. **Sobreposição com os provedores de anime** → existem 11 provedores de anime no repositório (AnimeFire, Dattebayo, AniTube, OxeAnimes, Animy, AniBunker, AnimeZeY, AnimesDigital, AnimesFHD, Animes Online Blue e AnimeQ), além do Kairou generalista. O valor do AnimesOnlineCC é o acervo antigo e as opções dubladas/legendadas em Blogger; a sobreposição é alta e a rodada online deve decidir se a manutenção se justifica.
12. **Layout DooPlay/WordPress** → mudança de `se-c`, `se-t`, `episodiotitle`, `playex` ou `option-*` vira erro estrutural, não ausência. As fixtures protegem o contrato observado, não o site futuro.
13. **Erro agregado com causas** → mensagens de host são saneadas para não vazar URL assinada ou token em log público.
14. **Rodada online inconclusiva** → sem `TMDB_API_KEY`, o provedor fica inconclusivo por configuração; com WAF, por bloqueio. Nenhum dos dois autoriza publicar como estável.

## Open Questions

1. Resolvida parcialmente em 2026-11-16: o contêiner observado é `article` com link `/anime/` (3 cartões para `Naruto`); falta confirmar o seletor de título/ano e o marcador de "nenhum resultado" na fixture.
2. A fonte publica `src` no próprio `div` em algum tema/página, ou o Prisma generalizou a partir de outra variante? O leitor cobre as duas formas e a fixture registra a observada.
3. Vale mapear páginas de arco/temporada própria pelo romaji específico da temporada do TMDB? A primeira versão não mapeia; a decisão depende de evidência online de títulos como Nanatsu no Taizai.
4. MixDrop, Streamtape, Dood ou Byse aparecem nesta fonte? Se não aparecerem na rodada online, os adaptadores podem ser removidos sem mudar o contrato.
5. A fonte bloqueia o IP da rodada online? Se bloquear, o status fica `🟠 Não verificado` e a mudança não é arquivada como estável.
6. A cobertura de animes justifica manter o provedor diante de 11 concorrentes? A resposta virá dos cinco títulos de anime da rodada; se a taxa for baixa, registrar o limite em `providers.md` e reavaliar em outra mudança.

## Validation

1. Testes offline em `test/animesonlinecc.test.js` com `fetch` simulado e fixtures sanitizadas: busca confirmada, busca vazia, busca com resultado alheio, ano divergente, ficha 404, ficha sem `h1`/ano, temporada ausente, episódio ausente, temporada agrupada, duas opções, fallback para `/anime/<slug>/`, página sem `option-*`, host desconhecido, host conhecido falhando entre opções válidas, todas as opções falhando, 403 na busca, 403 na página do episódio, 404 do episódio com fallback, `movie`, `mediaType` inválido e deduplicação.
2. `node --test test/animesonlinecc.test.js` passa sem internet.
3. `npm run lint`, `npm test` e `node build.js animesonlinecc` passam; o build gera o arquivo base e as variantes `gdrive/` e `prism/`.
4. `npm run test:online -- --provider animesonlinecc --record` roda com `TMDB_API_KEY` apenas no ambiente e registra a rodada em `providers.md`. O status inicial é `🟠 Não verificado`; como o provedor tem um único tipo, a rodada termina em `Estável` com ao menos um título resolvido, `Instável` sem resolução ou `Inconclusivo` por WAF, timeout externo ou chave ausente; `Parcial` não se aplica.
5. Nenhuma fixture, log ou documento contém token real do Blogger, cookie, URL assinada ou mídia real. A verificação procura por tokens reais (`token=` seguido de valor longo), `googlevideo.com`, `blogger.com/video.g` com token e hosts de mídia, aceitando apenas o placeholder `token=EXAMPLE` nas fixtures.
6. A change não está bloqueada: a busca, a confirmação, a página de episódio e a mídia do Blogger foram observadas em 14/11 e 16/11/2026. O item pendente é o seletor de título/ano dos cartões, que a fixture confirma; se não for confirmado, a implementação para e a change fica bloqueada até nova investigação.
7. A validação final compara o comportamento com a spec, revisa o diff e confirma que nenhum arquivo gerado foi editado à mão.
