# Design

## Context

Ver `proposal.md` — Why. A fonte é um catálogo PHP próprio em `https://topfilmes.biz/`, sem WordPress, API pública ou ID do TMDB na URL. A investigação de 12/11/2026 observou:

1. **Catálogo.** A home lista filmes em `/home?p=<n>`; a navegação tem gênero, letra e ano, sem seção de séries. Buscas por séries conhecidas (`round 6`, `wandinha`, `the office`, `stranger things`) não retornaram cartões; as fichas amostradas são todas de filme. O provedor cobre somente `movie`.
2. **Busca.** `GET /busca?q=<termo>` devolve cartões `.filme` com `a[href^="/assistir/"]`, `.title` e `.year`. A busca é parcial e sem acento (`invocacao` e `invocação` devolvem os mesmos 5 cartões). Uma consulta ampla (`q=a`) devolve 24 cartões e não publica paginação; a fonte limita a busca a uma página.
3. **Ficha.** `/assistir/<slug>` traz o título em `.infos h2`, o ano no primeiro `.info` de quatro dígitos, a duração, o gênero e o bloco `.links`. O bloco tem `.links_dub` com `<a href="/player/<slug>?player=1">`; `.links_leg` aparece apenas como bloco comentado com um embed fixo do YouTube (`https://www.youtube.com/embed/xHwLuKBflKM`), que não é mídia do título.
4. **Player.** `GET /player/<slug>?player=<n>` devolve `<video id="player">` com um ou mais `<source src="//topfilmes.biz/direct/mf/<id>/<hash>/<sd|hd>?expires=..." size="360|720" type="video/mp4">`. O atributo `size` é a altura, não o tamanho do arquivo.
5. **Mídia.** A URL `/direct/...` responde 302 para `download<numero>.mediafire.com/.../<arquivo>.mp4`; seguindo o redirecionamento, o arquivo responde 206 `video/mp4` com `Range`, sem `Referer` e sem cookie. O parâmetro `expires` é opaco e a URL é obtida de novo a cada abertura do player.

O runtime e o contrato de streams estão em `docs/arch.md`. A fonte não aceita TMDB nem IMDb; a identidade depende de `getMediaInfo` e de busca textual.

## Goals / Non-Goals

**Goals:**

1. Resolver filme do TMDB para a ficha correta, com título e ano confirmados.
2. Entregar todas as qualidades que o player publica, com o idioma do contêiner da ficha.
3. Isolar falha de player e não devolver streams parciais de etapa anterior.
4. Cobrir o fluxo com testes Node offline e com uma rodada online do pacote final.
5. Manter o custo de rede proporcional ao pedido: uma busca, uma ficha e um GET por player.

**Non-Goals:**

1. Séries, animes, doramas ou temporadas: a fonte observada não publica esses tipos. Se passar a publicar, a mudança precisa de nova proposta.
2. Legendado: o bloco existe apenas comentado, com embed de YouTube; o provedor lê o bloco ativo se ele aparecer, mas não trata o comentário como opção.
3. Baixar mídia, remover anúncios, contornar DRM ou manter a URL de mídia viva depois da execução.
4. Criar bloco de player específico do TopFilmes ou alterar blocos existentes.
5. Alterar `docs/arch.md`: nenhuma regra global muda.

## Decisions

### 1. Identidade e manifest

O provedor entra como `topfilmes`, nome `TopFilmes`, versão `1.0.0`, `supportedTypes` `["movie"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]` e logo de favicon do domínio. O `mediaType` diferente de `movie` devolve `[]` antes de qualquer requisição.

A fonte não expõe TMDB, IMDb nem tipo na ficha. Como o catálogo observado é só de filme, o tipo não precisa de confirmação na ficha; a identidade é confirmada por título e ano.

Alternativa descartada: declarar `tv` por causa da meta description "filmes e séries". A navegação, a busca e as fichas não sustentam o tipo, e um provedor de TV sem episódios só produziria ausência.

### 2. Busca e confirmação

O fluxo usa `getMediaInfo` e tenta, nesta ordem, `title`, `originalTitle` e no máximo dois `alternativeTitles`, com `fetchText` e perfil `page`. A URL é montada com `URLSearchParams` (`/busca?q=<termo>`), sem `searchParams.set` no `URL` (o polyfill do app não atualiza `href`).

O parsing usa a API básica do cheerio: `.filmes` como contêiner obrigatório, `.filme` para os cartões, `a` para o link, `.title` e `.year` para identidade. Candidatos guardam `{ title, year, url }`, com `url` resolvida contra a origem. `findBestMatch` recebe o `MediaInfo`; o ano do cartão é usado quando existe e `null` quando o cartão não informa. O primeiro termo com correspondência encerra a busca; `null` em todos os termos é ausência.

A fonte não pagina a busca. O limite de 24 cartões é da fonte e não é contornado: a consulta usa o título completo, não uma palavra genérica. Uma página sem `.filmes` é erro de layout; `.filmes` com a mensagem "Nenhum resultado encontrado" é ausência.

Na ficha, o título de `.infos h2` e o primeiro `.info` de quatro dígitos confirmam o candidato com `findBestMatch` sobre um único item. Ano da ficha mais de um ano distante do TMDB descarta o candidato; ficha sem ano mantém o ano do cartão. Título da ficha sem semelhança suficiente também descarta.

Alternativas descartadas: montar slug a partir do título (a fonte usa slugs próprios e devolve 404 para caminho desconhecido) e buscar por IMDb (a fonte não aceita identificador).

### 3. Seleção de players e idioma

A ficha é lida com cheerio. `.links` é o contêiner obrigatório; a ausência dele é erro de layout. As opções vêm de `.links_dub a` e `.links_leg a`, cada seletor separado — a API básica do cheerio do NuvioTV não tem `closest` nem `parent`, e o seletor por contêiner já dá o idioma.

Só entra link cujo `href` resolvido seja do próprio domínio e cujo caminho comece com `/player/`. Isso exclui o embed de YouTube e qualquer link externo. Blocos comentados não são elementos no cheerio (e o `basic-html` dos testes também os ignora). Links repetidos são deduplicados por URL, na ordem da ficha. Ficha válida sem link de player é ausência; ficha sem `.links` ou sem título é erro.

O idioma é `Dublado` para `.links_dub` e `Legendado` para `.links_leg`. As amostras observadas têm apenas `.links_dub`.

Alternativa descartada: procurar `tt-audio` no HTML. O campo aparece em algumas páginas e não em outras; o contêiner do link é a evidência direta da opção.

### 4. Player, qualidades e montagem dos streams

Cada link de player é consultado com `fetchText` e perfil `page`. O parsing lê todos os `source` do `<video>`; cada um precisa de `src` e `size`. O `src` é resolvido contra a URL do player (a fonte usa `//topfilmes.biz/...`). `size` vira `quality` como `<size>p`; valores de três ou quatro dígitos são aceitos por `buildStream`/`normalizeQuality`. Sem `size`, a qualidade fica `Desconhecida` e o stream é preservado. O campo `type` do `<source>` deve ser `video/mp4` ou o caminho deve terminar em `.mp4`; outra mídia é descartada como opção inválida.

Cada `<source>` vira um stream com:

1. `url`: o `src` do player, não a URL final do MediaFire;
2. `quality`: `${size}p`;
3. `language`: do contêiner da ficha;
4. `provider`: `MediaFire` (o caminho `/direct/mf/` e o redirecionamento confirmam a hospedagem);
5. `type`: `mp4`;
6. `format`: `{ template: FORMATTER.AUTO, addon: 'TopFilmes', title, year }`.

Não há `headers`: a URL `/direct` respondeu 206 `video/mp4` sem `Referer` e sem cookie. Não há `size` de arquivo, legenda externa ou outro campo que a fonte não forneça. A lista é ordenada com `sortByQuality`.

Alternativa descartada: seguir o redirecionamento e devolver a URL do MediaFire. Ela é específica da resposta e pode expirar; a URL `/direct` é o endereço público que a própria fonte entrega ao player. Também não se faz sonda de mídia na primeira versão: o `<source>` é o sinal de disponibilidade da fonte e uma requisição extra por stream não é justificada. Se a rodada online ou o uso mostrarem opção morta, uma mudança posterior pode acrescentar sonda mínima com `Range`, como em `redeflix-player`.

### 5. Isolamento, erros e logs

Cada player é resolvido em isolamento. Falha de rede, HTTP fora de 2xx, player sem `<source>` ou fonte sem `src` gera `console.warn('[TopFilmes] Opção <jogador/qualidade> descartada: <causa>')` e só descarta aquela opção. Se todas falharem, o erro sobe com a causa de cada uma.

Ausência reconhecida — busca vazia, nenhum candidato confirmado, ficha sem player — devolve `[]` sem erro. Erro de layout na busca, na ficha ou no player, e falha de rede/HTTP são fatais. Somente `getStreams` captura, registra `console.error('[TopFilmes] Falha em movie <id>: <causa>')` e devolve `[]`, sem streams parciais.

Mensagens não incluem a URL de mídia nem `expires`: usam o slug, o número do player e a qualidade. O provedor não implementa timeout próprio; o app controla a espera.

### 6. Testes e fixtures

O teste do provedor empacota `src/topfilmes/` com `buildProvider`, nos formatos publicados, e simula `fetch` por URL. As fixtures ficam em `test/fixtures/topfilmes/` e são sanitizadas: hosts de mídia fictícios, IDs e tokens substituídos por placeholders, sem URL assinada real.

Casos previstos:

1. filme resolvido com dois `<source>` (360p e 720p), idioma `Dublado`, `provider` `MediaFire` e contrato completo;
2. filme resolvido com um `<source>`;
3. fallback por título original quando o título PT-BR não retorna candidato;
4. busca vazia;
5. ano da ficha incompatível;
6. ficha sem ano, mantendo o ano do cartão;
7. ficha sem player;
8. embed de YouTube e bloco de legendado comentado ignorados;
9. um player com falha e outro funcionando, com `console.warn`;
10. todos os players com falha, com erro e `getStreams` devolvendo `[]`;
11. layout de busca ou de ficha alterado, com erro;
12. requisição de série devolvendo `[]` sem rede;
13. fontes repetidas deduplicadas;
14. log sem `expires` ou URL de mídia.

### 7. Documentação e status

`providers.md` ganha a linha e a seção `## TopFilmes` com `🟠 Não verificado` até a rodada online do pacote final; depois da rodada, o status segue `docs/tests.md`, seção 7. `docs/provider-investigation.md` ganha uma nota curta em 3.12 sobre MP4 entregue por redirecionamento da própria fonte para uma hospedagem externa, com o limite de não devolver a URL final e de não acrescentar cabeçalhos sem necessidade. `src/_blocks/index.md` não muda, porque nenhum bloco é criado ou alterado. `docs/arch.md` não muda.

## Risks / Trade-offs

1. **Catálogo só de filme** → se a fonte passar a publicar séries, o provedor não as cobre. Mitigação: declarar `supportedTypes` `["movie"]` e registrar a limitação; uma nova mudança cobre o tipo novo.
2. **Busca limitada a 24 cartões e sem paginação** → títulos com muitos homônimos podem não aparecer. Mitigação: buscar pelo título completo, tentar título original e alternativos e devolver ausência em vez de escolher um parecido.
3. **Layout PHP próprio** → qualquer mudança derruba os seletores. Mitigação: parsers estritos que lançam erro em vez de devolver lista vazia, fixtures reais e rodada online após o build.
4. **URL de mídia efêmera** → a URL `/direct` pode expirar antes da reprodução. Mitigação: resolver a cada execução, não cachear e documentar o limite; o app inicia a reprodução logo após a resolução.
5. **Redirecionamento para MediaFire** → o host pode mudar, exigir contexto ou ficar indisponível. Mitigação: devolver a URL da fonte, testar o contrato offline e registrar o comportamento na rodada online; não fixar a URL final.
6. **Bloco de legendado apenas comentado** → um dia o site pode ativar `.links_leg` com opções reais. Mitigação: o provedor já lê o contêiner ativo e classifica `Legendado`; o comentário não é confundido com opção.
7. **Cloudflare** → desafio ou bloqueio pode interromper a busca. Mitigação: perfil `page`, erro explícito e nenhuma conclusão de ausência a partir de HTML de desafio.
8. **Direitos autorais** → o provedor só localiza URLs públicas da fonte; não hospeda mídia. Nenhum código externo é reaproveitado; os parsers são locais.

## Migration Plan

1. Criar `src/topfilmes/` com `index.js` (contrato, captura única, `sortByQuality`) e `extractor.js` (busca, ficha, players e montagem).
2. Acrescentar a entrada `topfilmes` em `manifest.json` na versão `1.0.0`.
3. Criar fixtures sanitizadas e `test/topfilmes.test.js` com os casos da seção 6.
4. Rodar `npm run lint`, `npm test` e `node build.js topfilmes`; conferir os três formatos e a ausência de edição manual em `providers/`, `gdrive/` e `prism/`.
5. Rodar `npm run test:online -- --provider topfilmes` com `TMDB_API_KEY` somente do ambiente e atualizar `providers.md` com a rodada real.
6. Atualizar `providers.md` e `docs/provider-investigation.md` na mesma mudança.
7. Rollback: remover a entrada do manifest e a pasta `src/topfilmes/`, reconstruir os formatos e reverter a documentação; não há dados persistidos, migração nem estado de servidor.
