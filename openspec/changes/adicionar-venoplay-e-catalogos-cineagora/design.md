# Design

## Context

O CineAgora já é um provedor DLE com um catálogo e o player BrStream: `src/cineagora/catalog.js` busca e confirma a identidade em `cineagora.club`; `src/cineagora/player.js` lê `.mirrors .button`, resolve o objeto `video` e monta a master HLS; `src/cineagora/index.js` valida a entrada, chama o TMDB, resolve o player e ordena os streams. As specs `cineagora-catalog` e `cineagora-player` descrevem esse contrato.

O VenoPlay não é coberto. A fonte tem busca textual, uma página de título com JSON-LD, o endpoint `get_players` com os rótulos `Dublado`/`Legendado` e o player `mgeb` por ID do TMDB. O acesso é público, sem conta e sem chave; a única chave externa é o `TMDB_API_KEY` que o app já fornece.

As observações de 2026-11-18 que sustentam o desenho:

1. **CineAgora, CineGratis e VisionCine são a mesma rede BrStream.** Em Clube da Luta (TMDB 550) e em Breaking Bad S01E01 (TMDB 1396), os três catálogos devolveram o mesmo `video_slug`, o mesmo `id`, o mesmo `uid` e o mesmo `md5` no player `watch.brstream.cc`.
2. **Os catálogos têm marcações diferentes.** CineAgora usa resultados `a.item` e espelhos `.mirrors .button`; CineGratis usa resultados `li.film a.tt`, página com `h1 > a`/`h2` e espelhos `.player__mirrors .mirror`; VisionCine usa cartões `div.poster-container` e espelhos `.mirrors a.nav-link`. A página do VisionCine respondeu 403 sem `Referer` e 200 com ele.
3. **A identidade varia por catálogo.** CineAgora publica título, ano e IMDb em seletores próprios; CineGratis publica título e ano no resultado e IMDb no JSON-LD; VisionCine publica título e ano, sem IMDb no HTML.
4. **A VenoPlay resolve por busca.** A semente `www2.venoplay.com` respondeu com o host final `w2.venoplay.site`; a busca em `/busca?q=` devolve cartões com título e tipo; a página publica JSON-LD com `@type` e ano; o `get_players` devolveu `Dublado` em `mgeb.space` e `Legendado` em `nhdapi.com` para filme e série.
5. **O player `mgeb` entrega HLS.** O embed respondeu 200 com `var sources`; o HLS de `mgeb.space` respondeu 206 `application/vnd.apple.mpegurl` para Breaking Bad S01E01; `mgeb.lat` também respondeu 200 e serve como reserva. `novix.x10.mx` respondeu 401, `infrastructuredesign.space` respondeu 404 e uma fonte `fontedecanais` respondeu 206 com `username`/`token` embutidos, que não podem ser usados. O `nhdapi.com` recusou conexão.

## Goals / Non-Goals

**Goals:**

1. Adicionar o VenoPlay como provedor `movie`/`tv`, com busca, identidade, `get_players` e HLS dublado.
2. Ampliar o CineAgora para buscar em três catálogos da mesma rede, unir os resultados e entregar cada arquivo BrStream uma única vez.
3. Manter o contrato do player BrStream e a fronteira de erro atuais.
4. Cobrir as fontes com testes offline e registrar a evidência online do pacote final.

**Non-Goals:**

1. Criar dois provedores novos para CineGratis e VisionCine; a mesma rede entra como catálogos.
2. Resolver `nhdapi.com`, hosts não comprovados do `mgeb`, Byse API v2, Blogger `batchexecute` ou qualquer item do levantamento de concorrentes fora deste escopo.
3. Fazer sonda de mídia para descobrir qualidade, usar `setTimeout` como timeout próprio, captcha, settings ou cache de URL de mídia.
4. Alterar o contrato do app, os blocos existentes ou `docs/arch.md`.

## Decisions

### D1. CineGratis e VisionCine entram como catálogos do CineAgora

A regra de `docs/arch.md` §4.10 manda tratar sites da mesma rede (mesmo acervo e mesmos hashes) como catálogos de um único provedor. A evidência de filme e série mostra o mesmo arquivo BrStream nos três sites. Criar três entradas no manifest duplicaria cada stream na lista do app e multiplicaria a manutenção sem ampliar a busca.

Alternativas:

1. **Três provedores independentes.** Descartada: duplica streams e contraria a regra de rede.
2. **Dois provedores novos e o CineAgora intacto.** Descartada pelo mesmo motivo; a diferença de marcação é resolvida por configuração de catálogo, não por provedor.
3. **Um provedor com três catálogos.** Escolhida.

O manifest ganha apenas a entrada do VenoPlay; a entrada do CineAgora muda de versão e descrição. Os nomes CineGratis e VisionCine aparecem na descrição, nos testes e em `providers.md`, não como `scrapers`.

### D2. A VenoPlay usa o fluxo oficial de busca e `get_players`

A rota direta do concorrente (`mgeb.lat/embed/<tmdb>`) funciona, mas devolve fontes sem rótulo de idioma e sem confirmação de título/ano. A rota oficial entrega o mesmo player com o rótulo `Dublado`/`Legendado` e permite confirmar o ano no JSON-LD. Como o nosso contrato exige idioma confiável, a rota oficial é a escolha.

Alternativas:

1. **Rota direta por TMDB.** Descartada: não informa idioma e não confirma o título; serve apenas como atalho do concorrente.
2. **Rota oficial com busca textual.** Escolhida; usa `TMDB_API_KEY` para o título, mas mantém idioma, tipo e ano verificáveis.
3. **Híbrido com fallback direto.** Descartado nesta versão: mistura dois contratos e pode devolver um stream sem idioma quando a busca falhar, mascarando ausência.

O `mediaId` interno é extraído da página; o `get_players` recebe `season_number` e `episode_number` vazios em filme e as coordenadas em série. O `site_id=4` é uma constante de protocolo do site, não uma credencial.

### D3. Configuração por catálogo no CineAgora

`src/cineagora/catalogs.js` passa a declarar os três catálogos com: `id`, `name`, `baseUrl`, `hosts` aceitos, `sections` de filme e série, `searchUrl`, `parseResults`, `readIdentity` e `mirrorSelector`. O `catalog.js` mantém uma única orquestração e chama o adaptador de cada catálogo. A configuração é estática e local; não há descoberta de domínio nem cache.

A busca dos três catálogos roda em paralelo, com cada promessa convertida em `{ ok, value }` ou `{ ok: false, error }` antes de `Promise.all`, porque `Promise.allSettled` não foi confirmado no runtime. Dentro de um catálogo, as consultas continuam sequenciais e param no primeiro candidato confirmado. Os players são resolvidos em ordem de catálogo (CineAgora, CineGratis, VisionCine) para que o primeiro rótulo prevaleça na deduplicação.

### D4. Identidade por catálogo

1. **CineAgora.** Mantém os seletores atuais: `h1.title`, `span.date a` e `div.imdb a`; a regra de IMDb, título e ano continua.
2. **CineGratis.** O resultado `li.film a.tt` traz o título PT-BR, `h2.film-tt .kt` o original e `span.film-yil` o ano; a página confirma `h1 > a`, `h2` e, quando o JSON-LD publicar, o IMDb em `sameAs`. A busca por IMDb com um único resultado do tipo também confirma, porque o índice do site casa o ID.
3. **VisionCine.** O cartão `div.poster-container` traz o título no `img[alt]`/`title` e o ano em `.poster-year`; a página confirma o `h1` com o título PT-BR e o `<small>` com o original, e o ano no `<title>`. A página não publica IMDb; a busca por IMDb com um único resultado do tipo é a confirmação de identidade, sempre acompanhada de título e ano compatíveis.
4. **Ambiguidade.** É por catálogo e termo. O mesmo título confirmado em vários catálogos é o caso esperado e segue para o player em todos.

A busca por IMDb é a primeira em todos; sem candidato, o título PT-BR e o original. Cada catálogo abre no máximo três candidatos por termo. Página sem título ou ano no formato esperado é erro de estrutura daquele catálogo, não ausência.

### D5. União e deduplicação

O `index.js` recebe os catálogos confirmados e resolve o player em ordem. O `resolvePlayer` passa a receber um `Set` compartilhado de chaves; cada opção resolvida calcula `uid|md5|id` e só entra se a chave for nova. O primeiro catálogo na ordem fornece o rótulo e os detalhes da release; os demais são ignorados quando o arquivo é o mesmo.

Se o player não tiver `uid`, `md5` ou `id` válidos, a opção já falha pelo contrato atual e não entra na união. Não há deduplicação por título; arquivos distintos continuam distintos.

### D6. Leitura dos espelhos

`readMirrors` deixa de ser fixo em `.mirrors .button` e passa a receber o seletor do catálogo. A leitura percorre os elementos do seletor, ignora os que não têm `data-link`, resolve o link contra a página e mantém apenas `watch.brstream.cc`. O texto do elemento, sem as tags internas do SVG, é o rótulo; rótulo vazio vira `#<n>` e a release continua como dica de idioma.

O comportamento de lançar erro em botão sem `data-link` é substituído por triagem, porque CineGratis e VisionCine têm elementos de trailer e de modal na mesma área. Isso não muda a resolução do BrStream nem o contrato dos streams.

### D7. Fluxo da VenoPlay

1. **Entrada.** `tmdbId` numérico, `movie`/`tv` e, em série, temporada/episódio inteiros a partir de 1; inválido não faz rede.
2. **TMDB.** `getMediaInfo` fornece título PT-BR, original e ano; é a única chave externa.
3. **Semente.** `fetchPage('https://www2.venoplay.com')`, usar o host final em busca, página e API; sem redirecionamento, usar o host da semente; em falha, `https://w2.venoplay.site`. Sem cache.
4. **Busca.** `GET /busca?q=<termo>` com título PT-BR e original; ler os `div.poster-card`, deduplicar cartões repetidos por URL, confirmar título exato e tipo `Filme`/`Série`.
5. **Página.** Abrir o cartão, ler o JSON-LD (`@type` `Movie`/`TVSeries` e `datePublished`), confirmar o ano, extrair o `mediaId` de `const mediaId = <n>` ou da chamada `get_players?id=<n>`.
6. **Players.** `GET /api/get_players?id=<id>&season_number=<s>&episode_number=<e>&site_id=4` com `Referer` da página, `X-Requested-With` e `Accept: application/json`; validar `players` como lista.
7. **mgeb.** Para cada item `Dublado` com host `mgeb.space`/`mgeb.lat`, abrir o embed, ler `var sources`, manter HLS `.m3u8` HTTPS de `mgeb.space`, rejeitar `workers.dev`, `username`, `token`, `password`, `fontedecanais`, `novix.x10.mx` e `infrastructuredesign.space`; em falha do host, tentar o outro host `mgeb` uma vez.
8. **Legendado.** `nhdapi.com` é triagem sem requisição; o host recusou conexão na observação.
9. **Streams.** `buildStream` com `FORMATTER.AUTO`, `addon` `VenoPlay`, `provider` `MGEB`, `type` `hls`, título/ano, temporada/episódio, idioma do rótulo e `quality` `Desconhecida`; sem sonda, sem `name`/`title`.

### D8. Fronteira de erro e ausência

1. **VenoPlay.** Busca, página, `get_players` e todas as opções são fatais quando falham; o `getStreams` registra `[VenoPlay] ...` e devolve `[]`. Título ausente, `players` vazio, `sources` vazio ou só triagem são ausência sem `console.error`.
2. **CineAgora.** A falha de um catálogo é isolada; se outro produzir stream, o resultado é mantido com `console.warn('[CineAgora] Catálogo <nome> descartado: <causa>')`. Se nenhum produzir stream e algum falhou, o erro agregado sobe e o `getStreams` registra `[CineAgora]` e devolve `[]`. Se todos forem ausência, a saída é `[]` sem erro.
3. **Opções.** Cada espelho BrStream e cada player `mgeb` continua isolado; a falha de uma opção não descarta as demais.
4. **Logs.** Nenhuma mensagem contém URL de mídia, token, `username`, `md5` ou a chave do TMDB. As fixtures usam identificadores sintéticos.

### D9. Sem bloco novo

As mudanças são específicas de catálogo e de fonte: a variação DLE multi-site depende de seletores e seções de cada site, e o fluxo VenoPlay depende de `get_players` e do player `mgeb`. Não há um segundo consumidor real que justifique um bloco. `blogger-video`, `http`, `script-extract`, `stream-build`, `custom-formatter`, `tmdb-info`, `title-match`, `language-discovery` e `quality-discovery` cobrem o que é comum. `docs/arch.md` e `src/_blocks/index.md` não mudam.

### D10. Testes e evidência

1. **Fixtures.** `test/fixtures/venoplay/` com busca, busca vazia, página de filme, página de série, `get_players` de filme/série, `players` vazio, `mgeb` com HLS válido, com credencial, com worker, sem `sources` e com host alternativo. `test/fixtures/cineagora/` ganha busca/página/espelho de CineGratis e VisionCine e os casos de deduplicação. Nenhuma fixture contém URL de mídia real, token, cookie ou hash de arquivo.
2. **Offline.** Testes do pacote gerado com `fetch` simulado; filme, série, ausência, ambiguidade, falha de catálogo, dedupe e rótulos.
3. **Online.** `npm run test:online -- --provider venoplay --record` e `--provider cineagora --record`, com a chave só no ambiente. A versão nova do CineAgora invalida a evidência antiga; a linha volta a `🟠 Não verificado` até a rodada e só então recebe o status.
4. **Documentação.** `providers.md` registra as duas linhas/seções; `docs/provider-investigation.md` §3.14 ganha a variação de catálogos DLE com o mesmo player BrStream e uma seção nova (3.38) descreve a busca + `get_players` + `mgeb`.

## Risks / Trade-offs

1. **VenoPlay muda o layout ou bloqueia a busca.** → O fluxo usa o host final, confirma título/tipo/ano e isola a falha; a rodada online mede a cobertura. Sem título confirmado, a saída é ausência, não stream inventado.
2. **`mgeb.space` bloqueia ou muda o `var sources`.** → Fallback para `mgeb.lat`; página sem `sources` é erro de estrutura; HLS de host não comprovado é triagem. Títulos só com fontes quebradas ficam sem stream, o que é ausência.
3. **`nhdapi.com` continua indisponível.** → O `Legendado` é triagem; o provedor entrega só `Dublado` e a descrição/status registram o limite. Se o host voltar, uma mudança própria o adiciona com fixture.
4. **CineGratis ou VisionCine mudam o layout.** → Cada catálogo tem adaptador, fixtures e erro isolado; a falha de um não derruba os outros. A rodada online mostra a cobertura real.
5. **VisionCine não publica IMDb.** → A busca por IMDb com um único resultado do tipo, mais título e ano exatos, é a confirmação; ambiguidade ou ano divergente viram ausência. O risco de falso positivo é menor que aceitar o primeiro cartão.
6. **O `datePublished` de um catálogo pode ser a data do post, não o ano do título.** → O CineAgora continua lendo o ano de `span.date`; CineGratis usa `span.film-yil` do resultado; VisionCine usa `.poster-year`/`<title>`; o VenoPlay usa o `datePublished` do JSON-LD dele, conferido em filme e série.
7. **A chave de dedupe pode variar entre catálogos.** → A evidência mostra o mesmo `uid`/`md5`/`id`; se um catálogo divergir, os arquivos ficam como streams distintos, sem perda de mídia. A dedupe por URL fica como reserva documentada no teste.
8. **A versão nova do CineAgora invalida a rodada antiga.** → A linha e a seção voltam a `🟠 Não verificado`; a rodada online do pacote final define o status. Não reaproveitar a evidência anterior.
9. **A VenoPlay exige `TMDB_API_KEY`.** → Sem a chave, a chamada é inconclusiva por configuração; o README já documenta o requisito. Não há chave no repositório.
10. **Três catálogos aumentam a latência.** → Busca concorrente entre catálogos, consultas sequenciais dentro de cada um e parada no primeiro confirmado; o app gerencia o tempo e o provedor não impõe timeout próprio.

## Migration Plan

1. Criar `src/venoplay/` e os adaptadores de catálogo do CineAgora; manter o contrato de `getStreams` e os blocos existentes.
2. Atualizar `manifest.json`: nova entrada `venoplay` e versão/descrição do `cineagora`.
3. Atualizar `providers.md`: nova linha/seção do VenoPlay e CineAgora com `🟠 Não verificado` e data `—`.
4. Rodar `npm run lint`, `npm test`, `node build.js venoplay` e `node build.js cineagora`; conferir os três pacotes e os manifests de formato.
5. Rodar as duas verificações online com a chave só no ambiente e registrar o resultado real em `providers.md`; só então promover o status.
6. Arquivar a mudança após a revisão e a evidência online, ou declarar explicitamente o que ficou fora.

Rollback: reverter os arquivos do provedor, as entradas do manifest e as seções de `providers.md`; não há estado persistido, migração de dados ou cache a limpar.
