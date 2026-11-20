# Design

## Context

O `redecanais.deals` é uma instância separada da marca RedeCanais, com catálogo, IDs e player próprios. A investigação de 20/11/2026 usou somente a URL pública, com `fetch` e leitura de HTML/JSON.

1. **Busca.** `GET /search.php?keywords=<termo>` devolve uma lista no formato `Título - AAAA - Qualidade (Dublado)` seguida de um link `Acessar`. Para `vingadores`, vieram 12 resultados e nenhum link `page=2`; busca sem resultado publica `Nenhum conteúdo encontrado.`. A página mantém o título `Buscar Conteúdo RedeCanais: <termo>`.
2. **Tipo.** Série publica `/<slug>-lista-de-episodios_<hash>.html?audio=dub`; filme publica `/<slug>_<hash>.html?audio=dub`.
3. **Identidade.** A ficha de filme tem `h1` `Título - AAAA (Dublado) - Qualidade`; a de série tem `h1` `Título (Dublado)` e o título `Título (Dublado) - Lista de Episódios - RedeCanais`. O `iframe[name="Player"]` carrega o TMDB no `vid`: `m99861.mp4` em filme e `e100088-1-1.mp4` em série. O `vid` é a confirmação forte; o título/ano só selecionam candidatos.
4. **Episódios.** A página da série publica links `...-1a-temporada-episodio-01_<hash>.html?audio=dub`, com o par no próprio `href`. A lista de `The Last of Us` trouxe 19 links, incluindo temporadas 1 e 2. O par é selecionado pelo `href`, nunca pela posição.
5. **Player.** A ficha publica `iframe[name="Player"]` com `/player3/server.php?categoria=vod&server=XT&subfolder=movie|series&vid=<vid>&audio=<audio>`. A página do player tem 22 KB, scripts de anti-debug, mas publica `var SOURCE_URL` e não exige `Referer` para ser lida. O `SOURCE_URL` aponta para `/player3/server.php?action=resolve&vid=<vid>&audio=<audio>`.
6. **Resolve.** `GET action=resolve` devolve JSON `{ok: true, src, download}` sem `Referer`. `src` é um MP4 em `r2.cloudflarestorage.com` com assinatura AWS4 e `X-Amz-Expires=18000` (5 horas); respondeu `206` com `video/mp4`. O `download` é uma página separada (`download.php`) e fica fora do contrato.
7. **Idioma.** O `resolve` devolveu o **mesmo** `src` e o mesmo `download` com `audio=dub` para `audio=dub` e `audio=leg`; a página `?audio=leg` muda o título para `(Legendado)` e o iframe para `audio=leg`, mas a mídia resolvida continua dublada. O `audio` do `download`/`src` é a única prova do arquivo; o rótulo da página é fachada.
8. **Limites da amostra.** Não foram observados HLS, outros valores de `server`, legendas externas, tamanho, 4K ou um `download` com `audio=leg`. O player tem anti-debug, mas o `resolve` é JSON limpo e não precisa executar script.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e série do `.deals` por busca textual, confirmando o TMDB pelo `vid`.
2. Selecionar o episódio pelo par publicado e usar o `href` da fonte.
3. Ler `SOURCE_URL`, chamar `action=resolve` e devolver o MP4 assinado.
4. Classificar o idioma pelo `audio` do arquivo resolvido, não pela fachada da página.
5. Isolar falhas por candidato e distinguir ausência de erro de estrutura.
6. Cobrir a cadeia com testes Node e fixtures sanitizadas.

**Non-Goals:**

1. O `.lt` e o `.phd` (change separada) e os domínios `.by`/`.in` (sem caminho público utilizável).
2. Download `download.php`, canais de TV, espelhos, bypass de anti-bot e execução de script do player.
3. HLS, sonda de mídia, cache, timeout, settings e bloco compartilhado novo.
4. Promover `Legendado` a partir de `?audio=leg` sem o `audio=leg` no arquivo resolvido.

## Decisions

### D1. Escopo e validação de entrada

O provedor aceita `movie` e `tv`, valida `tmdbId`, `mediaType`, temporada e episódio antes de qualquer requisição. Filme ignora temporada e episódio; série sem coordenadas inteiras a partir de 1 lança erro.

Alternativa descartada: tratar `mediaType` desconhecido como ausência; o contrato do app só entrega `movie`/`tv` e valor inesperado deve ser erro explícito.

### D2. Busca, página única e ausência

Os termos vêm de `media.title`, `media.originalTitle` e `media.alternativeTitles`, deduplicados por texto normalizado e limitados a oito. A busca usa `encodeURIComponent` e é tratada como uma única página: não há `page=2` observado. Página válida sem links ou com `Nenhum conteúdo encontrado.` é ausência; página sem o título `Buscar Conteúdo RedeCanais:` é erro de estrutura.

O limite de uma página é um teto observado, não uma promessa de cobertura. Títulos genéricos podem ficar fora do recorte; o provedor usa os títulos exatos do TMDB e o ano para reduzir falsos positivos.

Alternativa descartada: inventar `&page=2`; não há link nem evidência de paginação.

### D3. Tipo pela rota

O resultado só entra em pedido de filme quando o `href` não contém `-lista-de-episodios_`; só entra em pedido de série quando contém. Isso evita abrir uma ficha de série para um filme homônimo.

Alternativa descartada: usar o `h1` como discriminador principal; ele só existe depois de abrir a ficha e não evita consultas desnecessárias.

### D4. Identidade pelo `vid` e pelo título/ano

O título do resultado e o `h1` são limpos do ano, da qualidade e do rótulo de áudio. A similaridade usa `titleSimilarity` com limiar 0,85 e ano com tolerância de um; série aceita o ano da série ou o da temporada pedida.

O `vid` do player é a confirmação forte: `m<tmdb>.mp4` em filme e `e<tmdb>-<temporada>-<episódio>.mp4` em série. `vid` com TMDB, temporada ou episódio diferente descarta o candidato. Todos os candidatos confirmados são mantidos, não só o melhor; duplicados pelo mesmo `href` são unidos.

Alternativa descartada: confiar no slug ou no título da página; o `vid` é a identidade exata publicada pela fonte.

### D5. Seleção de episódio

A lista de episódios é lida na página da série. Cada link `Assistir` é lido e o par é extraído do `href` com `-(\d+)a-temporada-episodio-(\d+)-`; o `href` publicado é sempre usado. O `h1` do episódio é conferido contra o par; coordenadas divergentes descartam o candidato.

Sem lista de episódios, a página de série é erro de estrutura. Com a lista e sem o par pedido, é ausência. A fonte numera por temporada e publica arcos como temporadas próprias; não há soma de `episodeCount` do TMDB.

Alternativa descartada: posição visual ou URL montada por substituição de slug; ambas arriscam o episódio errado.

### D6. Player e `action=resolve`

A ficha é aberta com `fetchPage`; o `iframe[name="Player"]` é resolvido contra a URL final. A página do player é lida sem executar script; `extractScriptString` lê `SOURCE_URL`, que aponta para `action=resolve`. O `resolve` é chamado com `fetchJson` e aceita somente `{ok: true, src}` com URL HTTP(S).

`ok: false`, `src` vazio, JSON inválido ou resposta fora de 2xx é falha da opção. O `download` é uma página separada e não vira stream. O player tem anti-debug, mas o provedor só lê HTML/JSON; não há `eval`, `new Function` ou browser.

Alternativa descartada: construir o `resolve` manualmente a partir do iframe; a fonte publica `SOURCE_URL` e ele deve ser usado quando presente.

### D7. Idioma pelo arquivo resolvido

O `audio` do `download`/`src` é a prova: `dub` → `Dublado`, `leg` → `Legendado`, ausente → `Idioma Desconhecido`. O `?audio=leg` da página e o título `(Legendado)` não classificam o áudio, porque o `resolve` devolve o mesmo MP4 e o mesmo `download` com `audio=dub`.

O provedor não tenta `?audio=leg` por conta própria para filmes: a amostra mostra que o parâmetro é fachada e produziria um stream duplicado rotulado errado. Se uma página publicar um link com `audio=leg` e o `download` também disser `leg`, o stream sai como `Legendado`; se o `download` disser `dub`, sai como `Dublado`.

Alternativa descartada: usar o título/parâmetro da página como idioma; foi contrariado pelo `download` em filme e série.

### D8. Qualidade

A qualidade vem do título do resultado/ficha (`1080p` na amostra). Em episódio, a página do episódio não repete a qualidade; vale o título da série/candidato. Sem qualidade reconhecível, o campo é omitido e `buildStream` descobre nos textos já obtidos, caindo em `Desconhecida`.

Não há sonda de MP4 para medir altura. O rótulo é a declaração da fonte, não uma garantia do arquivo.

Alternativa descartada: abrir o MP4 para ler a altura; seria requisição extra por stream e violaria o contrato.

### D9. Contrato do stream e deduplicação

Cada stream usa `buildStream` com `format` (`FORMATTER.AUTO`, `addon: 'RedeCanais Deals'`, título, ano, temporada e episódio), `type` `mp4`, `provider` do parâmetro `server` (`XT`) e `quality`. `name` e `title` não são informados. `size`, `subtitles` e `headers` não entram porque a fonte não os fornece.

A deduplicação usa o `vid` e o `audio` resolvido; duas opções para o mesmo arquivo/áudio viram um stream. A lista final é ordenada por `sortByQuality`.

Alternativa descartada: deduplicar pela URL completa; a assinatura R2 muda a cada execução e o mesmo arquivo pareceria outro stream.

### D10. Fronteira de erro, isolamento e tempo

TMDB, busca e estrutura de página são fatais: HTTP fora de 2xx, busca sem marcador, série sem lista de episódios e episódio sem `h1` de coordenadas sobem. Ficha 404 é candidato removido e a busca continua. A ausência de player na ficha falha como opção isolada, com aviso, conforme a spec. Cada candidato é uma opção independente; falha gera `console.warn('[RedeCanais Deals] Opção <rótulo> descartada: <causa>')`; se nenhuma produzir stream e alguma falhar, o erro agregado sobe.

Nenhum timeout, `AbortController`, retentativa, cache ou settings. `getStreams` é a única camada que captura o erro final, registra `console.error('[RedeCanais Deals] ...')` e devolve `[]`.

Alternativa descartada: tentar o próximo termo depois de uma falha de rede; a falha deve ser observável, não mascarada como ausência.

### D11. Domínio, separação e documentação

A base é `https://redecanais.deals`, sem lista de espelhos. O `.lt`/`.phd` ficam na change `adicionar-provedor-redecanais`; `.by` e `.in` não têm caminho público utilizável e não entram. O domínio pode mudar fora do repositório e a mudança exige nova proposta.

O método novo entra em `docs/provider-investigation.md` como uma seção de player `action=resolve` com `vid` de TMDB, sem copiar URLs assinadas. `providers.md` recebe a linha e a seção com `🟠 Não verificado` antes da rodada online; o status final depende da rodada.

Alternativa descartada: tratar o `.deals` como catálogo do provedor `.lt`; os IDs, hashes e contratos de player são diferentes, e a regra do repositório reserva um provedor para sites com o mesmo acervo e os mesmos hashes.

### D12. Blocos e testes

Nenhum bloco novo. A cadeia usa `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`. A leitura da busca, da lista de episódios e do `vid` é local do provedor.

Os testes empacotam o provedor e executam o pacote com `fetch` simulado, conforme `docs/tests.md`. As fixtures são respostas reais sanitizadas: a URL assinada de `src` é substituída por um domínio de exemplo, sem `X-Amz-*`, e a fixture do resolve mantém apenas `ok`, `src` e `download` com placeholders.

## Risks / Trade-offs

1. **Domínio de clone/parceria** → o `.deals` não está na central de endereços do `.lt`; a base fica em uma constante e o status online registra a disponibilidade. Uma troca de domínio exige nova proposta.
2. **URL assinada e efêmera** → resolvida a cada execução, sem cache, fixture ou log; o relatório não registra a URL.
3. **Busca sem paginação** → a cobertura é a primeira página observada; títulos genéricos podem ficar fora. O provedor usa títulos exatos e o ano, e zero resultado é ausência.
4. **Catálogo dublado na amostra** → o `?audio=leg` é fachada e devolve o mesmo MP4; o provedor só declara `Legendado` quando o `download`/`src` diz `leg`.
5. **MP4 como único formato** → o manifest declara `formats: ["mp4"]`; HLS não foi observado e uma migração exige nova evidência.
6. **`vid` como identidade** → se o formato `m<tmdb>.mp4`/`e<tmdb>-<s>-<e>.mp4` mudar, a confirmação falha de forma explícita; não há fallback para título sem `vid`.
7. **Player com anti-debug** → o `resolve` é JSON limpo e não exige execução de script; se a página passar a exigir token/cookie, a opção falha isolada.
8. **Duplicidade editorial** → o `.deals` tem a mesma marca do `.lt`, mas catálogo/IDs próprios; a decisão de publicar os dois é editorial e o `providers.md` deve distinguir os nomes.
9. **`download` sem `audio`** → o idioma fica `Idioma Desconhecido` em vez de um palpite; a fonte pode mudar o marcador sem aviso.
10. **Anti-bot futuro** → se a busca ou o resolve passarem a exigir desafio, a página não terá o marcador e vira erro de estrutura, não ausência.

## Migration Plan

Não há migração. O provedor é novo, não altera o contrato dos existentes e adiciona uma entrada ao manifest. A publicação usa o branch `main` e o build regenera os pacotes dos formatos.

## Open Questions

1. Existem entradas HLS no acervo? A amostra só encontrou MP4; uma mudança futura precisa de evidência.
2. Existem outros valores de `server` além de `XT`? O provedor lê o parâmetro; a amostra só viu `XT`.
3. Alguma série tem `audio=leg` real no `download`? A amostra só viu `dub`; o provedor aceita o marcador se aparecer.
4. Há 4K ou qualidades abaixo de 1080p? O título carrega a qualidade e a descoberta local cobre o valor, sem filtro próprio.
5. O `.deals` vai continuar fora da central de endereços do `.lt`? A relação entre os domínios é editorial; o provedor não depende dela.

## Validation

1. `npm run lint` e `npm test` sem rede.
2. `node build.js redecanais-deals` para o arquivo base e as variantes `gdrive` e `prism`.
3. Testes offline: filme dublado, série, episódio, ausência, busca sem resultado, estrutura inválida, 404, `vid` divergente, `ok:false`, `src` ausente, fachada `?audio=leg` com `download` dub, uma opção falhando e outra funcionando, todas falhando e deduplicação.
4. `npm run test:online -- --provider redecanais-deals` com `TMDB_API_KEY` do ambiente, após `npm run build:min`, para registrar a evidência em `providers.md`.
5. Conferir que nenhuma fixture, log ou relatório contém URL assinada, `X-Amz-*`, cookie ou `download.php`.
