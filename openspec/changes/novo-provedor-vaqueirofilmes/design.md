# Design

## Context

Ver `proposal.md` para a motivação. A VaqueiroFilmes roda WordPress com o tema VacaTorrent e publica filmes no tipo de post `movie`. O catálogo é legível por REST (`/wp-json/wp/v2/search`, `/wp-json/wp/v2/movie`) e as páginas de filme trazem JSON-LD `Movie` com `name`, `alternateName` e `datePublished`. Os players ficam em variantes `?video=N` da página do filme; cada variante ativa um iframe externo. A opção EmbedPlay é a única que este provedor vai resolver.

A cadeia observada em 12/11/2026, com o filme TMDB `9320`:

1. `GET https://vaqueirofilmes.com/pt/movie/os-vingadores/?video=0` lista os botões `Myembed`, `EmbedplayApi`, `VidSrc` e `Superflixapi`, e ativa o iframe do Myembed.
2. `GET ...?video=1` ativa `https://embedplayapi.top/embed/9320`.
3. `GET https://embedplayapi.top/embed/9320` devolve `#embed-player[data-movie-id="R6KQR"]` e um servidor `.server[data-id="KZGn8"]`.
4. `GET https://embedplayapi.top/ajax/get_stream_link?id=KZGn8&movie=R6KQR&is_init=false&captcha=&ref=` devolve `{"success":true,"data":{"link":"https://embedplay.vip/filme/tt0118661"}}`.
5. `GET https://embedplay.vip/filme/tt0118661` lista as opções dubladas (`data-target="1"`) e legendadas (`data-target="2"`), com `data-id` por opção.
6. `POST https://embedplay.vip/api` com formulário `action=getPlayer&video_id=<id>` devolve `{"errors":"0","data":{"video_url":"https://embedplaybyse.top/e/<código>/<slug>"}}` para a opção Byse.
7. `GET https://embedplaybyse.top/api/videos/<código>/` devolve `playback` com `version`, `key_parts`, `iv` e `payload`; a decifragem AES-256-GCM local produz `sources` com uma URL HLS assinada.

O mesmo filme também oferece Abyss, Loadvid, VidSrc e Superflixapi. Abyss cifra a configuração em um bundle com WebSocket/IndexedDB; Loadvid devolve o conteúdo da playlist em vez de uma URL estável; VidSrc exige WebAssembly; Superflixapi responde com bloqueio Cloudflare. Nenhum desses caminhos entrega uma URL HLS utilizável no contrato atual.

Séries têm página de temporada com downloads em `enc/go.php`, mas não têm variante `?video=N` nem player. O `enc/go.php` responde com desafio Cloudflare no ambiente de desenvolvimento. Por isso o provedor é somente de filmes.

O runtime do app é QuickJS, sem APIs do Node e sem `crypto.subtle` garantido, mas com `cheerio-without-node-native` e `crypto-js` fornecidos pelo app. O contrato do provedor está em `docs/arch.md`; os blocos reutilizáveis estão em `src/_blocks/index.md`.

## Goals / Non-Goals

**Goals:**

1. Encontrar o post de filme correto no catálogo WordPress com confirmação de título e ano.
2. Descobrir a opção EmbedPlay na página do filme sem depender de download ou de links de anúncio.
3. Resolver EmbedPlay até o Byse e decifrar o playback localmente, sem serviço, chave ou conta externa.
4. Montar streams HLS com qualidade, idioma e legendas comprovados, usando `buildStream` e o formatador.
5. Isolar falhas por opção e distinguir ausência reconhecida de erro de rede, parsing ou bloqueio.

**Non-Goals:**

1. Séries, downloads, magnet e torrent.
2. Resolver Abyss, Loadvid, VidSrc ou Superflixapi.
3. Contornar Cloudflare, captcha ou bloqueio de anúncio.
4. Generalizar a decifragem do Byse como bloco compartilhado antes de existir um segundo consumidor real.
5. Guardar URL assinada, token de player ou payload de playback em fixture sem sanitização.

## Decisions

### 1. Catálogo pela REST de busca do WordPress

Usar `GET /wp-json/wp/v2/search?search=<título>&subtype=movie&per_page=20&_fields=id,title,url,subtype,type`, com até duas páginas, em vez de `/wp/v2/movie?search=`.

- A busca já aceita `subtype=movie` e devolve `url` e `title`, que são os dados necessários para a triagem. O endpoint `movie` devolve o objeto completo do post, maior e sem vantagem para este fluxo.
- A primeira consulta usa o título PT-BR do `getMediaInfo`. Se nenhum candidato for confirmado, a segunda usa o título original. Alternativas e título original também entram na confirmação local.
- Nenhum candidato confirmado é ausência reconhecida. HTTP fora de 2xx, JSON inválido ou resposta sem array são falha e interrompem o fluxo, porque o contrato não permite transformar erro em ausência.
- O recorte de 40 resultados é uma limitação conhecida da busca do WordPress, não uma promessa de cobertura total.

### 2. Identidade pelo JSON-LD da página

Cada resultado é aberto e o JSON-LD `@type: Movie` é lido para obter `name`, `alternateName` e `datePublished`.

- O JSON-LD é mais estável do que os seletores visuais e já separa filme de série (`TVSeries`).
- O ano é comparado com o ano do TMDB quando conhecido. O título é comparado com título PT-BR, original e alternativos, usando `titleSimilarity` (limiar 0.85) para ordenar e para a decisão local de correspondência, com ano exato. O bloco `findBestMatch` não é usado porque devolve só o melhor candidato e não permite detectar a ambiguidade de dois candidatos válidos.
- Para não abrir 40 páginas, os resultados são ordenados pelo título da busca e no máximo três candidatos são confirmados. Se exatamente um passar, ele é aceito; se nenhum ou mais de um passar, a resposta é ausência.
- Alternativa considerada: confiar só no primeiro resultado da busca. Rejeitada porque “Os Vingadores” retorna o filme de 1998 e o de 2012, e o primeiro resultado não é garantia de identidade.

### 3. Descoberta do player na variante `?video=N`

A página do filme sem `?video` só mostra o cartão “Onde assistir / baixar”; a lista completa de players aparece na variante `?video=0`.

- A variante `?video=0` é lida uma vez para mapear os botões `.vp-source-btn`: o texto é o rótulo e o `href` contém `?video=N`.
- O botão cujo texto contém `Embedplay` é seguido; a variante correspondente é aberta e o iframe ativo é lido. Isso evita depender da posição do botão.
- As demais opções são descartadas com `console.log` de triagem, sem falhar a opção EmbedPlay.
- Alternativa considerada: usar a página `movie-links/<id>`. Rejeitada porque ela só aponta para `?video=0` e mistura downloads protegidos por `enc/go.php`, que estão fora do escopo.

### 4. Cadeia EmbedPlay explícita

A cadeia é implementada com as mesmas requisições públicas do player, sem `eval`:

1. `fetchPage` em `embedplayapi.top/embed/<tmdb>` com perfil de página.
2. Leitura de `#embed-player[data-movie-id]` e do primeiro `.server[data-id]`; ausência de qualquer um é erro de parsing.
3. `fetchJson` em `ajax/get_stream_link` com `id`, `movie`, `is_init=false`, `captcha=` e `ref=`, usando o endereço do embed como `Referer`.
4. Validação de `success === true` e `data.link` HTTP(S). O link é aberto para leitura das opções.
5. Na página do `embedplay.vip`, localizar o seletor `.select_language` cujo texto identifica Dublado e usar o `data-target` correspondente para ler `.players_select_items[data-target="<valor>"] .player_select_item`. O grupo Legendado/VidSrc é triagem.
6. Para cada opção dublada, `fetchJson` com POST de formulário em `embedplay.vip/api`, campos `action=getPlayer` e `video_id`, `Referer` da página de opções. A resposta válida tem `errors` `"0"` (ou `0`) e `data.video_url` HTTP(S).

Cada opção dublada é uma unidade de falha: se uma falhar, `console.warn` e as outras continuam. Se todas falharem, o erro agregado sobe para o `getStreams`.

### 5. Byse: decifragem local do playback

Quando `video_url` é `https://embedplaybyse.top/e/<código>/<slug>`:

1. Extrair o código do caminho, validando `[a-z0-9]+`.
2. `fetchJson` em `https://embedplaybyse.top/api/videos/<código>/` com `Referer` da página `/e/` e `Accept: application/json`.
3. Exigir `playback` com `version`, `key_parts` (array), `iv` e `payload`.
4. Selecionar as partes: para `version` inteiro entre 1 e 20, usar as posições 1-based `version` e `31 - version` quando existirem no array; caso contrário, usar todas as partes. Essa é a regra do player observado e evita uma chave fixa.
5. Decodificar cada parte, o `iv` e o `payload` de base64url. O `payload` contém o ciphertext seguido da tag GCM de 16 bytes.
6. Decifrar AES-256-GCM com IV de 12 bytes. O runtime não garante `crypto.subtle` e o `crypto-js` não expõe GCM; a decifragem é feita com o keystream AES-CTR do próprio GCM:
   - `J0 = IV || 00 00 00 01`;
   - o primeiro bloco de dados usa `IV || 00 00 00 02`;
   - gerar os blocos de contador com AES-ECB (`crypto-js`, `mode.ECB`, `pad.NoPadding`), incrementando os 32 bits finais, e aplicar XOR no ciphertext.
7. Validar que o JSON decifrado tem `sources` array com ao menos uma URL HTTP(S). A tag GCM não é verificada porque o payload vem por HTTPS do mesmo host e o resultado é validado estruturalmente; isso evita implementar GHASH no QuickJS. A alternativa seria rejeitar Byse e ficar sem streams.
8. Considerar somente fontes HLS (`mime_type` com `mpegurl` ou URL `.m3u8`). Fontes MP4 são descartadas porque o manifest declara `m3u8`.

A URL HLS é assinada e curta. Ela é obtida a cada pedido; nenhum cache entre pedidos é permitido. Se a assinatura expirar, a opção falha e o app pede de novo.

### 6. Streams e metadados

- `buildStream` com `type: 'hls'`, `url` da fonte, `headers: playbackHeaders(url)` quando necessário, `format: { template: FORMATTER.AUTO, addon: 'VaqueiroFilmes', title, year }`.
- Qualidade: `height` da fonte quando presente; senão `discoverQuality([label, url])`; senão `Desconhecida`.
- Idioma: `LANGUAGE.DUBBED` quando a opção veio do grupo Dublado. Nenhum stream é promovido a PT-BR sem essa evidência.
- Legendas: `playback.tracks` com URL HTTP(S) e idioma normalizado; `name` quando houver. Sem URL válida, a faixa é omitida.
- Ordenação por `sortByQuality`.

### 7. Fronteira de erro

- Funções internas lançam erro com mensagem clara; não devolvem `null` para falha de rede/parsing.
- A falha de uma opção dublada é isolada com `console.warn('[VaqueiroFilmes] ...')`.
- `getStreams` valida a entrada, captura a falha final, registra `console.error('[VaqueiroFilmes] ...')` e devolve `[]`.
- Ausência reconhecida (busca vazia, nenhum candidato confirmado, botão EmbedPlay ausente) não gera `console.error` de falha; gera apenas o retorno vazio.
- O prefixo de log é `[VaqueiroFilmes]` e o `domain` de triagem é `vaqueirofilmes`.

### 8. Testes e fixtures

- `test/fixtures/vaqueirofilmes/` guarda respostas reais sanitizadas: busca, página do filme, variante `?video=0`, variante EmbedPlay, embed da EmbedPlay, link JSON, página de opções, resposta `getPlayer` e info do Byse com `playback` cifrado.
- O `payload` cifrado é mantido como opaco; o teste verifica a estrutura, a altura, o MIME e o idioma do resultado decifrado, sem persistir a URL HLS assinada.
- A decifragem é testada com o `payload` real da fixture, garantindo que a seleção de `key_parts` e o keystream estão corretos.
- `crypto-js` entra em `devDependencies` para o teste Node; o build já o mantém externo para o app.
- Casos: busca PT-BR, fallback original, lista vazia, erro HTTP, ano divergente, resultado de série, candidato confirmado, EmbedPlay ausente, opção desconhecida, API recusando, opção dublada válida, opção dublada falhando, host Byse não suportado, playback inválido, duas chamadas gerando URLs distintas (mock) e falha total.

## Risks / Trade-offs

1. **A API EmbedPlay pode mudar ou exigir token/captcha.** → Validar cada resposta e falhar com mensagem explícita; a fixture registra o contrato observado em 12/11/2026.
2. **A cifragem do Byse pode mudar.** → A seleção de `key_parts` é derivada do `version`; se a decifragem ou o JSON falharem, a opção falha, sem inventar stream. A fixture protege a regra atual.
3. **A URL HLS expira.** → Resolver a cada pedido, sem cache; a falha de assinatura é falha da opção, não ausência.
4. **Cloudflare ou bloqueio por IP no ambiente de desenvolvimento.** → O provedor não tenta contornar; registra a triagem/falha. A rodada online pode ficar inconclusiva, e o status em `providers.md` reflete isso.
5. **Busca do WordPress não é exaustiva.** → Duas consultas (PT-BR e original), até 40 resultados e confirmação por ano; ausência é reconhecida, mas não é prova de que o título não exista no site.
6. **Decifrar sem verificar a tag GCM.** → O payload vem por HTTPS do mesmo host e o JSON é validado; a alternativa seria não suportar Byse e ficar sem a única cadeia HLS observada.
7. **`crypto-js` no QuickJS.** → Usar apenas `AES`, `mode.ECB` e `pad.NoPadding`, carregados sob demanda; o build mantém o módulo externo.
8. **Cobertura limitada a filmes.** → Declarada no manifest e na documentação; séries e downloads não entram no contrato.

## Migration Plan

1. Adicionar a entrada `vaqueirofilmes` ao `manifest.json` e o código em `src/vaqueirofilmes/`.
2. Adicionar `crypto-js` às `devDependencies` e rodar `npm install`.
3. Implementar as fixtures e a suíte offline.
4. Rodar `npm run lint`, `npm test` e `node build.js vaqueirofilmes`.
5. Rodar `npm run test:online -- --provider vaqueirofilmes` com `TMDB_API_KEY` no ambiente; registrar a rodada em `providers.md` com `--record`.
6. Se a rodada online não comprovar funcionamento, manter a mudança sem arquivar e declarar a limitação no `design.md`/`providers.md`, conforme as regras de testes.
7. Rollback: remover a entrada do manifest, a pasta `src/vaqueirofilmes/`, o teste, as fixtures e a seção de `providers.md`; nenhum dado persistente é migrado.

## Open Questions

Nenhuma questão bloqueante. A existência de fontes MP4 no Byse e a cobertura de títulos menos populares podem ser observadas na rodada online sem mudar as specs ou o desenho.
