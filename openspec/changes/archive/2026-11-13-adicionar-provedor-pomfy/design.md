# Design

## Context

Ver `proposal.md` — Why. A investigação de 12/11/2026 observou a cadeia pública da API Pomfy:

1. **Catálogo.** `https://api.pomfy.stream/` aceita `GET /filme/<tmdb>` e `GET /serie/<tmdb>/<temporada>/<episódio>` e devolve HTML de uma página de iframe. A página só responde 2xx quando a requisição traz `Sec-Fetch-Dest: iframe`; sem esse cabeçalho, responde 403. Os IDs são do TMDB, então não há busca textual nem necessidade de `tmdb-info`.
2. **Token.** A página embute `statusToken="<código>.<assinatura>"` para o título ou episódio disponível. O token é nulo quando a fonte conhece o título, mas não tem o episódio ou a mídia; a página inexistente exibe “Título Indisponível”.
3. **Troca.** `GET https://api.pomfy.stream/api/play-token?t=<token>` devolve JSON com `provider` (`byse`, `dual` ou `flyfile`), `url`, `byseUrl` e `flyfileUrl`. Nos exemplos `dual`, `flyfileUrl` é `https://flyfile.app/embed/<id>` ou `https://flyf.lat/embed/<id>`.
4. **Flyfile.** O embed Flyfile consulta `GET https://api.flyfile.app/api/public/file/<id>` com `Referer` do embed, `X-FlyFile-View: embed` e `X-Embed-Referrer: https://api.pomfy.stream/`; o arquivo traz `status`, `mimeType`, `size`, `videoAsset.qualities`, `audioTracks`, `subtitles`, `originalMetadata` e `videoSettings.defaultAudioLanguage`. Em seguida, `GET https://api.flyfile.app/api/streaming/assign/<id>` devolve `url` e `token`, e o master é `https://<url>/hls/<token>/master.m3u8`.
5. **HLS.** O master é adaptativo, com faixas de áudio e legendas; o exemplo de *Clube da Luta* tinha áudio português padrão, áudio inglês alternativo e legendas em português e inglês. O master e os segmentos responderam sem `Referer`; as legendas externas também responderam sem cabeçalhos.
6. **Byse.** O outro player exige `access/challenge`, `access/attest` com assinatura ECDSA, captcha com PoW próprio, playback AES-GCM e `key_parts` no navegador. O HLS só é montado depois de um clique que passa por esse fluxo. Não há API pública que devolva o HLS diretamente.

A amostra de 12/11/2026 encontrou Flyfile em 4 de 26 filmes e 5 de 28 séries sorteados (aproximadamente 15% e 18%). O restante era Byse ou não tinha token. O runtime e o contrato estão em `docs/arch.md`; o provedor não usa TMDB, `cheerio` nem APIs de Node.

## Goals / Non-Goals

**Goals:**

1. Resolver filmes e episódios do TMDB que a Pomfy publica com Flyfile pronto.
2. Entregar o master HLS adaptativo com qualidade, idioma, legendas e metadados de apresentação da fonte.
3. Isolar ausência de mídia (sem token, só Byse, arquivo em processamento) de falha real (rede, HTTP, layout, `assign` incompleto).
4. Cobrir a cadeia com testes Node offline e uma rodada online do pacote final, declarando a cobertura parcial.
5. Manter o custo de rede proporcional: uma página, uma troca de token, um metadado de arquivo e um `assign` por execução.

**Non-Goals:**

1. Integrar o Byse, reproduzir captcha, attestation ou descriptografar o playback AES-GCM.
2. Usar navegador headless, serviço de bypass, proxy, VPN, conta ou chave externa.
3. Criar bloco compartilhado: a cadeia Pomfy → Flyfile é específica desta fonte e não tem segundo consumidor observado.
4. Alterar `docs/arch.md`, o contrato global, o build ou `src/_blocks/index.md`.
5. Garantir cobertura integral do catálogo Pomfy; títulos só com Byse são ausência reconhecida.

## Decisions

### 1. Identidade e manifest

O provedor entra como `pomfy`, nome `Pomfy`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, `contentLanguage` `["pt"]` e logo `https://api.pomfy.stream/apipomfywhiteblue.png`. A descrição informa que o HLS vem do servidor Flyfile e que títulos só com Byse não retornam stream.

A fonte aceita o ID do TMDB na URL. Não há `getMediaInfo`, `findBestMatch`, `slugify` nem `title-match`. O título e o ano exibidos na página são usados apenas no `format`; não confirmam identidade porque o ID já é a identidade recebida do app.

Alternativa descartada: consultar o TMDB para obter título e ano. Seria uma requisição extra e uma chave externa sem necessidade; a página já publica os dois dados.

### 2. Página, token e troca

A URL é montada por concatenação com o ID validado:
1. filme: `https://api.pomfy.stream/filme/<id>`;
2. série: `https://api.pomfy.stream/serie/<id>/<temporada>/<episódio>`.

A página é obtida com `fetchPage` e o perfil `page`, acrescentando `Referer: https://api.pomfy.stream/` e `Sec-Fetch-Dest: iframe`. O `Sec-Fetch-Dest` é o único cabeçalho de contexto exigido; `Sec-Fetch-Mode` e `Sec-Fetch-Site` não mudam a resposta. O `fetchPage` preserva a URL final e permite usá-la como referer da troca, embora a fonte não exija referer nessa chamada.

O `statusToken` é lido com `extractScriptString(page.text, 'statusToken')`. A função devolve `null` quando o valor é `null` ou não há atribuição de string. A presença de `h1.title` (inclusive “Título Indisponível”) confirma que a página é a estrutura esperada; uma resposta 2xx sem `h1.title` é erro de layout. Página válida sem token é ausência.

A troca usa `fetchJson` em `/api/play-token?t=<token>` com o token codificado. O JSON precisa ter `flyfileUrl`, `byseUrl` ou `url`. `flyfileUrl` não nulo é a opção Flyfile; quando ele é nulo, `url` de host Flyfile também vale. `flyfileUrl` nulo com `byseUrl`/`url` do Byse é Byse-only e vira ausência. Se nenhum dos três campos existir, é erro de contrato.

Alternativa descartada: chamar `/api/player-flyfile?t=<token>` diretamente. A resposta é o shell do frontend Flyfile, não o HLS; o caminho exigiria o mesmo `public/file` + `assign` e mais uma página.

### 3. Seleção e validação do Flyfile

O provedor aceita `flyfileUrl` ou, quando ele for nulo, `url` cujo host seja `flyfile.app` ou `flyf.lat` e cujo caminho seja `/embed/<id>`. O ID é o último segmento não vazio. A URL original é preservada como referer do embed; o `Referer` da API Flyfile é essa URL completa, o `X-FlyFile-View` é `embed` e o `X-Embed-Referrer` é `https://api.pomfy.stream/`.

O `X-Embed-Referrer` não é um segredo: é o contrato de embed que o próprio catálogo Pomfy usa e que o arquivo Flyfile publica em `videoSettings.embedWhitelist`. A API responde 403 sem esse contexto; não se trata de contornar conta, chave ou autenticação.

O metadado é lido com `fetchJson` em `https://api.flyfile.app/api/public/file/<id>`, perfil `api` e os três cabeçalhos. A validação:
1. `status` precisa ser `READY`;
2. `videoAsset` precisa existir;
3. `qualities` precisa ser lista (ou string JSON) com ao menos um item `status` `READY`;
4. o item de maior resolução numérica define a qualidade e o tamanho.

Qualquer uma das condições 1–3 sem mídia é ausência. `qualities` inválido ou `videoAsset` ausente depois de um arquivo `READY` é ausência, não erro; o arquivo existe, mas não tem HLS pronto para o plugin.

O `assign` é `GET https://api.flyfile.app/api/streaming/assign/<id>` com os mesmos cabeçalhos e `X-Adblock-Detected: 0`. O `X-Adblock-Detected` é o valor que o frontend envia no contexto de embed; não é uma declaração de ausência de anúncio no aparelho, apenas o campo esperado pelo endpoint. A resposta precisa de `url` https e `token` não vazio; sem um deles, erro. O master é montado por concatenação, sem `searchParams.set`, para não depender do polyfill de `URL`.

Alternativa descartada: usar `streaming/assign` antes de validar as qualidades. O endpoint devolve token mesmo para um arquivo não pronto, e o master resultante não teria playlist utilizável.

### 4. Metadados, qualidade e montagem

O stream é único: o master é adaptativo e já contém as variantes de vídeo e as faixas de áudio/legenda. A qualidade exibida é a maior `quality` pronta (`1080p`, `720p` etc.), passada a `buildStream`; o bloco normaliza e `getStreams` ordena. O tamanho é `qualities[].sizeBytes` da qualidade escolhida; sem ele, usa `file.size`. A conversão usa um `formatBytes` local de duas casas e limiar de 1 GiB, compatível com o bloco `torrent-release`, mas sem importar o bloco de torrent e suas dependências.

O `format` leva `FORMATTER.AUTO`, `addon` `Pomfy`, título e ano da página (quando presentes), temporada e episódio em série, `filename` de `file.name`, `bitrate` de `originalMetadata.bitrateKbps * 1000` e `duration` de `originalMetadata.durationSec`. `originalMetadata` é uma string JSON; se não for JSON válido, os campos opcionais de bitrate/duração são omitidos, sem invalidar o stream. `folderName`, `folderSize`, `source`, `encode`, `visualTags` e `audioTags` não são inventados; a primeira versão não os preenche.

O stream leva `provider` `Flyfile`, `type` `hls` e nenhum `headers`: o master e os segmentos responderam sem `Referer` e sem cookie no teste de 12/11/2026. Se a rodada online mostrar exigência de contexto, a mudança seguinte acrescenta `playbackHeaders` com evidência.

Alternativa descartada: devolver uma URL por qualidade. O master já é adaptativo; repetir a mesma mídia em várias linhas duplicaria a lista sem controle real de qualidade no app.

### 5. Idioma e legendas

A classificação é feita no provedor, não por `languageHints`, porque a presença de uma faixa portuguesa alternativa poderia marcar como dublado um arquivo cujo áudio padrão é inglês. A ordem é:

1. escolher a faixa padrão: `default: true`; senão a primeira cujo `lang` seja compatível com `videoSettings.defaultAudioLanguage`; senão a primeira;
2. áudio `por`/`pt` com rótulo ou região Brasil → `Dublado`;
3. áudio `por`/`pt` sem região Brasil → `Dublado (Não PT-BR?)`;
4. áudio estrangeiro com legenda `por`/`pt` → `Legendado`; legenda portuguesa sem região Brasil → `Legendado (Não PT-BR?)`;
5. áudio estrangeiro sem legenda portuguesa → `Gringo`;
6. sem áudio e sem legenda portuguesa → `Idioma Desconhecido`.

As legendas vêm de `videoAsset.subtitles`: `url` e `language` legível (`por` → `Português`, `eng` → `Inglês`; código desconhecido usa o rótulo). O campo `isDefault` não altera a lista. Uma legenda com URL fora de http(s) é descartada isoladamente; as demais permanecem. Não há `headers`: a URL de legenda respondeu sem contexto no teste.

Alternativa descartada: usar `discoverLanguage` com todos os rótulos de áudio e legenda. A descoberta é útil quando a fonte não diz qual faixa toca; aqui o arquivo diz qual é o áudio padrão e a legenda não deve rebaixar um áudio dublado.

### 6. Ausência, falhas e logs

A cadeia tem duas naturezas de resultado:
1. **Ausência reconhecida** (lista vazia, sem `console.error`): página válida sem `statusToken`, `flyfileUrl` nulo, arquivo fora de `READY`, `videoAsset` ausente ou nenhuma qualidade pronta.
2. **Falha** (erro que sobe): HTTP fora de 2xx na página, no `public/file` ou no `assign`; JSON inválido; página 2xx sem `h1.title`; token presente mas resposta sem os campos de player; `assign` sem `url`/`token`.

O `extractStreams` recebe um objeto `request` com `stage` (`Entrada`, `Página`, `Player`, `Arquivo`, `Streams`) e atualiza antes de cada etapa. O `getStreams` é o único ponto de captura: registra `console.error('[Pomfy] <stage>: <mensagem>')` e devolve `[]`. Nenhuma mensagem inclui a URL do master, o token do `assign` ou o `statusToken`.

Alternativa descartada: capturar cada opção com `console.warn` e devolver lista vazia. Só existe uma opção de player integrada; uma falha dela é falha da execução, não uma opção independente a descartar.

### 7. Testes e fixtures

O teste empacota `src/pomfy/` com `buildProvider`, nos formatos publicados, e simula `fetch` por URL e cabeçalhos. As fixtures ficam em `test/fixtures/pomfy/` e são sanitizadas: hosts de mídia fictícios, tokens e IDs substituídos, sem URL assinada real.

Casos previstos:
1. filme com Flyfile pronto, duas qualidades, áudio português padrão e legendas;
2. episódio de série com Flyfile pronto, temporada/episódio no `format`;
3. título só com Byse (`flyfileUrl` nulo) → lista vazia sem erro;
4. página sem `statusToken` e página “Título Indisponível” → lista vazia;
5. arquivo em processamento, sem `videoAsset` ou sem qualidade pronta → lista vazia;
6. áudio inglês padrão com legenda PT → `Legendado`;
7. português sem região → `Dublado (Não PT-BR?)`;
8. sem áudio/legenda PT → `Nunca Dublado` (a asserção verifica o enum);
9. legenda com URL inválida descartada, stream preservado;
10. falha HTTP na página, no `public/file` e no `assign` → erro e `getStreams` `[]` com `console.error`;
11. `assign` sem `token` → erro;
12. entrada inválida sem requisição;
13. layout da página sem `h1.title` → erro;
14. log sem URL de mídia ou token;
15. `filename`, bitrate e duração presentes quando o metadado os informa.

### 8. Documentação e status

`providers.md` ganha a linha e a seção `## Pomfy` com `🟠 Não verificado` até a rodada online; depois da rodada, o status segue `docs/tests.md`, seção 7. A descrição e a tabela deixam explícito que o provedor é parcial: Flyfile apenas.

`docs/provider-investigation.md` ganha a seção 3.19, “Catálogo por ID do TMDB com token de embed e API pública do player” (a numeração 3.13 já estava duplicada no guia e a 3.18 foi ocupada pelo Kairou durante a integração; a nova seção entra após a 3.18), com:
1. sinal: página com `statusToken` e endpoint local de troca;
2. investigação: `Sec-Fetch-Dest: iframe`, troca por player, API do Flyfile e `assign`;
3. referências: `src/pomfy/extractor.js` e `test/pomfy.test.js`;
4. limites: Byse como hipótese não integrada (captcha/attestation/playback criptografado), cobertura parcial e URL assinada efêmera.

`src/_blocks/index.md` e `docs/arch.md` não mudam. Nenhum bloco novo é criado; `formatBytes` é local ao provedor porque importar `torrent-release` traria o decodificador de torrent e o bloco `http` sem uso.

## Risks / Trade-offs

1. **Cobertura parcial (~15–18% nas amostras)** → o provedor pode devolver ausência na maior parte do catálogo. Mitigação: declarar `Parcial` em `providers.md`, descrição explícita e cenário de Byse-only nos testes; a rodada online mede a cobertura real.
2. **Byse muda ou vira obrigatório** → o provedor não o integra. Mitigação: não prometer cobertura integral; se o catálogo migrar, uma nova mudança avalia o caminho, sem reutilizar captcha/attestation.
3. **`embedWhitelist`/cabeçalhos do Flyfile** → `X-Embed-Referrer` ou `X-FlyFile-View` podem mudar e a API passa a 403. Mitigação: erro explícito, teste offline com 403 e verificação online após o build.
4. **URL HLS assinada e efêmera** → o master expira e não deve ser cacheado. Mitigação: resolver a cada execução; não gravar URL/token em log, fixture ou documentação.
5. **Página Pomfy com contexto de iframe** → o `Sec-Fetch-Dest` é um cabeçalho de navegador; a fonte pode endurecer a checagem. Mitigação: um único cabeçalho, sem cookies nem UA especial, e erro explícito em 403.
6. **`originalMetadata` como string JSON** → pode vir inválido. Mitigação: bitrate/duração são opcionais; JSON inválido não derruba o stream.
7. **Qualidade fora do padrão** → `buildStream` lança. Mitigação: a fonte publica `1080p`/`720p`; se mudar, o erro aparece na rodada online em vez de um stream com qualidade inventada.
8. **Direitos autorais** → o provedor só localiza URLs públicas da fonte, não hospeda mídia. O código é local; nenhuma implementação externa é copiada.

## Migration Plan

1. Criar `src/pomfy/index.js` (contrato, captura única, `sortByQuality`) e `src/pomfy/extractor.js` (página, token, Flyfile, montagem).
2. Acrescentar a entrada `pomfy` em `manifest.json` na versão `1.0.0`.
3. Criar fixtures sanitizadas e `test/pomfy.test.js` com os casos da seção 7.
4. Rodar `npm run lint`, `npm test` e `node build.js pomfy`; conferir os três formatos e a ausência de edição manual em `providers/`, `gdrive/` e `prism/`.
5. Rodar `npm run test:online -- --provider pomfy` e atualizar `providers.md` com a rodada real.
6. Atualizar `providers.md` e `docs/provider-investigation.md` na mesma mudança.
7. Rollback: remover a entrada do manifest e a pasta `src/pomfy/`, reconstruir os formatos e reverter a documentação; não há dados persistidos, migração nem estado de servidor.

## Open Questions

Nenhuma pendente para a implementação. A cobertura real do Flyfile será medida na rodada online; se o status ficar `Parcial`, a limitação já está registrada na spec e não exige nova decisão.
