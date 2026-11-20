# Design

## Context

O RedeCanais (`https://redecanais.lt`) é um catálogo PT-BR em PhpMelody com o tema Echo. A página inicial responde `HTTP 200` ao `fetch` direto, sem cookie, conta ou desafio anti-bot, e publica `pm_video_data`, `MELODYURL2` e o formulário `GET /search.php?keywords=<termo>`.

A investigação de 20/11/2026 usou somente a URL pública, com `fetch` e leitura de HTML. Nenhum scraper externo foi consultado.

1. **Busca.** `GET /search.php?keywords=<termo>` devolve oito cartões por página e paginação `&page=<n>`. O cartão é `div.thumbnail .caption h3 a`, com texto `Título (Dublado|Legendado) - AAAA - Qualidade`. Busca válida sem cartões não publica mensagem própria; a página mantém o título `Buscar Conteúdo RedeCanais: <termo>`. Uma resposta sem esse título não é busca válida.
2. **Tipo.** Série publica `/<slug>-lista-de-episodios_<hash>.html`; filme publica `/<slug>_<hash>.html`. O mesmo padrão vale para animes, novelas e desenhos, que o app pede como `movie` ou `tv`.
3. **Identidade.** A fonte não publica o ID do TMDB. As fichas têm `h1` no formato `Título (Dublado|Legendado) - AAAA - Qualidade` e JSON-LD `Movie`/`TVSeries` com `name` e `dateCreated`. A confirmação é textual, por título e ano, como em outros provedores do repositório.
4. **Série.** A página da série publica os episódios em `div[itemprop="description"]`, com cabeçalhos `Nª Temporada` e links `...-<N>a-temporada-episodio-<M>-..._<hash>.html`. Em 24 páginas de série sorteadas, os 869 links de episódio seguiram esse par. O `h1` do episódio confirma `Nª Temporada - Episódio N`. O texto do episódio é genérico (`Dublado e Legendado`), e o marcador real pode estar no link (`-leg-`) ou no título (`[LEG]`). O rótulo da série nem sempre corresponde ao áudio dos episódios: `Ninguém Além de Você (Dublado)` publica episódios `[LEG]`.
5. **Player.** A ficha publica `iframe[name="Player"]` com `/player3/server.php?categoria=vod&server=R2&subfolder=media&vid=r2-<id>`. O player responde `HTTP 403` sem `Referer` e `HTTP 200` com `Referer` de qualquer página de `redecanais.lt`. O HTML publica `var SRC`, `var SOURCE_FORMAT` e `var SOURCE_MIME`. Na amostra, todos os players usaram `SOURCE_FORMAT: "file"` e `SOURCE_MIME: "video\/mp4"`.
6. **Mídia.** A URL de `SRC` é assinada com `exp` e `sig`, em um CDN próprio, e respondeu `HTTP 206` com `video/mp4`, caixa `ftyp` e sem `Referer`, `Origin` ou cookie. A URL muda a cada requisição do player e não pode ser cacheada nem registrada.
7. **Limites da amostra.** Não foram observados HLS, múltiplos servidores, legendas externas, tamanho de arquivo, 4K ou canais de TV nas páginas de VOD. O download `DL` é uma página separada e fica fora do contrato.
8. **Domínios vizinhos.** Em 20/11/2026, `redecanais.phd` entregou o mesmo conteúdo do `.lt` (mesmo `uniq_id`, mesmo iframe e canonical `https://redecanais.lt/...`); com `redirect: follow`, a requisição termina no `.lt`. Os outros três não compartilham o contrato: `redecanais.by` é um site de mesma marca com catálogo e IDs próprios e player ofuscado/anti-debug de 1,3 MB sem `SRC`; `redecanais.deals` usa busca própria, `?audio=dub|leg` em filme, episódios publicados e `player3` com `action=resolve`, que devolve JSON `{ok, src, download}` sem `Referer` e MP4 assinado `206`; `www18.redecanais.in` é WordPress/DooPlay, mas a busca `/?s=` responde `403` com desafio Cloudflare, o `wp-json` responde `401` e o AJAX do DooPlay entrega um embed de `superflixapi.boats` cuja página responde "Verificação". O `.deals` é o único dos três com contrato público utilizável e fica como candidato a provedor separado; `.by` e `.in` não têm caminho público utilizável. Nenhum é fallback do contrato do `.lt`.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e série por título e ano do TMDB, aceitando todas as variantes de áudio confirmadas.
2. Selecionar o episódio pelo par publicado, sem posição visual, e confirmar as coordenadas no `h1`.
3. Resolver o player `player3` com o `Referer` da ficha e devolver a URL de mídia assinada.
4. Classificar o idioma pela evidência mais próxima do episódio e não pelo texto genérico da página.
5. Manter falha de uma opção isolada e ausência distinta de erro de estrutura.
6. Cobrir a cadeia com testes Node e fixtures sanitizadas.

**Non-Goals:**

1. Download `DL`, canais de TV, anúncios, domínios alternativos e bypass de anti-bot.
2. Resolver players que a fonte não usa nas fichas de VOD observadas.
3. Sondar mídia, abrir a playlist, medir resolução real ou baixar arquivo.
4. Criar bloco compartilhado novo; a cadeia é específica desta fonte.
5. Legendas externas, tamanho, seeders ou peers enquanto a fonte não os publicar.

## Decisions

### D1. Escopo e validação de entrada

O provedor aceita `movie` e `tv`. Valida `tmdbId`, `mediaType`, temporada e episódio antes de qualquer requisição, como o `_template`. Filme ignora temporada e episódio. Série sem coordenadas inteiras a partir de 1 lança erro.

Alternativa descartada: aceitar `mediaType` desconhecido e devolver lista vazia. O contrato do app só entrega `movie`/`tv`, e um valor inesperado deve ser erro explícito.

### D2. Busca, paginação e ausência

Os termos vêm de `media.title`, `media.originalTitle`, `media.alternativeTitles` e `media.romajiTitles` (os romaji da temporada pedida primeiro), deduplicados por texto normalizado e limitados a oito. A busca usa `encodeURIComponent`, sem `+`, e lê até cinco páginas de oito cartões, parando quando a página não tem cartões ou não publica `page=<n+1>`.

A página é válida quando o título do documento contém `Buscar Conteúdo RedeCanais:`. Página válida sem cartões é ausência; página sem esse marcador é erro de estrutura. O limite de cinco páginas é um teto adotado, não uma garantia de cobertura: com oito cartões por página, títulos exatos raramente passam da primeira página.

Alternativas descartadas: `/ajax_search.php` (sugestões, sem ano nem tipo) e busca por ID (a fonte não aceita TMDB/IMDb).

### D3. Tipo pela rota

O cartão só entra em pedido de filme quando o `href` não contém `-lista-de-episodios_`; só entra em pedido de série quando contém. Isso evita abrir uma ficha de série para um filme homônimo e vice-versa. A rota é o discriminador observado em todas as listas de filmes, séries, animes, novelas e desenhos.

Alternativa descartada: usar o JSON-LD `@type` como discriminador principal, porque ele só existe depois de abrir a ficha e não evita consultas desnecessárias.

### D4. Identidade e múltiplos candidatos

O título do cartão e do `h1` é limpo do ano, da qualidade e do rótulo de áudio no fim (`(Dublado)`, `(Legendado)`, `(Nacional)`, `(Dublado e Legendado)`). A comparação usa `titleSimilarity` contra `media.title`, `media.originalTitle` e `media.alternativeTitles`, com limiar 0,85 e ano com tolerância de um. Para série, o ano aceito é o da série ou o da temporada pedida em `media.seasons`, porque a fonte agrupa temporadas na mesma página e pode publicar páginas de arco com o ano da temporada.

Todos os cartões confirmados são mantidos, não apenas o melhor: dublado e legendado são páginas distintas e viram opções independentes. Cartões duplicados pelo mesmo `href` são unidos. Cartão sem ano só é aceito quando é o único candidato acima de 0,90; caso contrário, é ambíguo e fica como ausência.

Alternativas descartadas: `findBestMatch` sozinho (devolve um candidato e perderia a variante de áudio) e comparação exata de título (perde títulos com pontuação ou subtítulo diferente).

### D5. Seleção de episódio

O bloco `div[itemprop="description"]` é a fronteira da lista de episódios; os cartões recomendados ficam fora dele. Cada link `Assistir` desse bloco é lido e o par é extraído do próprio `href` com `-(\d+)a-temporada-episodio-(\d+)-`. O `href` publicado é sempre usado; nenhuma URL de episódio é montada. O `h1` do episódio é conferido contra o par e, se trouxer coordenadas diferentes, o candidato é descartado como estrutura inválida.

Sem o bloco de descrição, a página de série é erro de estrutura. Com o bloco e sem o par pedido, é ausência. A varredura aceita temporadas com numeração local (1, 2, 3...) e não tenta numeração absoluta: a fonte numera por temporada e publica arcos como temporadas próprias.

Alternativas descartadas: posição visual do link, soma de `episodeCount` do TMDB e construção da URL por substituição de slug. Nenhuma tem evidência nesta fonte e todas arriscam o episódio errado.

### D6. Resolução do player

A ficha é aberta com `fetchPage`; o `iframe[name="Player"]` é resolvido contra a URL final da ficha. O player é aberto com `Referer` da ficha e perfil `player`. `extractScriptString` lê `SRC`, `SOURCE_FORMAT` e `SOURCE_MIME`; a URL de mídia é resolvida contra a URL final do player.

O tipo é `mp4` quando `SOURCE_FORMAT` é `file` e `SOURCE_MIME` é `video/mp4`; é `hls` quando `SOURCE_FORMAT` é `hls` ou o caminho de `SRC` termina em `.m3u8`. Formato declarado diferente desses é triagem: a opção não produz stream e não é falha. `SRC` ausente, vazio ou fora de HTTP(S) é falha da opção.

O `fetch` do player exige `Referer`; a reprodução não exigiu cabeçalho. O provedor não acrescenta `headers` ao stream. O `provider` é o parâmetro `server` do iframe (`R2` na amostra); se o parâmetro faltar, o campo é omitido.

Alternativas descartadas: abrir `embed.php?vid=` (duplica o iframe), usar o link `DL` (download, fora do contrato) e fixar o host do CDN (a URL é assinada e o host pode mudar).

### D7. Idioma

Em filme, o rótulo `(Dublado)`/`(Legendado)` do cartão ou do `h1` é a evidência. Em série, a precedência é: marcador do episódio no `href` (`-dublado`, `-leg`) e no título (`[DUB]`, `[LEG]`); depois o rótulo da série (`(Dublado)`/`(Legendado)`); depois `Idioma Desconhecido`.

O texto `Dublado e Legendado` do título do episódio é template da fonte e é ignorado, porque classificaria todo episódio como dublado, inclusive os `[LEG]`. `Nacional` é tratado pela descoberta local como dublado, conforme o enum existente. Não há legenda externa observada para promover uma página não dublada a `Legendado`.

Alternativas descartadas: passar o título inteiro do episódio para `languageFromTexts` (o texto genérico vence) e usar só o rótulo da série (contrariado por `Ninguém Além de Você`).

### D8. Qualidade

A qualidade vem do cartão/ficha (`1080p` na amostra) e é passada como `quality`. Em episódio, a ficha do episódio não repete a qualidade; vale o rótulo da página da série. Sem qualidade reconhecível, o campo é omitido e `buildStream` descobre nos textos já obtidos, caindo em `Desconhecida`.

Não há sonda de playlist nem leitura de mídia para medir resolução. O rótulo da série é a declaração da fonte, não uma garantia do arquivo.

Alternativa descartada: abrir cada MP4 para ler a altura; seria uma requisição extra por stream, proibida pelo contrato.

### D9. Contrato do stream e deduplicação

Cada stream usa `buildStream` com `format` (`FORMATTER.AUTO`, `addon: 'RedeCanais'`, título, ano, temporada e episódio), `type`, `provider` e `quality`. `name` e `title` não são informados. `size`, `subtitles` e `headers` não entram porque a fonte não os fornece nas fichas observadas.

A deduplicação usa a URL de mídia sem a query assinada e o idioma; duas opções que apontam para o mesmo arquivo e o mesmo áudio viram um stream. O mesmo arquivo em áudios diferentes não é deduplicado. A lista final é ordenada por `sortByQuality`.

Alternativa descartada: deduplicar pela URL completa; a assinatura muda a cada requisição e o mesmo arquivo pareceria outro stream.

### D10. Fronteira de erro, isolamento e tempo

TMDB, busca e estrutura de página são fatais: HTTP fora de 2xx, busca sem marcador, série sem bloco de episódios, episódio sem `h1` de coordenadas e ficha sem estrutura sobem. Ficha 404 é candidato removido e a busca continua. Cada candidato (áudio/qualidade) é uma opção independente; dentro dele, o player é resolvido isoladamente. Falha gera `console.warn('[RedeCanais] Opção <rótulo> descartada: <causa>')`; se nenhuma opção produzir stream e alguma tiver falhado, o erro agregado sobe.

Nenhum timeout, `AbortController`, retentativa, cache ou settings. O app controla a espera. `getStreams` é a única camada que captura o erro final, registra `console.error('[RedeCanais] ...')` e devolve `[]`.

Alternativa descartada: tentar o próximo termo de busca depois de uma falha de rede; a falha é da fonte e deve ser observável, não mascarada como ausência.

### D11. Domínio, redirecionamento e documentação

A base é `https://redecanais.lt`, sem lista de espelhos. `fetchPage` pode seguir um redirecionamento da própria requisição e a URL final é usada para resolver os links relativos; não há troca de domínio depois de uma ausência válida. O domínio pode mudar fora do repositório e a mudança exige nova proposta.

A verificação dos domínios vizinhos em 20/11/2026 não encontrou fallback utilizável. `redecanais.phd` é um alias que entrega o conteúdo do `.lt` e canonicaliza para ele; o player dele redireciona ao `.lt` e exige `Referer` do endereço final, então usar `.phd` como base não acrescenta disponibilidade. `redecanais.by` tem catálogo/IDs próprios e player ofuscado de 1,3 MB sem `SRC`; `redecanais.deals` tem catálogo/IDs próprios e player com `action=resolve`; `www18.redecanais.in` é WordPress/DooPlay, bloqueia a busca com desafio Cloudflare e entrega embed de `superflixapi.boats` com "Verificação". O `.deals` é o único com contrato público utilizável (busca, episódios, `?audio=dub|leg` em filme, JSON `{ok, src, download}` e MP4 assinado `206`) e fica como candidato a provedor separado; `.by` e `.in` não entram, e nenhum dos três é fallback do `.lt` nesta mudança.

O método novo entra em `docs/provider-investigation.md` como uma seção de catálogo PhpMelody com player `player3`, sem copiar URLs assinadas. `providers.md` recebe a linha e a seção com `🟠 Não verificado` antes da rodada online; o status final depende da rodada.

Alternativa descartada: manter uma lista de espelhos como o Pobreflix HD; `.phd` é o único alias e não é um backend independente, enquanto `.by`, `.deals` e `.in` têm contratos diferentes.

### D12. Blocos e testes

Nenhum bloco novo. A cadeia usa `tmdb-info`, `title-match` (similaridade), `slugify` (normalização), `http`, `script-extract`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`. A leitura de cartões, do bloco de episódios e do `h1` é local do provedor, porque os seletores e o formato de título são específicos.

Os testes empacotam o provedor e executam o pacote com `fetch` simulado, conforme `docs/tests.md`. As fixtures são respostas reais sanitizadas: a URL assinada de `SRC` é substituída por um domínio de exemplo, sem `exp`/`sig`, e a fixture do player mantém apenas `SOURCE_FORMAT`, `SOURCE_MIME` e `SRC`.

## Risks / Trade-offs

1. **Domínio instável** → a base fica em uma constante e os links relativos usam a URL final da resposta; uma troca de domínio exige nova proposta, não fallback silencioso.
2. **URL assinada e efêmera** → resolvida a cada execução, sem cache, fixture ou log; o relatório online não registra a URL.
3. **`Referer` obrigatório no player** → enviado na descoberta; se o `fetch` do app descartar o cabeçalho, a opção falha isolada com aviso, sem derrubar as demais.
4. **Rótulo da série divergente do episódio** → o marcador do episódio tem precedência; quando não há marcador, o rótulo da série é a única evidência e pode ficar impreciso.
5. **Texto genérico `Dublado e Legendado`** → ignorado de propósito; sem marcador e sem rótulo, o idioma fica `Idioma Desconhecido`, em vez de um palpite.
6. **Ano da fonte diferente do TMDB** → tolerância de um e aceitação do ano da série ou da temporada; fora disso, ausência.
7. **Qualidade no nível da série** → o episódio pode ter resolução diferente da declarada na página da série; o provedor não sonda a mídia.
8. **Amostra só com MP4** → o ramo HLS é aceito quando a fonte declarar `hls` ou `.m3u8`, mas não foi observado; uma mudança de player pode exigir fixture nova.
9. **Busca textual e teto de cinco páginas** → títulos muito genéricos podem ficar fora; o limite é explícito e não vira promessa de cobertura.
10. **Anti-bot futuro** → se a fonte passar a responder desafio, a página não terá o título de busca e vira erro de estrutura, não ausência.
11. **Conteúdo adulto/estranho no catálogo** → o provedor só devolve o que o TMDB pediu; nenhuma triagem por categoria é necessária no contrato atual.
12. **Domínios vizinhos não são fallback** → `.phd` canonicaliza para `.lt` e redireciona o player ao `.lt`; `.by`, `.deals` e `.in` têm catálogo/player próprios. O provedor não tenta esses domínios; uma mudança de endereço exige nova proposta.

## Migration Plan

Não há migração. O provedor é novo, não altera o contrato dos existentes e não muda o manifest compartilhado além da entrada nova. A publicação usa o branch `main` e o build regenera os pacotes dos formatos.

## Open Questions

1. O CDN exige `User-Agent` específico na reprodução? A amostra respondeu `206` sem cabeçalho; o teste no aparelho decide se uma mudança futura precisa de `headers`.
2. Existem entradas HLS no acervo? A amostra só encontrou `SOURCE_FORMAT: "file"`; o ramo HLS fica aceito, mas sem evidência online.
3. Existem outros valores de `server` além de `R2`? O provedor lê o parâmetro; a amostra só viu `R2`.
4. Há 4K ou qualidades abaixo de 1080p no acervo? O cartão carrega a qualidade e a descoberta local cobre o valor, sem filtro próprio.
5. O download `DL` deve entrar em outra mudança? Fora do contrato de reprodução e não é necessário para o objetivo.
6. O `.deals` deve virar um provedor separado? A avaliação de 20/11/2026 encontrou busca, episódios, `?audio=dub|leg` em filme e `action=resolve` público com MP4 `206`; a decisão é editorial e fica fora desta mudança.

## Validation

1. `npm run lint` e `npm test` sem rede.
2. `node build.js redecanais` para o arquivo base e as variantes `gdrive` e `prism`.
3. Testes offline: filme dublado, filme legendado, série com episódio, série com episódio `[LEG]`, ausência, busca sem resultado, estrutura inválida, 404 de candidato, uma opção falhando e outra funcionando, todas falhando, player sem `SRC`, formato não suportado e deduplicação.
4. `npm run test:online -- --provider redecanais` com `TMDB_API_KEY` do ambiente, após `npm run build:min`, para registrar a evidência em `providers.md`.
5. Conferir que nenhuma fixture, log ou relatório contém URL assinada, `exp`, `sig` ou cookie.
