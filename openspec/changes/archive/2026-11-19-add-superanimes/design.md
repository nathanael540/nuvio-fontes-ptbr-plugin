# Design

## Context

1. A fonte é o Super Animes (AnimesTVS), catálogo brasileiro de animes. `https://animestvs.org` e `https://api.animestvs.org` respondem JSON, não HTML: na primeira sondagem de 2026-11-19, a raiz devolveu `{"status":"ok","service":"AnimesTVS API"}` e o servidor se identifica como Express.
2. A investigação foi feita somente nas duas URLs públicas informadas, com `fetch`/Node e sem código de terceiros. Nenhum scraper, repositório externo, token, cookie ou URL assinada foi consultado ou copiado.
3. Rotas públicas observadas em 2026-11-19:
   1. `GET /animes` — catálogo completo; 8.617 entradas na primeira leitura e 8.617/8.606 em leituras seguintes (o acervo cresce durante a investigação).
   2. `GET /animes?titulo=<título>` — correspondência exata pelo título, sem substring (`kimetsu` devolveu zero; `kimetsu no yaiba` devolveu as duas variantes de áudio).
   3. `GET /animes-recentes` — 200 entradas; `GET /animes-dublados` — 1.280; `GET /animes-legendados` — 7.330.
   4. `GET /episodios-recentes` — 800 linhas recentes, sem filtro por consulta.
   5. `GET /episodios-dublados` — 21.810 linhas e 1.320 títulos; `GET /episodios-legendados` — 90.602 linhas e 7.279 títulos.
   6. `GET /generos` — 50 títulos recentes, não uma lista de gêneros.
4. O catálogo publica `id`, `titulo`, `imagem`, `sinopse`, `generos`, `audio`, `episodios`, `ano` e `tipo`. O áudio é `Dublado` ou `Legendado` (uma entrada apareceu com `dublado` minúsculo) e `tipo` repete o áudio em minúsculas. `episodios` vem como texto (`"12"`, `"1"`, `"0"`, `"Desconhecido"` ou `"Desconhecido (em exibição)"`).
5. As listas de episódios publicam `id`, `anime`, `episodio`, `link_video`, `tipo`, `created_at`, `visualizacoes` e `image`. `anime` repete o título do catálogo, inclusive o sufixo `(Dublado)`; `episodio` é `Episódio NNN` ou `Filme`. Foram observados poucos rótulos sem número (`Episódio`) e números soltos (`007`), tratados como linhas não selecionáveis.
6. Todos os `link_video` apontam para `https://cdn.animestvs.org/<dublados|legendados>/<diretório>/<id>.mp4`. O diretório identifica a origem/qualidade: `fullhd` e `like` entregaram 1920x1080, `hd3` entregou 1280x720, `hd2` entregou 960x720, `iphoneb` entregou 560x420 e `thunder3` misturou 1080p e 720p. A inspeção foi feita com `Range` mínimo e leitura do cabeçalho `tkhd` do MP4, sem baixar o arquivo.
7. O MP4 respondeu HTTP 206, `video/mp4`, com `Range` e sem `Referer`/`Origin`; o provedor não informa cabeçalhos de reprodução. As URLs são estáveis no CDN, mas continuam sendo resolvidas a cada pedido, sem cache.
8. O catálogo é exclusivo de anime e publica títulos em romaji, muitas vezes em entradas separadas por arco/temporada. Exemplos observados:
   1. Demon Slayer: `Kimetsu no Yaiba` (S1), `Kimetsu no Yaiba: Mugen Ressha-hen (TV)` (S2), `Kimetsu no Yaiba 2: Yuukaku-hen` (S3), `Kimetsu no Yaiba 3: Katanakaji no Sato-hen` (S4) e `Kimetsu no Yaiba: Hashira Geiko-hen` (S5).
   2. Attack on Titan: S3 tem 22 episódios no TMDB e a fonte publica 12 + 10 (`Season 3` e `Season 3 Part 2`); S4 tem 28 e a fonte publica 16 + 12 (`The Final Season` e `The Final Season Part 2`).
   3. Naruto: o TMDB tem 4 temporadas (52+52+54+62), mas a fonte publica uma entrada de 210 episódios legendada e 219 dublada; o episódio absoluto é a única numeração comum.
   4. Boku no Hero Academia: a fonte usa número final no título (`Boku no Hero Academia 2`), sem `Season`.
   5. Koori no Jouheki 2nd Season: o próprio título do TMDB contém `2nd Season`; o marcador é parte do nome da obra, não uma temporada da fonte.
9. Filmes são entradas de exatamente um episódio, com rótulo `Filme` na lista. Os títulos do TMDB em PT-BR não coincidem com o romaji: `A Viagem de Chihiro` → `Sen to Chihiro no Kamikakushi`, `Princesa Mononoke` → `Mononoke-hime`, `Your Name.` → `Kimi no Na wa.` e `Demon Slayer: Mugen Train - O Filme` → `Kimetsu no Yaiba Movie: Mugen Ressha-hen`.
10. Tamanhos de transferência medidos: catálogo 5,5 MB JSON (1,5 MB comprimido), lista dublada 6,4 MB (440 KB comprimido) e lista legendada 26,4 MB (1,7 MB comprimido). O Node lê e filtra as três listas em cerca de 1 a 4 segundos por pedido; o QuickJS tem mais memória e tempo, mas o contrato não oferece uma rota por título.
11. O runtime é QuickJS: `fetch`, `URL`, `URLSearchParams`, `AbortController`, `atob`/`btoa`, `module` e `TMDB_API_KEY`; `require` só para `cheerio-without-node-native` e `crypto-js`. Não há `axios`, APIs do Node, `setTimeout`, `setInterval`, `TextEncoder` ou `TextDecoder`. O provedor não impõe timeout e só `getStreams` captura a falha final.

## Goals / Non-Goals

**Goals:**

1. Resolver filmes e séries de anime pela API JSON pública, sem HTML e sem chave adicional.
2. Confirmar a obra pelos títulos e pelo ano do TMDB e selecionar a temporada pelo dado declarado, sem posição visual.
3. Cobrir temporadas em partes, séries publicadas em uma entrada e filmes com variantes dublada e legendada.
4. Derivar idioma e qualidade somente de campos e URLs já obtidos, sem sonda de mídia.
5. Distinguir ausência reconhecida de falha de rede, JSON ou estrutura, com testes offline determinísticos.

**Non-Goals:**

1. Implementar conta, login, favoritos, histórico ou downloads do site.
2. Abrir o player do site, baixar mídia, sondar resolução ou cachear URLs.
3. Contornar bloqueio, captcha, Cloudflare ou restrição de acesso.
4. Criar um bloco compartilhado com um único consumidor.
5. Mapear temporada por posição, pela contagem total da série ou por numeração absoluta quando a temporada tem entrada própria.
6. Tratar legendas externas: os arquivos `legendados` são hardsub e não publicam faixa `VTT`.

## Decisions

### D1. Consumir a API JSON em vez de raspar HTML

1. As duas URLs públicas respondem JSON; não existe HTML de catálogo, formulário de busca ou player intermediário. A única interface observada é a API Express.
2. Usar `fetchJson` do bloco `http` com `profile: 'api'`. Os cabeçalhos do perfil já trazem `User-Agent` de navegador e `Accept` JSON; a fonte respondeu sem `Origin`/`Referer` próprios.
3. Alternativas descartadas:
   1. Raspar HTML: não há HTML.
   2. Usar o Jina Reader: intermediário desnecessário para JSON direto.
   3. Consultar `robots.txt` para rotas: o arquivo só repete os sinais de conteúdo do Cloudflare e não lista a API.

### D2. Baixar o catálogo completo e filtrar localmente

1. `GET /animes` devolve todas as entradas em uma lista; a busca por `?titulo=` é exata, não por substring, e não ajuda a encontrar arcos cujo título difere do romaji do TMDB.
2. A seleção precisa comparar o mesmo título contra todas as variantes de áudio e temporada; uma única leitura do catálogo (5,5 MB) é mais simples e previsível do que dezenas de buscas exatas.
3. Alternativas descartadas:
   1. Buscar cada termo do TMDB com `?titulo=`: não encontra `Kimetsu no Yaiba: Yuukaku-hen` porque a fonte publica `Kimetsu no Yaiba 2: Yuukaku-hen`.
   2. Baixar `/animes-dublados` e `/animes-legendados` separadamente: são recortes do mesmo catálogo e dobrariam a leitura sem ganho de identidade.
   3. Usar `/animes-recentes` ou `/generos`: são recortes de vitrine, não o acervo.

### D3. Identidade de filme e série pelo título do TMDB e pelo ano

1. Remover o sufixo `(Dublado)`/`(Legendado)` (e a variação `- Dublado [PT-PT]`) antes de comparar; o mesmo filme existe nas duas variantes e o sufixo reduziria artificialmente a similaridade.
2. Para filme, considerar entradas com exatamente um episódio e confirmar pelo maior `titleSimilarity` contra título PT-BR, original, alternativos e romaji, com ano dentro de um. Escolher uma entrada por áudio; em empate, o ano exato vence.
3. Para série, exigir que o título comece por um título do TMDB ou tenha similaridade mínima de 0,85. Isso exclui derivados que apenas contêm o nome da obra (`Boruto: Naruto Next Generations`, `Vigilante: Boku no Hero Academia Illegals`).
4. Alternativas descartadas:
   1. Usar `findBestMatch` para tudo: devolve um único candidato e não separa as variantes de áudio.
   2. Aceitar o primeiro título parecido: confundiria filmes, especiais e arcos diferentes.
   3. Ignorar o ano: `Kimetsu no Yaiba Movie: Mugen Jou-hen` (2025) competiria com `Mugen Ressha-hen` (2020).

### D4. Temporada pelo marcador, pelo romaji específico e pelo arco

1. Para a temporada 1, preferir a entrada de base: marcador explícito 1, romaji específico da temporada 1 ou título que coincide com os títulos do TMDB e cujo ano fica a até um do ano da série. Se houver mais de uma base, vence a maior similaridade e depois a contagem mais próxima da temporada do TMDB.
2. Para temporadas acima de 1, a ordem de seleção é:
   1. marcador explícito igual à temporada (`Season N`, `Nth Season`, `Temporada N`, `Nª Temporada` ou número final);
   2. romaji do TMDB com o marcador da temporada (`Season N Romaji`);
   3. romaji de arco sem número (`The Final Season`, `Sennen Kessen-hen`), com ano dentro de um; para `Part N`, a tolerância sobe para dois anos.
3. Um marcador que já faz parte do título do TMDB (`Koori no Jouheki 2nd Season`) não é lido como temporada da fonte: o título coincidente é a entrada de base.
4. Alternativas descartadas:
   1. Usar a posição da temporada no array: a fonte agrupa arcos e partes sem garantia de ordem.
   2. Usar a contagem total da série para decidir a temporada: Bleach e One Piece têm temporadas do TMDB que não correspondem às entradas da fonte.
   3. Tratar todo `Nth Season` como temporada: quebraria obras cujo nome termina em `2nd Season`.

### D5. Partes e numeração absoluta

1. Ordenar os candidatos da temporada por `Part N`, depois por ano e por contagem decrescente. Percorrer a lista descontando os episódios de cada parte até localizar o episódio pedido.
2. Quando a temporada não é coberta por entradas próprias, calcular o episódio absoluto somando as temporadas regulares anteriores do TMDB e procurar a entrada de base que publica a série inteira e tenha contagem maior ou igual ao absoluto. Naruto e One Piece são os casos observados.
3. Alternativas descartadas:
   1. Usar `id` ou a posição do episódio na lista: a fonte publica os episódios em ordem decrescente e sem garantia de contiguidade.
   2. Devolver o pacote inteiro: o app pediu um episódio.
   3. Inventar índice quando a contagem não alcança o pedido: ausência é preferível a episódio errado.

### D6. Episódio pelo rótulo e ausência sem erro

1. Filtrar as linhas pelo título normalizado da entrada e ler `Episódio N` (com zeros à esquerda) ou `Filme` como 1. Números soltos são aceitos como fallback; rótulo sem número é ignorado.
2. Linha correspondente com `link_video` vazio, não URL ou fora de HTTP(S) é falha da opção; linha ausente é ausência.
3. Alternativas descartadas:
   1. Usar o índice da linha: a lista mistura títulos e ordens.
   2. Tratar `Episódio` sem número como erro fatal: é um dado sujo de uma linha, não uma mudança de contrato.

### D7. Qualidade pelo diretório do CDN

1. A fonte não publica campo de qualidade. O diretório do CDN é a única evidência local e foi conferido nos arquivos: `fullhd`/`like` 1080p, `hd3`/`hd2` 720p, `iphoneb` 420p, `thunder3` misto.
2. Mapear somente `fullhd` → `1080p`, `hd3`/`hd2` → `720p` e `iphoneb` → `420p`. `like` e `thunder3` são origem/servidor e ficam `Desconhecida`, assim como caminhos legados sem diretório.
3. Alternativas descartadas:
   1. Mapear `like` para 1080p: foi 1080p em três de quatro amostras, mas o nome não declara resolução.
   2. Sondar o MP4 para medir resolução: seria requisição extra e o contrato proíbe descoberta de qualidade por rede.
   3. Usar o nome do arquivo: os arquivos são ids numéricos.

### D8. Idioma pelo áudio da entrada

1. `Dublado`/`dublado` vira `LANGUAGE.DUBBED`; `Legendado`/`legendado` vira `LANGUAGE.SUBTITLED`. O catálogo é PT-BR, então as variantes `(Não PT-BR?)` não são usadas sem evidência de região.
2. Não deduzir idioma pelo título, pela sinopse ou pelo nome do arquivo; a entrada de áudio é o dado declarado.
3. Alternativas descartadas:
   1. Usar `tipo` como verdade absoluta: `audio` é o campo principal e `tipo` só é fallback.
   2. Promover `Legendado` a `Dublado` quando o áudio não existe: sem evidência.

### D9. Isolamento por áudio e fronteira de erro

1. Catálogo, TMDB e validação de entrada são fatais. Cada áudio é uma opção independente: a falha da lista de episódios é descartada com aviso e o outro áudio segue.
2. Se nenhum stream sair e alguma opção falhar, o erro agregado sobe com a causa de cada áudio. Se todos forem ausência, a lista é vazia sem aviso.
3. Somente `getStreams` captura a falha final, registra `[Super Animes] Falha em <tipo> <id>: <causa>` e devolve `[]`.
4. Alternativas descartadas:
   1. Capturar erro em cada função: esconderia a causa e impediria o erro agregado.
   2. Retentar 429/5xx: multiplicaria a leitura de 26 MB em uma API sem cota documentada.
   3. Guardar as listas em cache entre chamadas: o processo do plugin não é um daemon e o custo de memória do JSON legendado é alto.

### D10. Sem bloco novo e sem código externo

1. O fluxo usa os blocos existentes `http`, `tmdb-info`, `slugify`, `title-match`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`. Não há um segundo consumidor do catálogo completo para justificar um bloco.
2. Toda a arquitetura e todo o código vêm da observação das duas URLs públicas e da documentação deste repositório; nenhum scraper ou plugin de terceiro foi consultado, copiado ou creditado.

## Risks / Trade-offs

1. **Lista legendada de 26 MB** → é o maior custo da fonte e não há rota por título. O provedor baixa uma vez por chamada e filtra localmente; o QuickJS pode demorar mais que o Node. O limite é externo ao provedor, que não impõe timeout.
2. **Catálogo em romaji e temporadas em arcos** → a confirmação depende dos romaji do TMDB. Títulos sem romaji, traduções próprias ou arcos sem relação explícita ficam sem correspondência; ausência é preferível a escolher a obra errada.
3. **Temporadas agrupadas** → Jujutsu Kaisen, Naruto, One Piece e Bleach têm temporadas do TMDB que não batem com as entradas da fonte. A numeração absoluta cobre a série publicada em uma entrada; temporadas além da contagem ficam ausentes.
4. **Entradas sem linhas de episódio** → parte do catálogo anuncia títulos que não aparecem nas listas completas. O provedor devolve lista vazia quando o episódio não existe na lista.
5. **Filme em duas partes** → a seleção de filme exige exatamente um episódio. Um filme publicado em duas linhas fica ausente; não há evidência de como o app deveria escolher entre as partes.
6. **Qualidade `like`** → o bucket foi 1080p nas amostras, mas é um servidor, não um rótulo de resolução; fica `Desconhecida` para não afirmar o que o nome não declara.
7. **Sem legenda externa** → os arquivos legendados são hardsub e as listas não publicam URL de legenda; nenhum campo `subtitles` é inventado.
8. **API não versionada** → mudança de rota, campo ou envelope sobe como erro de estrutura; as fixtures registram o contrato observado.
9. **Sem sonda de mídia** → a URL publicada comprova o contrato, não a reprodução no aparelho. A rodada online mede a resolução do pacote, não o vídeo.

## Open Questions

1. Existe uma rota por título que não foi descoberta? As sondagens de `GET /animes/<id>`, `/episodios/<id>`, `/animes/<id>/episodios` e variantes responderam 404; a única interface observada para episódios são as listas completas. Uma rota futura deve ser reavaliada com nova evidência.
2. O bucket `like` sempre entrega 1080p? A amostra foi de quatro arquivos, com um sem `tkhd` no trecho lido. O provedor não afirma resolução para esse diretório.
3. A fonte tem limite de requisições? Não foi observado cabeçalho de cota; o provedor faz três leituras no máximo por pedido (catálogo e uma ou duas listas).
4. Filmes em duas partes aparecem no acervo? A amostra de filmes usou entradas de um episódio; o comportamento para duas partes fica como ausência até nova evidência.

## Implementation Notes

1. `src/superanimes/api.js` concentra as três rotas e a validação de envelope.
2. `src/superanimes/text.js` concentra título, áudio, contagem, ano, temporada, parte e utilitários de erro.
3. `src/superanimes/catalog.js` concentra identidade, seleção de temporada, partes e numeração absoluta.
4. `src/superanimes/episodes.js` concentra o rótulo do episódio, a validação de `link_video` e a qualidade pelo diretório.
5. `src/superanimes/extractor.js` orquestra uma leitura de catálogo, uma lista por áudio, o isolamento de falha e a montagem com `buildStream`.
6. `src/superanimes/index.js` valida a entrada, captura a falha final, deduplica e ordena.

## Validation

1. `npm run lint` passou sem violações.
2. `npm test` passou com 1.739 testes, incluindo `test/superanimes.test.js` (20 casos), manifest, `providers.md`, catálogo online, build e servidor.
3. `node build.js superanimes` gerou `providers/superanimes.js`, `gdrive/providers/superanimes.js`, `prism/providers/superanimes.js` e os `<formato>/manifest.json`, sem edição manual.
4. `node --test test/superanimes.test.js` cobre filme, temporada 1, romaji específico, marcador explícito, parte acumulada, romaji de arco, numeração absoluta, sufixo minúsculo, ausência, áudio ausente, falha isolada e total, catálogo inválido e `link_video` inválido.
5. `openspec validate add-superanimes --strict` passou.
6. A rodada online de **2026-11-19T18:49:51.743Z**, ID `2026-11-19T18-49-37-263Z-superanimes-17144b3e-5c6e`, perfil `anime`, pacote `1.0.0`, semente `17144b3e1bd946344071a32ba2acae91`, resolveu **5/5 filmes** e **5/5 séries**, sem falha ou caso inconclusivo. O status em `providers.md` ficou `🟢 Estável` com data `2026-11-19`.
7. Nenhum artefato, fixture ou log contém URL de mídia real, cookie, token, segredo ou chave. As fixtures usam `cdn.example`; o relatório online é sanitizado pelo harness.
