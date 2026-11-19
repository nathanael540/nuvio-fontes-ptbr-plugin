# Design

## Context

Ver `proposal.md` para motivação e escopo. Na investigação do APK do Seekee (`com.enzo.paulo`, build 182) e dos scripts públicos baixados via GraphQL `webScriptSettings`, verificou-se que:

1. A API nativa do app (`mobile-api.buscari.com`) exige assinatura com chave pública distinta além de `getFastPlayInfo` retornar `no rights` (`-170004`) para usuários sem assinatura VIP, enquanto `/buscari/app/search/search` depende da raspagem de Google/Bing dentro de um `WebView` Android sujeito a reCAPTCHA.
2. O script público de busca (`search/prod/1.0.0/my-react-lib.umd.*.min.js`) consulta diretamente `GET https://h5-api.otv.cc/quan/h5/search/search?enterType=user&keyWord=<termo>` com assinatura local (`aeskey` + `sign` + `currentTime`) e cabeçalhos `lang: pt`, `versionCode: 182`, `clientType: android_buscari`, `deviceId`, devolvendo até 5 resultados com `resourceUrl`, `resourceTitle`, `typeCode`, `endYear` e `labelList`.
3. Todas as URLs devolvidas por `h5-api.otv.cc` usam o host `h5.onfilom.com`, que responde HTTP 403 com desafio do Cloudflare ao `fetch` direto. Contudo, os sete domínios vest investigados (`es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com`, `ww20.321moviesfree.com`) servem exatamente os mesmos caminhos `/pt/detail/<movie|drama>/<slug>[/<ep>]` com HTTP 200 direto, sem exigir `User-Agent` especial ou cookies, publicando `__NEXT_DATA__` (`props.pageProps`) e `<meta name="x-meta-*">` com playlists `.m3u8` e legendas `.srt` acessíveis sem cabeçalhos adicionais.

## Goals / Non-Goals

**Goals:**

1. Consolidar o ecossistema Seekee/Vest em um único provedor `seekee` (`Seekee`), cobrindo filmes, séries, animes e doramas com streams HLS e legendas `.srt`.
2. Manter 100% de compatibilidade com QuickJS transpiled para `es2016` (NuvioMobile e NuvioTV), sem `BigInt` literals, `TextEncoder`, `crypto` nativo do Node ou APIs exclusivas de navegador.
3. Resolver automaticamente temporadas faltantes no top-5 da busca via `seasons[]`, expandir variantes de áudio via `dubbingList` e impedir falsos positivos de episódio único quando o site cai silenciosamente para o episódio 1.

**Non-Goals:**

1. Criar sete provedores separados em `manifest.json`: os sete domínios espelham exatamente o mesmo acervo e produziriam streams duplicados, violando `docs/arch.md` seção 4, item 10.
2. Consumir `mobile-api.buscari.com` (`queryFreshDomainList`, `getFastPlayInfo`) ou raspar Google/Bing como o `WebView` do APK.
3. Expor dublagens em idiomas de terceiros (`es`, `tr` etc.) quando o pedido visa o catálogo PT-BR.

## Decisions

### 1. Provedor único unificado com rede de espelhos ordenada

- **Decisão:** Publicar apenas `seekee` (`Seekee`), tentando os espelhos na ordem `es.cuevana4br.com`, `play.cuevana19.com`, `flixlat.com`, `latino.solo-latino.com`, `video.playspelis.com`, `www3.dramasfree.com`, `ww20.321moviesfree.com` somente em falha de rede, HTTP fora de 2xx ou resposta sem `__NEXT_DATA__`.
- **Alternativas consideradas:** Criar um provedor por domínio (`cuevana4br`, `cuevana19`, `flixlat` etc.). Rejeitado porque todos compartilham os mesmos IDs, slugs, `dubbingList` e mídia subjacente; cada domínio extra apenas replicaria os mesmos streams e latência.
- **User-Agent dos espelhos (achado do apply):** os sete espelhos respondem 403 ao `User-Agent` de Chrome desktop dos perfis do bloco `http` e 200 sem `User-Agent`, com OkHttp ou com Chrome Android. As páginas usam o `User-Agent` de Chrome Android, coerente com o app de origem; a busca em `h5-api.otv.cc` aceita o perfil `api` sem mudança.
- **Espelho preferido:** o carregador começa as leituras seguintes do mesmo pedido pelo último espelho que respondeu, para não repetir um espelho bloqueado a cada página.
- **Nota de licenciamento e origem:** Implementação limpa e original do protocolo público observado em `h5-api.otv.cc` e nos espelhos HTML, sem cópia de código terceiro incompatível com GPL-3.0.

### 2. Assinatura da busca compatível com ES2016 e QuickJS

- **Decisão:** Implementar criptografia RSA-1024 PKCS#1 v1.5 pura em JavaScript com multiplicação de Montgomery (CIOS) em limbs de 16 bits, com `R² mod n` e `n' = -n⁻¹ mod 2^16` pré-calculados do módulo (evitando `BigInt`, que o esbuild `target: 'es2016'` rejeita em literais, e `TextEncoder`/`crypto`), combinada com `crypto-js` (`AES` ECB + `Pkcs7`, `enc.Utf8`, `enc.Base64`, `MD5`) já permitido nos dois apps.
- **Desempenho (medido no apply):** por busca, ~3 ms no Node e ~25 ms no V8 com `--jitless`; a primeira versão, por dobra e soma bit a bit, levava ~200 ms sem JIT e foi substituída para não pesar no QuickJS interpretado.
- **Detalhes do protocolo:**
  1. Gerar chave ASCII aleatória de 16 caracteres hexadecimais (`k`).
  2. Cifrar `k` com o expoente público `65537` (`e = 2^16 + 1`: 16 elevações ao quadrado + 1 multiplicação modular) e módulo RSA-1024 extraído da chave pública pública do script cliente Seekee, codificando em Base64 (`aeskey`).
  3. Ordenar as chaves de query (`enterType`, `keyWord`) em ordem lexicográfica decrescente, concatenar seus valores, codificar em Base64 UTF-8, prefixar `currentTime` em milissegundos, substituir `+` por `-` e `/` por `_`, cifrar em AES-128-ECB com `k` e calcular `MD5` em hex minúsculo (`sign`).
  4. Enviar com `lang: "pt"`, `versionCode: "182"`, `clientType: "android_buscari"` e `deviceId` hexadecimal de 32 caracteres (não fixo nem ligado a conta).
- **Alternativas consideradas:** Usar `BigInt('0x...')` (funciona em QuickJS moderno, mas aritmética em membros de 15 bits funciona até em motores JS sem `BigInt` e executa em ~16 ms) ou buscar direto nos espelhos via `/pt/search?keyword=` (desabilitado nos espelhos públicos, retorna `searchRes: []`).

### 3. Confirmação de identidade, tipo e resolução de temporada/episódio

- **Decisão:**
  1. Validar entrada (`movie` ignora temporada/episódio; `tv` exige inteiros `>= 1`).
  2. Consultar `getMediaInfo` (`tmdb-info`) para obter título PT-BR, título original, alternativas, ano e `seasons`.
  3. Buscar em `h5-api.otv.cc` com `mediaInfo.title`, seguido de `mediaInfo.originalTitle` e `mediaInfo.alternativeTitles` (deduplicados) apenas se nenhum candidato compatível for confirmado.
  4. Filtrar `typeCode`: `"movie"` para `mediaType === 'movie'`; `"drama"` para `mediaType === 'tv'`.
  5. Normalizar `resourceTitle` removendo prefixo `[...]` e sufixo `(Temporada|Season) N`, comparar também o trecho antes de `:` (a fonte publica `Arcane: League of Legends` para `Arcane` do TMDB) e extrair o slug após `<id>-` em `resourceUrl`, sem o sufixo de idioma `[Audio-pt-BR]`; comparar ambos com `title-match`/`slugify` contra o `MediaInfo`. Em `movie`, exigir compatibilidade com `mediaInfo.year` quando `endYear` existir; em `tv`, não descartar uma temporada porque `endYear` reflete o ano da temporada (como visto em *Arcane* 2021 com `endYear: 2024`), validando contra `mediaInfo.year` ou `mediaInfo.seasons`.
  5.1. Comparar também com algarismos romanos de II a X convertidos para arábicos (`Gladiador II` na fonte e `Gladiador 2` no TMDB ficavam em 0,84, abaixo do mínimo de 0,85); `V` fica de fora para não alterar títulos como `V de Vingança`.
  6. Para `tv`, preferir resultado já correspondente à temporada pedida (`Temporada N` / `Season N`); quando o top-5 trouxer outra temporada da mesma série, abrir a página dessa temporada, localizar `seriesNo === season` em `props.pageProps.seasons` e seguir para `/pt/detail/drama/<websiteParam>/<episode>`.
  6.1. Séries de temporada única (doramas e novelas) publicam `seriesNo: null`; a temporada da página vem então da entrada de `seasons` cujo `websiteParam` é a própria página. Sem essa leitura, Hotel Del Luna, Pousando no Amor e Senhora do Destino falharam na primeira rodada online.
  7. Ao abrir a página do episódio, confirmar que `Number(pageProps.currentEpisodeNumber) === episode` e que existe item correspondente em `episodeVo` (ou número compatível), pois pedidos como `/99` retornam HTTP 200 caindo silenciosamente para o episódio 1.

### 4. Expansão de idioma, legendas e montagem dos streams

- **Decisão:**
  1. Na página confirmada (e episódio selecionado), considerar a própria página e `dubbingList` e selecionar a primeira versão com `audioLanguageCode === 'pt'` (dublada ou com áudio original em português) e a primeira com `dubMode === '0'` em outro idioma, descartando dublagens de terceiros (`es`, `tr` etc.). A versão da própria página reaproveita o HTML já baixado.
  2. Classificar idioma (decisão do apply, alinhada à spec):
     - `audioLanguageCode === 'pt'`: `LANGUAGE.DUBBED`, porque o catálogo `pt` é brasileiro. Exceção achada na rodada online: `languageName` `Áudio Português-PT` marca português de Portugal (o `labelList` da busca ainda mostra `Português Brasil` 🇧🇷, então a bandeira não comprova região) e sai `LANGUAGE.DUBBED_NON_PT_BR`; entre versões em português, a brasileira tem preferência.
     - Áudio estrangeiro: `LANGUAGE.SUBTITLED` quando `subtitlingList` do episódio contém `pt`, `pt_BR`, `pt-br` ou `pob` (mesma convenção); sem faixa portuguesa, `LANGUAGE.NON_PT_BR` (`Gringo`).
  3. Extrair cada item de `mediaInfoList` (`.m3u8`), resolver o rótulo de qualidade via `definitionList` (`GROOT_HD` → `1080p`, `GROOT_SD` → `720p`, `GROOT_LD` → `540p`, `GROOT_FD` → `360p`) e fallback `qualityHints`/`quality-discovery`.
  4. Mapear todas as entradas válidas de `subtitlingList` para `{ url: subtitlingUrl, language: language || languageAbbr }`, mantendo sem cabeçalhos adicionais já que os CDNs `.m3u8` e `.srt` respondem HTTP 200 diretamente.
  5. Não informar `size`: `episodeVo[idx].fileSize` é um valor único do episódio, sem correspondência com cada qualidade de `mediaInfoList`. Os streams também saem sem `headers`, porque playlists e legendas respondem 200 sem cabeçalhos.
  6. Montar via `buildStream` com `format: { template: FORMATTER.AUTO, addon: 'Seekee', title, year, season, episode }`, deduplicar por URL e ordenar com `sortByQuality`.

## Risks / Trade-offs

1. **Limite de 5 resultados em `h5-api.otv.cc`** → Mitigado usando consultas fallback (`title`, `originalTitle`, `alternativeTitles`) e navegação pela lista `seasons` da página quando outra temporada da mesma série aparece no top-5. A busca específica `<título> Temporada <N>` como último recurso não foi implementada (YAGNI): nas rodadas online, nenhuma série dependeu dela.
2. **Mudança da chave pública RSA ou cabeçalhos exigidos por `h5-api.otv.cc`** → Mitigado isolando a assinatura em `src/seekee/api.js` com validação explícita de `code !== "00000"` para que eventual erro de assinatura (`-10002`/`-10005`) seja reportado claramente como falha técnica, nunca mascarado como ausência.
3. **Cloudflare passar a bloquear um dos 7 espelhos** → Mitigado pela lista ordenada com fallback automático entre os 7 domínios verificados e possibilidade de evolução futura via `queryFreshDomainList` documentada em `docs/provider-investigation.md`.
4. **Expiração de tokens `hdnts` nas URLs `.m3u8`** → Mitigado resolvendo tudo em tempo de execução sem cache nem gravação de URLs assinadas em fixtures ou documentação (`test/fixtures/seekee/` usará apenas URLs sanitizadas).
5. **Português de Portugal com rótulo brasileiro na busca** → A classificação usa o `languageName` da página, não a bandeira do `labelList`.

## Validação

1. **Testes Node (`test/seekee.test.js`, 23 casos, fixtures reais sanitizadas de 19/11/2026):** assinatura (`aeskey` conferido contra o RSA sem padding do Node e `sign` contra AES/MD5 do Node), código de protocolo e HTTP de erro na busca, filme por título PT-BR, fallback para o título original, ausência, ano divergente, subtítulo após `:` com slug `[Audio-pt-BR]`, numeral romano, série na temporada da busca, temporada fora do top-5 via `seasons`, temporada única com `seriesNo` nulo, episódio 99 com queda para o episódio 1, `Gringo`, português de Portugal, failover após 403, página sem `__NEXT_DATA__`, todos os espelhos bloqueados, User-Agent Android, falha isolada de uma versão, erro agregado sem mídia e entrada inválida.
2. **Rodadas online (19/11/2026):** a primeira (Estável, movie 4/5, tv 2/5) revelou o `seriesNo` nulo em três séries de temporada única; a segunda (Estável, 4/5 e 5/5) revelou o numeral romano de Gladiador II, e a busca revelou o `Áudio Português-PT`. A rodada registrada em `providers.md`, com o pacote final, ficou Estável com movie 4/5 e tv 5/5; o único vazio (filme de Swallowed Star) não existe na fonte, que só tem a série.
3. `npm run lint`, `npm test` e `node build.js seekee` passaram com o pacote final.
