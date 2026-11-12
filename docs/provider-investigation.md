# Guia de investigação de novos provedores

Mapa de metodologias para estudar uma fonte e escolher um caminho de implementação a partir dos provedores atuais. Não é uma lista de endpoints universais nem garantia de funcionamento de sites semelhantes.

## 1. Como usar este mapa

1. Leia [arquitetura e contrato](arch.md), [regras de testes](tests.md), [catálogo de blocos](../src/_blocks/index.md) e [status dos provedores](../providers.md). Este guia não substitui essas referências.
2. Combine os métodos conforme a cadeia da fonte: busca JSON, detalhe HTML, botão AJAX, player intermediário e mídia final podem exigir abordagens diferentes.
3. **Em uso** significa implementação em provedor atual. Os testes citados demonstram o comportamento implementado; evidência online do pacote correspondente fica exclusivamente em `providers.md`.
4. **Bloco disponível** significa implementação e teste isolado sem consumidor atual. **Hipótese** significa caminho ainda sem implementação local. Não apresente uma hipótese como método comprovado.
5. Os caminhos HTTP abaixo pertencem às fontes citadas. Trocar o domínio não basta: confirme método, parâmetros, esquema, identidade e mídia na nova fonte. Não use o histórico anterior ao reset como requisito ou evidência de teste.
6. Antes de implementar comportamento novo, abra a proposta OpenSpec. Registre no `design.md` as descobertas específicas, alternativas, impedimentos e validação; mantenha aqui apenas o método reaproveitável.

## 2. Roteiro de investigação

1. **Definir amostra.** Separe filme, episódio avulso, episódio em pacote e ausência conhecida, quando aplicáveis. Registre TMDB, tipo e coordenadas; confirme que a fonte anuncia o exemplo positivo.
2. **Reconhecer a fonte.** Observe páginas públicas, formulários, scripts e requisições de busca e reprodução. Procure WordPress, Blogger, definições de indexador, IDs e nomes de players. HTML vazio pode depender de API ou renderização JavaScript.
3. **Descobrir o contrato mínimo.** Reproduza uma requisição por vez: endereço, GET/POST, query, corpo, `Content-Type`, cabeçalhos e esquema da resposta. Prefira uma interface pública estruturada quando ela contiver os dados necessários; não invente rotas nem enumere caminhos indiscriminadamente.
4. **Confirmar identidade.** Prefira IDs exatos; sem eles, compare título PT-BR, original, alternativos e ano, distinguindo filme, série, temporada e episódio. O primeiro resultado parecido não é confirmação.
5. **Seguir a cadeia.** Anote catálogo, detalhe, opção, iframe, API e mídia. Preserve a URL final de cada página e descubra em qual salto um parâmetro ou cabeçalho é necessário.
6. **Reduzir a requisição.** Compare chamadas com e sem cada campo de contexto; não copie cabeçalhos de navegador indiscriminadamente nem cookies de sessão pessoal como solução de integração.
7. **Verificar a saída.** Diferencie HTML, JSON de opção e mídia. Confirme HLS, MP4 ou magnet válido, seleção de episódio, áudio, legendas e metadados fornecidos.
8. **Classificar o resultado.** Separe ausência reconhecida, incompatibilidade, opção quebrada, bloqueio, cota e configuração insuficiente. HTTP 200 com desafio, publicidade ou home não comprova ausência ou mídia válida.
9. **Capturar evidência.** Guarde respostas reais sanitizadas e cubra erros e falsos positivos em testes offline. Depois da implementação e do build, a aprovação de funcionamento exige a rodada online do pacote final.

## 3. Métodos observados

### 3.1. Busca por ID e rota de embed

1. **Situação: Em uso.** A fonte recebe TMDB ou IMDb diretamente, dispensando busca textual quando o contrato permite.
2. **Investigar.** Procure IDs nas URLs e no código público que monta embeds. Teste filme e série separadamente: tipo e coordenadas podem ocupar segmentos ou campos diferentes. Confirme a identidade da resposta.
3. **Exemplos.** MegaEmbed usa `/embed/<tmdb>` e `/embed/<tmdb>/<temporada>/<episódio>`, lendo `var sources` como JSON. BeTor busca por IDs exatos; TheRARBG usa o IMDb associado ao TMDB em `/api/v1/title/<imdb>/`.
4. **Referências.** [MegaEmbed](../src/megaembed/extractor.js), [BeTor](../src/betor/extractor.js), [TheRARBG](../src/therarbg/extractor.js) e bloco [tmdb-info](../src/_blocks/tmdb-info/index.mjs). Testes: [MegaEmbed](../test/megaembed.test.js), [BeTor](../test/betor.test.js) e [TheRARBG](../test/therarbg.test.js).
5. **Limites.** O mesmo número não comprova tipo. Não generalize rotas entre fontes nem consulte o TMDB por hábito quando o ID recebido já resolve o pedido.

### 3.2. REST do WordPress

1. **Situação: Em uso.** Posts e categorias são publicados como JSON; o conteúdo pode trazer magnets ou somente o endereço do detalhe.
2. **Investigar.** Procure `/wp-json/` no HTML e nos scripts. Confirme `/wp-json/wp/v2/posts` público e o parâmetro `search`. Leia o esquema antes de escolher `_fields`, `per_page`, filtros e paginação.
3. **Exemplos.** Filmestorrent reutiliza `wordpress-torrent`, buscando IMDb e depois títulos, com `_fields=id,link,title,content` e `per_page=20`; extrai magnets de `content.rendered`. LimeFilmes resolve categorias por `/wp-json/wp/v2/categories?slug=<slug>`, separa filmes, séries e coleções e visita `post.link` para confirmar a ficha.
4. **Referências.** Bloco [wordpress-torrent](../src/_blocks/wordpress-torrent/index.mjs), [Filmestorrent](../src/filmestorrent/extractor.js) e [LimeFilmes](../src/limefilmes/extractor.js). Testes: [bloco](../test/blocks/wordpress-torrent/index.test.mjs), [Filmestorrent](../test/filmestorrent.test.js) e [LimeFilmes](../test/limefilmes.test.js).
5. **Limites.** No bloco atual, lista JSON vazia válida encerra a consulta sem trocar de domínio; HTML de bloqueio não é lista vazia. O recorte de 20 posts não comprova busca exaustiva: investigue paginação na nova fonte.

### 3.3. Feed JSON do Blogger

1. **Situação: Em uso.** O feed fornece posts sem raspar a busca HTML.
2. **Investigar.** Procure domínio Blogspot e links de feed. O exemplo local usa `/feeds/posts/default?alt=json&max-results=20&q=<consulta>`. Confirme feed habilitado, conteúdo completo ou resumido e paginação necessária.
3. **Exemplo.** Baixar Filmes Via-Torrent lê `feed.entry`, `title.$t`, `content.$t`, categorias e `openSearch$totalResults.$t`. Confirma IMDb no HTML; sem ele, compara títulos e ano do filme. Para série, exige a temporada pedida.
4. **Referências.** [Extrator Blogger](../src/baixarfilmestorrent123/extractor.js) e [testes](../test/baixarfilmestorrent123.test.js); blocos `tmdb-info`, `title-match` e de torrent conforme o caso.
5. **Limites.** `max-results=20` é o recorte atual, não cobertura integral. Blogspot sozinho não comprova feed JSON utilizável ou magnets públicos.

### 3.4. Raspagem HTML por seletores

1. **Situação: Em uso.** Resultados e links estão no HTML; não há API utilizável ou ela não contém os dados necessários.
2. **Investigar.** Inspecione formulário, URL de busca e elementos repetidos dos resultados. Preserve a relação entre título, ano e link; visite o detalhe para confirmar identidade e extrair opções.
3. **Exemplos.** DooPlay consulta `/?s=<consulta>` e lê `.search-page article`, `.title a` e `.year`; episódios são selecionados pelas coordenadas da listagem, não pela posição visual. Baixa Rápido mantém leitores próprios para famílias de páginas distintas, compartilhando confirmação e transporte.
4. **Referências.** [Busca DooPlay](../src/dooplay/sources.js), [utilitários Baixa Rápido](../src/baixarapido/common.js) e [leitor GratisTorrent](../src/baixarapido/gratistorrent.js). Testes: [DooPlay](../test/dooplay.test.js) e [Baixa Rápido](../test/baixarapido.test.js). Blocos: `title-match`, `slugify` e `script-extract`.
5. **Limites.** Use apenas a API básica do cheerio aceita no NuvioTV e percorra coleções com `eq(i)`. Seletor ausente pode indicar layout alterado ou bloqueio; só reconheça ausência com evidência da estrutura válida da fonte.

### 3.5. APIs particulares, AJAX e parâmetros de player

1. **Situação: Em uso.** Botões de reprodução e seleção de temporada consultam interfaces diferentes da busca de posts.
2. **Investigar.** Procure `data-*`, ID do post, número do servidor, ações e chamadas ao escolher uma opção. Confirme GET/POST e formulário/JSON; reproduza os campos observados sem misturar contratos.
3. **DooPlay.** Há busca em `/wp-json/dcfilter/v1/results` e expansão por `/wp-json/dooplayer/v2/<post>/<type>/<nume>` ou POST em `/wp-admin/admin-ajax.php`, com `action=doo_player_ajax`, `post`, `nume` e `type`. A resposta deve conter `embed_url`.
4. **Outras variações.** NixPlay envia formulário a `/wp-json/api/v1/player` e `/wp-json/api/v1/player-resolve`, com `type`, `tmdb`, `season` e `episode`; série usa `type=episode`. FSHD encadeia `/api/options` e `/api/players`. Pobreflix HD usa ações em `/index.php` para busca, episódios e player.
5. **Referências.** [DooPlay](../src/dooplay/players.js), [NixPlay](../src/pobreflix-nixplay/player.js), [FSHD](../src/fshd/api.js) e [Pobreflix HD](../src/pobreflixtv/site.js). Testes: [DooPlay](../test/dooplay.test.js), [NixPlay](../test/pobreflix-nixplay.test.js), [FSHD](../test/fshd.test.js) e [Pobreflix HD](../test/pobreflixtv.test.js).
6. **Limites.** `wp-json` também abriga APIs particulares, não apenas `wp/v2/posts`. `embed_url` e `video_url` podem apontar para outra página; confirme os campos e as coordenadas antes de seguir.

### 3.6. Definição de indexador Prowlarr como mapa da API

1. **Situação: Em uso no BeTor.** A [definição pública `betorbr/betor-search`, arquivo `betor-search.yml`](https://raw.githubusercontent.com/betorbr/betor-search/refs/heads/main/betor-search.yml), consultada em 12/11/2026, descreve o indexador para Prowlarr. É fonte de descoberta do contrato, não um servidor Prowlarr exigido pelo plugin.
2. **Investigar a definição.** Leia base em `links`, caráter público em `type`, modos em `caps`, caminhos e entradas em `search`, seletor dos resultados e mapeamento dos campos. No BeTor, ela aponta para `https://search.betor.top/`, caminho `v1/search/`, JSON e lista `items`; descreve busca textual, IMDb, TMDB, temporada e episódio. Os campos incluem `magnet_uri`, `torrent_name`, tamanho, seeders e peers.
3. **Ação no provedor.** Consuma a API pública diretamente com `fetch`, sem instalar Prowlarr ou consumir sua API administrativa. O código atual tenta IMDb com tipo, TMDB com tipo e TMDB sem tipo, nessa ordem, e pagina com `size=100`, conferindo `total`. A definição ajuda na descoberta; código e spec locais determinam o comportamento implementado.
4. **Referências.** [Extrator BeTor](../src/betor/extractor.js), [testes](../test/betor.test.js) e [spec](../openspec/specs/betor-search/spec.md). Para outra fonte, procure definição pública equivalente e confirme cada campo com respostas reais.
5. **Limites.** YAML não comprova disponibilidade online nem autoriza copiar defaults ou filtros. Identificadores sem tipo exigem triagem adicional; erro de consulta ou paginação não equivale a ausência. Dependência de conta, chave ou instância privada não atende às regras do repositório. Ao reaproveitar código externo, verifique licença e registre a origem conforme `AGENTS.md`.

### 3.7. Contexto HTTP: Referer, Origin, User-Agent e URL final

1. **Situação: Em uso.** Catálogo, iframe, API e mídia podem exigir contextos distintos. O cabeçalho HTTP se chama `Referer`; não confunda com propriedades de navegador chamadas `referrer`.
2. **Investigar.** Compare o contexto de cada salto. Use `fetchPage` para preservar `response.url`, resolva caminhos relativos contra a página que respondeu e mantenha os cabeçalhos necessários também na reprodução, não apenas na descoberta.
3. **Referências.** Bloco [http](../src/_blocks/http/index.mjs): perfis `page`, `api` e `player`, `fetchJson`, `fetchText`, `fetchPage`, corpos `form`/`json` e `playbackHeaders`. Testes: [http](../test/blocks/http/index.test.mjs). Veja exceções em [MegaEmbed](../src/megaembed/player.js) e [seus testes](../test/megaembed.test.js).
4. **Exceções observadas.** MegaEmbed omite `Referer` em MP4, Uqload ou opção com `noReferrer`; não aplique `playbackHeaders` cegamente. Outros players dependem da página final como `Referer`. Cabeçalhos de descoberta, sondagem e reprodução têm responsabilidades diferentes.
5. **Limites.** Envie somente os cabeçalhos necessários e não transporte credenciais entre hosts. `Range` de sondagem não pode virar dependência da reprodução: o app ignora esse cabeçalho no stream. Cabeçalhos HTTP não se aplicam a magnet ou `torrent://`.

### 3.8. Resolução de players conhecidos e decodificação local

1. **Situação: Em uso.** Páginas intermediárias, scripts empacotados, Base64 e chamadas adicionais escondem a mídia final.
2. **Investigar.** Identifique host e estrutura antes de escolher o resolvedor. Extraia somente strings e configurações necessárias, sem executar `eval` ou scripts remotos. Preserve identidade e coordenadas de episódio durante a cadeia.
3. **FirePlayer.** O bloco [fireplayer](../src/_blocks/fireplayer/index.mjs) segue plenoflu/SuperCDN, PlayerFlix, GStream, myembed e VaiQueCol/embedplayer2 até HLS, com desempacotamento local, limite de saltos e detecção de ciclos. FirePlayer PT-BR e DooPlay usam a cadeia; FSHD reutiliza `unpackPacker` para sua configuração específica.
4. **Outros hosts.** [Pobreflix HD](../src/pobreflixtv/hosts.js) resolve MixDrop, Streamtape e DoodStream: `MDCore.wurl` após desempacotar, recomposição de `robotlink` e fluxo `pass_md5`, respectivamente. São adaptadores locais, não blocos universais para qualquer variante desses hosts.
5. **Torrent codificado.** [Starck Filmes](../src/starckfilmes/xid.js) desfaz uma permutação de `xid`, decodifica Base64 e exige resultado `magnet:?`, sem serviço externo de desbloqueio.
6. **Testes.** [Bloco FirePlayer](../test/blocks/fireplayer/index.test.mjs), [FirePlayer PT-BR](../test/fireplayer.test.js), [DooPlay](../test/dooplay.test.js), [FSHD](../test/fshd.test.js), [Pobreflix HD](../test/pobreflixtv.test.js) e [Starck Filmes](../test/starckfilmes.test.js).
7. **Limites.** Bypass aqui significa reproduzir o fluxo público e a transformação local observada, não remover autenticação ou DRM. Não fixe tickets ou URLs temporárias capturadas. Serviços auxiliares precisam ser públicos, sem conta e sem chave; a única chave externa permitida continua sendo `TMDB_API_KEY`.

### 3.9. Tickets temporários e resolução em etapas

1. **Situação: Em uso.** O HTML publica configuração e tickets que precisam ser resolvidos por opção, em vez de uma URL final permanente.
2. **Exemplo.** RedeFlix lê configuração e opções de áudio, resolve tickets e consulta `/playerkys/source.php` para obter MP4. NixPlay reutiliza essa cadeia quando a opção aponta para o ecossistema RedeFlix.
3. **Investigar.** Distinga ticket inicial, ticket de lançamento, servidor e URL final. Confirme quais dados são compartilhados e quais pertencem a cada opção. Não trate o ticket como chave de serviço configurável ou versionada.
4. **Referências.** Bloco [redeflix-player](../src/_blocks/redeflix-player/index.mjs), [RedeFlix](../src/redeflix/index.js) e [NixPlay](../src/pobreflix-nixplay/player.js). Testes: [bloco](../test/blocks/redeflix-player/index.test.mjs), [RedeFlix](../test/redeflix.test.js) e [NixPlay](../test/pobreflix-nixplay.test.js).
5. **Limites.** Preserve opções válidas quando outra falhar. Dados efêmeros do fluxo público não devem aparecer em documentação, logs públicos ou fixtures sem sanitização. Não transforme URL de sessão em endpoint estático.

### 3.10. Redirecionamento, troca de domínio e espelhos

1. **Situação: Em uso.** Troca de domínio, espelho equivalente e catálogo complementar são situações diferentes, não uma lista genérica de reservas.
2. **Investigar.** Compare endereço solicitado e final, caminho, identidade e estrutura. Detecte redirect que perde a busca na home. Defina destinos reconhecidos e quando uma resposta válida encerra a tentativa.
3. **Exemplos.** Pobreflix HD valida bases explícitas e rejeita lookalikes e redirects em cascata; NixPlay valida origem final contra aliases aprovados; MegaEmbed tenta espelhos; Filmestorrent agrega catálogos e mantém reservas dentro de cada um. Baixa Rápido fixa o domínio escolhido ao visitar detalhes.
4. **Referências.** [Pobreflix HD](../src/pobreflixtv/site.js), [NixPlay](../src/pobreflix-nixplay/catalog.js), [MegaEmbed](../src/megaembed/extractor.js), [Filmestorrent](../src/filmestorrent/extractor.js) e [Baixa Rápido](../src/baixarapido/common.js). Testes nos respectivos `test/<id>.test.js`; veja a [spec de redirect](../openspec/specs/pobreflix-domain-redirect/spec.md).
5. **Limites.** Não aceite um host só por conter o nome da fonte, nem copie políticas de domínios sem evidência. Trocar de domínio após ausência válida pode mascarar ausência ou misturar catálogos.

### 3.11. Torrents: release avulsa, pacote e metadados

1. **Situação: Em uso.** O catálogo fornece magnet, mas uma temporada completa não pode ser devolvida como episódio avulso.
2. **Investigar.** Leia hash, nome, tamanho, qualidade, idioma, temporada, episódio e contexto. Normalize BTIH hexadecimal/Base32, distinga coleção de filme individual e deduplique antes de operações adicionais de rede.
3. **Pacotes.** Reutilize [torrent-release](../src/_blocks/torrent-release/index.mjs) e [torrent-files](../src/_blocks/torrent-files/index.mjs). Obtenha a lista pelo [cache público de metadados](#41-cache-público-de-torrent-para-encontrar-o-índice-do-episódio), selecione um único vídeo e preserve o índice original. Monte `torrent://<hash>/<índice>` com `buildTorrentFileUrl` somente após essa seleção. Sem arquivo único, descarte o pacote; filme e episódio avulso seguem como magnet.
4. **Confirmação adicional.** TheRARBG consulta resultados existentes do [Verifile](#42-verifile-para-inspecionar-o-conteúdo-real-da-mídia), interpreta faixas e confirma a relação arquivo/episódio. Consulta de metadados do torrent e inspeção da mídia são recursos complementares, não substitutos.
5. **Testes.** [torrent-release](../test/blocks/torrent-release/index.test.mjs), [torrent-files](../test/blocks/torrent-files/index.test.mjs), [BeTor](../test/betor.test.js) e [TheRARBG](../test/therarbg.test.js).
6. **Idioma na ficha.** A ficha pode publicar `Idioma`, `Idiomas` ou `Áudio` em tabela, `#informacoes` ou `.info_p`; leia o campo e passe como `audio` para `classifyMagnetOption`, sem confundir `Qualidade de Áudio`. Em fonte PT-BR, `Dual Áudio`/`Tri Áudio` conta como `Dublado (Não PT-BR?)`; `PT-BR`, `Brasil`, `POB` ou `Dublado` explícito prevalece. O campo `languages` do BeTor mistura áudio e legenda embutida e não serve como prova de áudio. Referências: [readPageLanguage](../src/baixarapido/common.js), [language-discovery](../src/_blocks/language-discovery/index.mjs) e testes [Baixa Rápido](../test/baixarapido.test.js) e [language-discovery](../test/blocks/language-discovery/index.test.mjs).
7. **Limites.** Metadados não comprovam reprodução P2P ou disponibilidade de peers. Não invente índice nem selecione o primeiro vídeo. O idioma da interface do catálogo não comprova áudio PT-BR; só o campo da ficha, o rótulo da opção ou a faixa declarada entram como evidência.

### 3.12. HLS, MP4, áudio e legendas

1. **Situação: Em uso.** Uma URL com aparência de vídeo pode devolver HTML, miniatura ou playlist inadequada.
2. **HLS.** Leia `#EXTM3U`, variantes, resoluções, áudio e legendas. FirePlayer preserva o master quando depende de faixas externas, em vez de devolver vídeo sem áudio. Resolva URLs relativas contra a playlist que respondeu; extensão não basta, pois FSHD também encontra playlist em endereço terminado em `.txt`.
3. **MP4.** RedeFlix sonda por Range, com validação opcional de assinatura `ftyp`; MegaEmbed lê caixas MP4 para obter altura quando disponível no trecho recebido. Não generalize sondagens: confirme necessidade e suporte antes de adicionar requisições.
4. **Legendas e idioma.** Preserve legendas e seus cabeçalhos. Em FSHD, `tracks` da configuração pode conter miniaturas; legendas vêm dos elementos `<track>` e parâmetros de URL pertinentes. Classifique áudio pelos seis valores de `LANGUAGE`, sem promover português sem região a PT-BR comprovado. Áudio estrangeiro conhecido sem legenda PT vira `Gringo`; com legenda PT, `Legendado`. Faixa `und` ou ausente permanece desconhecida.
5. **Referências.** [FirePlayer](../src/_blocks/fireplayer/index.mjs), [MegaEmbed](../src/megaembed/player.js), [RedeFlix](../src/_blocks/redeflix-player/index.mjs), [API FSHD](../src/fshd/api.js) e [configuração FSHD](../src/fshd/packer.js). Testes: [FirePlayer](../test/blocks/fireplayer/index.test.mjs), [MegaEmbed](../test/megaembed.test.js), [RedeFlix](../test/blocks/redeflix-player/index.test.mjs) e [FSHD](../test/fshd.test.js).
6. **Limites.** Não baixe vídeo inteiro para descobrir metadados nem acrescente requisições só para descobrir qualidade; preserve `Desconhecida` sem evidência disponível. Resolução da URL não comprova reprodução no app.

### 3.13. Busca paginada por parâmetro de página

1. **Situação: Em uso no Redes Torrents.** A busca por palavra devolve 20 cartões por página e aceita `pagina=<n>` no mesmo `index.php?busca=<termo>`, com a mesma lista do caminho canônico `/pesquisa/<slug>/pagina/<n>/`.
2. **Investigar.** Confirme o tamanho da página, a quantidade de páginas e o que a fonte devolve depois do fim. No Redes Torrents, em 12/11/2026, a busca por "the last of us" tinha a 2ª temporada na página 6 e a 1ª na página 11; a página 25 tinha 5 cartões e as seguintes repetiam esses 5 cartões.
3. **Ação no provedor.** O leitor percorre a página 1 e avança enquanto houver 20 cartões e nenhuma ficha confirmada, com teto de 12 páginas. A comparação da lista de `href` da página detecta repetição e evita novo laço de fichas; a triagem de tipo, temporada e título continua em cada página antes da consulta de detalhe. Só o primeiro termo de busca recebe a paginação profunda; os termos alternativos leem uma única página.
4. **Referências.** [Leitor `download-row`](../src/baixarapido/download-row.js) e [testes do Baixa Rápido](../test/baixarapido.test.js).
5. **Limites.** O teto de 12 páginas é um limite adotado, não uma garantia de cobertura: títulos depois dele continuam fora da busca. A ordem por data pode mudar entre requisições e a comparação por `href` é heurística, não identidade do post. O método em uso é o do Redes Torrents; elevar o teto ou aplicar a paginação a outras fontes é hipótese até haver evidência e teste próprios.

### 3.13. Catálogo WordPress com player externo e playback cifrado

1. **Situação: Em uso.** A fonte publica filmes em WordPress, oferece várias variantes de player na mesma página e entrega o HLS final depois de uma cadeia de iframes, APIs e um `playback` cifrado. A cadeia foi observada em 12/11/2026.
2. **Investigar.** Confirme a REST de busca (`/wp-json/wp/v2/search` com `subtype` específico) e a identidade na página de detalhe; procure o JSON-LD `Movie`/`TVSeries` com título, título alternativo e data. Na variante que lista os players, leia os botões e o `href` de cada variante; só depois abra a variante escolhida e o iframe ativo. Preserve a URL final de cada salto para o `Referer` seguinte.
3. **Cadeia observada.** Os botões `.vp-source-btn` levam a `?video=N`; a variante EmbedPlay ativa um iframe `embedplayapi.top/embed/<tmdb>`, que expõe `#embed-player[data-movie-id]` e um `.server[data-id]`. A consulta `ajax/get_stream_link` com `id`, `movie`, `is_init=false`, `captcha=` e `ref=` devolve `data.link` em `embedplay.vip`. A página de opções separa os grupos por `data-target`; o grupo Dublado é consultado em `api` com formulário `action=getPlayer&video_id=<id>` e devolve `data.video_url`. O host `embedplaybyse.top` recebe `/api/videos/<código>/` e devolve `playback` com `version`, `key_parts`, `iv` e `payload`.
4. **Decifragem local.** Selecione as partes de `key_parts` pelas posições `version` e `31 - version` (1-based), com fallback para todas quando a versão não mapeia; concatene os bytes base64url e use AES-256-GCM com IV de 12 bytes. No runtime comum, o GCM é reproduzido pelo keystream AES-CTR do próprio GCM (bloco inicial `IV || 00 00 00 02`, incrementando os 32 bits finais) com AES-ECB do `crypto-js`. O JSON decifrado é validado antes de virar stream; a tag GCM não é verificada.
5. **Referências.** [Catálogo](../src/vaqueirofilmes/catalog.js), [identidade](../src/vaqueirofilmes/identity.js), [players](../src/vaqueirofilmes/players.js), [Byse](../src/vaqueirofilmes/byse.js) e [testes](../test/vaqueirofilmes.test.js); fixtures em [test/fixtures/vaqueirofilmes](../test/fixtures/vaqueirofilmes/).
6. **Limites.** A cadeia observada só entrega HLS pela opção EmbedPlay/Byse; Abyss, Loadvid, VidSrc e Superflixapi não entram no contrato atual. A URL HLS é assinada e curta: resolva a cada pedido, sem cache. O catálogo só foi confirmado para filmes; séries e downloads em `enc/go.php` ficam fora. A seleção de `key_parts`, o esquema do playback e a API do player podem mudar, então cada resposta precisa ser validada e a fixture protege apenas o contrato observado.

## 4. Serviços intermediários e enriquecimento

1. Use esta seção quando a fonte já fornecer uma página ou um hash, mas faltar conteúdo legível, o índice de um episódio ou evidência do que há na mídia. Esses serviços podem complementar métodos de catálogo sem pertencer à mesma fonte.
2. Antes de adotar qualquer um, confirme acesso público sem conta e sem chave, contrato, cota, compatibilidade com o app e comportamento em indisponibilidade. Não faça uma dependência opcional virar requisito para toda opção de mídia.

### 4.1. Cache público de torrent para encontrar o índice do episódio

1. **Situação: Em uso.** O bloco [torrent-files](../src/_blocks/torrent-files/index.mjs), consumido por BeTor e outros provedores de torrent, consulta itorrents.org sem conta e sem chave. É um serviço intermediário de metadados, não um serviço que escolhe o episódio remotamente.
2. **Quando usar.** A fonte entrega magnet de pacote de temporada ou faixa de episódios, sem informar qual arquivo corresponde ao pedido. Entregar apenas o magnet pode fazer o app escolher outro vídeo do pacote.
3. **Como funciona.** `fetchTorrentFiles` pede `https://itorrents.org/torrent/<HASH-HEXADECIMAL-EM-MAIÚSCULAS>.torrent`, recebe o arquivo binário e decodifica bencode no aparelho. A saída contém `index` a partir de zero, `path` e `size`, na ordem original do torrent, sem baixar a mídia.
4. **Seleção local.** `findEpisodeFile` procura um único vídeo pelas coordenadas, ignorando amostras. Aceita padrões como `S02E03`, `T02E03` e `2x03`; só com pacote da temporada confirmada admite episódio isolado como `E03` ou `03 - Título`. O índice não é o número do episódio, a posição numa lista ordenada pelo nome ou a posição entre os vídeos após filtrar outros arquivos.
5. **Ação.** Use `buildTorrentFileUrl` para produzir `torrent://<hash>/<índice>` apenas com correspondência única. Deduplique hashes antes da consulta. Valide tanto seleção correta quanto ausência e ambiguidade; HTTP não-2xx e `.torrent` inválido são erros, não uma lista vazia válida.
6. **Referências.** [Bloco](../src/_blocks/torrent-files/index.mjs), [uso no BeTor](../src/betor/extractor.js), [teste do bloco](../test/blocks/torrent-files/index.test.mjs) e [teste BeTor](../test/betor.test.js).
7. **Limites.** O cache pode não conhecer o hash ou estar indisponível. Não invente índice nem substitua o episódio pelo maior arquivo. Obter a lista não confirma áudio, integridade dos frames, disponibilidade de peers ou reprodução. Outro serviço que devolva lista ou índice é **Hipótese** até confirmar hash, ordem e semântica do índice com testes reais.

### 4.2. Verifile para inspecionar o conteúdo real da mídia

1. **Situação: Em uso para consultar resultados existentes.** TheRARBG usa GET em `/api/v1/verifile/<hash>/`. O recurso também pode ser investigado para hashes descobertos em outros catálogos; não é necessário presumir que o catálogo de origem já forneça todos os metadados da mídia.
2. **Contrato externo de referência.** A [documentação do Verifile](https://therarbg.com/verifile/), no trecho fornecido pelo mantenedor em 12/11/2026, descreve análise dos dados reais do torrent: faixas e idiomas de áudio e legenda, codec, dimensões, profundidade de bits, HDR e frame rate, além de decodificação de amostras ao longo do vídeo. A lista de arquivos pode reprovar programas, atalhos e conteúdo sem vídeo antes de baixar mídia.
3. **Leitura do resultado.** Separe `verifile` (classificação do conteúdo), `status` (estado do trabalho) e `phase` (fase de apresentação). `stage`, `progress`, `heartbeatAgeSeconds` e `stuck` descrevem andamento; `reason` e `detail` explicam resultado ou impedimento. `result` reúne `video`, `audio`, `subtitles`, `claimed`, `mismatches` e `samples`; `log` registra passos, não uma evidência a copiar integralmente para o repositório.
4. **Não confundir estados.** `verified` e `failed` não equivalem a `cant_check`, `retried` ou `unknown`. Sem peers (`unreachable`/`no_peers`), formato não suportado e análise pendente não comprovam conteúdo falso. Um trabalho `done` também precisa da classificação adequada; não use qualquer resposta HTTP 200 como aprovação.
5. **Uso atual.** [verifile.js](../src/therarbg/verifile.js) lê somente resultados existentes, com concorrência limitada e parada de novas consultas após HTTP 429. [classify.js](../src/therarbg/classify.js) confere hash, post quando informado, `status=done`, `verifile=verified` e estrutura do resultado antes de classificar faixas. O [extrator](../src/therarbg/extractor.js) relaciona arquivo e episódio e preserva os metadados aplicáveis. Referência de teste: [TheRARBG](../test/therarbg.test.js).
6. **Capacidade externa ainda não integrada.** O trecho documenta POST JSON em `/api/v1/verifile/`, com `infoHash`, para pedir uma análise, inclusive de hash ainda ausente do catálogo; nesse caso, `post` pode ser `null` e o worker busca o torrent no swarm. Isso inicia trabalho remoto e pode adicionar o torrent ao site: não é uma consulta passiva nem comportamento já realizado pelo provedor.
7. **Cota e custo.** O trecho informa dez solicitações de análise por dia UTC sem conta, com `X-Verifile-Limit` e `X-Verifile-Remaining`; exceder a cota devolve HTTP 429 com `scope=verifile_day`. Consultar ou acompanhar também está sujeito a limite de requisições. Não confunda cota de novos trabalhos com rate limit, não adote a modalidade autenticada e reconfirme os limites antes de implementar. Não dispare POST em massa durante investigação ou testes offline.
8. **Acompanhamento externo ainda não integrado.** GET em `/api/v1/verifile/<chave>/events` é descrito como SSE, com `status` inicial, eventos `progress`, estado final e `end`. O exemplo externo usa `EventSource`, que não faz parte das globais permitidas pelo runtime comum deste projeto. Não copie esse cliente para o plugin nem presuma suporte a conexão persistente; uma integração de POST ou acompanhamento exige proposta, avaliação do runtime e testes próprios.
9. **Limites e reaproveitamento.** Verifile não substitui a lista ordenada do `.torrent` para descobrir o índice do episódio, nem comprova sozinho identidade da obra, região PT-BR ou reprodução no aparelho. Evidência de idioma precisa ser normalizada pelo contrato local; metadado de legenda embutida não vira legenda externa sem URL real. O cliente atual é local ao TheRARBG, não um bloco compartilhado: só extraia um bloco quando outro consumidor real demonstrar o padrão.

### 4.3. Leitura intermediada pelo Jina Reader

1. **Situação: Bloco disponível.** [jina-reader](../src/_blocks/jina-reader/index.mjs) tem [testes offline](../test/blocks/jina-reader/index.test.mjs), mas não há import nos provedores atuais. Não é solução já comprovada online por um deles.
2. **Quando investigar.** O `fetch` direto só obtém estrutura dependente de JavaScript ou bloqueio. Antes de intermediar, procure a API pública usada pela página.
3. **Como estudar.** O bloco envia a URL em POST ao Reader e permite HTML, Markdown ou texto, motor, seletores e cache. Confirme conteúdo, URL final, status e adequação dos dados à extração.
4. **Limites.** Use acesso anônimo, sem `apiKey`, conta ou credencial. O catálogo alerta para cota por IP e domínios indisponíveis anonimamente. Contexto de mídia, IP ou cookies do intermediário podem não servir no aparelho; não presuma que ele supera desafios.
5. **Evolução.** Mova para métodos em uso somente quando houver consumidor real, testes do fluxo e evidência online correspondente. Experimentos isolados ficam no design da mudança.

## 5. Da investigação à implementação

1. **Proposta e desenho.** Especifique o comportamento em OpenSpec e registre no design a cadeia observada, método escolhido, limitações e alternativas descartadas. Detalhes de um provedor não pertencem a `docs/arch.md`.
2. **Código mínimo.** Use `src/_template/` como referência de contrato, não obrigação de busca textual. Reutilize blocos; extraia novos somente de padrões observados em provedores reais, atualizando catálogo e suíte correspondente.
3. **Runtime.** Use apenas o QuickJS comum dos apps, sem Node, rede no carregamento do módulo ou timeout próprio. Respeite os limites de cheerio e dos polyfills `URL`/`URLSearchParams` descritos na arquitetura.
4. **Erros e opções.** Lance erro quando faltar dado esperado. Só `getStreams` captura a falha final com `console.error` e retorna `[]`; opção independente pode falhar com `console.warn` preservando as demais. Se todas falharem, o erro sobe. Ausência reconhecida não deve ocultar falha de parsing, rede ou bloqueio.
5. **Streams.** Use `buildStream` e `format`, sem definir `name` ou `title`. Preencha opcionais fornecidos, como cabeçalhos, legendas, tamanho, peers, seeders e metadados de apresentação, sem inventar valores.
6. **Fixtures e testes.** Guarde respostas reais sanitizadas em `test/fixtures/<fonte>/`. Cubra filme, episódio, pacote e ausência quando aplicáveis, além de respostas inválidas, identidade conflitante e falha isolada. Testes Node e de blocos continuam sem internet.
7. **Validação.** Após alterar código, manifest, build ou testes, execute `npm run lint`, `npm test` e `node build.js <id>`. Depois do build, execute `npm run test:online -- --provider <id>` com rede real e chave TMDB somente do ambiente quando necessária. Registre rodada e status em `providers.md`; aprovação offline não autoriza publicação.
8. **Conclusão.** Sincronize documentação e artefatos; arquive a mudança somente com testes previstos passando ou exclusões declaradas. A rodada Node online verifica resolução e contrato, não reprodução no QuickJS ou download P2P.

## 6. Como manter o mapa

1. Consulte o guia ao investigar um novo provedor. Se houver método novo ou variação relevante reutilizável, atualize-o na mesma mudança. Se os métodos existentes bastarem, acrescente referência somente quando trouxer evidência ou esclarecer um limite.
2. Organize por método, não por provedor. Associe consumidores reais para permitir encontrar um caminho sem conhecer o nome de uma implementação anterior.
3. Cada entrada deve registrar situação, sinal de reconhecimento, investigação, contrato observado, código de partida, testes e limites. Identifique referências externas pelo repositório/arquivo e data de consulta quando o contrato puder mudar.
4. Marque ideias sem implementação como **Hipótese**, com a pergunta a responder. Bloco sem consumidor permanece como recurso disponível; não misture essas categorias com uso comprovado.
5. Corrija referências quando arquivos mudarem ou consumidores forem removidos. Reavalie a classificação, sem preservar uma afirmação de uso apenas porque houve implementação no passado.
6. Status e rodadas ficam em `providers.md`, decisões específicas no design e comportamento nas specs. Não duplique logs, títulos aprovados ou garantias de funcionamento atual neste guia.
7. Nunca registre segredos, cookies de sessão, tickets ativos ou URLs assinadas de mídia. Use placeholders e fixtures sanitizadas; respeite GPL-3.0 e atribuição ao reaproveitar código.
