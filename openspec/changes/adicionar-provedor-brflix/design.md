# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://brflix.lat/`; URLs assinadas, tokens de mídia e cookies não são registrados aqui.

1. O site é uma SPA com rotas em hash e metadados do TMDB. O catálogo não é servido no HTML inicial; a busca e os detalhes usam o backend do próprio site.
2. O player escolhe um entre vários servidores declarados em `/app.js`: `zeus`, `fenixflix`, `superflix`, `warezcdn`, `megaembed`, `embedmovies`, `clickhost` e `native_premium`. A opção "Servidor Principal" agrega esses caminhos.
3. A resolução agregada usada pelo player é `GET /best-stream-resolve?mediaType=movie|tv&tmdbId=<id>&season=<n>&episode=<n>&dubbed=1&hq=0`. Ela responde HTTP 200 com `{"ok":true,"enc":true,"payload":"<iv>:<tag>:<ciphertext>"}` ou `{"ok":false,"enc":true,"payload":"..."}`. O payload é JSON cifrado em AES-256-GCM.
4. A chave simétrica de 32 bytes está em texto claro no `/app.js` do site, junto do código público que decifra o payload. Ela não é emitida por conta, não identifica usuário e não libera nenhum recurso além da leitura da resposta pública; é uma constante de protocolo do player, não uma credencial.
5. O JSON decifrado tem `ok`, `url`, `type`, `provider`, `dubbed`, `quality` e `candidates[]`. Cada candidato tem `provider`, `url`, `type` e, às vezes, `dubbed` e `quality`. Os tipos observados são `mp4`, `hls` e `iframe`.
6. As URLs dos candidatos são relativas ao BRFlix, como `/dynamic-proxy/http__<host>/<caminho>` e `/embedplayer-proxy/cdn/hls/<hash>/master.m3u8?md5=<...>&expires=<...>`. Elas apontam para proxies públicos do próprio site; não exigem cookie, conta ou `Referer` nos testes. O MP4 respondeu 206 a `Range` e o master HLS respondeu `#EXTM3U` com variantes de 360p e 720p e faixas de áudio e legenda.
7. As URLs de mídia têm validade curta (`expires` no master HLS). A mesma consulta repetida devolve URLs novas; não há cache entre chamadas.
8. O campo `quality` não é uniforme: em MP4 ele trouxe `1080` e `720`; em HLS trouxe valores como `1.1979`, `2.2222` e `3.7977`, compatíveis com tamanho em GB, não com resolução. O valor só é usado quando for uma resolução inteira plausível.
9. `dubbed=1` foi aceito em todos os exemplos. Em alguns títulos o servidor devolveu `dubbed:false` mesmo com a preferência dublada; o campo do candidato é a evidência usada para o idioma, não o parâmetro enviado.
10. Títulos com apenas `iframe` (por exemplo, um filme cuja única opção era `v1.watchplay.shop/movie/<tmdb>`) não entregam mídia jogável no contrato atual. O site abre esse candidato em iframe; o Nuvio precisa de URL direta.
11. A API não exige IMDb: a consulta só com `tmdbId` devolveu candidatos para filme e série. `getMediaInfo` não é necessário para resolver; só seria útil para enriquecer título e ano no formatador.
12. O runtime do app tem `fetch`, `URL`, `URLSearchParams`, `atob`/`btoa` e `crypto-js`, mas não garante `crypto.subtle`. O `crypto-js` não implementa GCM. O build já mantém `crypto-js` externo.

## Goals / Non-Goals

**Goals:**

1. Consumir a resolução agregada do BRFlix por TMDB, com uma única consulta por pedido.
2. Decifrar o payload no aparelho com `crypto-js`, sem APIs do Node e sem `crypto.subtle`.
3. Devolver somente candidatos MP4 e HLS jogáveis, com idioma, proveniência e cabeçalhos coerentes.
4. Distinguir ausência reconhecida de falha de rede, parsing, decifragem ou estrutura.
5. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online pelo perfil generalista.

**Non-Goals:**

1. Resolver as opções `iframe` do agregado, inclusive `v1.watchplay.shop`.
2. Consultar diretamente FenixFlix, SuperFlix, MegaEmbed, EmbedMovies, ClickHost, WarezCDN ou FirePlayer; o valor do provedor é o agregado do BRFlix.
3. Baixar o master HLS, separar variantes, sondar MP4 ou descobrir qualidade por requisição extra.
4. Manter cache, renovar URLs expiradas ou repetir a consulta automaticamente.
5. Adicionar conta, cookie, token, proxy externo ou chave de serviço.
6. Criar um bloco compartilhado antes de existir um segundo consumidor real do mesmo protocolo.
7. Consultar `dubbed=0` como fallback; a preferência dublada é a única consultada nesta versão.
8. Usar `getMediaInfo` ou IMDb para enriquecer o formatador ou ampliar a cobertura; o fluxo atual usa somente o TMDB.

## Decisions

### D1. Usar `/best-stream-resolve` em vez de raspar a SPA ou seus servidores individuais

1. A resolução agregada devolve, em uma requisição, os candidatos que o próprio site escolheria entre vários servidores. É o menor fluxo observado e o que expõe a maior cobertura.
2. Alternativas descartadas:
   1. Raspar o HTML da SPA: o catálogo e o player são montados por JavaScript; o HTML inicial não contém a mídia.
   2. Consumir somente o FenixFlix (Servidor 8): é um servidor público e sem cifra, mas cobre apenas parte do agregado e não é o BRFlix.
   3. Resolver cada servidor individualmente: vários já têm provedores próprios neste repositório e o resultado deixaria de ser o agregado do BRFlix.
   4. Usar o iframe do site: o contrato do Nuvio não reproduz uma página HTML.
3. A API não é versionada. Mudanças de esquema sobem como erro de estrutura, não como ausência.

### D2. Decifrar AES-256-GCM com o keystream AES-CTR do `crypto-js`

1. Ler `enc`, `payload` e o `iv` de 12 bytes. O `payload` é `iv:tag:ciphertext` em Base64.
2. Construir o contador GCM `J0+1 = iv || 00 00 00 02` e decifrar o ciphertext com `CryptoJS.AES.decrypt` em modo CTR e `NoPadding`, usando a chave em `CryptoJS.enc.Hex` e o contador em `CryptoJS.enc.Hex`.
3. A tag GCM não é verificada, porque o `crypto-js` não expõe GHASH e o payload vem por HTTPS do mesmo host; o JSON decifrado é validado estruturalmente. A alternativa seria implementar GHASH no QuickJS, sem ganho de segurança para este fluxo público.
4. Alternativas descartadas:
   1. `crypto.subtle`: existe só no NuvioMobile e não é garantido no runtime comum.
   2. Implementar AES-GCM completo no provedor: mais código e mais superfície de erro para um payload pequeno e público.
   3. Baixar a chave do `/app.js` em tempo de execução: adiciona uma requisição, depende do formato do bundle e não elimina o uso da chave; a constante pública fica documentada no código com a origem.
   4. Usar um serviço externo de decifragem: adicionaria conta, chave ou dependência não permitida.
5. A chave é uma constante de protocolo pública, citada no código com a URL de origem e a data; não é segredo de usuário. O provedor não envia essa chave a nenhum serviço.

### D3. Consulta por TMDB, sem busca textual e sem `getMediaInfo`

1. Validar `tmdbId` como texto não vazio e `mediaType` como `movie` ou `tv`.
2. Para `movie`, montar a query sem `season`/`episode`. Para `tv`, exigir inteiros positivos e enviá-los.
3. Enviar `dubbed=1` e `hq=0`, como o player do site. Não enviar `imdbId`: a API resolveu os exemplos só com o TMDB e o IMDb exigiria uma consulta adicional ao TMDB.
4. Alternativas descartadas:
   1. `getMediaInfo` para obter título, ano e IMDb: melhora o formatador e a cobertura do FenixFlix, mas adiciona uma requisição e uma chave externa em um fluxo que já resolve pelo TMDB.
   2. Busca textual: a API não expõe busca de catálogo; o player já recebe o TMDB.

### D4. Triagem dos candidatos

1. Preferir `candidates[]`; se ausente, usar a URL de nível superior como único candidato.
2. Aceitar somente `type` `hls` ou `mp4`, com URL HTTP(S) ou relativa. Resolver URLs relativas contra `https://brflix.lat/` com `new URL(url, base)`. Candidato HLS ou MP4 com URL inválida é opção com falha: descartar com `console.warn('[BRFlix] Opção <provider> descartada: <causa>')`, preservando os demais.
3. Descartar `iframe` por triagem, sem aviso de falha; se todos os candidatos forem descartados por triagem, devolver lista vazia. Se todas as opções falharem, o erro agregado sobe.
4. Deduplicar pela URL absoluta final. O candidato de nível superior costuma repetir o primeiro item de `candidates`.
5. O `type` do stream é `hls` ou `mp4`; a extensão da URL não decide o tipo quando o campo existe.
6. Alternativa descartada: resolver o iframe `v1.watchplay.shop` para HLS. É um player adicional, com contrato próprio, e fica fora do escopo desta mudança; pode virar outro provedor ou uma mudança futura se a cobertura justificar.

### D5. Streams, idioma, qualidade e cabeçalhos

1. Montar cada stream com `buildStream` e `format: { template: FORMATTER.AUTO, addon: 'BRFlix' }`. Título, ano, temporada e episódio não são fornecidos pela API; omitir em vez de buscar no TMDB.
2. `provider` recebe o nome do candidato (`BRFLIX Server 1`, `BRFLIX Alternativo`, `BRFLIX Ultra HD` etc.).
3. `language`: `dubbed:true` vira `LANGUAGE.DUBBED`; `dubbed:false` vira `LANGUAGE.SUBTITLED`. Sem o campo, omitir e deixar a descoberta local classificar como desconhecido, sem inventar PT-BR.
4. `quality`: usar somente quando o valor for um inteiro plausível de resolução (por exemplo, `720`, `1080`, `2160`). Valores fracionários ou fora dessa faixa são ignorados; o `buildStream` decide localmente e preserva `Desconhecida`. Não há requisição extra só para descobrir qualidade.
5. `headers`: `playbackHeaders('https://brflix.lat/')`, com `User-Agent`, `Referer` e `Origin`. Os proxies responderam sem `Referer` nos testes, mas os cabeçalhos preservam o contexto do site e não introduzem credencial.
6. Não preencher `size`, `subtitles`, `infoHash`, `seeders` ou `peers`: a resposta não os fornece. As faixas de legenda do master HLS ficam no próprio master, não viram legendas externas.
7. Ordenar com `sortByQuality` no ponto de entrada, como no template.

### D6. Fronteira de erro

1. `ok:false` é ausência reconhecida: a API já tentou os servidores e não produziu mídia. Devolver `[]`, sem `console.error`.
2. Erro de rede, HTTP fora de 2xx, JSON inválido, payload ausente, IV inválido, Base64 inválido, falha de decifragem, `ok:true` sem `candidates` e sem URL superior são erros de estrutura/falha e sobem.
3. Candidato HLS ou MP4 com URL inválida é opção com falha isolada: descartar com `console.warn`, preservando os demais. Se nenhum stream for produzido e alguma opção tiver falhado, o erro agregado sobe. O descarte de `iframe` é triagem documentada, não falha.
4. `getStreams` valida a entrada, captura a falha final, registra `console.error('[BRFlix] ...')` e devolve `[]`.
5. Não impor timeout, não repetir a consulta e não manter cache. O app gerencia a espera; a consulta agregada pode demorar porque tenta vários servidores.

### D7. Manifest, versão e documentação

1. Manifest: `id` `brflix`, nome `BRFlix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `pt` e logo `https://brflix.lat/favicon.png`.
2. `providers.md`: linha e seção `## BRFlix` com status `🟠 Não verificado`, `—` na coluna de última verificação e sem bloco de verificação até a rodada online.
3. `docs/provider-investigation.md`: nova seção sobre agregador com resposta cifrada no cliente, registrando a descoberta do endpoint no bundle, o formato `iv:tag:ciphertext`, a decifragem por keystream, a triagem `iframe` e os limites de expiração e cobertura.
4. Nenhum bloco novo e nenhuma alteração em `src/_blocks/index.md`; a decifragem e a triagem são específicas desta fonte.
5. `package.json`: `crypto-js` em `devDependencies` para os testes Node; o build já o mantém externo.

### D8. Testes e fixtures

1. `test/fixtures/brflix/` guarda respostas reais sanitizadas: resposta cifrada de filme com MP4 e HLS, resposta cifrada de série, `ok:false`, candidato somente `iframe`, resposta sem cifra e estrutura inválida. O ciphertext pode ser mantido como opaco; URLs completas de mídia não entram em fixtures em texto claro.
2. Para os casos determinísticos de contrato, gerar payloads sintéticos com a mesma chave e IV controlado, usando `node:crypto` no teste, e afirmar as URLs de exemplo. O teste da decifragem usa um payload real e verifica apenas estrutura, tipos e idioma.
3. Casos: filme com dois candidatos, série, `dubbed:false`, `iframe` único, `ok:false`, resposta sem cifra, HTTP 500, JSON inválido, payload sem IV, ciphertext inválido, `ok:true` sem candidatos, URL relativa, deduplicação e duas chamadas gerando URLs distintas no mock.
4. `crypto-js` entra em `devDependencies`; o teste do provedor importa o pacote gerado e o runtime simulado usa o mesmo módulo.

## Risks / Trade-offs

1. **Chave pública no código** → a chave é uma constante de protocolo do player, não um segredo ou credencial; fica documentada com a origem e não é enviada a terceiros. Se o site trocar a chave, a decifragem falha de forma explícita e a mudança precisará de atualização.
2. **API cifrada e anti-scraping** → a API pode mudar o esquema ou bloquear o ambiente. O provedor não tenta contornar; falha explícita e a rodada online registra o impedimento.
3. **URLs expiram** → resolver a cada chamada, sem cache. Uma URL expirada no meio da reprodução é limitação da fonte, não do contrato.
4. **Candidatos `iframe`** → parte do acervo pode não ser jogável no Nuvio. A triagem devolve lista vazia em vez de uma URL de página; a cobertura é medida na rodada online.
5. **`ok:false` pode esconder falha de servidor** → a API só devolve `ok:false` depois de tentar os provedores, e erros de rede/HTTP do próprio BRFlix continuam fatais. O risco residual fica registrado.
6. **Qualidade HLS desconhecida** → o campo `quality` do HLS não é resolução. O stream é preservado como `Desconhecida`; não há requisição extra para ler o master.
7. **Faixa de áudio do HLS** → o master pode expor áudio em inglês e português e o app pode não honrar a preferência do site; o idioma do stream segue o campo `dubbed` do candidato. O MP4 dublado, quando existe, tende a ser a opção mais previsível.
8. **Latência** → a consulta agregada tenta vários servidores e pode demorar. O provedor não impõe timeout; o app decide a espera.
9. **`crypto-js` no QuickJS** → usar somente `AES`, `mode.CTR` e `pad.NoPadding`, com `enc.Hex`/`enc.Base64`; o build mantém o módulo externo.
10. **Tag GCM não verificada** → o payload vem por HTTPS e o JSON é validado; a alternativa seria implementar GHASH no QuickJS, sem ganho prático para uma resposta pública.

## Migration Plan

1. Criar `src/brflix/` com `index.js`, `api.js`, `payload.js` e `streams.js`, seguindo o contrato de `src/_template/`.
2. Adicionar `crypto-js` às `devDependencies` e rodar `npm install`.
3. Adicionar a entrada `brflix` ao `manifest.json`, a linha e a seção em `providers.md` e as fixtures/testes.
4. Implementar a consulta, a decifragem, a triagem, a montagem dos streams e a fronteira de erro.
5. Rodar `npm run lint`, `npm test` e `node build.js brflix`.
6. Executar `npm run test:online -- --provider brflix` com o pacote construído e registrar a rodada em `providers.md`; sem ela, o status permanece `🟠 Não verificado`.
7. Arquivar a mudança somente com os testes previstos passando ou com as exclusões declaradas.
8. Rollback: remover a entrada do manifest, `src/brflix/`, o teste, as fixtures, a dependência e a seção de `providers.md`; nenhum dado persistente é migrado.


