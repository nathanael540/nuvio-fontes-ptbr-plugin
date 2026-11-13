# Design

## Context

Ver `proposal.md` — Why. A investigação de 12/11/2026 observou:

1. **Página e player.** `https://rivo.st/` é uma aplicação Next.js baseada no TMDB. A página pública de detalhe respondeu HTTP 403 ao `fetch` direto, mas a home respondeu 200 e o player é carregado em um chunk dinâmico. O player direto é servido por `https://f.rivo.st/` (aplicação `rezeplayer`); o player alternativo “Embed” é `https://cinesrc.st/`.
2. **API do player direto.** O bundle público do `f.rivo.st` consulta `GET /api/servers?v=7`, `GET /api/source/<movie|tv>/<tmdbId>?server=<id>` (com `s` e `e` em série) e `GET /api/meta/<movie|tv>/<tmdbId>`. O player usa `GET /api/season/<tmdbId>/<temporada>` para a lista de episódios, que não é necessária ao provedor porque o app já envia temporada e episódio.
3. **Lista de servidores.** `/api/servers?v=7` devolve `{"servers":[{"id":"1","label":"Server 1"}, ..., {"id":"9","label":"Server 9"}]}`. O servidor `library` não aparece nessa lista e respondeu vazio; a consulta sem `server` respondeu HTTP 403.
4. **Resposta de fontes.** `/api/source/...` devolve `{ provider, server, sources, subtitles }`. Cada fonte tem `url`, `kind` (`hls` ou `mp4`), `quality` (ex.: `"1080p (Brazilian Portuguese)"`, `"1080p Pure Studio Master (5.0 Mbps AAC)"`, `"Auto"`), `subProvider` (`"Server 1"`) e `provider` (`"rivo"`). Cada legenda tem `url`, `lang` (`en`, `pt`, `pb`, ...), `label` (`"Portuguese (BR)"`, `"English"`, ...) e, quando aplicável, `direct`.
5. **Metadados.** `/api/meta/movie/<id>` devolve `title`, `year`, `backdrop`, `poster`, `logo` e `imdbId`. Em série, devolve também `seasons`, `episode` e `next`; o provedor usa somente `title` e `year`, porque o formatador não tem campo de nome de episódio.
6. **Amostra de servidores.** Em 18 casos (10 filmes e 8 séries), o servidor 1 respondeu fontes em 17, com 159 fontes HLS/MP4 e rótulos de idioma; o servidor 5 respondeu em 17, com 91 fontes HLS e rótulos de bitrate; o servidor 6 respondeu em 8, com 24 fontes HLS; os servidores 2 e 3 responderam uma fonte cada; os servidores 7, 8 e 9 não responderam fontes. O servidor 4 respondeu fontes em 12 casos, mas as URLs de mídia responderam HTTP 401.
7. **Mídia.** Os masters HLS de `1.rivo.st` responderam 200 sem `Referer` ou `Origin`; alguns masters do servidor 1 responderam 502 (`Upstream manifest returned 404`) e MP4 do proxy `proxy.vidbolt.xyz` respondeu 206 com assinatura `ftyp`, com instabilidade em chamadas repetidas. Legendas diretas responderam 200; as não diretas funcionaram pelo proxy `https://f.rivo.st/api/subtitle?url=<url codificada>`, que devolve VTT.
8. **Alternativa descartada.** O embed `cinesrc.st` exige `POST /api/c/bootstrap`, scripts de desafio (`__ss2_challenge`), WebAssembly e um upstream `fembox.aether.bar`; além da complexidade, o host não resolveu no ambiente de investigação. O provedor usa somente o player direto `f.rivo.st`.

O runtime e o contrato de streams estão em `docs/arch.md`. Os blocos reutilizados são `http`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`; nenhum bloco novo é necessário.

## Goals / Non-Goals

**Goals:**

1. Consultar o player público do RIVO pelo ID do TMDB, sem busca textual e sem `TMDB_API_KEY`.
2. Distribuir a consulta pelos servidores de mídia publicados e isolar falhas por servidor.
3. Selecionar somente fontes HLS/MP4 e classificar qualidade, idioma e legendas a partir do que a fonte anuncia.
4. Montar streams completos com `buildStream` e `format`, sem `name`/`title` próprios.
5. Cobrir o fluxo com testes Node offline e com uma rodada online do pacote final.

**Non-Goals:**

1. Raspar a página de detalhe do `rivo.st` ou contornar o HTTP 403.
2. Resolver o desafio do `cinesrc.st` ou consumir o upstream `fembox.aether.bar`.
3. Usar as fontes do servidor 4 enquanto elas responderem HTTP 401.
4. Sondar cada URL de mídia para descobrir disponibilidade, qualidade real, áudio ou legendas embutidas.
5. Criar bloco novo, alterar `docs/arch.md` ou mudar o contrato global.
6. Cachear ou manter viva URL assinada, baixar mídia ou reproduzir P2P.
7. Reproduzir recursos do site sem relação com streams, como watchlist, histórico, playlists e watch party.

## Decisions

### 1. Identidade, manifest e entrada

O provedor entra como `rivo`, nome `RIVO`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8", "mp4"]`, `contentLanguage` `["pt"]` e logo `https` do favicon do domínio. A descrição em pt-BR informa que as faixas dubladas e legendadas seguem o anúncio da fonte.

`src/rivo/index.js` segue o contrato do app: `PROVIDER_NAME = 'RIVO'`, chamada a `extractStreams`, `sortByQuality` e único `console.error('[RIVO] ...')` na fronteira. `src/rivo/extractor.js` valida `tmdbId` numérico positivo, `mediaType` e, em série, temporada e episódio inteiros a partir de 1 antes de qualquer requisição. Entrada inválida lança `Entrada: ...`; o teste confere que nenhum `fetch` é chamado.

### 2. API pública consultada

Todas as requisições usam `fetchJson` do bloco `http` com perfil `api` e `Referer: https://f.rivo.st/`. Os endpoints são:

1. `GET https://f.rivo.st/api/servers?v=7` — lista os servidores de mídia.
2. `GET https://f.rivo.st/api/source/movie/<tmdbId>?server=<id>` — fontes do filme.
3. `GET https://f.rivo.st/api/source/tv/<tmdbId>?s=<temporada>&e=<episódio>&server=<id>` — fontes do episódio.
4. `GET https://f.rivo.st/api/meta/movie/<tmdbId>` ou `GET https://f.rivo.st/api/meta/tv/<tmdbId>` — título e ano para o `format`.
5. `GET https://f.rivo.st/api/subtitle?url=<url codificada>` — legenda não direta convertida em VTT.

A query é montada como texto com `URLSearchParams(...).toString()`, sem depender de `searchParams.set` atualizar `href` nem de iteração no polyfill dos apps. A consulta agregada sem `server` não é usada porque respondeu HTTP 403; a consulta ao servidor `library` não é usada porque respondeu vazio. A página HTML do `rivo.st` não é usada.

O `Referer` foi incluído em todas as requisições de API porque o servidor 4 respondeu 403 sem ele. O provedor não consulta o servidor 4, mas o cabeçalho é mantido como contexto público do player e não carrega credencial.

### 3. Servidores: descoberta, triagem e isolamento

O provedor obtém a lista de `/api/servers` e consulta todos os IDs publicados, exceto `4`. O servidor 4 é excluído por uma constante comentada, com a evidência de que suas URLs de mídia responderam HTTP 401 em todos os testes; ele pode voltar quando a fonte corrigir o comportamento. Alternativa descartada: consultar o servidor 4 e descartar as URLs 401 depois, o que gastaria uma requisição e ainda produziria opções inválidas.

As consultas aos servidores são feitas em paralelo com captura individual, porque `Promise.allSettled` não foi confirmado no runtime. A ordem final dos streams não depende da ordem de resposta: os resultados são concatenados na ordem da lista de servidores. Cada servidor tem três estados:

1. **Com fontes:** as fontes válidas entram no resultado.
2. **Sem fontes:** `sources` vazio é ausência daquele servidor, não erro.
3. **Falha:** rede, HTTP fora de 2xx, JSON inválido ou estrutura alterada geram `console.warn('[RIVO] Servidor <label> descartado: <causa>')` e não interrompem os demais.

Se todos os servidores responderem vazio, o resultado é `[]` sem erro. Se nenhum stream for produzido e ao menos um servidor tiver falhado, `extractStreams` lança um erro agregado com o estado de cada servidor; `getStreams` registra e devolve `[]`. A mensagem não inclui URL de mídia.

### 4. Triagem das fontes

Cada item de `sources` é classificado antes de virar stream:

1. `kind` `hls` ou `mp4` é aceito; `dash` ou `kind` desconhecido é descartado por triagem, sem aviso de falha.
2. Em fonte aceita, `url` precisa ser HTTP(S) e o objeto precisa ter os campos usados. URL inválida, `url` ausente ou item que não é objeto é opção malformada: gera `console.warn('[RIVO] Fonte <servidor> descartada: <causa>')` e conta como falha para o erro agregado, não como ausência.
3. Fontes repetidas são deduplicadas pela URL, preservando a primeira ocorrência na ordem dos servidores.
4. Se todas as fontes forem apenas triagem por `kind`, o resultado é `[]` sem erro. Se houver fonte malformada e nenhum stream, o erro agregado sobe.

Essa distinção evita que uma mudança de contrato na fonte (por exemplo, `sources` com itens sem `url`) seja confundida com ausência de catálogo.

### 5. Qualidade, idioma e legendas

**Qualidade.** O provedor passa `qualityHints: [source.quality]` ao `buildStream` e não define `quality`. O bloco `quality-discovery` normaliza `1080p (Brazilian Portuguese)` para `1080p`, `1080p Pure Studio Master (5.0 Mbps AAC)` para `1080p` e `Auto` para `Desconhecida`. Nenhuma qualidade é inferida do título, do ano ou do bitrate.

**Idioma.** O idioma é lido do parêntese final do rótulo de qualidade. O provedor não usa a descoberta genérica `discoverLanguage` para esse texto, porque ela classificaria `English sub` como `Legendado`; usa `normalizeText` e uma tabela explícita:

1. `brazilian portuguese` ou `portuguese (br)` → `LANGUAGE.DUBBED` (`Dublado`).
2. `portuguese`/`portugues` com `sub` → `LANGUAGE.SUBTITLED_NON_PT_BR` (`Legendado (Não PT-BR?)`).
3. `brazilian portuguese` com `sub` → `LANGUAGE.SUBTITLED` (`Legendado`).
4. `portuguese`/`portugues` sem `sub` → `LANGUAGE.DUBBED_NON_PT_BR` (`Dublado (Não PT-BR?)`).
5. Idioma estrangeiro reconhecido (`english`, `spanish`, `french`, `german`, `italian`, `russian`, `hindi`, `arabic`, `bengali`, `tamil`, `telugu`, `tagalog`, `indonesian`, `kurdish`, `ukr`/`ukrainian`, entre outros observados) → `LANGUAGE.NON_PT_BR` (`Gringo`).
6. Parêntese técnico (`5.0 Mbps AAC`, `Master`) ou ausência de parêntese → não define `language`; o `buildStream` resolve `Idioma Desconhecido` porque o `format` não leva `filename`/`folderName` nem `languageHints`.

O rótulo `Portuguese` sem região não é promovido a `Dublado`, e o rótulo `English sub` não é promovido a `Legendado`.

**Legendas.** As legendas vêm exclusivamente do array `subtitles` do mesmo servidor que produziu a fonte. Cada item é convertido em `{ url, language }`:

1. `direct === true` usa a URL anunciada.
2. `direct` ausente ou falso usa `https://f.rivo.st/api/subtitle?url=${encodeURIComponent(url)}`.
3. `language` usa `label` (`"Portuguese (BR)"`, `"English"`, ...), que é o texto que o app exibe.
4. Itens sem URL HTTP(S) ou sem idioma são descartados com aviso; legendas repetidas são deduplicadas pela URL.

Não há mistura de legendas de um servidor com fontes de outro, porque a numeração e a sincronização podem divergir.

### 6. Metadados e montagem do stream

O `meta` é buscado uma vez, em paralelo com os servidores, e é opcional:

1. `title` e `year` entram em `format` quando existem; `year` é convertido de texto para número quando tem quatro dígitos.
2. Em série, `season` e `episode` vêm do pedido do app, não do `meta`. O nome do episódio não é usado porque `FormatDetails` não tem esse campo.
3. Falha ou ausência do `meta` gera `console.warn('[RIVO] Metadados indisponíveis; seguindo sem título/ano')` e não impede devolver as fontes.

Cada fonte aceita vira:

```js
buildStream({
  url: source.url,
  format: { template: FORMATTER.AUTO, addon: 'RIVO', title, year, season, episode },
  qualityHints: [source.quality],
  language,              // somente quando a tabela conclui
  subtitles,             // somente quando o servidor anuncia
  provider: source.subProvider ?? server.label,
  type: source.kind,
});
```

Não são informados `name`, `title` do stream, `headers`, `size`, `seeders`, `peers` ou `infoHash`, porque a fonte não os fornece. Em particular, não se usa `playbackHeaders`: os masters HLS e os MP4 testados responderam sem `Referer`/`Origin`, e o app envia os cabeçalhos de reprodução que o usuário configurou. Se a rodada real mostrar uma exigência da hospedagem, o ajuste fica para uma mudança com evidência de reprodução, não para esta proposta.

### 7. Ausência, falhas, logs e efemeridade

1. A validação de entrada lança antes da rede; `getStreams` registra `[RIVO] Falha em <tipo> <id>: Entrada: ...` e devolve `[]`.
2. A falha da lista de servidores ou de todos os servidores com fontes sobe como erro; `getStreams` registra e devolve `[]`.
3. Servidor sem fontes e triagem por `kind` são ausência, sem `console.error`.
4. Falha de um servidor ou de uma fonte gera `console.warn` com o rótulo do servidor e a causa, sem URL, token, assinatura ou hash.
5. Nenhuma URL de mídia, legenda assinada ou resposta bruta vai para fixture, documentação, relatório ou log.
6. Cada execução consulta a API de novo; não há cache, `localStorage`, `AbortController` nem timeout próprio. O app controla a espera.
7. A resposta da API pode variar entre execuções (a amostra mostrou servidores e fontes diferentes para o mesmo título); o provedor não presume estabilidade nem tenta reproduzir uma execução anterior.

### 8. Testes e fixtures

O teste empacota `src/rivo/` com `buildProvider` nos formatos `gdrive` e `prism`, executa o pacote em `vm` com `fetch` simulado e `URL`/`URLSearchParams` reais, e usa `test/support/basic-html.js` apenas se necessário (o provedor não precisa de cheerio). As fixtures ficam em `test/fixtures/rivo/` e são sanitizadas: hosts de mídia fictícios, URLs assinadas substituídas por `example`, sem `Policy`, `Signature`, `Key-Pair-Id` ou token real.

Casos previstos:

1. Filme com fontes do servidor 1 e 5: HLS/MP4, qualidades, idiomas, legendas e `format` com título/ano.
2. Série com `s` e `e` corretos, `format` com temporada e episódio e nome do título.
3. Ausência: todos os servidores com `sources` vazio → `[]` sem `console.error`.
4. Falha isolada: um servidor com HTTP 500 e outro com fonte → stream preservado e `console.warn`.
5. Todas as opções falham → `[]` com `console.error` agregado.
6. Lista de servidores inválida ou HTTP fora de 2xx → `[]` com erro.
7. Fonte `dash` descartada por triagem; somente `dash` → `[]` sem erro.
8. Fonte `hls` sem URL → aviso e erro agregado quando for a única.
9. URL repetida entre servidores → um stream.
10. Idioma: `Brazilian Portuguese`, `Portuguese`, `Portuguese sub`, `English`, `English sub`, `Ukr` e rótulo sem idioma.
11. Legendas diretas, não diretas com proxy, repetidas e ausentes.
12. Metadados indisponíveis: streams ainda são devolvidos, sem título/ano e com aviso.
13. Entrada inválida: nenhuma chamada de `fetch`.
14. Servidor 4 não é consultado; as requisições de API usam `Referer` do player.
15. Contrato do stream: `name`/`title` gerados, `format` com `addon` `RIVO`, `type` igual ao `kind`, `provider` do servidor, ordenação e ausência de campos inventados.
16. Logs sem URL de mídia, assinatura ou hash.

O `npm test` atual tem 24 falhas por `test/maestro/` e `test/scenarios/` ausentes no checkout, sem relação com este provedor. A implementação deve comparar o resultado com essa linha de base e não introduzir novas falhas; se a infraestrutura for restaurada, o inventário de cenários passa a exigir um cenário e um fluxo Maestro para o RIVO, que devem entrar na mesma mudança.

### 9. Documentação e status

`providers.md` ganha a linha e a seção `## RIVO` com status inicial `🟠 Não verificado` e `—` na última verificação. A rodada online do pacote final substitui o status conforme `docs/tests.md`, seção 7.

`docs/provider-investigation.md` ganha uma subseção na seção 3 (APIs de player) para o método “API de player que aceita o ID do TMDB e distribui a consulta por servidores”: situação em uso, endpoints, campos, referência a `src/rivo/extractor.js` e `test/rivo.test.js`, e limites (servidor 4, URL efêmera, rótulos de idioma incompletos e ausência de sondagem de mídia).

`docs/arch.md` e `src/_blocks/index.md` não mudam: nenhum contrato global, bloco ou dependência nova.

## Risks / Trade-offs

1. **URLs de mídia assinadas e efêmeras** → cada execução resolve de novo; o provedor não cacheia nem registra. Se o app demorar a iniciar a reprodução, a URL pode expirar; isso é limitação da fonte, não do contrato.
2. **Servidor 4 excluído** → perde-se uma parte das fontes que a fonte anuncia. Mitigação: a constante é isolada e documentada; se o 401 for corrigido, o servidor volta em uma mudança com nova evidência.
3. **HLS do servidor 1 com 502 em parte dos masters** → o provedor devolve a fonte mesmo assim, porque não sonda mídia. O usuário pode escolher outra; a rodada online não reproduz vídeo e não comprova esse ponto. Uma sondagem opcional seria uma mudança futura com custo de requisições.
4. **Rótulos de idioma incompletos** → servidores 5 e 6 não informam idioma no rótulo; esses streams saem como `Idioma Desconhecido`, sem promover português. A classificação só melhora se a fonte passar a anunciar o idioma.
5. **Variação entre execuções** → a mesma URL pode devolver servidores e fontes diferentes, como observado. Os testes usam fixtures; a rodada online registra a execução real.
6. **Cloudflare, 403 e rate limit** → a API pode bloquear ou limitar. O provedor isola por servidor e não faz retry cego; se todos falharem, o erro é explícito. A página 403 não é usada como prova de ausência.
7. **Direitos autorais e disponibilidade** → o provedor apenas localiza URLs públicas do player; não hospeda mídia, não contorna DRM nem autenticação. A disponibilidade dos títulos pode mudar sem aviso.
8. **Linha de base de testes incompleta** → o checkout atual tem 24 falhas por módulos `test/maestro/` e `test/scenarios/` ausentes. A mudança não deve ser arquivada como “testes passando” enquanto essas falhas existirem; a validação compara com a linha de base e o cenário Maestro entra quando a infraestrutura voltar.
9. **Sobreposição com outros provedores** → o RIVO agrega fontes de terceiros e pode coincidir com MegaEmbed, FirePlayer ou outros. Não há bloco compartilhado novo; o valor está no catálogo e na API própria do RIVO. Deduplicação entre provedores não é responsabilidade deste provedor.

## Migration Plan

1. Criar `src/rivo/index.js` (contrato, validação, captura única, `sortByQuality`) e `src/rivo/extractor.js` (API, servidores, fontes, idioma, legendas, metadados).
2. Acrescentar a entrada `rivo` ao fim de `manifest.json` na versão `1.0.0`.
3. Criar as fixtures sanitizadas e `test/rivo.test.js` com os casos da seção 8.
4. Rodar `npm run lint`, `npm test` (comparando com a linha de base) e `node build.js rivo`; conferir os três formatos e que nenhuma saída foi editada à mão.
5. Rodar `npm run test:online -- --provider rivo` e atualizar `providers.md` com a rodada real.
6. Atualizar `docs/provider-investigation.md` na mesma mudança.
7. Rollback: remover `src/rivo/` e a entrada do manifest, reconstruir os formatos e reverter a documentação; não há dados persistidos, migração nem estado de servidor.

## Validation

1. `node --test test/rivo.test.js test/manifest.test.js test/providers-catalog.test.js` passou em 12/11/2026: 45 testes, sem falhas.
2. `npm run lint` passou sem avisos.
3. `npm test` passou com 1108 testes e nenhuma falha em 12/11/2026. A linha de base descrita na proposta não se confirmou no checkout desta rodada: `test/maestro/` e `test/scenarios/` continuam ausentes, mas o `npm test` não apresentou as 24 falhas antes registradas.
4. `node build.js rivo` gerou `providers/rivo.js`, `gdrive/providers/rivo.js` e `prism/providers/rivo.js`, além dos manifests de formato.
5. `npm run test:online -- --provider rivo --record` concluiu com status **Estável**: 5/5 filmes e 5/5 séries resolvidos, 0 sem resultado, 0 falha e 0 inconclusivo. A rodada foi registrada em `providers.md`.
6. `docs/arch.md`, `src/_blocks/index.md` e `README.md` não mudaram; nenhum contrato global, bloco ou comando novo.
7. `test/maestro/` e `test/scenarios/` continuam ausentes no checkout. O cenário e o fluxo Maestro do RIVO ficam pendentes para quando a infraestrutura voltar; ela não foi recriada nesta mudança.
