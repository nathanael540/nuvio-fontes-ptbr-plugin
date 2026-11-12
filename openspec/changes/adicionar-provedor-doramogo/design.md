# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://www.doramogo.net/` e orientam as decisões; valores efêmeros de sessão, cookies e URLs assinadas não são registrados aqui.

1. O site não é WordPress. A busca é `https://www.doramogo.net/search/?q=<consulta>` e devolve cartões `.doramogo-search-result-card` com título em `#doramogo-search-result-title`, tipo em `#doramogo-search-result-type` (`Filme` ou `Dorama`), link em `a[href]` e pôster em `https://cdn.doramogo.net/imagens/<tmdbId>_...`.
2. A busca devolve no máximo 18 cartões. Em uma consulta ampla, a página informou 84 resultados, mas `?page=2` devolveu a mesma seleção; não há paginação observada. Consultas por ID do TMDB não funcionam; a busca é textual.
3. A ficha fica em `/series/<slug>`, tanto para série quanto para filme. Ela traz `h1`, o tipo (`Filme` ou `Dorama`), `Áudio:` (`Dublado` ou `Legendado`), `Status`, `Estúdio` e `Duração`. O ano exibido ao lado do título original é a data de publicação no catálogo (por exemplo, 2026 para títulos de 2019 e 2021), não o ano de lançamento.
4. Séries listam as temporadas em `.dorama-one-season-block` e os episódios em `a.dorama-one-episode-item`, com links `.../temporada-<n>/episodio-<nn>`. Há séries com três temporadas, todas presentes no HTML da ficha.
5. Filmes usam a mesma rota `/series/<slug>` e uma entrada pseudoepisódio `.../temporada-1/episodio-01` com o rótulo `FILME Assistir Filme`. A página do filme declara `tipo: "filmes"`; a da série declara `tipo: "doramas"`.
6. A página do episódio publica `var urlConfig = { base, slug, tipo, temporada, episodio }`, `const PRIMARY_URL = "https://ondemand.madfirebox.shop"` e `const FALLBACK_URL = "..."`. O caminho é montado pela própria página: `<primeira letra do slug em maiúscula>/<slug>/<temporada com 2 dígitos>-temporada/<episódio com 2 dígitos>/stream.m3u8` para série e `<primeira letra>/<slug>/stream/stream.m3u8` para filme.
7. O host primário de mídia respondeu HTTP 403 nas sondagens, mesmo com `Referer`. O host alternativo publicado (`https://forks-doramas.madfirebox.shop` para séries e `https://forks-filmes.madfirebox.shop` para filmes) respondeu 200 para playlists de série, temporada posterior e filme. Sem `Referer`, o host alternativo respondeu 403; com `Referer` de qualquer página do Doramogo, respondeu 200. `Origin` não foi necessário nos testes de série, mas é enviado junto por `playbackHeaders`.
8. A playlist é uma lista de mídia com segmentos `.ts`, sem `RESOLUTION` nem rótulo de qualidade. O site anuncia "HD" genericamente, mas não informa resolução; a qualidade fica desconhecida.
9. O rótulo `Áudio:` da ficha é confiável por página: `Pousando no Amor` e `Vincenzo` declaram `Dublado`; `Itaewon Class (Legendado)` declara `Legendado`. O título da página diz "Dublado e Legendado" em todos os casos, então esse texto genérico não serve para classificar o stream.
10. O ID do TMDB aparece no nome do arquivo do pôster e coincide com o ID conhecido: `94796_T1_tv_size.webp` (Pousando no Amor), `117376_T1_tv_size.webp` (Vincenzo), `96162_T1_tv_size.webp` (Itaewon Class), `1269208_movie_size.webp` (Meus 84 m²) e `437109_movie_size.webp` (A Vilã). A ficha também traz pôsteres de relacionados; é preciso ler o pôster principal, não os relacionados.
11. Um episódio inexistente pode redirecionar para o último episódio disponível: `.../temporada-1/episodio-17` de Pousando no Amor terminou em `.../episodio-16`, com HTTP 200. A coordenada final precisa ser conferida; não basta o status.
12. Restrições do runtime: apenas a API básica do cheerio (`load`, seleção CSS, `eq`, `find`, `text`, `attr`), sem APIs do Node e sem timeout próprio; o build transpila para `es2016`. O teste offline usa `test/support/basic-html.js`, que não oferece `each`, `map` nem `html`; a leitura de scripts deve ser feita sobre a string HTML.

## Goals / Non-Goals

**Goals:**

1. Confirmar a identidade pelo ID do TMDB sem depender do ano exibido pela fonte.
2. Cobrir filme, série, temporada posterior e as variantes dublada e legendada publicadas em páginas distintas.
3. Montar a URL HLS a partir do host e do caminho publicados pela página, sem fixar CDN no código.
4. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online no perfil generalista.

**Non-Goals:**

1. Adicionar ou alterar blocos: `tmdb-info`, `http`, `stream-build` e `language-discovery` atendem ao fluxo.
2. Criar perfil de nicho nesta mudança: o catálogo `movie` não tem cinco títulos com a tag `dorama`; um perfil exclusivo falharia na preparação. A curadoria de filmes asiáticos fica para uma mudança própria.
3. Baixar mídia, sondar a playlist, reproduzir no aparelho ou garantir disponibilidade futura do CDN.
4. Inventar qualidade, tamanho, legendas externas ou áudio que a fonte não declare.
5. Contornar Cloudflare, conta, chave ou qualquer proteção; o host alternativo é público e publicado pela própria página.

## Decisions

### D1. Identidade pelo ID do TMDB no pôster

1. Montar a lista de consultas com `media.title`, `media.originalTitle` e `media.alternativeTitles`, deduplicando por `normalizeText`.
2. Para cada consulta, ler os cartões do tipo esperado e extrair título, URL e ID do pôster com `/(?:cdn\.doramogo\.net\/imagens\/)(\d+)_/`.
3. Confirmar o candidato quando o ID do pôster for igual a `media.tmdbId`. Não usar o ano da ficha: ele é a data de publicação no catálogo e divergiu em todos os exemplos.
4. Se o cartão não expuser ID no pôster, consultar a ficha e repetir a leitura no pôster principal. Só aceitar se o ID for igual; usar `titleSimilarity` apenas para limitar quais fichas sem ID são consultadas.
5. Coletar candidatos de todas as consultas e deduplicar por URL. Cada página confirmada é uma variante de áudio; a mesma obra pode ter uma página dublada e outra legendada.
6. Alternativas descartadas:
   1. `findBestMatch` sozinho: o título do cartão pode trazer `(Legendado)` ou `(Dublado)` e o ano da ficha não é o de lançamento; a confirmação por ID é mais forte.
   2. Buscar pelo ID do TMDB: a busca do site é textual e devolveu zero para IDs testados.
   3. Confiar no ano da ficha: reprovaria títulos corretos ou aceitaria o ano errado.
7. Limite conhecido: a busca publica 18 cartões e não pagina. Consultas com o título completo e as variantes do TMDB tendem a trazer o título para o recorte; se ele não estiver no recorte, a ausência é registrada, sem inventar paginação.

### D2. Cada variante confirmada é uma opção independente

1. A busca e o TMDB são etapas fatais: falha de rede, resposta inválida ou ausência de candidato encerram o pedido conforme o contrato (erro ou lista vazia).
2. Cada página confirmada (variante de áudio) é resolvida isoladamente: ficha, seleção de episódio ou filme, página do episódio, configuração e stream.
3. A falha de uma variante gera `console.warn('[Doramogo] Opção <rótulo> descartada: <causa>')` e não impede as demais.
4. Se nenhuma variante produzir stream e ao menos uma falhou, o erro sobe com a causa de cada uma. Se todas terminarem em ausência reconhecida, a saída é lista vazia.
5. Alternativa descartada: tratar a ficha como etapa fatal e parar na primeira falha. Isso perderia a variante legendada quando a dublada estivesse quebrada e misturaria ausência com falha.

### D3. Seleção de episódio, filme e ausência

1. Série: percorrer `a.dorama-one-episode-item`, ler `temporada-<n>/episodio-<nn>` do `href` e exigir a coordenada exata. Se não houver link, a variante termina em ausência.
2. A lista de episódios é a confirmação de existência; não usar a posição visual nem o texto do link. Todas as temporadas estão no HTML, então não é preciso interagir com o botão de temporada.
3. Buscar a página do episódio com `fetchPage` para conhecer a URL final. Se a URL final tiver outra temporada ou episódio, tratar como ausência (caso do episódio 17 que redireciona para o 16). Se a página listada responder 404, é falha, não ausência.
4. Filme: procurar a entrada `temporada-1/episodio-01` na ficha. Se não houver, ausência. Buscar com `fetchPage` e exigir a mesma URL final e `tipo` de filme.
5. Ler `var urlConfig` e `const FALLBACK_URL` da página do episódio. Validar `slug` contra o slug da ficha, `tipo` (`doramas` para série, `filmes` para filme) e, em série, temporada e episódio. Divergência entre a URL final e a coordenada é ausência; configuração ausente, `tipo` desconhecido ou slug diferente é erro de estrutura.
6. Alternativa descartada: construir a URL do episódio apenas com o pedido do app e ignorar a lista da ficha. Isso devolveria episódios redirecionados ou inexistentes como se existissem.

### D4. Caminho HLS publicado e host alternativo

1. Montar o caminho com o `slug` e o `tipo` lidos do `urlConfig`, usando a primeira letra do slug em maiúscula:
   1. Série: `<letra>/<slug>/<temporada com 2 dígitos>-temporada/<episódio com 2 dígitos>/stream.m3u8`.
   2. Filme: `<letra>/<slug>/stream/stream.m3u8`.
2. Usar o `FALLBACK_URL` publicado na página como host. O host primário respondeu 403 nas sondagens; o alternativo respondeu 200 para os casos de série, temporada posterior e filme.
3. Não fixar `forks-doramas` nem `forks-filmes` no código: a página publica o host e ele pode mudar. Se o host não estiver presente, erro de estrutura.
4. Não acrescentar `?nocache`: a URL sem query respondeu 200 e é estável para teste. O site usa o parâmetro apenas para cache busting.
5. Não sondar a playlist. A página do episódio é a fonte de verdade do caminho; uma sondagem extra por stream não é necessária para montar o contrato e a verificação online não reproduz mídia. Se o host passar a devolver 404 para um caminho publicado, a falha aparece na rodada online e pode ser tratada em mudança própria.
6. Alternativa descartada: usar o host primário com algum cookie de sessão. A regra do repositório proíbe depender de sessão pessoal; o alternativo é publicado pela própria página e funciona sem conta.

### D5. Cabeçalhos de reprodução

1. Usar `playbackHeaders(page.url)`: `User-Agent` padrão, `Referer` da página do episódio e `Origin` da origem do Doramogo.
2. A fonte exige `Referer` no host alternativo: sem ele, a playlist respondeu 403; com ele, 200. Os segmentos `.ts` também responderam 403 sem `Referer` e 200 com ele.
3. Não enviar `Range`; o app ignora esse cabeçalho na reprodução e ele não é necessário para montar o stream.
4. Limite: o harness online valida o contrato do stream, não a reprodução no QuickJS. Os cabeçalhos são os mesmos que o navegador da fonte envia e ficam no campo `headers` do stream.

### D6. Idioma pelo rótulo da ficha

1. Ler o rótulo `Áudio:` da ficha com uma expressão sobre o HTML, sem depender do título genérico "Dublado e Legendado".
2. Normalizar com `normalizeLanguage`: `Dublado` vira `LANGUAGE.DUBBED`; `Legendado` vira `LANGUAGE.SUBTITLED`.
3. Sem rótulo reconhecível, usar `LANGUAGE.UNKNOWN`; não promover português sem evidência.
4. A variante de áudio é a página, não uma faixa dentro do mesmo arquivo: páginas diferentes podem ter o mesmo ID do TMDB e rótulos diferentes. Todas as confirmadas são devolvidas.

### D7. Contrato dos streams

1. Montar cada stream com `buildStream`:
   1. `url` HLS montada na D4.
   2. `headers` de `playbackHeaders`.
   3. `language` da D6.
   4. `provider: 'doramogo'` e `type: 'hls'`.
   5. `format: { template: FORMATTER.AUTO, addon: 'Doramogo', title: media.title, year: media.year, season, episode }`.
2. Não informar `quality`: a fonte não publica resolução; `buildStream` descobre localmente e usa `Desconhecida` quando não há correspondência. O cabeçalho "HD" do site não é uma resolução.
3. Não informar `size` nem `subtitles`: a fonte não os publica.
4. Ordenar com `sortByQuality` no ponto de entrada, como no template.
5. Deduplicar streams por `url` antes de ordenar, caso duas páginas confirmadas apontem para o mesmo arquivo.

### D8. Manifesto, perfil online e documentação

1. `manifest.json`: `id` `doramogo`, nome `Doramogo`, descrição dos filmes e séries dublados/legendados em HLS, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, `filename` `providers/doramogo.js`, `enabled` verdadeiro, formatos `["m3u8"]`, `contentLanguage` `["pt"]` e logo PNG HTTPS do site (`.../images/icon-tile.png`).
2. `providers.md`: linha e seção com `🟠 Não verificado` e `—` até a rodada online. O bloco de verificação só é preenchido pela execução explícita.
3. Sem perfil de nicho: `test/online/profiles.json` não muda. O catálogo `movie` tem zero títulos com a tag `dorama`; o `tv` tem seis. Um perfil `dorama` exigiria cinco filmes elegíveis e falharia na preparação. A rodada usa o perfil generalista e deve escolher uma semente que inclua ao menos um título de dorama no `tv`, registrando a semente e a seleção; sem isso, a amostra pode não representar o nicho da fonte.
4. `docs/provider-investigation.md` recebe um método novo: busca HTML com confirmação pelo ID do TMDB no nome da imagem, leitura do caminho de mídia publicado (`urlConfig` + host alternativo) e exigência de `Referer` no host de mídia. Referências: `src/doramogo/` e `test/doramogo.test.js`. Limites: busca de 18 cartões sem paginação, ano da ficha não confiável, host primário 403 e ausência de qualidade publicada.
5. `src/_blocks/index.md` não muda: nenhum bloco novo ou alterado.

### D9. Testes offline

1. Fixtures reais sanitizadas em `test/fixtures/doramogo/`:
   1. Busca com resultado único, busca com variante legendada e busca sem resultado.
   2. Ficha de série com uma temporada, ficha com três temporadas e ficha de filme.
   3. Página de episódio de série, de temporada posterior, de filme e de episódio redirecionado.
   4. Página de ficha ou episódio sem a configuração esperada.
2. `test/doramogo.test.js` empacota o provedor nos formatos publicados, simula o TMDB e a fonte com `basic-html` e cobre:
   1. Carregamento CommonJS sem rede e entradas inválidas antes de qualquer requisição.
   2. Filme, episódio avulso, temporada posterior, variante legendada e duas variantes de áudio.
   3. Ausência de título, de episódio e de entrada de filme.
   4. Tipo conflitante, ID conflitante, redirecionamento de episódio, configuração ausente e falha isolada de variante.
   5. Campos do stream, `language`, `provider`, `type`, qualidade desconhecida, ausência de tamanho/legendas e `name`/`title` nos dois formatos.
3. Não usar rede nos testes; a verificação online é a única etapa com acesso real.

## Risks / Trade-offs

1. **Busca limitada a 18 cartões, sem paginação** → usar o título completo e as variantes do TMDB; se o título não estiver no recorte, a saída é vazia. Uma paginação futura exige mudança própria.
2. **Host primário 403** → usar o host alternativo publicado na página; se ele mudar, o parser acompanha; se desaparecer, a falha sobe como erro, não como ausência.
3. **Hotlink protection por `Referer`** → incluir `Referer` da página do episódio, `Origin` e `User-Agent`. Sem eles, a playlist e os segmentos respondem 403.
4. **Ano da ficha não é o de lançamento** → confirmar pelo ID do TMDB; o ano do TMDB é usado apenas na apresentação do stream.
5. **Configuração publicada e layout podem mudar** → validar `urlConfig`, `tipo`, `slug` e coordenadas; seletores ausentes viram erro de estrutura, não ausência silenciosa. Fixtures e testes cobrem o caminho normal.
6. **Playlist não é sondada** → um caminho publicado pode estar sem mídia; a rodada online mede a resolução do contrato, não a reprodução. Sondar cada stream adicionaria requisições e não seria suficiente para garantir reprodução no aparelho.
7. **Perfil generalista pode não sortear doramas** → escolher e registrar uma semente que inclua ao menos um título de dorama no `tv`; a rodada continua avaliando os cinco casos de cada tipo, sem trocar títulos individualmente.
8. **Duas variantes de áudio podem apontar para a mesma URL** → deduplicar por `url` antes de ordenar.
9. **Cloudflare e bloqueio de bot** → usar os perfis de `http` e os cabeçalhos de reprodução; não implementar bypass, conta ou cookie de sessão. Uma resposta 200 com desafio não é ausência.
10. **Uso de conteúdo de terceiros** → o repositório não hospeda mídia; o provedor apenas publica o caminho HLS da fonte. A responsabilidade de uso permanece com quem utiliza.

## Migration Plan

1. Capturar e sanitizar as fixtures; implementar a leitura de busca, ficha e episódio com testes de parsing.
2. Implementar o extrator, o ponto de entrada e a montagem dos streams; cobrir os casos de filme, série, temporada posterior, variantes, ausência e falhas.
3. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o método em `docs/provider-investigation.md`.
4. Rodar `npm run lint`, `npm test` e `node build.js doramogo`; confirmar os três pacotes e os manifests de formato.
5. Executar `npm run test:online -- --provider doramogo` com `TMDB_API_KEY` apenas no ambiente e uma semente que inclua ao menos um dorama no `tv`; registrar a rodada e ajustar o status.
6. Arquivar a mudança somente com os testes previstos passando ou com a exclusão declarada. Rollback: remover a entrada do manifest, os arquivos gerados, a seção de `providers.md` e o método do guia; nenhum bloco ou catálogo é alterado.

## Open Questions

1. A busca do site passará a paginar? Hoje o recorte é 18 cartões e `?page=2` repete a primeira página; a resposta não muda o desenho atual.
2. Haverá mais de duas variantes de áudio por título? O código devolve todas as páginas confirmadas; não há decisão pendente.
3. O host alternativo continuará publicado com o mesmo contrato? Ele é lido da página a cada pedido; uma mudança de host é absorvida, e a remoção vira erro de estrutura.
4. O catálogo `movie` ganhará cinco títulos com a tag `dorama` para um perfil exclusivo? Fica para uma curadoria própria, porque a alteração de catálogo invalida a evidência online dos demais provedores.
