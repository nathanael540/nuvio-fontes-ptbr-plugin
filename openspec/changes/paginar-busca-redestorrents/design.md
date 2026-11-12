# Design

## Context

O Baixa Rápido já agrega onze catálogos da mesma rede. O Redes Torrents é o catálogo `redestorrents`, da família `download-row`, variante `custom-card`, em `src/baixarapido/download-row.js`. A busca usa `GET /index.php?busca=<termo>` e a ficha fica em uma página do próprio domínio; os magnets são lidos de `.download-row`, com hash base32 ou hexadecimal, e resolvidos pelo bloco `torrent-release`.

O leitor `locateCustomCardPages` consulta apenas a primeira página de busca de cada termo. A busca do site, porém, é por palavras, ordenada por data e paginada em 20 cartões. Em 12/11/2026, a busca por "the last of us" tinha `The Last of Us - 2ª Temporada` na página 6 e `The Last of Us - 1ª Temporada` na página 11; a página 25 tinha 5 cartões e as páginas seguintes repetiam esses 5 cartões. O catálogo atual não alcança nenhuma das duas temporadas.

O Redes Torrents não vira provedor separado. A decisão e a alternativa descartada estão em `proposal.md`; os requisitos estão em `specs/redestorrents-catalog/spec.md`.

## Goals / Non-Goals

**Goals:**

1. Encontrar fichas que a busca do Redes Torrents coloca depois da primeira página, sem mudar a identidade do catálogo dentro do Baixa Rápido.
2. Manter o custo de rede limitado e previsível, com parada antecipada e um teto de páginas.
3. Reaproveitar a triagem, a confirmação por IMDb/título/ano e a resolução de torrents já existentes.
4. Cobrir o comportamento com testes offline, sem internet, e com uma rodada online do pacote final.

**Non-Goals:**

1. Criar um provedor `redestorrents` ou duplicar o acervo em dois provedores.
2. Ler todas as páginas da busca, usar sitemaps ou enumerar slugs de fichas.
3. Alterar a busca ou o leitor das outras variantes de `download-row` e dos demais catálogos do Baixa Rápido.
4. Criar bloco novo, dependência nova, serviço externo novo ou chave nova.
5. Garantir cobertura de resultados além do teto de 12 páginas.

## Decisions

### 1. Paginar somente a variante `custom-card`

A mudança fica em `locateCustomCardPages`, que atende apenas o Redes Torrents. As variantes `media-card-link`, `bruto-card` e `media-list-item` continuam com o comportamento atual, e `locateSlugPages` não é tocado. Isso evita mudança de comportamento nos outros dez catálogos e mantém o escopo da proposta.

Alternativa descartada: paginar todas as buscas de `download-row`. Aumentaria o custo e o risco nos catálogos que não têm o mesmo problema observado.

### 2. Paginação sequencial com teto de 12 páginas

A página 1 continua sendo lida primeiro. Se ela tiver 20 cartões e nenhuma ficha confirmada, o leitor pede `pagina=2`, depois `pagina=3`, e assim por diante, até 12 páginas. O endereço é o mesmo da busca atual, com o parâmetro acrescentado:

```text
/index.php?busca=<termo>&pagina=<n>
```

O site aceita esse formato e devolve a mesma página do caminho canônico `/pesquisa/<slug>/pagina/<n>/`; usar o parâmetro evita depender do slug com underscore que o site gera para o termo.

O teto de 12 cobre a evidência observada (página 11) e limita o custo a 12 requisições de busca por termo principal. Alternativas descartadas:

1. Ler as 25 páginas observadas: custo alto e sem garantia de cobrir todo o acervo.
2. Usar os nove sitemaps (`post-sitemap1.xml` a `post-sitemap9.xml`, cerca de 45 mil URLs): download grande e desproporcional para uma única busca.
3. Montar slugs de ficha por tentativa: o site tem várias terminações de slug e devolve página de "não encontrada" com HTTP 200, o que torna a validação frágil.
4. Filtrar a busca por tipo ou ordenação: o site ignora parâmetros como `tipo`, `categoria` e `ordenar`; o formulário público só envia `busca`.

### 3. Ordem dos termos de busca

O primeiro termo de `searchTerms(media)` é o principal e recebe a paginação profunda, até 12 páginas. Os termos seguintes (título original e alternativos) continuam com uma única página. Assim a busca mais provável é aprofundada sem multiplicar o teto por todos os títulos do TMDB.

Se a página 1 de um termo vier vazia ou com menos de 20 cartões, a paginação daquele termo termina e o próximo termo é tentado. O conjunto `seen` de fichas já visitadas continua valendo entre páginas e termos, para não repetir a consulta de detalhe.

### 4. Critérios de parada

A paginação para quando ocorrer o primeiro destes eventos:

1. Uma ficha confirmada por `selectConfirmedPages` é encontrada.
2. A página tem menos de 20 cartões.
3. O parser reconhece estado vazio explícito.
4. A assinatura da página (lista de `href` dos cartões) repete a assinatura de uma página já lida.
5. O limite de 12 páginas é atingido.

O site repete a última página quando o número da página passa do fim; a assinatura evita laço. Uma página com HTML não reconhecido continua lançando erro `retryable`, como hoje: HTTP 200 com layout inesperado não é ausência.

### 5. Triagem e confirmação inalteradas

Em cada página, os cartões passam por `prefilterCard` antes de qualquer consulta de ficha. A confirmação continua em `selectConfirmedPages` e `matchTitleAndYear`, com IMDb, título e ano; a paginação não relaxa nenhum critério. Uma ficha em página posterior só entra se confirmar a mesma obra do TMDB.

A leitura da ficha e a extração dos magnets continuam em `readContent`/`readRows`; a resolução continua em `classifyMagnetOption` e `resolveTorrentOptions`. Nenhum bloco muda.

### 6. Log e erros

O log do catálogo passa a registrar a página lida e o resumo da busca:

```text
[Baixa Rápido/redestorrents] Busca "<termo>" página <n> em <host>: <m> cartão(ões)
[Baixa Rápido/redestorrents] Busca "<termo>": <n> página(s) lidas, parada por <motivo>
```

Motivos: `ficha confirmada`, `última página`, `estado vazio`, `página repetida` e `limite de 12 páginas`. O log não inclui magnets, URLs assinadas ou dados pessoais.

Falhas de rede, HTTP fora de 2xx e layout não reconhecido continuam subindo. Se todas as páginas e termos terminarem sem confirmação, o catálogo devolve lista vazia, sem erro fatal, como já ocorre na ausência reconhecida.

## Risks / Trade-offs

1. **Latência**: até 12 requisições de busca no pior caso. Mitigação: parada antecipada, teto fixo e paginação profunda só no primeiro termo; o provedor não cria timeout próprio, conforme a arquitetura.
2. **Cobertura parcial**: títulos depois da página 12 continuam fora. Mitigação: o limite e a evidência ficam registrados em `docs/provider-investigation.md`; uma nova mudança pode elevar o teto se houver evidência de necessidade.
3. **Mudança de layout**: se o site deixar de reconhecer a busca, o parser lança erro em vez de tratar como ausência. Mitigação: o teste offline cobre página válida, vazia e repetida; a rodada online confirma o pacote final.
4. **Lista de resultados instável entre requisições**: a assinatura pode variar e a paginação pode perder ou repetir um cartão. Mitigação: `seen` evita consultar a mesma ficha duas vezes; a confirmação por IMDb/título/ano continua sendo a barreira final.
5. **Página cheia no fim**: se a última página tiver exatamente 20 cartões, a próxima repete a mesma lista; a assinatura detecta e para.
6. **Outros catálogos**: a mudança é restrita à variante `custom-card`; as suítes dos demais catálogos devem continuar passando sem alteração.

## Migration Plan

1. Alterar `src/baixarapido/download-row.js` para paginar a variante `custom-card` e registrar página/motivo.
2. Se necessário, expor em `src/baixarapido/gratistorrent.js` apenas o necessário para identificar a página lida; a assinatura pode ser montada no próprio `download-row.js` a partir dos `href` já devolvidos por `parseSearch`.
3. Adicionar fixtures e casos em `test/baixarapido.test.js` para página 1, página posterior, última página, página repetida, limite e falha de rede.
4. Subir `baixarapido` para `1.5.0` em `manifest.json`, rodar `node build.js baixarapido` e conferir os três formatos.
5. Rodar `npm run lint` e `npm test`; depois, com o pacote final, `npm run test:online -- --provider baixarapido` e atualizar `providers.md` com a rodada.
6. Registrar o método e os limites em `docs/provider-investigation.md`.
7. Rollback: reverter o commit e reconstruir o pacote; não há migração de dados nem estado persistente.
