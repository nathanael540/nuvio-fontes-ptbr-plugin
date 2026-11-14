# Tasks

## 1. Estrutura e busca nos workers

- [ ] 1.1 Criar `src/animezey/index.js`, `src/animezey/search.js` e `src/animezey/extractor.js` com JSDoc, `PROVIDER_NAME = 'AnimeZeY'`, validação de entrada (`tmdbId` numérico, `mediaType` `movie`/`tv`, temporada e episódio ≥ 1 em série) e `getStreams` como única captura; verificar que `node build.js animezey` empacota sem erro.
- [ ] 1.2 Implementar `searchFiles(query, workerIndex)` com `POST /1:search`, corpo `{ q, page_token: null, page_index: 0 }`, cabeçalhos `Content-Type: application/json`, `Accept: */*` e `Referer: <worker>/1:search`; usar `fetch` direto para ler o status e validar `{ data: { files[] } }` com os campos `name`, `size`, `mimeType`, `id`, `link`; verificar com testes que `data.files` vazio é ausência e `data.files` ausente é erro.
- [ ] 1.3 Implementar o uso exclusivo do worker primário e tratar `429`, `5xx` e falha de transporte como falha estrutural, sem montar stream com o link do secundário; verificar com `fetch` simulado que `200` vazio é ausência, que `429`/`5xx` sobem como erro e que o secundário não é chamado.
- [ ] 1.4 Implementar as consultas de filme (`título ano`, `título`, `originalTitle ano`) e série (`título SxxExx`, `título xxExx`, `título - episódio`, absoluto quando aplicável), com limite de seis termos não repetidos; verificar com testes que o termo de episódio é montado e que títulos repetidos não geram segunda chamada.

## 2. Validação de identidade e coordenadas

- [ ] 2.1 Implementar a normalização do nome (remoção de grupos `[...]`, pontos/underscores, tags de release e resolução) e o parser de coordenadas (`SxxExx`, `xxExx`, `Season x Episode y`, ` - NN`); verificar com fixtures que S02E01 é lido e que um nome sem coordenada é rejeitado em série.
- [ ] 2.2 Comparar o segmento de título com os títulos do TMDB por `titleSimilarity` (limiar 0,80 ou igualdade normalizada) e aplicar o ano do filme com tolerância de um ano; verificar que Boruto é rejeitado para Naruto, que S05E01 é rejeitado para S01E01 e que "A Viagem de Chihiro (2001)" é aceito.
- [ ] 2.3 Descartar arquivos sem extensão/MIME de vídeo e arquivos sem `link`; verificar com testes que `.srt`, imagem e `link` ausente não viram stream.
- [ ] 2.4 Deduplicar por `id`/caminho do `link`, limitar a cinco arquivos para filme e dois para episódio e preferir maior tamanho/qualidade; verificar com teste que o mesmo arquivo em duas consultas sai uma vez.

## 3. Contrato dos streams e URL assinada

- [ ] 3.1 Montar o host dedicado `https://animezey16082023.animezey16082023.workers.dev` + `link` preservando a query, com `buildStream`, `format` (`FORMATTER.AUTO`, `addon: 'AnimeZeY'`, título, ano, temporada, episódio e `filename`), `type` pela extensão, `provider: 'AnimeZeY'` e `size` formatado de bytes; verificar que nenhum stream tem `name`/`title` e que a URL contém o caminho `/download.aspx` e os parâmetros originais.
- [ ] 3.2 Passar `languageHints: [file.name]` e deixar a qualidade em `format.filename`; verificar que `Dual Áudio` vira `Dublado (Não PT-BR?)`, `Legendado` vira `Legendado`, nome sem idioma vira `Idioma Desconhecido` e resolução ausente vira `Desconhecida`.
- [ ] 3.3 Não usar `?a=view`, sonda `Range`, timeout, cache ou settings; verificar por inspeção do pacote gerado e por teste que nenhuma requisição extra é feita depois do `POST /1:search`.
- [ ] 3.4 Preencher `test/animezey.test.js` com filme exato, filme com ano divergente, série exata, temporada divergente, Boruto/Naruto, arquivo sem coordenada, lista vazia, `429`/`5xx` sem uso do secundário, JSON inválido, arquivo sem `link`, idioma desconhecido e qualidade desconhecida; verificar com `node --test test/animezey.test.js`.

## 4. Manifest, build e documentação do método

- [ ] 4.1 Adicionar a entrada `animezey` em `manifest.json` (`name: "AnimeZeY"`, `description`, `version: "1.0.0"`, `supportedTypes: ["movie", "tv"]`, `filename: "providers/animezey.js"`, `enabled: true`, `formats: ["mkv", "mp4"]`, `contentLanguage: ["pt"]`, `logo` https da imagem publicada no `<link rel="icon">` do worker, que respondeu `200 image/png`) e rodar `node build.js animezey`; verificar que `providers/animezey.js`, `gdrive/providers/animezey.js`, `prism/providers/animezey.js` e os `<formato>/manifest.json` foram gerados.
- [ ] 4.2 Rodar `npm run lint` e `npm test`; verificar que as suítes de manifest, catálogo e build passam com a nova entrada.
- [ ] 4.3 Adicionar a seção do método em `docs/provider-investigation.md` (índice de arquivos por API de busca, envelope `data.files`, host dedicado de download, URL assinada preservada, `?a=view` 401, busca fuzzy e o secundário que responde na busca mas falha no download), com referências a `src/animezey/` e `test/animezey.test.js`; verificar que o guia distingue o observado da hipótese.
- [ ] 4.4 Adicionar `animezey: { "exclusiveTag": "anime" }` em `test/online/profiles.json`, atualizar `revision`/`curatedAt` e confirmar ao menos cinco filmes e cinco séries com a tag `anime`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 4.5 Atualizar `providers.md` com a linha e a seção do AnimeZeY, status inicial `Não verificado` e bloco da rodada; verificar com `node --test test/providers-catalog.test.js`.

## 5. Verificação online

- [ ] 5.1 Rodar `npm run test:online -- --provider animezey` com `TMDB_API_KEY` do ambiente e registrar a rodada em `providers.md`; verificar que a saída contém data, status e casos por título, sem URLs assinadas ou chaves.
- [ ] 5.2 Conferir manualmente um filme (A Viagem de Chihiro) e um episódio (Jujutsu Kaisen S02E01) no pacote final; verificar `206 video/x-matroska` ou `video/mp4` e a presença de `size`, `quality` e `language` coerentes com o nome do arquivo.

## Workflow follow-up

- Arquivar a change somente com os testes offline e a rodada online concluídos, ou com o que ficou fora declarado em `design.md`.
