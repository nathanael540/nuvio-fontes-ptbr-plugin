# Design

## Context

O HTML do player do Blogger publica `streamingData` em duas formas observadas no AniTube:

1. Uma string JavaScript que contém JSON escapado, começando em `"{\"streamingData\"`.
2. Um objeto JSON embutido no HTML, encontrado pelo marcador `"streamingData"`.

O HTML pode trazer `&quot;`, `&#39;`, `&lt;`, `&gt;` e `&amp;`; os escapes são decodificados antes da leitura do JSON. `streamingData.formats` lista formatos progressivos com `url` e `qualityLabel`; formatos adaptativos e `serverAbrStreamingUrl` ficam fora do contrato. O código atual está em `src/anitube/players.js` e é exportado como `extractBloggerFormats`.

## Goals / Non-Goals

**Goals:**

1. Uma única implementação de extração de `streamingData.formats`, com contrato explícito e JSDoc completo.
2. Preservar exatamente o comportamento do AniTube: mesmas URLs, mesmo `qualityLabel`, mesmos erros.
3. Cobrir as duas formas de `streamingData`, entidades HTML e casos inválidos sem rede.
4. Deixar AnimeQ e Animes Online Blue consumirem o bloco sem copiar código.

**Non-Goals:**

1. Resolver o iframe do Blogger, escolher player ou montar streams: isso continua no provedor.
2. Ler formatos adaptativos, `serverAbrStreamingUrl`, legendas ou áudio.
3. Fazer requisição, usar cheerio ou executar script remoto.
4. Alterar o contrato do AniTube ou o manifest.

## Decisions

### 1. Assinatura e retorno

O bloco exporta apenas:

```js
extractBloggerFormats(html)
```

Recebe o HTML bruto do player e devolve `Array<{ url: string, qualityLabel: string|null }>`, na ordem publicada. URL fora de HTTP(S) é ignorada; `qualityLabel` vazio vira `null`. Não há deduplicação: o AniTube também não deduplica nessa etapa.

### 2. Erros

O bloco lança erro com mensagem clara quando:

1. `streamingData.formats` não existe;
2. o JSON não é válido;
3. nenhum formato progressivo com URL HTTP(S) resta após a triagem.

O provedor decide se a falha é isolada por opção ou fatal, como hoje. O bloco não registra log.

### 3. Localização das funções

Saem de `src/anitube/players.js` para o bloco: `extractBloggerFormats`, `readStreamingData`, `findStringEnd`, `findObjectEnd`, `decodeHtmlEntities` e o helper `isHttpUrl` usado pela extração. Ficam no AniTube: `collectPlayers`, `resolvePlayers`, `resolveOption`, `resolveFhd`, `resolvePlayer1`, `readFhdUrl`, `readFhdSource`, `readBloggerIframe` e `sanitizeMessage`. O `isHttpUrl` genérico do provedor pode continuar local se ainda for usado por outra função; nesse caso o bloco tem o seu próprio helper privado.

### 4. Sem cheerio e sem rede

A extração é puramente textual. O bloco não importa `cheerio`, `http` nem qualquer módulo do provedor; isso o mantém utilizável no QuickJS e testável sem fixtures de rede.

### 5. Compatibilidade

O AniTube importa o bloco e mantém os mesmos seletores, mensagens e streams. A suíte existente (`test/anitube.test.js`) é a prova de não regressão; a suíte do bloco cobre os casos que o provedor não isola.

## Alternatives

1. **Manter cópias locais no AnimeQ e no Animes Online Blue.** Rejeitado: três cópias do mesmo parser, com risco de divergência e sem teste isolado.
2. **Criar um bloco genérico de player.** Rejeitado: o bloco precisa ser pequeno e observado; a cadeia de iframe, seleção e headers é específica de cada provedor.
3. **Usar cheerio para localizar o JSON.** Rejeitado: o `streamingData` está dentro de script, não em um elemento estável; a leitura textual já é a implementação em uso.

## Risks / Trade-offs

1. O formato do HTML do Blogger pode mudar; o bloco falha com mensagem clara e o provedor isola a opção.
2. A extração só cobre MP4 progressivo; HLS e formatos adaptativos continuam fora, como no AniTube.
3. `qualityLabel` é apenas o rótulo publicado; não é uma promessa de resolução real.

## Validation

1. Testes unitários do bloco com HTML controlado, sem rede.
2. `node --test test/anitube.test.js` e `node build.js anitube` antes e depois do refactor.
3. `node --test test/blocks-catalog.test.js` para a linha do catálogo.
4. Nenhuma rodada online é necessária para um bloco sem rede; a evidência de funcionamento do AniTube continua sendo a rodada do pacote publicado.
