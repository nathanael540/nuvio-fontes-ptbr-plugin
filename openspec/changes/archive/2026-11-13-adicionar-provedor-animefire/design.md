# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 12/11/2026 contra `https://animefire.one/` e `https://api.animefire.one`; tokens de mídia, cookies e URLs assinadas não são registrados aqui.

1. O site é uma SPA Angular: o HTML inicial só traz o casco e um script `main-<hash>.js`; o conteúdo é carregado no navegador. O bundle principal declara `apiUrl: 'https://api.animefire.one'` e `url: 'https://animefire.one'`.
2. A busca usada pelo site é `GET /animes/pesquisar?q=<consulta>&page=<n>`, com resposta JSON paginada no estilo Laravel: `data[]`, `links` e `meta` (`current_page`, `last_page`, `total`). Cada item traz `id` opaco, `titles` (`BR`, `US`, `JP`), `audio`, `poster_src`, `status` e `published_at`.
3. A busca é por substring e não ordena por relevância exata: `Naruto` devolveu 69 resultados em três páginas, com o título exato na primeira; `Akira` devolveu 36 resultados de substrings (`Kirakira?Precure`, `Akikan` etc.) em duas páginas, sem o filme `Akira`. Por isso a busca precisa de paginação e de confirmação por título e ano.
4. A ficha é `GET /anime/<id>` e traz `data.format` (`tv` ou `movie`), `data.hero` (títulos, ano, áudio), `data.seasons[]` (`number`, `first_episode_number`), `data.episodes[]` (`id`, `season`, `number`, `title`, `audio`, `created_at`), relações e recomendações. Nos exemplos, `number` é o número dentro da temporada e `first_episode_number` é o número absoluto inicial da temporada.
5. As temporadas publicadas podem coincidir com o TMDB (Attack on Titan com 4, My Hero Academia com 8) ou agrupar várias temporadas em uma só (Jujutsu Kaisen com 59 episódios todos em `season: 1`). O provedor só aceita o par exato `season`/`number`; não infere a temporada pela posição.
6. O episódio é `GET /episode/<id>` e traz `data.streams[]` com `audio` (`dublado` ou `legendado`), `is_mtl`, `is_offline`, `url`, `qualities[]`, `chapters` e `thumbnails`. `url` é um master HLS em `akumast.net`, servido com `Content-Type: application/vnd.apple.mpegurl`; as variantes são caminhos relativos terminados em `.jpg`.
7. O master testado continha 480p, 720p, 1080p AV1 e 720p AVC. O array `qualities` do JSON declarava as mesmas resoluções, incluindo uma variante `720p-x264`. O master e as variantes responderam 200 com e sem `Referer`/`Origin`.
8. Episódios antigos continuam anunciados com `is_offline: false`, mas o master responde 404: Naruto S01E01, Demon Slayer S01E01 e S04E01, Jujutsu Kaisen S01E01, My Hero Academia S01E01 e The Frontier Lord S01E12 falharam; One Piece S23E25, Tomb Raider King S01E12 e Hell Mode S02E13 responderam 200. A retenção da mídia é uma limitação da fonte, não uma ausência de título.
9. O runtime exige a API básica do cheerio, mas a fonte entrega JSON; nenhum scraping de HTML é necessário. `URLSearchParams` não é iterável e a query deve ser montada como texto, não alterando `URL.searchParams`.
10. A API respondeu com `x-ratelimit-limit: 200` e `x-ratelimit-remaining` decrescente nos testes. O provedor não deve multiplicar requisições nem sondar a mídia.

## Goals / Non-Goals

**Goals:**

1. Confirmar título, ano e tipo antes de resolver a mídia, sem aceitar o primeiro resultado parecido.
2. Selecionar temporada e episódio pelo par declarado na API, preservando a temporada pedida.
3. Resolver as opções dublada e legendada como opções independentes e devolver streams HLS válidos.
4. Manter o provedor testável offline com fixtures reais sanitizadas e verificável online no perfil `anime`.

**Non-Goals:**

1. Cobrir conteúdo que não seja anime; o site não é um catálogo generalista.
2. Sondar cada URL de mídia, baixar playlists ou validar reprodução; a rodada online confirma o contrato, não o vídeo.
3. Inventar mapeamento de temporada para séries cuja ficha agrupa várias temporadas do TMDB em uma só.
4. Oferecer tamanho, legendas externas, seeders ou peers; a fonte não os publica.
5. Adicionar chave, conta, proxy ou serviço externo.

## Decisions

### D1. Consumir a API JSON pública em vez de raspar a SPA

1. Usar `https://api.animefire.one` com `fetchJson` do bloco `http`, perfil `api`, nos caminhos `/animes/pesquisar`, `/anime/<id>` e `/episode/<id>`.
2. Alternativas descartadas:
   1. Raspar o HTML do site: o conteúdo é montado por JavaScript e o HTML inicial não tem catálogo.
   2. Usar o Jina Reader: adicionaria um intermediário e uma cota desnecessários para uma API pública que já entrega JSON.
   3. Reutilizar seletores de outra fonte: o contrato é outro e não há HTML estável.
3. A API não é versionada; mudanças de esquema sobem como erro de estrutura, não como ausência.

### D2. Busca por variantes, paginação e confirmação de identidade

1. Montar as consultas na ordem: título PT-BR, título original e alternativos brasileiros, deduplicadas por `normalizeText`.
2. Para cada consulta, pedir as páginas de `/animes/pesquisar` a partir de `page=1` até `meta.last_page`, acumulando candidatos. Cada item vira um candidato por título em `titles` (`BR`, `US`, `JP`), com ano lido de `published_at`.
3. Usar `findBestMatch` com o `MediaInfo` do TMDB sobre os candidatos acumulados. Ao encontrar um candidato, buscar a ficha e aceitar somente se `data.format` corresponder ao tipo pedido. Em caso de tipo conflitante, marcar aquele candidato como rejeitado e continuar a paginação.
4. Parar na primeira ficha confirmada. Se todas as consultas e páginas acabarem sem confirmação, devolver lista vazia.
5. O ano de `published_at` é o ano de estreia da obra; para série, é o mesmo ano que o TMDB usa como `first_air_date`, e não o ano de uma temporada posterior. Isso evita aceitar um spin-off de outro ano.
6. Alternativas descartadas:
   1. Aceitar o primeiro resultado: a busca por substring devolve títulos não relacionados, como `Kirakira?Precure` para `Akira`.
   2. Buscar apenas pelo título PT-BR: perde obras cujo título na fonte está em outra variante.
   3. Usar o ID do TMDB na busca: a API não expõe esse ID; os IDs do site são opacos.

### D3. Seleção de episódio e filme

1. Validar `season` e `episode` como inteiros positivos antes de qualquer requisição quando `mediaType` for `tv`.
2. Para série, percorrer `data.episodes` e escolher a entrada com `season` e `number` iguais ao pedido. Não usar posição visual, índice do array nem `first_episode_number` como substituto.
3. Se a temporada não existir, devolver lista vazia. Se a temporada existir mas o episódio não, devolver lista vazia. Não tentar outra temporada.
4. Para filme, exigir `format: movie` e usar a única entrada de `data.episodes`; se a lista estiver vazia, devolver lista vazia; se tiver mais de uma entrada, lançar erro de estrutura.
5. Alternativa descartada: mapear temporada do TMDB para a posição absoluta da lista. Jujutsu Kaisen, por exemplo, publica 59 episódios em `season: 1`; sem metadados de temporada do TMDB no provedor, esse mapeamento seria uma estimativa e poderia tocar o episódio errado.

### D4. Resolução da mídia e opções de áudio

1. Buscar `GET /episode/<id>` e ler `data.streams` como opções independentes.
2. Cada opção com `is_offline: true` é descartada por triagem, sem aviso de falha.
3. Cada opção restante é resolvida em uma promessa que devolve `{ ok: true, stream }` ou `{ ok: false, erro }`. Usar `Promise.all` sobre essas promessas já convertidas, porque `Promise.allSettled` não foi confirmado no runtime.
4. Se uma opção falhar e outra produzir stream, registrar `console.warn('[AnimeFire] Opção <áudio> descartada: <causa>')` e devolver os streams válidos. Se todas as opções falharem, lançar erro com a causa de cada uma.
5. Se todas as opções estiverem offline, devolver lista vazia: a fonte reconheceu a indisponibilidade. Se `data.streams` estiver ausente ou não for lista, lançar erro de estrutura.
6. O `url` do master HLS é devolvido como está. Não baixar playlist, não sondar o CDN e não separar variantes: o app já trata um master adaptativo, e uma requisição extra por episódio não é necessária para montar o stream.
7. A qualidade é a maior resolução declarada em `qualities`, normalizada por `normalizeQuality`; `4K` equivale a 2160. Sem qualidade reconhecível, o campo é omitido e o `buildStream` decide localmente, preservando o stream como `Desconhecida`.
8. O idioma vem do campo `audio`: `dublado` vira `LANGUAGE.DUBBED` e `legendado` vira `LANGUAGE.SUBTITLED`. Texto fora desse vocabulário entra como `languageHints` para a descoberta local; nada é promovido a PT-BR sem evidência. `is_mtl` não é usado como idioma, porque indica tradução automática e não classifica o áudio.
9. Cabeçalhos de reprodução: `playbackHeaders('https://animefire.one/')`, com `User-Agent`, `Referer` e `Origin`. O CDN respondeu sem eles nos testes, mas os cabeçalhos preservam o contexto do site e não introduzem credencial.

### D5. Streams, manifest e verificação

1. Cada stream é montado com `buildStream`:
   1. `url` do master HLS.
   2. `quality` pela maior resolução declarada, quando houver.
   3. `language` pelo áudio da fonte.
   4. `provider: 'AnimeFire'` e `type: 'hls'`.
   5. `headers` de reprodução.
   6. `format: { template: FORMATTER.AUTO, addon: 'AnimeFire', title, year, season, episode }`, com `message: 'Reprodução adaptativa'` por ser um master HLS.
   7. Sem `size`, `subtitles`, `infoHash`, `seeders` ou `peers` enquanto a fonte não os fornecer.
2. Ordenar com `sortByQuality` no ponto de entrada, como no template.
3. Manifest: `id` `animefire`, nome `AnimeFire`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8`, `contentLanguage` `pt` e logo `https://animefire.one/favicons/favicon-192x192.png`.
4. Verificação online: `test/online/profiles.json` ganha `animefire: { exclusiveTag: "anime" }`, com revisão e `curatedAt` atualizados; os catálogos já têm 5 filmes e 6 séries com a tag `anime`. A tabela de `providers.md` começa em `🟠 Não verificado` e só muda com a execução explícita.
5. A rodada online usa os títulos de anime já catalogados. Como a amostra de série inclui apenas S01E01, a evidência mede a resolução do contrato; a retenção de mídia antiga é uma limitação registrada, não um critério para sondar URLs.

### D6. Documentação e reutilização

1. Nenhum bloco novo: a fonte entrega JSON e o fluxo usa `tmdb-info`, `title-match`, `http`, `quality-discovery`, `language-discovery`, `custom-formatter` e `stream-build`.
2. Atualizar `docs/provider-investigation.md` com o método “API pública de catálogo de SPA”: como achar `apiUrl` no bundle, os três caminhos observados, a paginação, a confirmação de tipo e os limites de retenção.
3. Não alterar `src/_blocks/index.md` quando nenhum bloco mudar; o teste do catálogo continua válido.
4. Registrar o provedor em `providers.md` com a seção vazia de verificações e status `🟠 Não verificado`.

## Risks / Trade-offs

1. **Mídia antiga com 404** → a fonte anuncia `is_offline: false` mesmo quando o master não existe mais. O provedor entrega a URL publicada, sem sondar; a limitação fica registrada e a rodada online não a confunde com ausência de título.
2. **Busca por substring** → títulos comuns geram muitos resultados e o exato pode estar em página posterior. A paginação e o `findBestMatch` reduzem falsos positivos; um título ausente do acervo termina em lista vazia.
3. **Temporadas agrupadas** → séries como Jujutsu Kaisen publicam várias temporadas do TMDB em uma só. O provedor devolve ausência para temporadas posteriores em vez de tocar o episódio errado; uma mudança futura pode adicionar metadados de temporada do TMDB.
4. **API sem versão** → mudanças de esquema quebram o parsing. Testes de fixture e erros de estrutura explícitos tornam a falha visível; não há fallback silencioso.
5. **Cota da API** → o cabeçalho observado limita 200 requisições por janela. O fluxo gasta uma requisição do TMDB, uma ou mais de busca, uma de ficha e uma de episódio; não há cache entre chamadas.
6. **Qualidade declarada versus master** → `qualities` é a única evidência sem baixar a playlist. Se a fonte divergir, o stream ainda reproduz no master; a qualidade exibida pode ficar acima ou abaixo da melhor variante real.
7. **Áudio desconhecido** → o vocabulário observado é `dublado`/`legendado`; um valor novo vira dica local e não é promovido a uma classificação inventada.
8. **Cloudflare** → o site e a API responderam sem desafio nos testes. Um desafio futuro vira erro de rede/HTTP, não ausência.

## Migration Plan

1. Criar `src/animefire/` e os testes com fixtures reais sanitizadas; rodar `node build.js animefire`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil `anime` em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método reaproveitável.
4. Rodar `npm run lint`, `npm test` e o build; confirmar que os arquivos gerados foram atualizados.
5. Executar `npm run test:online -- --provider animefire` com `TMDB_API_KEY` apenas no ambiente; registrar a rodada e ajustar o status conforme o resultado.
6. Arquivar a mudança somente com os testes previstos passando ou com exclusões declaradas.
7. Rollback: remover a entrada do manifest, os arquivos gerados, o perfil e a seção de `providers.md`; os blocos existentes não são alterados.

## Open Questions

1. A primeira rodada online confirmará com que frequência os episódios antigos do catálogo ainda resolvem mídia e se o status deve refletir a retenção observada.
2. Confirmar se o título PT-BR, o original e os alternativos brasileiros cobrem o acervo de anime; se muitos títulos só aparecerem em romaji, uma mudança futura pode expor romaji no `tmdb-info` e reutilizar a busca.
3. Confirmar se `qualities` continua correspondendo ao master HLS em todo o acervo; uma divergência não impede a reprodução, mas afeta a qualidade exibida.
