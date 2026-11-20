# Design

## Context

1. `providers.md` registra a execução `2026-11-20T13-20-44-544Z-animesdigital-20261120-9e00`, gerada em 20/11/2026 às 13:21:39 UTC, pacote 1.0.0, perfil `anime`, combinação `prism/all/all/all` e semente `20261120`. Foram 0/5 filmes e 0/5 séries resolvidos; a seleção de séries usa S01E01. Os dois catálogos tinham revisão `2026-11-12.1`.
2. O `result.json` dessa execução, em `test/artifacts/online/<ID>/`, confirma os dez resultados `Sem resultado`, todos com zero streams, `reason` nulo e sem avisos. O diretório contém apenas esse relatório; não há respostas HTTP nem logs por etapa. O relatório não comprova a causa dos vazios nem que cada requisição ao catálogo ocorreu.
3. O fluxo em `src/animesdigital/index.js` consulta TMDB, procura candidato, seleciona mídia e extrai Anivideo; retornos antecipados reconhecidos e exceções capturadas em `getStreams` convergem para `[]`. Assim, um resultado vazio isolado não identifica a etapa; o relatório não prova ausência de exceções registradas no console.
4. Em consulta pública pontual posterior em 20/11/2026, a página inicial respondeu HTTP 200 e a busca por `Jujutsu Kaisen` respondeu HTTP 200 após redirecionamento para `/pesquisa/`, com oito cartões `itemA`; pelo menos dois apontavam para fichas `/anime/a/`. Isso confirma acesso e estrutura de busca naquele momento, não confirmação de candidato, episódio, player, mídia ou condição da rodada anterior. Não foi executado o pacote final nessa consulta.
5. A seção do provedor também registra, em 14/11, 1/5 filmes e 3/5 séries, com limitações de rota `/filme/` e listagem dos 50 episódios mais recentes. É evidência histórica diferente, não explicação demonstrada dos dez casos de 20/11.
6. **Identidade do pacote.** Na data do diagnóstico, o build minificado de `providers/animesdigital.js`, `gdrive/providers/animesdigital.js` e `prism/providers/animesdigital.js` era byte a byte igual aos arquivos versionados. A rodada usou o código publicado atual, não um pacote antigo.
7. **Reprodução da rodada.** A execução direta do pacote `prism/all/all/all` com a mesma semente e os mesmos dez títulos, em 20/11/2026, mostrou que quatro casos chegaram à página `/video/a/<id>` e encontraram o iframe atual do Anivideo: `movie` 372058 (Your Name) e `tv` 95479 (Jujutsu Kaisen), 85937 (Demon Slayer) e 65930 (My Hero Academia). Nesses quatro, o código antigo não coletava nenhuma opção, porque o iframe agora é `api.anivideo.net/cdn/<token>` e não tem o parâmetro `d`; `extractStreams` devolvia lista vazia sem aviso, como ausência reconhecida.
8. **Player atual.** A página `/cdn/<token>` responde HTTP 403 `NOT_IFRAME` quando aberta sem `Sec-Fetch-Dest: iframe` e HTTP 200 quando aberta com esse cabeçalho, o mesmo contexto em que o site a embute. A página 200 publica um setup do jwplayer cujo `sources[].file` é o manifesto HLS em `cdn-sv01.maximaimg.online`. O manifesto respondeu HTTP 403 sem contexto e HTTP 200 `application/vnd.apple.mpegurl` com `Referer` da fonte ou `User-Agent`; a URL de mídia e o token não entram em fixture, log ou documentação.
9. **Resultado após a correção.** A mesma execução direta passou a resolver 1/5 filmes (Your Name) e 3/5 séries (Jujutsu Kaisen, Demon Slayer e My Hero Academia). É a mesma cobertura da rodada de 14/11; não comprova disponibilidade geral nem reprodução no aparelho.
10. **Vazios restantes.** Os seis casos restantes não chegam ao player novo: Mononoke, Akira e Chihiro só aparecem em fichas `/filme/` ou não têm cartões `/anime/a/`; Mugen Train, pedido como filme de 2020, só tem uma página de arco com sete episódios e ano 2021; One Piece e Bleach listam os 50 episódios mais recentes e não têm S01E01. São limitações de catálogo e de contrato já registradas, não regressão do player.
11. **Rodada registrada.** Depois da correção, `npm run test:online -- --provider animesdigital --seed 20261120 --record` gerou a rodada `2026-11-20T15-20-38-402Z-animesdigital-20261120-3277`, pacote 1.0.0, perfil `anime`, semente `20261120`, catálogos `movie@2026-11-12.1` e `tv@2026-11-12.1`, manifest `prism/all/all/all`. Resultado: movie 1/5 e tv 3/5, sem falhas e sem casos inconclusivos, status `Estável` pelos critérios de ao menos uma resolução por tipo; a proporção é apenas indicativa. Os seis `Sem resultado` são os casos de catálogo do item 10. O relatório transitório não contém streams, URLs nem respostas brutas.

## Goals / Non-Goals

**Goals:**

1. Reconhecer o iframe atual `/cdn/<token>` e extrair o manifesto HLS do setup do jwplayer, preservando o iframe legado.
2. Manter cada iframe como opção independente e o contrato de ausência, falha isolada e erro agregado.
3. Cobrir a correção com fixtures sanitizadas e testes offline; revalidar o pacote final online e registrar o resultado sem dados sensíveis.

**Non-Goals:**

1. Declarar corrigidos os seis vazios de catálogo ou extrapolar disponibilidade geral da fonte.
2. Ampliar o contrato para fichas `/filme/`, mapear arco para filme, inferir episódios por posição ou buscar páginas antigas sem evidência.
3. Provar reprodução no aparelho, qualidade ou disponibilidade de mídia; a rodada online valida o contrato dos streams.
4. Contornar autenticação, conta, chave ou serviço de bypass; a página do player é pública e o cabeçalho apenas reproduz o contexto do iframe do próprio site.

## Decisions

### D1. Duas formas de iframe Anivideo

O provedor passa a aceitar `iframe` de `api.anivideo.net/videohls.php?d=<url>` e de `api.anivideo.net/cdn/<token>`. A primeira mantém a leitura do parâmetro `d`; a segunda abre a página do player com `Sec-Fetch-Dest: iframe` e `Referer` da fonte e lê o campo `file` das `sources`. Cada iframe continua sendo uma opção independente.

Alternativas consideradas:

1. **Tratar `/cdn/<token>` como ausência.** Descartada: mantém os quatro títulos encontrados em lista vazia, apesar de o player publicar manifesto.
2. **Montar a URL do manifesto pelo slug e pelo episódio.** Descartada: o caminho do CDN e o nome do arquivo não são deriváveis com segurança e mudariam sem aviso.
3. **Executar um navegador headless.** Descartada: o runtime do app não oferece navegador e o contrato não permite dependência externa.

### D2. Manifesto HLS e formato das fontes

A rota `/cdn/` é aceita somente quando o player publica uma ou mais fontes com URL `http(s)` cujo caminho termina em `.m3u8`. Fonte que não seja HLS é ignorada; se nenhuma sobrar, a opção falha com aviso e o erro agregado sobe quando todas falharem. O provedor não baixa a playlist nem sonde a mídia.

Alternativas consideradas:

1. **Aceitar qualquer `file` do player.** Descartada: o setup declara `type: "video/mp4"` mesmo quando o arquivo é `.m3u8`, e uma URL arbitrária poderia ser imagem ou página.
2. **Aceitar MP4 na mesma opção.** Descartada: não foi observado na amostra e mudaria o tipo do stream sem prova.
3. **Baixar a playlist para confirmar `#EXTM3U`.** Descartada: adiciona requisição e latência por stream; a extensão e o `sources` do player são a evidência disponível.

### D3. Cabeçalhos do stream novo

O stream extraído da rota `/cdn/` leva `headers: { Referer: 'https://animesdigital.org/' }`, porque o manifesto respondeu 403 sem contexto e 200 com o `Referer` da fonte. O iframe legado continua sem `headers`, preservando o contrato anterior, porque o manifesto antigo respondia 200 sem eles.

Alternativas consideradas:

1. **Incluir `Referer` em todos os streams Anivideo.** Descartada: altera o caminho legado sem evidência de necessidade.
2. **Usar `playbackHeaders` com a URL do player como `Referer`.** Descartada: a raiz do site é o contexto comprovado e não expõe o token do player.
3. **Depender só do `User-Agent` do app.** Descartada: o cabeçalho do app não é controlado pelo provedor; o `Referer` é determinístico e foi validado.

### D4. Fora do escopo permanece fora

Fichas `/filme/`, páginas de arco sem marcador de temporada, séries longas sem o episódio antigo na lista e o filme Mugen Train publicado como arco continuam ausência ou limitação. Não há alteração de contrato para cobri-los nesta change.

Alternativas consideradas:

1. **Aceitar `/filme/`.** Descartada: a rota não publica link `/video/a/` na amostra e a spec atual não a cobre.
2. **Mapear a página de arco de Mugen Train para o filme.** Descartada: a página tem sete episódios e ano 2021; o pedido é um filme de 2020.
3. **Paginar a busca de episódios antigos.** Descartada: não foi observada paginação nem endpoint de lista completa; inferir posição violaria a spec.

## Cenários de regressão

1. Iframe legado com `d` válido continua resolvendo o manifesto sem cabeçalhos; `d` vazio ou fora de http(s) continua falha isolada.
2. Iframe `/cdn/` com `sources[].file` em `.m3u8` resolve um stream HLS com `Referer` da raiz do site.
3. Página `/cdn/` sem `sources`, sem fonte HLS ou fora de 2xx é falha isolada; o aviso e o erro agregado não expõem o token nem a URL do player.
4. Um iframe `/cdn/` inválido não descarta um iframe legado válido na mesma página.
5. Página sem iframe Anivideo continua ausência reconhecida, sem erro.
6. Busca vazia, ficha `/filme/`, temporada não declarada e episódio ausente continuam ausência; HTTP fora de 2xx e HTML inesperado continuam erro registrado na fronteira.
7. O pacote final é revalidado online; os seis vazios de catálogo são registrados como limitação, não como correção.

## Risks / Trade-offs

1. [Cabeçalho no QuickJS] → A rodada Node envia `Sec-Fetch-Dest: iframe` e recebe 200; o fetch do QuickJS pode tratar esse cabeçalho como proibido. Se ele for descartado, a opção `/cdn/` falha com aviso e o erro agregado sobe, sem regressão do iframe legado. O limite fica registrado.
2. [Token e URL efêmeros] → O token do iframe e a URL do CDN não entram em fixture, log, relatório ou documentação; só o host e a estrutura são registrados.
3. [Variabilidade da fonte] → A rota `/cdn/` e o setup do jwplayer podem mudar; a fixture é datada e a rodada online é a evidência de funcionamento.
4. [Amostra limitada] → Cinco títulos por tipo e S01E01 não cobrem catálogo, temporadas posteriores nem reprodução no app.
5. [Trabalho compartilhado] → O build final é compartilhado; a rodada deve ser feita após `npm run build:min` e registrada para o pacote efetivamente gerado.

## Migration Plan

1. Implementar a leitura das duas formas de iframe, os testes e as fixtures; executar `node build.js animesdigital`, `npm run lint` e `npm test`.
2. Gerar `npm run build:min` e executar `npm run test:online -- --provider animesdigital` no pacote final `prism/all/all/all`, registrando versão, identidade, perfil, semente, seleção, resultados e impedimentos sanitizados.
3. Atualizar `providers.md`, `docs/provider-investigation.md` e a spec apenas com o comportamento e a rodada comprovados. Rollback restaura o código e os pacotes anteriores; a evidência de uma rodada não valida pacote diferente.
