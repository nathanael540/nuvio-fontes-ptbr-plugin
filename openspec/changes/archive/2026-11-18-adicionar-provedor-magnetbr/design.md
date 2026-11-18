# Design

## Context

Ver `proposal.md` para a motivação. Este documento registra as observações da fonte, as decisões e o que ainda depende da implementação.

1. A definição pública de Prowlarr/Jackett do MagnetBR, consultada em 2026-11-14, descreve `GET /indexers/{{ .Config.scraper_type }}` com resposta JSON, `q` igual ao IMDb ou às palavras, `season` e `ep`, e resultados em `results`. A fonte foi reconhecida em 2026-11-16 com chamadas reais ao catálogo completo; a definição orienta a descoberta, não é executada pelo plugin.
2. O catálogo completo responde em `GET https://magnetbr.flixbr.online/indexers/db` sem chave, sem conta e sem cookie, com `application/json` e `{ count, results, source }`. Em ausência, a resposta pode trazer também `queued: true`.
3. Cada item traz `id`, `category` (`Movies`, `TV` ou `Anime`), `title`, `original_title`, `title_processed`, `title_translated_processed`, `magnet_original`, `magnet_link`, `magnet`, `info_hash`, `imdb`, `year`, `size`, `size_bytes`, `seed_count`, `leech_count`, `audio_tags`, `has_legenda`, `legend`, `scraper_source`, `details`, `date`, `trackers` e `moderation_status`.
4. Reconhecimento de contrato em 2026-11-16, com uma a três requisições por endpoint:
   1. `q=matrix` respondeu 26 itens de `Movies`; `q=tt0133093` respondeu 6 itens, todos com o IMDb pedido; `q=0133093` (IMDb sem `tt`) respondeu os mesmos 6.
   2. `q=tt3581920&season=1&ep=2` respondeu 9 itens, todos `S01E02`; `q=the last of us&season=1&ep=1` respondeu 8 itens. O filtro de temporada/episódio funciona no servidor para itens indexados em nível de episódio.
   3. `q=tt11743610&season=1&ep=1` respondeu `count: 0` com `queued: true`; `q=tt11743610&season=1` respondeu 5 pacotes `S01` do mesmo título. Um pacote foi lido no cache itorrents.org e a lista de arquivos trazia `S01E01` a `S01E08`.
   4. `q=tt0903747&season=1` respondeu 14 itens, entre eles `Breaking.Bad.Season.1.S05...`, com duas temporadas conflitantes no mesmo título.
   5. `q=tt0409591&season=1&ep=1` respondeu `count: 0` com `queued: true`; `q=naruto` respondeu 88 itens de `Anime` com títulos como `Naruto.2002.720p.x264.AAC.Brazilian`, sem `SxxExx` nem temporada no texto.
   6. `q=tt0388629&season=1&ep=1` respondeu 1 item `One.Piece.S01E01.2023...`, categoria `Anime`, ano 2023, embora a temporada 1 do anime no TMDB seja de 1999. É um falso positivo da associação de IMDb da fonte.
   7. `q=the` respondeu `count: 100` e 100 itens; `page=2` e `page=50` devolveram outros 100; `page=999` devolveu lista vazia. `count` é o tamanho da página, não o total, e a API aceita `page`, embora a definição do Prowlarr não pagine.
   8. Links magnet apareceram em hexadecimal maiúsculo, hexadecimal minúsculo e base32 de 32 caracteres. No caso base32, `info_hash` já vinha em hexadecimal de 40 caracteres, mas o `magnet_link` público continuava em base32.
   9. `size` apareceu como `2.5 GB`, `30.0 GB`, `2,8 GB`, `21.92 MB`, `30 B`, `31 B` e `175 B`; `size_bytes` acompanhava os valores, inclusive os corrompidos. O filtro da definição do Prowlarr troca `0 B` por `2,5 GB`, o que este repositório não pode fazer.
   10. `audio_tags` apareceu como `Português, Inglês`, `Português` e `Inglês`; `legend` apareceu como `Português`; `has_legenda` acompanhou a presença. Os títulos gerados acrescentam `[Brazilian]` e `[Eng]` a partir desses campos.
   11. `scraper_source` apareceu como `rede`, `starck`, `comand`, `bludv`, `tfilme` e `torrentclaw`; `moderation_status` veio `ok` nos itens observados.
   12. O upload do site exige conta Google, mas a busca e a leitura do catálogo são livres. O provedor não usa upload, conta, Prowlarr, Radarr ou Sonarr.
5. Blocos reaproveitáveis: `tmdb-info` (IMDb, títulos, ano e temporadas), `http` (JSON e cabeçalhos), `title-match` (`titleSimilarity`), `torrent-release` (`readMagnet`, `infoHashFromBtih`, `episodeTarget`, `seasonNumbers`, `isCollectionTitle`, `humanSize`, `formatBytes`), `torrent-files` (`fetchTorrentFiles`, `findEpisodeFile`), `stream-build` (`buildStream`, `buildTorrentFileUrl`, `sortByQuality`), `custom-formatter`, `language-discovery` (`normalizeLanguage`, `languageFromTexts`, `LANGUAGE`) e `quality-discovery` (`discoverQuality`). Nenhum bloco novo.
6. Restrições do runtime: `fetch`, `URL`, `URLSearchParams`, `atob`, `btoa`, `console` e `cheerio-without-node-native`; sem APIs do Node, sem `setTimeout`, sem timeout próprio, sem `TextDecoder`. O app gerencia a espera.

## Goals / Non-Goals

**Goals:**

1. Resolver filme e episódio no catálogo agregado do MagnetBR por IMDb e por título, com confirmação local de identidade.
2. Aproveitar a consulta de temporada para devolver pacotes como `torrent://` quando o episódio for identificável, sem escolher arquivo por posição.
3. Manter a classificação de idioma conservadora e restrita à evidência da fonte, sem promover `[Brazilian]` gerado pelo indexador a PT-BR comprovado.
4. Distinguir ausência, triagem e falha; manter o erro em um único ponto e isolar cada opção.
5. Não introduzir setting, chave, serviço externo novo ou dependência.

**Non-Goals:**

1. Expor o seletor de fonte (`db`, `starck`, `rede`, `tfilme`, `comand`, `bludv`, `torrentclaw`) ou consultar mais de um endpoint por pedido.
2. Paginar a busca, buscar por TMDB, usar upload, conta Google, Prowlarr, Radarr ou Sonarr.
3. Sondar mídia, baixar playlist, medir resolução, validar reprodução P2P ou contar peers reais.
4. Corrigir metadados da fonte, como tamanho em bytes, IMDb trocado ou título gerado.
5. Criar bloco de indexador genérico ou alterar os blocos existentes.

## Decisions

### D1. Provedor próprio com `index.js` e `extractor.js`

1. `src/magnetbr/index.js` faz a validação de entrada, chama o extrator, ordena com `sortByQuality` e é o único ponto de captura de erro (`console.error('[MagnetBR] ...')`).
2. `src/magnetbr/extractor.js` concentra a consulta, a triagem, a resolução de pacotes e a montagem dos streams. O provedor é pequeno e não precisa de mais arquivos.
3. Alternativas descartadas:
   1. Bloco `torrent-indexer` compartilhado com o BeTor: os dois catálogos têm esquemas e filtros diferentes; a abstração nasceria de duas fontes, mas misturaria busca, triagem e formato de resposta antes de haver um terceiro consumidor.
   2. Catálogo adicional no BeTor: os acervos, a API e a identidade são independentes; juntar esconderia a ausência de um no outro e mudaria um provedor estável.
   3. Provedor só de filme: a fonte tem série e pacote, e o contrato já tem suporte a `torrent://`.

### D2. Catálogo completo, uma página e sem setting

1. Usar somente `https://magnetbr.flixbr.online/indexers/db`. A definição do Prowlarr oferece `db`, `hybrid`, `all`, `starck`, `rede`, `tfilme`, `comand`, `bludv` e `torrentclaw`; `db` é o catálogo completo, que já agrega os demais.
2. Não expor `scraper_type` no manifest. Um setting duplicaria a escolha do Prowlarr sem evidência de que o usuário do Nuvio precise dela, e `db` é a recomendação pública.
3. Ler somente a primeira página. `count` é o tamanho da página (100 no limite), não o total; a paginação profunda multiplicaria requisições e a busca por IMDb/temporada costuma caber na primeira página.
4. Alternativas descartadas:
   1. Consultar `db` e todos os endpoints específicos: repetiria os mesmos hashes e multiplicaria a carga.
   2. Paginar até `count` zerar: `count` não é total; o custo cresceria sem garantia de cobrir o item.
   3. Descobrir o domínio pela home: a definição pública e o catálogo usam um host estável; não há lista de espelhos observada.

### D3. Busca por IMDb, fallback por título e consulta de pacote

1. As tentativas são, nesta ordem e sem repetir termo: `media.imdbId` quando existir; `media.title`; `media.originalTitle`; `media.alternativeTitles`. A comparação de deduplicação é sem diferenciar maiúsculas e espaços nas pontas.
2. Cada tentativa lê a resposta e aplica a triagem antes de decidir se para. Uma tentativa com itens brutos todos descartados não encerra a busca; uma tentativa com ao menos um candidato aceito para.
3. Um erro HTTP, JSON inválido ou estrutura fora do contrato interrompe a busca sem tentar o termo seguinte, como no BeTor. Uma resposta válida com zero itens libera a próxima tentativa.
4. Em série, cada tentativa faz a consulta exata (`season` + `ep`) e a consulta da temporada (`season`, sem `ep`), nesta ordem. Os resultados são unidos por `info_hash`; a consulta de temporada serve para pacotes, e a exata serve para episódios avulsos.
5. Se a consulta exata devolver o mesmo hash de um pacote, o stream de episódio avulso prevalece e o pacote daquele hash não é baixado.
6. Alternativas descartadas:
   1. Só a consulta exata: perderia os pacotes de temporada, que são a maior parte do acervo de séries antigas observado.
   2. Só a consulta de temporada: em temporadas longas, o episódio pedido pode ficar fora dos 100 itens; a consulta exata garante a presença.
   3. Usar o filtro de palavras da definição (`S01` → `temporada 1`): a API aceita `season` e `ep` separados; reescrever o termo só reproduziria o Prowlarr.

### D4. Triagem de identidade

1. Normalizar `imdb` da fonte e do TMDB para comparar só os dígitos. Item com IMDb preenchido e diferente do pedido é descartado. Item sem IMDb só é aceito com evidência local de título.
2. `category` `Movies` em pedido de filme e `TV`/`Anime` em pedido de série são compatíveis. `TV` em filme e `Movies` em série são descartados. `Anime` é aceito nos dois pedidos porque a categoria não distingue filme de série; os marcadores locais decidem.
3. Título: `titleSimilarity` de 0,85 contra título PT-BR, original e alternativos, ou o título normalizado contido no texto da release. Para filme, quando o ano da fonte e o do TMDB existem, a diferença máxima é um ano. A coleção (`trilogia`, `coleção`, `todos os filmes`, `saga completa`) é descartada em pedido de filme.
4. Série: `episodeTarget` e `seasonNumbers` são calculados no texto de `title`, `original_title`, `magnet_original` e `dn`. Episódio explícito de outra temporada ou de outro episódio descarta o item; temporada explícita que não inclui a pedida descarta; mais de uma temporada no texto (por exemplo, `Season.1.S05`) descarta por conflito.
5. Item de série sem episódio nem temporada explícitos só é aceito quando o IMDb é igual, o título é compatível e o ano da temporada no TMDB está a no máximo um ano do ano da fonte, quando o TMDB informa esse ano. Essa é a evidência que compensa a ausência de coordenadas no texto; o filtro do servidor não é aceito sozinho.
6. O ano da temporada vem de `media.seasons` (campo `year`). Sem ano no TMDB ou sem ano no item, a checagem é omitida. A tolerância de um ano cobre lançamento e estreia em anos diferentes; o falso positivo `One.Piece.S01E01.2023` contra a temporada 1 de 1999 é descartado.
7. Alternativas descartadas:
   1. Aceitar todo item devolvido pelo filtro do servidor: o caso One Piece mostra que a associação de IMDb da fonte pode apontar para outra produção.
   2. Confiar no `title_processed`: o título é gerado pelo indexador e repete a categoria/idioma; serve para título, não para identidade absoluta.
   3. Usar só similaridade de título: remakes e títulos genéricos passariam; o IMDb e o ano fecham a decisão.

### D5. Pacotes de temporada

1. Um item da consulta de temporada sem episódio explícito, ou com faixa de episódios, é candidato a pacote. Item da consulta exata com episódio único é magnet; item da consulta exata sem marcador que passou na triagem de identidade também é magnet, porque o servidor já filtrou a coordenada e o texto não indica pacote.
2. Cada hash de pacote é resolvido uma vez por `fetchTorrentFiles`, mesmo que apareça em mais de uma tentativa ou consulta. Entre duplicatas do mesmo hash, vale a de mais seeders para os metadados exibidos.
3. `findEpisodeFile` é chamado com `seasonPack: true`. Um único arquivo correspondente vira `torrent://<hash>/<índice>` com `buildTorrentFileUrl`; zero ou mais de um candidato descarta o pacote por triagem.
4. A falha de rede do cache descarta só aquela opção, com `console.warn('[MagnetBR] Opção <rótulo> descartada: <causa>')`; o erro agregado só sobe se nenhuma opção produzir stream e alguma tiver falhado.
5. O tamanho do stream de pacote é o do arquivo do episódio quando a lista o informa; o tamanho do pacote vai em `format.folderSize` quando for diferente. O arquivo vai em `format.filename` e o nome do pacote em `format.folderName`.
6. Alternativas descartadas:
   1. Devolver o magnet do pacote sem índice: o app tocaria o maior arquivo, que costuma ser outro episódio; o contrato proíbe.
   2. Escolher o primeiro vídeo do torrent: não identifica o episódio.
   3. Baixar todos os pacotes antes de deduplicar: multiplicaria requisições e violaria o isolamento por opção.

### D6. Idioma, tamanho, qualidade e campos do stream

1. Idioma: `normalizeLanguage(item.audio_tags)` define áudio português (`Dublado` ou `Dublado (Não PT-BR?)`) e estrangeiro (`Gringo`). Áudio português prevalece. Sem áudio português, `has_legenda` com `legend` em português produz `Legendado`/`Legendado (Não PT-BR?)` via `normalizeLanguage('Legenda ' + legend)`. Sem legenda portuguesa, áudio estrangeiro produz `Gringo`. Sem campo conclusivo, `languageFromTexts([magnet_original, dn])`; sem conclusão, `Idioma Desconhecido`.
2. `title`, `title_processed` e `title_translated_processed` não entram na classificação de idioma. O `[Brazilian]` é derivado de `audio_tags` e não comprova a região do áudio; usá-lo promoveria `Português` a `Dublado` sem prova.
3. Tamanho: `humanSize(item.size)` aceita MB/GB/KB, normaliza vírgula e ignora `30 B`/`175 B`. Se ele devolver `null`, `formatBytes(item.size_bytes)` só é usado quando `size_bytes` for inteiro maior ou igual a 1 MiB. Sem valor plausível, o campo é omitido. Nenhum valor padrão é inventado.
4. Qualidade: `discoverQuality` sobre `title`, `magnet_original`, `dn` e, no pacote, o caminho do arquivo. Sem correspondência, `Desconhecida`; não há requisição extra.
5. Seeders e peers: `seed_count`/`leech_count` só entram quando inteiros não negativos; zero é preservado. A definição do Prowlarr troca zero por um, o que este repositório não faz.
6. `provider`: `scraper_source` quando texto não vazio. É o catálogo de origem dentro do agregado, como `rede` ou `starck`.
7. Magnet: `readMagnet` sobre `magnet_link` e, se ausente, `magnet`; normaliza BTIH base32 para 40 hexadecimais e completa trackers públicos quando não houver `tr=`. `infoHash` recebe o mesmo hash.
8. `format`: `FORMATTER.AUTO`, `addon: 'MagnetBR'`, título, ano, temporada e episódio; `filename` do `dn` ou, na falta, `magnet_original`/`title`; `folderName` e `folderSize` no pacote. `name` e `title` do stream não são informados.
9. Deduplicação por URL, mantendo a primeira; o stream exato prevalece sobre o pacote de mesmo hash. `sortByQuality` no ponto de entrada.

### D7. Fronteira de erro, ausência e logs

1. Validar `tmdbId` numérico, `mediaType` `movie`/`tv`, temporada/episódio inteiros a partir de 1 em série e `TMDB_API_KEY` antes de qualquer requisição; chamar `getMediaInfo` antes da fonte.
2. Resposta válida com `results` vazio é ausência, mesmo com `queued: true`. O provedor não espera a indexação em segundo plano nem repete a consulta por isso.
3. `results` que não é lista, `count` que não é inteiro não negativo, HTTP fora de 2xx ou JSON inválido sobem como erro. A busca e o TMDB são etapas fatais.
4. Cada item aceito é uma opção independente. Falha de magnet, de montagem ou de leitura do pacote descarta só a opção, com aviso. Se nenhum stream sair e houver falha, sobe o erro agregado; se todos forem triagem, a lista é vazia sem aviso.
5. Sanitizar mensagens: sem chave do TMDB, sem query de URL, sem magnet completo e sem corpo de resposta. O rótulo usa o `id` do item ou os oito primeiros caracteres do hash.
6. Sem timeout, sem retentativa por lentidão, sem cache de busca ou de mídia. A falha de uma tentativa não aciona outra por lentidão.

### D8. Testes, manifest e documentação

1. `test/magnetbr.test.js` empacota o provedor com `buildProvider` nos formatos publicados e executa o pacote com `fetch` simulado, no padrão do `test/betor.test.js`. As respostas da fonte são montadas no teste a partir das formas reais observadas; o `.torrent` do cache é construído em memória com bencode.
2. Casos mínimos: filme por IMDb com magnet hexadecimal e base32; filme por título; filme sem IMDb no item; IMDb divergente; tipo divergente; coleção; tamanho `2,8 GB`, `30 B` e `size_bytes` corrompido; série com episódio exato; item sem marcador com IMDb e ano da temporada; item sem marcador sem evidência; temporada conflitante; falso positivo de ano; episódio/temporada divergentes; pacote com arquivo único; pacote sem o episódio; pacote ambíguo; falha do cache; `queued`; HTTP 503; JSON inválido; entrada inválida; chave do TMDB ausente; idioma português, inglês com legenda PT, inglês sem legenda e desconhecido; `scraper_source` como `provider`; deduplicação e ordenação; variantes gdrive/prism; logs sem chave e sem magnet completo.
3. Manifest: `id` `magnetbr`, nome `MagnetBR`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, `formats: ["magnet"]`, `contentLanguage: ["pt"]`, logo `https://www.google.com/s2/favicons?domain=magnetbr.flixbr.online&sz=128` e descrição que mencione o catálogo agregado, magnet e pacote de temporada.
4. `providers.md` ganha a linha e a seção `MagnetBR` com status `🟠 Não verificado` e data `—`; o perfil é generalista e `test/online/profiles.json` não muda.
5. `docs/provider-investigation.md` §3.6 ganha a variação do indexador JSON que aceita IMDb + temporada/episódio, devolve `count`/`results`/`queued`, exige duas consultas para episódio e pacote e usa o cache itorrents para o índice do arquivo; inclui os limites de página única, anime sem marcador e metadados corrompidos. Nenhum bloco novo.
6. Nenhuma alteração em `README.md` ou `docs/arch.md`: as regras globais e o catálogo de blocos não mudam.

## Risks / Trade-offs

1. **Associação de IMDb errada na fonte (One Piece)** → a triagem exige IMDb, título e ano da temporada; o falso positivo é descartado. O custo é perder remasterizações de temporadas antigas lançadas muitos anos depois.
2. **Indexação em segundo plano (`queued`)** → a primeira chamada pode voltar vazia; a próxima pode encontrar o item. O provedor não espera nem repete, porque o app gerencia a espera e o contrato não permite polling.
3. **Animes sem `SxxExx`** → a consulta exata devolveu zero/`queued` nos exemplos; itens sem marcador só entram com IMDb, título e ano. A cobertura de anime episódico pode ficar baixa; é uma limitação da fonte, não uma promessa.
4. **Limite de 100 itens por página** → a primeira página pode não conter o episódio ou o pacote. A consulta exata cobre o episódio; o pacote é uma tentativa adicional, não uma garantia.
5. **Temporadas conflitantes no título** → itens como `Season.1.S05` são descartados mesmo que um arquivo pudesse corresponder; a decisão evita baixar e anunciar a temporada errada.
6. **Tamanho e contagem corrompidos** → valores em bytes isolados e contagens ausentes são omitidos ou preservados como zero; a tela pode mostrar menos metadados, mas não inventa dados.
7. **Idioma conservador** → `Português` sem região vira `Dublado (Não PT-BR?)`, e o `[Brazilian]` gerado não promove. A classificação pode subestimar o áudio brasileiro, mas não afirma região sem prova.
8. **Dependência do itorrents.org para pacotes** → falha do cache descarta só a opção; sem o cache, o pacote não vira stream. O magnet de episódio avulso continua.
9. **Domínio único** → não há descoberta de espelhos; uma troca de host exige mudança no provedor. A definição pública e o catálogo compartilham o host observado em 2026-11-16.
10. **Sem timeout** → uma fonte lenta consome a espera configurada no app; o provedor não cancela nem repete. É o comportamento global do repositório.
11. **Evidência** → o reconhecimento de 2026-11-16 não substitui a rodada online; ele só confirma o contrato usado no desenho.

## Migration Plan

1. Criar `src/magnetbr/index.js` e `extractor.js` a partir de `src/_template/` e dos contratos de `src/betor/`, sem bloco novo.
2. Adicionar a entrada `magnetbr` ao `manifest.json` e rodar `node build.js magnetbr`.
3. Escrever `test/magnetbr.test.js` e as respostas controladas; rodar `node --test test/magnetbr.test.js`.
4. Adicionar a linha e a seção em `providers.md` e a variação em `docs/provider-investigation.md` §3.6.
5. Rodar `npm run lint`, `npm test` e `node build.js magnetbr`.
6. Executar `npm run test:online -- --provider magnetbr --record` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada em `providers.md`; sem ela, o status permanece `🟠 Não verificado`.
7. Arquivar somente com os casos de teste previstos passando ou com as exclusões declaradas.
8. Rollback: remover a entrada do manifest, `src/magnetbr/`, o teste, as fixtures, os arquivos gerados e a seção de `providers.md`; nenhum dado persistente é migrado.

## Open Questions

1. A fonte passará a indexar episódios de anime com temporada/episódio internos? Hoje a consulta exata devolve `queued` e os itens não têm marcador; se mudar, a cobertura melhora sem alterar a triagem.
2. O `page` continuará disponível e estável? A implementação não pagina; uma mudança futura pode reavaliar se a primeira página deixar de cobrir os pacotes.
3. O host `magnetbr.flixbr.online` continuará sendo o único? Não há espelho observado; uma troca exige mudança de constante e nova evidência.
4. Vale expor o seletor de fonte no futuro? Hoje `db` cobre o catálogo completo e a escolha adicionaria configuração sem necessidade comprovada.
5. A tolerância de um ano para o ano da temporada é suficiente para remasterizações? A decisão evita falso positivo; uma rodada online pode mostrar títulos legítimos descartados e justificar uma mudança própria.

## Validation

1. `npm run lint` passou com 0 erros e 0 avisos sem desativar regras; `src/magnetbr/` não usa APIs do Node, `axios`, `setTimeout` ou `TextDecoder`.
2. `node --test test/magnetbr.test.js` passou com 8/8 testes offline cobrindo:
   1. busca por IMDb e fallback por título;
   2. erro HTTP/JSON sem fallback;
   3. filme com magnet hexadecimal e base32;
   4. tamanho com vírgula, tamanho em bytes isolado e `size_bytes` corrompido;
   5. IMDb divergente, tipo divergente, coleção e ano incompatível;
   6. série com episódio exato e com item sem marcador;
   7. temporada conflitante, episódio divergente e falso positivo de ano;
   8. pacote com arquivo único, sem arquivo, ambíguo e com falha do cache;
   9. `queued` como ausência;
   10. idioma português, estrangeiro com legenda PT, estrangeiro sem legenda e desconhecido;
   11. `scraper_source` como `provider`, seeders/peers e contagem zero;
   12. deduplicação, ordenação e variantes gdrive/prism;
   13. entrada inválida e chave do TMDB ausente sem requisição;
   14. logs sem chave do TMDB e sem magnet completo.
3. `node build.js magnetbr` gerou `providers/magnetbr.js` (sem `async`/`await`) e as variantes `gdrive/providers/magnetbr.js` e `prism/providers/magnetbr.js`, atualizando `gdrive/manifest.json` e `prism/manifest.json`.
4. `npm test` passou integralmente com 1569/1569 testes (0 falhas), incluindo as suítes de manifest, catálogo de provedores, blocos e provedores existentes.
5. `npm run test:online -- --provider magnetbr --record` rodou em 2026-11-18T21:16:01.278Z (ID `2026-11-18T21-14-29-484Z-magnetbr-197a8f15-1ef6`, semente `197a8f15f7c4d4ea76298ebe9491c734`, perfil `generalista`, pacote `1.0.0`) e registrou status `🟢 Estável` em `providers.md`, com `movie` 2/5 resolvidos (3 sem resultado, 0 falhas, 0 inconclusivos) e `tv` 4/5 resolvidos (1 sem resultado, 0 falhas, 0 inconclusivos).
6. Exclusões e limites preservados: animes episódicos sem marcador `SxxExx` fora da janela de ano da temporada, paginação além da primeira página (`count <= 100`), espera por indexação em segundo plano (`queued: true`) e comprovação de reprodução P2P no aparelho permanecem fora do escopo desta mudança.

