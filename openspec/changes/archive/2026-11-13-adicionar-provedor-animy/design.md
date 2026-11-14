# Design

## Context

Ver `proposal.md` — Why. A investigação online de 2026-11-13/14 (UTC) observou:

1. `GET https://animy.net/api/v1/animes?limit=24&offset=0&sort=popular&search=Kimetsu%20no%20Yaiba` → `200 application/json`, corpo `{ items, total }`; cada item traz `id`, `slug`, `t`, `nativeTitle`, `y`, `kind`, `audio`, `audios`, `eps`, `altTitles`, `links`.
2. `GET https://animy.net/api/v1/animes/84` → `200 application/json`; a ficha traz `kind: tv`, `audio: dublado`, `episodes[]` com `id`, `season`, `number`, `numberLabel`, `title`, `thumb`.
3. `GET https://animy.net/api/v1/animes/84/episodes/1/1` → `200 application/json`; a rota traz `streams[]` com `kind: mp4`, `url` em `feralstream.animy.net`, `audio: dublado`, `skip`.
4. A mídia respondeu `206`, `Content-Type: video/mp4`, 1024 bytes com `Range: bytes=0-1023` e assinatura `ftypisom`, com e sem `Origin`/`Referer`.
5. A rota de um episódio inexistente respondeu `404` com `{"error":"episode not found"}`.
6. A busca de um título ausente ("A Viagem de Chihiro") respondeu `200` com `{ items: [], total: 0 }`.

A fonte separa dublado e legendado em entradas diferentes do catálogo: a série Demon Slayer apareceu como `id 84` ("(Dublado)", 63 episódios) e `id 12` ("Legendado", 63 episódios). As temporadas 1 a 5 da entrada 84 têm 26, 7, 11, 11 e 8 episódios, iguais às temporadas do TMDB 85937. O campo `y` não é o ano de estreia em todos os casos (Akira 1988 aparece com `y: 2024`; Demon Slayer 2019 com `y: 2024`), então não serve como filtro eliminatório.

## Goals / Non-Goals

**Goals:**

1. Cobrir filme e série com uma busca REST curta e identidade por título, tipo e, quando necessário, ano como desempate.
2. Entregar as variantes dublada e legendada quando ambas existirem, sem duplicar URL/idioma.
3. Manter o contrato do app: `buildStream`, `format`, `type` MP4, `provider`, idioma do enum e ausência reconhecida.
4. Reutilizar os blocos existentes; nenhum bloco novo.

**Non-Goals:**

1. Sondar mídia, impor timeout, cachear respostas ou adicionar settings de áudio/qualidade.
2. Consultar AniList ou Kitsu: os títulos romaji e alternativos do TMDB foram suficientes para "Kimi no na wa" e "Kimetsu no Yaiba" na amostra.
3. Mapear numeração absoluta ou tabelas fixas de temporada: a fonte usa o mesmo par `season`/`number` do TMDB na amostra; quando divergir, o episódio é ausência, não um palpite.
4. Baixar ou transcrever o MP4 para descobrir resolução.

## Decisions

### 1. Busca pelos títulos do TMDB, com candidatos enriquecidos pelo próprio item

`getMediaInfo` fornece `title`, `originalTitle`, `alternativeTitles` e `romajiTitles` (com temporada). A busca usa, no máximo, oito termos não vazios e não repetidos: título PT-BR, título original e alternativos; para série, os romaji com `season` igual à temporada pedida vêm antes dos romaji sem temporada. Cada termo é uma chamada `GET /api/v1/animes` com `limit=24`, `offset=0`, `sort=popular` e `search`.

A identidade não compara apenas `t`: o item publica `nativeTitle` e `altTitles[]`. O provedor normaliza `t`, `nativeTitle` e cada `altTitles[].title` e aceita o candidato quando a similaridade com o termo for pelo menos 0,82 ou houver igualdade normalizada. `kind` precisa ser `movie` para filme e `tv` para série. O ano (`y`) entra só como desempate: +0,05 na pontuação quando coincide com o ano do TMDB, sem penalizar divergência.

**Alternativas descartadas:** `findBestMatch` puro (rejeitado porque o ano do catálogo é unreliable e porque o título canônico pode ser romaji); busca apenas pelo título PT-BR (não encontra "Kimi no na wa" a partir de "Your Name.").

### 2. Cada entrada do catálogo é uma variante de áudio

A fonte publica uma entrada por áudio, com o mesmo conteúdo e títulos diferentes. O provedor agrupa os candidatos confirmados por identidade (título normalizado + `kind`) e resolve até quatro entradas: as duas primeiras com `audio` distinto e as demais como reserva. Cada variante é resolvida isoladamente; a falha de uma gera `console.warn('[Animy] Opção <título> descartada: <causa>')` e não impede as outras. Se nenhuma variante produzir stream e alguma tiver falhado, o erro agregado sobe com as causas.

A deduplicação final usa `url` + `language`; a mesma URL publicada em duas entradas não vira dois cards.

**Alternativa descartada:** escolher só a primeira entrada. Isso perderia o legendado quando a busca devolve primeiro o dublado (Demon Slayer) e vice-versa.

### 3. Episódio pelo par `season`/`number`, sem numeração absoluta

Para série, o provedor baixa a ficha da variante e procura `episodes[]` com `season === season` e `number === episode`. Para filme, usa a primeira entrada de `episodes` (a fonte publica `season: 1`, `number: 1`). O par ausente é ausência da variante; não há tentativa de número absoluto, temporada 0 ou tabela de segmentos.

**Alternativa descartada:** a receita original de numeração absoluta e tabelas de Re:Zero/Bleach/Mushoku/Jujutsu. Não foi observada divergência na amostra e o custo de manter tabelas fixas não se justifica; quando a fonte agrupar temporadas, o par não publicado vira ausência explícita.

### 4. MP4 direto, sem sonda e sem cabeçalhos

A rota de reprodução publica `kind: mp4` e uma URL absoluta. O provedor valida `http:`/`https:` e monta o stream com `type: kind`, `provider: 'Animy'` e `format` (`FORMATTER.AUTO`, `addon: 'Animy'`, título, ano, temporada, episódio e `filename` quando houver). A qualidade não é declarada; `buildStream` a descobre nos textos já obtidos e, sem correspondência, usa `Desconhecida`. O MP4 respondeu sem `Origin`/`Referer`, então `headers` é omitido. Não há `Range` de sondagem.

**Alternativa descartada:** sonda `Range` para validar a assinatura `ftyp` e descobrir altura. A regra do repositório proíbe requisição extra só para qualidade, e a URL publicada já é o contrato da fonte.

### 5. Erros e ausência

1. Busca vazia (`items: []` ou nenhum candidato compatível) → `[]`.
2. `404` da rota de reprodução com corpo `{"error":"episode not found"}` → ausência da variante. A rota de reprodução usa `fetch` direto, não `fetchJson`, para ler o corpo do `404` antes de decidir.
3. `404` da ficha ou da busca sem o corpo de ausência, `5xx`, JSON inválido, `items`/`episodes`/`streams` fora do esquema → erro estrutural, lançado até `getStreams`.
4. `getStreams` é o único ponto de captura: registra `[Animy]` e devolve `[]`.

### 6. Blocos e arquivos

1. `src/animy/api.js`: `searchAnime`, `fetchAnime`, `fetchEpisode` com validação de esquema e mensagens claras.
2. `src/animy/extractor.js`: termos de busca, identidade, variantes, seleção de episódio e montagem dos streams.
3. `src/animy/index.js`: validação de entrada, `sortByQuality` e captura única.
4. Blocos: `http`, `tmdb-info`, `slugify` (normalização), `language-discovery`, `stream-build`, `custom-formatter`, `quality-discovery`. Não há bloco novo; a identidade usa `titleSimilarity` de `title-match` ou uma comparação local sobre os títulos já normalizados.

## Risks / Trade-offs

1. **Ano do catálogo não confiável** → não usar como filtro; só desempate. O risco residual é escolher a entrada errada entre temporadas com títulos idênticos; a seleção de episódio por `season`/`number` reduz o impacto.
2. **Busca limitada a 24 itens** → o provedor não pagina a busca; títulos com muitos resultados podem ficar fora. A amostra teve `total` 0–4, mas a limitação é real e a rodada online mede a cobertura.
3. **Qualidade sempre "Desconhecida"** → aceito pelo contrato; a fonte não declara resolução e não haverá sonda. O app ainda reproduz o MP4.
4. **Catálogo incompleto** (Chihiro não está no Animy) → ausência reconhecida; a rodada online mede a cobertura real.
5. **API não versionada e sem documentação** → validação de esquema em cada resposta; mudança de contrato sobe como erro estrutural, não como ausência.
6. **Retenção da CDN** → a URL publicada pode responder 404 depois; o provedor não sonda nem promete disponibilidade. A evidência online é a única prova de funcionamento.
7. **Duplicação de variantes** → deduplicação por URL + idioma; se a fonte publicar a mesma URL em entradas diferentes, sai um card só.

## Migration Plan

1. Adicionar `src/animy/`, a entrada no `manifest.json` e os testes; rodar `node build.js animy`, `npm run lint` e `npm test`.
2. Publicar as saídas geradas no mesmo commit do código e do manifest.
3. Rodar `npm run test:online -- --provider animy` e registrar a rodada em `providers.md`.
4. Rollback: remover a entrada do manifest, os arquivos de `src/animy/` e as saídas geradas; nenhum dado persistido ou migração.

## Validation

1. **Confirmado online:** busca, ficha, rota de episódio e MP4 com `206 video/mp4` e `ftypisom` para Demon Slayer S01E01 (dublado e legendado), Jujutsu Kaisen S01E01, Attack on Titan S01E01, Akira e Kimi no na wa; ausência de Chihiro; `404 episode not found` para um par não publicado.
2. **Hipótese:** cobertura de títulos fora da amostra, reprodução no app e retenção da CDN no longo prazo. A rodada online e o uso real decidem.
3. **Testes offline obrigatórios:** filme, episódio dublado, episódio legendado, duas variantes no mesmo pedido, episódio ausente, busca vazia, `404` de ausência, `5xx`, JSON inválido e estrutura sem `items`/`episodes`/`streams`.
