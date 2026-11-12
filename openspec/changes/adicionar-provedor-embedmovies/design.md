# Design

## Context

Ver `proposal.md` — Why. A investigação de 12/11/2026 observou:

1. **Catálogo e busca.** `POST https://embedmovies.org/inc/Ajax.php` com formulário `type=search` e `search=<termo>` devolve `{ success, results, total_results, ... }`. O termo pode ser o ID do TMDB: `603` devolve Matrix e `100088` devolve The Last of Us, com `tmdb_id`, `imdb_id`, `type`, `title` (`pt`/`en`), `release_date`, `is_anime` e `embed`. A busca por ID não precisa de `TMDB_API_KEY` nem de busca textual. O site envia `csrf_token` quando a página tem o token, mas a busca respondeu com sucesso sem ele.
2. **Embed.** O `embed` dos filmes é `https://myembed.biz/filme/<imdb>`; o das séries é `https://myembed.biz/serie/<tmdb>`. A página do `myembed.biz` é um invólucro público com `<iframe id="video-player" src="https://playerflix.ink/filme/<imdb>">` ou `.../serie/<tmdb>/<temporada>/<episódio>`.
3. **PlayerFlix.** A página do `playerflix.ink` consulta `GET https://playerflix.ink/inc/Ajax.php?type=<movie|tv>&id=<id>&season=<n>&episode=<n>` com `X-Requested-With: XMLHttpRequest` e devolve `{ status, data: { title, release_date, options } }`. Cada opção tem `embed`, `lang`, `label`, `budget` e `id`; algumas têm `embed_id`.
4. **Opções observadas.** `WatchPlay` (`v1.watchplay.shop`) é triagem por playlist sem `RESOLUTION`; `VIP Player` (`embedplayer2.xyz`) resolve HLS; `Embed Play` (`embedplayabyss.top`), Blogger e `ok.ru` ficam fora do conjunto suportado; `Premium` (`superflixapi.fun`) vem com `budget` `danger`. O bloco `fireplayer` já cobre exatamente essa cadeia: `myembed.biz`, `playerflix.ink`, `embedplayer2.xyz`, a triagem de `budget danger` e o idioma das opções.
5. **Limite da fonte.** A página do EmbedMovies diz que a reprodução é somente por iframe e não publica links diretos. O provedor não contorna isso: apenas segue o encaminhamento público até as opções que o bloco já resolve. Títulos cujas opções são todas de hosts não suportados ficam sem stream.

O runtime e o contrato de streams estão em `docs/arch.md`. O bloco `fireplayer` é a implementação em uso para a cadeia de player; nenhum bloco novo é necessário.

## Goals / Non-Goals

**Goals:**

1. Encontrar o título no catálogo EmbedMovies pelo ID do TMDB, sem busca textual e sem chave.
2. Confirmar tipo e identidade antes de seguir para o player.
3. Reutilizar o bloco `fireplayer` para resolver a cadeia pública e montar os streams.
4. Isolar opções não suportadas e falhas parciais, sem devolver streams de etapas anteriores.
5. Cobrir o fluxo com testes Node offline e com uma rodada online do pacote final.

**Non-Goals:**

1. Resolver hosts fora do conjunto do bloco (`watchplay.shop`, `embedplayabyss.top`, Blogger, `ok.ru`, `superflixapi.fun`).
2. Contornar iframe, DRM, autenticação, anúncio ou desafio.
3. Baixar mídia, manter URL de mídia viva ou cachear resultados.
4. Criar bloco novo ou alterar o bloco `fireplayer`.
5. Alterar `docs/arch.md`: nenhuma regra global muda.

## Decisions

### 1. Identidade, manifest e entrada

O provedor entra como `embedmovies`, nome `EmbedMovies`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, `contentLanguage` `["pt"]` e logo `https` do favicon do domínio. `getStreams` valida o `tmdbId` numérico positivo, o `mediaType` e, em série, temporada e episódio inteiros a partir de 1 antes de qualquer requisição. Entrada inválida registra `[EmbedMovies] Entrada: ...` e devolve `[]`.

Animes e doramas são atendidos como `tv`, porque a busca do catálogo devolve `type` `tv` e `is_anime` apenas como marcação. Não há tipo de mídia novo.

### 2. Busca por ID do TMDB

A busca usa `fetchJson` do bloco `http`:

1. `POST https://embedmovies.org/inc/Ajax.php`, perfil `api`, `Referer` da origem e formulário `{ type: 'search', search: String(tmdbId) }`.
2. A resposta precisa de `success` verdadeiro e `results` em array; caso contrário, é erro de contrato.
3. A correspondência é exata: `Number(item.tmdb_id) === Number(tmdbId)` e `item.type` igual a `movie` para filme ou `tv` para série. O primeiro item que satisfizer os dois critérios é usado.
4. Sem correspondência exata, o provedor registra a ausência e devolve `[]` sem erro fatal.

Não se envia `csrf_token`: a busca pública respondeu sem ele e obter o token exigiria uma requisição extra e parsing de uma página que pode mudar. O endpoint também aceita `type=movie`/`type=tv` com paginação, mas a busca por ID é direta e evita varrer 638 páginas de filme.

Alternativas descartadas: consultar o `playerflix.ink` diretamente com o ID do TMDB (funciona, mas duplicaria o FirePlayer e ignoraria o catálogo que dá nome à fonte); usar `getMediaInfo` e busca textual (introduziria dependência do TMDB e ambiguidade de título); varrer o catálogo paginado (inviável pelo volume).

### 3. Endereço do player e coordenadas

O `embed` confirmado é a entrada da cadeia. Em filme, é usado como está. Em série, o provedor remove a barra final e acrescenta `/<temporada>/<episódio>` ao caminho, como a própria documentação do EmbedMovies orienta. O endereço precisa ser HTTP(S) e pertencer a `myembed.biz` ou `playerflix.ink`; outro host é erro de contrato, não ausência.

O `meta` do stream vem do catálogo: título `pt`, com fallback para `en`, e ano dos quatro primeiros dígitos de `release_date`. Quando o catálogo não traz título, o campo é omitido e o bloco tenta o título da resposta do PlayerFlix; se nenhum dos dois existir, o bloco lança erro.

### 4. Resolução com o bloco fireplayer

O provedor monta uma única entrada:

```js
{
  url: playerUrl,
  referer: 'https://embedmovies.org/',
  label: 'EmbedMovies',
  domain: 'embedmovies',
  languageHint: 'pt-br',
  meta: catalogMeta(item),
}
```

e chama `playEntries` com `{ logName: 'EmbedMovies', domain: 'embedmovies', request, identity, providerName: 'EmbedMovies' }`. O bloco segue o iframe do `myembed.biz`, consulta o Ajax do PlayerFlix, aplica a triagem de `budget danger`, resolve `embedplayer2.xyz` e monta os streams com `buildStreams`. A deduplicação por URL, qualidade e idioma fica no próprio `playEntries`.

`identity` leva `tmdbId` e o `imdb_id` do catálogo quando existir. O bloco usa essa identidade nas checagens de coordenadas e de título; a identidade principal já foi confirmada pelo `tmdb_id` exato.

### 5. Erros, ausência e logs

1. Falha de busca (HTTP, JSON, estrutura) ou de contrato do catálogo sobe como erro.
2. Correspondência exata ausente, ou todas as opções apenas triagem, devolve `[]` sem erro fatal.
3. Falha técnica de uma opção é tratada pelo bloco com `console.warn('[EmbedMovies] ...')` e não interrompe as demais.
4. Se nenhuma opção produzir stream e houver falha técnica, `extractStreams` lança erro com as causas; `getStreams` registra `[EmbedMovies] Nenhuma opção entregou streams: ...` e devolve `[]`.
5. Mensagens usam `redact` do bloco para remover URL, hash e parâmetro assinado. Nenhuma URL de mídia vai para fixture, documentação ou resumo público.
6. O provedor não impõe timeout; o app controla a espera.

### 6. Testes e fixtures

O teste empacota `src/embedmovies/` com `buildProvider`, nos formatos publicados, e executa o pacote em `vm` com `fetch` simulado, `require` devolvendo o `load` de `test/support/basic-html.js` e `URL`/`URLSearchParams` reais. As fixtures ficam em `test/fixtures/embedmovies/` e são sanitizadas: domínios de mídia fictícios, hashes e ids substituídos, sem URL assinada real.

Casos previstos:

1. filme resolvido: busca, `myembed`, PlayerFlix, `embedplayer2.xyz` e playlist HLS, com contrato completo;
2. série resolvida: coordenadas no caminho do `myembed` e no `format` do stream;
3. ausência: busca sem correspondência exata, sem requisição ao player;
4. tipo divergente: mesmo `tmdb_id` com `type` diferente, sem requisição ao player;
5. opções apenas de hosts não suportados: `[]` sem erro;
6. uma opção com falha e outra funcionando: stream preservado e `console.warn`;
7. todas as opções com falha: `[]` com `console.error`;
8. busca com HTTP fora de 2xx, JSON inválido ou estrutura alterada: `[]` com erro;
9. `embed` ausente ou fora dos domínios aceitos: `[]` com erro;
10. `myembed` sem iframe ou PlayerFlix sem `options`: `[]` com erro;
11. entrada inválida: `[]` sem requisição;
12. contrato do stream: `name`/`title` gerados, `format` com `addon` `EmbedMovies`, `type` `hls`, `provider` do host resolvido, `language`, `headers`, legendas e ordenação;
13. logs sem URL de mídia, token ou hash;
14. opções e streams repetidos deduplicados.

### 7. Documentação e status

`providers.md` ganha a linha e a seção `## EmbedMovies` com status inicial `🟠 Não verificado`; a rodada online do pacote final substitui o status conforme `docs/tests.md`, seção 7. `docs/provider-investigation.md` ganha uma nota na seção 3.1 sobre a variação “busca AJAX que aceita o ID do TMDB e devolve o embed de um player já coberto pelo bloco `fireplayer`”, com referência a `src/embedmovies/extractor.js` e `test/embedmovies.test.js` e o limite das opções não suportadas. `src/_blocks/index.md` e `docs/arch.md` não mudam.

## Risks / Trade-offs

1. **Cobertura dependente das opções do PlayerFlix** → títulos cujas opções são só `watchplay`, Blogger, `ok.ru` ou `embedplayabyss.top` ficam sem stream. Mitigação: triagem explícita, ausência sem erro e registro do limite; uma mudança futura pode adicionar um resolvedor de host, se houver consumidor real.
2. **Dependência do invólucro `myembed.biz`** → o host pode mudar ou deixar de publicar o iframe. Mitigação: validar o host e falhar com erro de contrato; o bloco já aceita `playerflix.ink` como entrada alternativa.
3. **Busca por ID do catálogo** → o endpoint pode deixar de indexar IDs ou mudar o formato. Mitigação: correspondência exata por `tmdb_id` e tipo, erro em resposta inválida e fixture real sanitizada; a rodada online confirma o pacote final.
4. **URL de mídia efêmera** → `embedplayer2.xyz` pode devolver playlist assinada com validade curta. Mitigação: resolver a cada execução, não cachear, não registrar em log nem fixture; o app inicia a reprodução logo após a resolução.
5. **Cloudflare e bloqueio de bot** → a busca ou o player podem responder com desafio. Mitigação: `blockReason` do bloco, erro explícito e nenhuma conclusão de ausência a partir de desafio.
6. **Sobreposição com FirePlayer PT-BR** → os dois usam a mesma cadeia de player. Mitigação: o EmbedMovies tem catálogo e identidade próprios; o código compartilhado fica no bloco, sem duplicação.
7. **Direitos autorais** → o provedor só localiza URLs públicas da fonte; não hospeda mídia. Nenhum código externo é reaproveitado.

## Migration Plan

1. Criar `src/embedmovies/index.js` (contrato, validação, captura única, `sortByQuality`) e `src/embedmovies/extractor.js` (busca, endereço do player, `playEntries`, montagem final).
2. Acrescentar a entrada `embedmovies` em `manifest.json` na versão `1.0.0`.
3. Criar fixtures sanitizadas e `test/embedmovies.test.js` com os casos da seção 6.
4. Rodar `npm run lint`, `npm test` e `node build.js embedmovies`; conferir os três formatos e a ausência de edição manual em `providers/`, `gdrive/` e `prism/`.
5. Rodar `npm run test:online -- --provider embedmovies` e atualizar `providers.md` com a rodada real.
6. Atualizar `providers.md` e `docs/provider-investigation.md` na mesma mudança.
7. Rollback: remover a entrada do manifest e a pasta `src/embedmovies/`, reconstruir os formatos e reverter a documentação; não há dados persistidos, migração nem estado de servidor.
