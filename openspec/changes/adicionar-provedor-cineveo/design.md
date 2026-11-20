# Design

## Context

O Cineveo (`https://cineveo.cfd`) é um catálogo PT-BR sobre Invision Community (IPS) com uma camada própria de vídeo. A página do filme (`/movies/<slug>`) e a do episódio (`/series/<slug>-t<temporada>-ep<episódio>.html`) publicam o estado inicial em JSON, e o site também expõe uma API JSON pública em `/api`. A investigação de 20/11/2026 usou somente respostas públicas, sem conta, cookie ou chave.

1. **Detalhe por ID.** `GET /api?action=details&type=movie&id=<tmdb>` devolve `{ type, item, stream, servers }` para filme; `type=series` devolve `{ type, item, episodes, seasons }`. O `item.tmdb_id` é o próprio ID do TMDB, e o `item.slug` é usado nas páginas.
2. **Servidores de filme.** `servers.dub[]` e `servers.leg[]` trazem `id`, `name`, `quality`, `type`, `audio`, `url` e `download`. Na amostra, o primeiro servidor apontava para `/api/vod-resolve?token=...` e o segundo para um MP4 público em `pub-*.r2.dev`; o `download` repetia o `url`.
3. **Redirecionamento de filme.** `vod-resolve` responde `302` para uma URL assinada do R2 com validade de 18.000 segundos (5 horas). O MP4 público respondeu `206` com `Range: bytes=0-0`, sem `Referer` nem `Origin`.
4. **Série.** O detalhe lista `episodes[]` com `season`, `episode`, `available`, `id` e `title`, mas não traz servidores. Cada episódio disponível tem página própria no padrão publicado pelo próprio JavaScript da fonte, `/series/<slug>-t<S>-ep<E>.html`.
5. **Página do episódio.** O HTML contém `<script id="initialEpisodeData" type="application/json">` com `series`, `episode`, `servers`, `prevEpisode` e `nextEpisode`. Os servidores de episódio trazem `download` (sem `url`), no formato `/api?action=episodeDownload&episode_id=<id>&audio=<dub|leg>&server=<id>`; o endpoint responde `302` para um MP4 público do R2, que também respondeu `206` sem cabeçalhos.
6. **Áudio.** Os grupos são `dub` e `leg`; a página de uma série marcada como legendada publicou servidores nos dois grupos. O campo `episodes[].audio` veio como `"dub"` mesmo nessa série, então não é confiável para classificar o áudio.
7. **Alternativa observada.** A página `/player/?id=<tmdb>&s=<temporada>&e=<episódio>&audio=<dub|leg>` publica `sourcesToken` e a chamada `GET /player/sources?token=...` devolve `sources[]` com `file`, `label`, `subtitle` e `type`. Não foi adotada nesta versão.
8. **Atributo enganoso.** O elemento `#view` da página do filme publicou `data-tmdb-id="1477712"` (O Sorveteiro) enquanto o JSON embutido e a API apontavam `1506560` (O Confronto dos Thundermans). O atributo não é usado pelo provedor.
9. **Busca.** `/buscar?q=<termo>` consulta `/api?action=catalog&type=movie|series&limit=80&sort=recent&search=<termo>`. A busca por ID numérico devolveu `total: 5` com `items: []`, então não serve como consulta por TMDB.
10. **Ausência.** `action=details` para ID inexistente e para tipo divergente responde `404` com um HTML próprio (`<title>404 Not Found</title>`, `text/html`), diferente do JSON de sucesso.
11. **Cloudflare.** Páginas e API responderam `200` ao `fetch` direto com `User-Agent` de navegador. Os arquivos JS estáticos responderam `403` sem `Referer`, mas o provedor não os consome.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e série pelo ID do TMDB, sem consulta ao TMDB e sem chave externa.
2. Ler todos os servidores dublados e legendados da fonte, com qualidade e tipo declarados.
3. Selecionar o episódio pelo par exato e validar a coordenada na página.
4. Distinguir ausência (404 documentado, lista vazia, episódio indisponível) de falha de rede, HTTP, JSON ou layout.
5. Manter a falha de uma opção isolada e subir erro agregado quando nenhuma opção produzir stream e alguma falhar.
6. Cobrir a cadeia com testes Node e fixtures reais sanitizadas.

**Non-Goals:**

1. Busca textual, fallback por título, metadados do TMDB e matches aproximados.
2. Downloads, página `/download.php`, legendas externas, HLS ou hosts de player não usados pela fonte.
3. Cadeia `/player/` por token, `sourcesToken` e `fallbackSources`.
4. Espelhos de domínio, cache, timeout próprio, settings e bloco compartilhado novo.
5. Sondar a mídia para descobrir resolução, tamanho ou reprodução.

## Decisions

### D1. Escopo e validação de entrada

O provedor aceita `movie` e `tv`. Valida `tmdbId` numérico, `mediaType`, temporada e episódio antes de qualquer requisição, como o `_template`. Filme ignora temporada e episódio; série sem coordenadas inteiras a partir de 1 lança erro.

Alternativa descartada: aceitar `mediaType` desconhecido e devolver lista vazia. O contrato do app só entrega `movie`/`tv`, e um valor inesperado deve ser erro explícito.

### D2. Consulta por ID, sem busca textual e sem TMDB

O provedor usa `https://cineveo.cfd/api?action=details&type=<movie|series>&id=<tmdbId>`. A fonte é indexada pelo ID do TMDB (`item.tmdb_id` é igual ao ID consultado), então `getMediaInfo` e a busca por título não entram. Isso elimina a dependência de `TMDB_API_KEY` e evita ambiguidade entre homônimos.

Alternativas descartadas: `action=catalog&search=<título>` (busca textual, sem tipo/ano na resposta e com paginação de 80 itens) e `action=catalog&search=<tmdbId>` (devolveu `total` sem `items`). Nenhuma cobre a consulta exata por ID.

### D3. Leitura do detalhe e ausência

A requisição usa `fetch` com `HEADER_PROFILES.api` do bloco `http`, porque `fetchJson` lança em 404 antes de o corpo ser inspecionado. Um 404 só é ausência quando o corpo é `text/html` e contém o título `404 Not Found` da fonte; qualquer outro 404, status fora de 2xx, corpo não JSON, `type` divergente ou `tmdb_id` diferente do pedido é falha. A resposta 200 com `servers` vazio ou ausente é ausência.

O mesmo tratamento vale para série: 404 documentado é ausência; 200 com `episodes` vazio é ausência; `episodes` ausente ou de tipo inesperado é erro de estrutura.

Alternativa descartada: capturar o erro de `fetchJson` e tratá-lo como ausência. O erro não preserva o corpo, e um 404 de WAF seria confundido com título inexistente.

### D4. Servidores de filme

Cada item de `servers.dub` e `servers.leg` é uma opção independente. O endereço é `url` ou, quando ausente, `download`, resolvido contra `https://cineveo.cfd` se for relativo. Servidor sem nenhum dos dois é falha daquela opção, com aviso. O `type` do servidor é lido como `mp4`/`hls`; valor diferente é triagem.

A URL publicada é devolvida como está, inclusive o endpoint `vod-resolve` com token. O `vod-resolve` é o mesmo endereço que o player da fonte usa e responde com redirect; resolver o redirect exigiria uma requisição extra e produziria uma URL assinada de curta duração. A URL é resolvida a cada pedido e não entra em cache, fixture ou log.

Alternativa descartada: `action=stream&type=movie&id=<tmdb>`, que responde 302 apenas para o servidor padrão e não expõe as opções de áudio e qualidade.

### D5. Seleção do episódio

O provedor percorre `episodes[]` e aceita somente o item com `season` e `episode` iguais aos pedidos e `available === true`. O `episode.id` não é usado para montar a mídia; a página é aberta pelo padrão publicado pela própria fonte: `/series/<slug>-t<S>-ep<E>.html`, com o `slug` de `item.slug`.

Episódio fora da lista ou com `available` diferente de `true` é ausência. O provedor não usa posição visual, soma de temporadas nem numeração absoluta.

Alternativa descartada: `action=stream&type=episode&id=<episodeId>`, que só entrega o servidor padrão e não permite escolher áudio ou qualidade. `action=details&type=episode` responde 404.

### D6. Leitura da página do episódio

A página é baixada com `fetchPage` (a URL final importa para resolver os `download` relativos). O JSON é extraído do bloco `<script id="initialEpisodeData" type="application/json">` com uma expressão local e `JSON.parse`; `extractScriptJson` não serve porque lê atribuições `name = {...}`, não o conteúdo de um `<script>` com `id`.

O bloco ausente em uma página 200 é erro de estrutura. O `series.tmdb_id` deve ser igual ao ID pedido; divergência é erro de identidade. Se `episode.season` ou `episode.episode` divergirem do pedido, o resultado é ausência, porque a fonte pode redirecionar para outro episódio; nunca o episódio errado é devolvido.

Alternativa descartada: `/player/` + `/player/sources?token=...`. A resposta é equivalente, mas exige duas requisições extras, um token de curta duração e o mesmo tratamento de `fallbackSources`; a página do episódio já publica os servidores por áudio.

### D7. Idioma

O grupo `dub` vira `LANGUAGE.DUBBED` (`Dublado`) e `leg` vira `LANGUAGE.SUBTITLED` (`Legendado`). Grupo desconhecido vira `LANGUAGE.UNKNOWN` (`Idioma Desconhecido`). O campo `audio` do servidor não é usado para descoberta, e o campo `episodes[].audio` é ignorado porque veio `"dub"` até em série legendada.

Alternativa descartada: passar o título ou o nome do servidor para `languageFromTexts`; esses textos não declaram o áudio e poderiam promover um palpite.

### D8. Qualidade e tipo

A qualidade vem de `server.quality`; quando vazia, o nome do servidor entra como `qualityHints`. `HD` é normalizado pelo bloco `quality-discovery` para `720p`, resolução explícita mantém o valor e rótulo sem resolução cai em `Desconhecida`. Não há sonda de player nem leitura de mídia.

O `type` do stream vem de `server.type` (`mp4` na amostra). `hls` é aceito se a fonte declarar; outros valores são triagem, com aviso, sem derrubar as demais opções.

Alternativa descartada: abrir o MP4 para medir altura ou duração; seria uma requisição extra por stream e o contrato proíbe sondar só para qualidade.

### D9. Montagem, deduplicação e campos opcionais

Cada stream usa `buildStream` com `format` (`FORMATTER.AUTO`, `addon: 'Cineveo'`, título, ano convertido para inteiro, temporada e episódio em série). `name` e `title` não são informados. `headers`, `size`, `subtitles` e `provider` não entram, porque a fonte não os publica; o nome do servidor é rótulo de qualidade, não host de provedor.

A deduplicação usa a URL resolvida e o idioma: dois servidores com a mesma URL e o mesmo áudio viram um stream; a mesma URL em áudios diferentes permanece. A lista final é ordenada por `sortByQuality`.

Alternativa descartada: deduplicar por `server.id`. O mesmo arquivo pode aparecer com IDs diferentes (token e URL direta no filme), enquanto o ID não identifica o arquivo para o usuário.

### D10. Fronteira de erro, isolamento e tempo

Consulta de detalhe, identidade, seleção de episódio e estrutura da página são fatais: HTTP fora de 2xx sem o 404 documentado, JSON inválido, `type`/`tmdb_id` divergente, `initialEpisodeData` ausente e coordenada de série divergente sobem. Cada servidor é uma opção independente: a falha gera `console.warn('[Cineveo] Opção <rótulo> descartada: <causa>')` e preserva as demais. Se nenhum stream sair e algum servidor tiver falhado, o erro agregado sobe; se todos forem ausência, a saída é lista vazia.

Nenhum timeout, `AbortController`, retentativa, cache ou settings. O app controla a espera. `getStreams` é a única camada que captura o erro final, registra `console.error('[Cineveo] ...')` e devolve `[]`.

Alternativa descartada: trocar de domínio ou repetir a consulta após falha; a fonte tem uma base única e a falha deve ser observável.

### D11. Domínio e documentação

A base é `https://cineveo.cfd`, sem lista de espelhos. `www.cineveo.cfd` não resolveu na amostra. A URL final de `fetchPage` é usada para resolver os `download` relativos; não há troca de host depois de ausência válida. Uma mudança de domínio exige nova proposta.

O método novo entra em `docs/provider-investigation.md` como API JSON de catálogo por TMDB com página de episódio em JSON embutido. `providers.md` recebe a linha e a seção com `🟠 Não verificado` antes da rodada online; o status final depende da rodada. `rejected-providers.md` não é alterado, porque a fonte foi aceita.

A entrada nova usa `contentLanguage: ["pt"]`, como todo o `src/manifest.json` e o `test/manifest.test.js`. `docs/arch.md` ainda descreve `contentLanguage` como a string `"pt"`; esta mudança corrige a redação para a lista `["pt"]`, sem alterar o contrato do manifest.

### D12. Blocos, fixtures e testes

Nenhum bloco novo. A cadeia usa `http` (perfis e `fetchPage`), `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`. A leitura do detalhe, do 404, do bloco `initialEpisodeData` e dos servidores é local do provedor, porque o contrato é específico.

As fixtures são respostas reais sanitizadas: o token de `vod-resolve` é substituído por um valor fixo de exemplo e as URLs de mídia por hosts de exemplo; nenhuma fixture guarda token ativo, URL assinada, cookie ou header de sessão. O teste empacota o provedor e executa o pacote com `fetch` simulado, conforme `docs/tests.md`.

## Risks / Trade-offs

1. **Token de filme expira em ~5 h** → o detalhe é consultado a cada pedido e a URL não é cacheada; a reprodução começa com o token recém-emitido.
2. **Cloudflare pode desafiar o `fetch`** → páginas e API responderam 200 ao perfil do bloco; um desafio vira falha de estrutura, nunca ausência, e não é contornado.
3. **`HD` é rótulo genérico** → normalizado para `720p`; a resolução real não é medida e o valor é o declarado pela fonte.
4. **`episodes[].audio` não é confiável** → o idioma vem somente dos grupos `servers.dub`/`servers.leg` da página do episódio.
5. **Padrão de URL do episódio** → copiado do JavaScript publicado da fonte; se mudar, a página não terá `initialEpisodeData` e vira erro de estrutura, não episódio errado.
6. **Página pode redirecionar para outra coordenada** → a coordenada é conferida e a divergência vira ausência.
7. **Sem busca textual** → títulos que a fonte não indexa pelo TMDB ficam ausentes; não há fallback por nome.
8. **Mídia sem cabeçalhos na amostra** → se o CDN passar a exigir `Referer` ou `User-Agent`, a reprodução falha no aparelho; a rodada online comprova o contrato, não a reprodução.
9. **Amostra só com MP4** → o ramo HLS é aceito quando declarado, mas não foi observado; uma fixture nova será necessária se a fonte mudar.
10. **Atributo `data-tmdb-id` divergente na página do filme** → o provedor não lê o HTML do filme; usa somente o `item.tmdb_id` da API.
11. **Acervo muda diariamente** → a rodada online é um recorte datado; não há promessa de cobertura integral.

## Migration Plan

Não há migração. O provedor é novo, não altera o contrato dos existentes e não muda o manifest compartilhado além da entrada nova. A publicação usa o branch `main` e o build regenera os pacotes dos formatos.

## Open Questions

1. O CDN exigirá `User-Agent` ou `Referer` na reprodução? A amostra respondeu `206` sem cabeçalhos; o teste no aparelho decide se uma mudança futura precisa de `headers`.
2. Existem filmes com opção legendada? A amostra de filmes recentes só trouxe `dub`; o código trata os dois grupos.
3. Existem fontes HLS no acervo? A amostra só encontrou `type: "mp4"`.
4. O `vod-resolve` continua aceitando o token por cinco horas? A expiração foi observada no token (`exp`), mas a reprodução longa não foi testada.
5. O campo `quality` do servidor sempre acompanha o nome? O código usa o nome como dica quando o campo vem vazio.

## Validation

1. `npm run lint` e `npm test` sem rede.
2. `node build.js cineveo` para o arquivo base e as variantes `gdrive` e `prism`.
3. Testes offline: filme dublado com um servidor, filme com vários servidores, série com episódio dublado, série com opções dublada e legendada, ausência de título (404 documentado), tipo divergente, episódio não publicado, episódio indisponível, página sem `initialEpisodeData`, coordenada divergente, uma opção falhando e outra válida, todas falhando, todas ausentes e deduplicação.
4. `npm run build:min` e `npm run test:online -- --provider cineveo` para registrar a evidência em `providers.md`.
5. Conferir que nenhuma fixture, log, relatório ou documentação contém token ativo, URL assinada, cookie ou header de sessão.
