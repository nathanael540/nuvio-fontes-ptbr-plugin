# Design

## Context

Ver `proposal.md` — Why. A investigação online de 2026-11-14 (UTC) observou:

1. `https://1.animezey23112022.workers.dev/` e `https://1.animezeydl.workers.dev/` responderam `200 text/html`.
2. `POST /1:search` com `{"q":"A Viagem de Chihiro","page_token":null,"page_index":0}` respondeu `200 text/plain;charset=UTF-8` com `{ nextPageToken, curPageIndex, data: { files[] } }`. Cada arquivo traz `mimeType`, `size` (bytes em texto), `name`, `modifiedTime`, `id`, `driveId` e `link` relativo `/download.aspx?file=...&expiry=...&mac=...`.
3. A busca de "A Viagem de Chihiro" devolveu 6 arquivos, entre eles `A Viagem de Chihiro (2001) [1080p][Dual Áudio].mkv` (2.441.830.780 bytes).
4. `GET https://animezey16082023.animezey16082023.workers.dev/download.aspx?...` com `Range: bytes=0-1023` respondeu `206 video/x-matroska`, 1024 bytes, começo `1a45dfa3` (EBML), com e sem `Referer`.
5. `GET <worker><link>?a=view` respondeu `401`; a página de visualização não é usável.
6. A busca é fuzzy: "Demon Slayer S01E01" devolveu apenas `S05E01`; "Kimetsu no Yaiba S02E01" devolveu 0 arquivos; "Naruto S01E01" devolveu 100 episódios de Boruto. O filtro por nome é obrigatório.
7. A busca "Jujutsu Kaisen S02E01" devolveu o arquivo `[Anitsu] Jujutsu Kaisen - S02E01 [BD 1080p x265 FLAC] [DUAL][7AC0D93D].mkv`, mas o download desse arquivo excedeu 120 s no teste e ficou como hipótese.
8. O worker secundário `1.animezeydl.workers.dev` respondeu `200` na busca, mas o link dele no host dedicado respondeu `500 text/plain` com `Range: bytes=0-1023`; o link do primário respondeu `206 video/x-matroska`. A rotação de workers não é usada para streams.

## Goals / Non-Goals

**Goals:**

1. Buscar no índice com poucas consultas e validar título, ano e coordenadas antes de montar o stream.
2. Entregar MKV/MP4 direto pelo host dedicado, com tamanho, qualidade e idioma derivados do nome e do campo `size`.
3. Isolar falha por arquivo e por consulta, sem timeout próprio e sem sonda.
4. Reutilizar os blocos existentes; nenhum bloco novo.

**Non-Goals:**

1. Usar a página `?a=view` ou qualquer player intermediário; ela responde `401`.
2. Paginar o índice até o fim ou varrer dezenas de consultas; o custo e a cota dos workers não justificam.
3. Garantir áudio PT-BR quando o nome do arquivo não comprova; a classificação segue o enum fechado.
4. Sondar o arquivo, baixar o vídeo inteiro ou medir reprodução P2P.

## Decisions

### 1. Consultas curtas por título e coordenadas

`getMediaInfo` fornece `title`, `originalTitle`, `alternativeTitles`, `year` e `seasons[]`. Para filme, o provedor consulta `"<título> <ano>"`, `"<título>"` e, se o título original for latino, `"<originalTitle> <ano>"`. Para série, consulta `"<título> SxxExx"`, `"<título> xxExx"`, `"<título> - <episódio>"` e, quando a soma das temporadas anteriores for diferente do episódio relativo, `"<título> <absoluto>"`. No máximo seis consultas por pedido, sem repetição.

Cada consulta é uma chamada `POST /1:search` no worker ativo. O corpo é JSON e os cabeçalhos são `Content-Type: application/json`, `Accept: */*` e `Referer: <worker>/1:search`. Não há paginação: se a primeira página não contiver um arquivo validado, a consulta é considerada esgotada. O limite de 100 arquivos por resposta é o teto observado.

**Alternativa descartada:** percorrer `nextPageToken` até o fim. A busca fuzzy devolve listas enormes (100 arquivos para "Naruto") e o custo cresce sem garantir o episódio; a validação estrita já descarta o que não serve.

### 2. Validação estrita do nome do arquivo

O nome é normalizado com `slugify`: remove grupos iniciais `[...]`, troca pontos/underscores por espaço, remove tags de release (`BD`, `WEB-DL`, `x265`, `FLAC`, `DUAL`, `1080p`, `AAC`, etc.) e preserva o título e as coordenadas. A validação tem quatro etapas:

1. **Extensão e MIME:** aceitar `video/x-matroska`, `video/mp4`, `video/x-msvideo`, `video/webm` ou extensões `.mkv`, `.mp4`, `.avi`, `.mov`, `.webm`; descartar `.srt`, imagens e desconhecidos.
2. **Coordenadas:** extrair `S(\d{1,2})E(\d{1,3})`, `(\d{1,2})x(\d{1,3})`, `Season (\d+) Episode (\d+)` ou ` - (\d{1,3})(?:\D|$)`; exigir temporada e episódio exatos. Arquivo sem coordenada em pedido de série é descartado. O número absoluto só é aceito como alternativa quando o nome não tem `SxxExx` e o título tem similaridade alta.
3. **Título:** o segmento antes da coordenada é comparado com os títulos do TMDB por `titleSimilarity`; exigir pelo menos 0,80 ou igualdade normalizada. Isso rejeita "Boruto: Naruto Next Generations" para "Naruto" e "Demon Slayer S05E01" para S01E01.
4. **Ano:** para filme, se o nome trouxer um ano de quatro dígitos, exigir diferença de no máximo um ano; para série, o ano é opcional e só desempata.

**Alternativa descartada:** confiar na ordem ou no primeiro resultado da busca. A busca devolve S05E01 para uma consulta S01E01 e Boruto para Naruto; a ordem não é identidade.

### 3. Cada arquivo é uma opção independente

O provedor reúne os arquivos validados de todas as consultas, deduplica por `id` (ou pelo caminho do `link`) e monta até cinco streams para filme e dois para episódio, preferindo maior tamanho e qualidade. Cada arquivo é montado em `try/catch`: falha de `link` ou de `buildStream` gera `console.warn('[AnimeZeY] Opção <nome> descartada: <causa>')` e não descarta os demais. Se nenhum stream sair e algum arquivo tiver falhado, o erro agregado sobe.

**Alternativa descartada:** parar no primeiro arquivo válido. O índice pode ter várias releases (DUAL, dublado, legenda embutida) e o usuário escolhe no app.

### 4. URL no host dedicado, sem view e sem sonda

O campo `link` é relativo e contém a assinatura (`file`, `expiry`, `mac`). O provedor monta `https://animezey16082023.animezey16082023.workers.dev` + `link` exatamente como recebido, sem decodificar ou recodificar a query. Se `link` já for absoluto, usa como está. A página `?a=view` não é chamada (401). Não há `Range` de sondagem: o `206` observado comprova o contrato, não a reprodução.

**Alternativa descartada:** usar o worker da busca como host do arquivo. O host dedicado é o que respondeu `206 video/x-matroska`; o worker de busca é índice, não CDN.

### 5. Qualidade, idioma e tamanho a partir do que já foi obtido

`buildStream` recebe `format.filename` com o nome do arquivo; a qualidade é descoberta por `quality-discovery` (1080p, 720p, 4K etc.) sem requisição. O idioma é passado em `languageHints: [file.name]`, que reconhece `Dublado`, `Legendado` e `Dual Áudio`; sem hint, sai `Idioma Desconhecido`. O tamanho vem de `size` em bytes, formatado localmente em MB/GB com duas casas. Nenhum campo é inventado.

**Alternativa descartada:** chamar a API do Google Drive ou abrir o MKV para ler faixas. Exigiria conta/chave ou download, fora do contrato.

### 6. Worker primário, sem rotação para um link não reproduzível

A busca usa `1.animezey23112022.workers.dev`. O secundário `1.animezeydl.workers.dev` respondeu `200` na busca, mas o link dele no host dedicado respondeu `500 text/plain` no teste, enquanto o link do primário respondeu `206 video/x-matroska`; por isso o secundário não é usado para streams. `429`, `5xx` e falha de transporte do primário são falhas estruturais; `200` com `data.files: []` é ausência. O `search.js` usa `fetch` direto, não `fetchJson`, para ler o status. `getStreams` é o único ponto de captura e registra `[AnimeZeY]`.

**Alternativa descartada:** rotacionar para o secundário em `429`/`5xx` como na proposta original. O link do secundário não é aceito pelo host dedicado; a rotação devolveria cards quebrados.

### 7. Blocos e arquivos

1. `src/animezey/search.js`: `searchFiles(query)` com POST, rotação e validação do envelope.
2. `src/animezey/extractor.js`: consultas, validação do nome, seleção, `formatSize` e montagem com `buildStream`.
3. `src/animezey/index.js`: validação de entrada, `sortByQuality` e captura única.
4. Blocos: `http`, `tmdb-info`, `slugify`, `title-match` (`titleSimilarity`), `stream-build`, `custom-formatter`, `language-discovery`, `quality-discovery`. Nenhum bloco novo.

## Risks / Trade-offs

1. **Busca fuzzy** → validação estrita; o custo é ausência em títulos cujo arquivo não está indexado com o título/coordenada esperados ("Kimetsu no Yaiba S02E01" devolveu 0). A rodada online mede a cobertura.
2. **Índice não é catálogo** → o provedor não promete acervo; devolve o que o índice publica e passa no filtro.
3. **URL assinada e efêmera** → resolver a cada pedido, sem cache, fixture, log ou documentação; a fixture usa apenas o esquema sanitizado, nunca a URL real.
4. **Host dedicado lento** → um download de Jujutsu S02E01 excedeu 120 s no teste; o provedor não impõe timeout e o app controla a espera. A rodada online decide.
5. **`?a=view` 401** → o caminho de visualização não é usado; se o host dedicado mudar, o provedor falha e a evidência online é a única prova.
6. **Worker secundário sem download válido** → só o primário é usado; um `429`/`5xx` do primário não tem fallback e sobe como falha. Uma futura evidência de download pelo secundário pode reabrir a rotação.
7. **Qualidade "2076p" e rótulos fora do padrão** → `quality-discovery` normaliza o que reconhece; o resto fica `Desconhecida`, sem inventar 4K.
8. **Idioma não comprovado** → nomes sem `Dublado`/`Legendado`/`Dual` saem como `Idioma Desconhecido`; não promover PT-BR por o índice ter filmes dublados.

## Migration Plan

1. Adicionar `src/animezey/`, a entrada no `manifest.json` e os testes; rodar `node build.js animezey`, `npm run lint` e `npm test`.
2. Publicar as saídas geradas no mesmo commit do código e do manifest.
3. Rodar `npm run test:online -- --provider animezey` e registrar a rodada em `providers.md`.
4. Rollback: remover a entrada do manifest, os arquivos de `src/animezey/` e as saídas geradas; nenhum dado persistido.

## Validation

1. **Confirmado online:** worker primário `200`; busca `200` com `data.files[]`; arquivo de Chihiro 1080p Dual Áudio; download `206 video/x-matroska` com assinatura EBML, sem `Referer`; busca vazia `data.files: []`; worker secundário `200` na busca, mas link no host dedicado `500`.
2. **Hipótese:** download do arquivo de Jujutsu S02E01 (excedeu 120 s no teste), cobertura de episódios fora da amostra e reprodução no app. A rodada online e o uso real decidem.
3. **Testes offline obrigatórios:** filme exato, filme com ano divergente, série exata, S05E01 rejeitado para S01E01, Boruto rejeitado para Naruto, arquivo sem coordenada, lista vazia, `429`/`5xx` como falha sem usar o secundário, JSON inválido, arquivo sem `link`, idioma desconhecido e qualidade desconhecida.
