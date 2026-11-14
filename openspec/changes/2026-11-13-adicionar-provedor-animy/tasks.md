# Tasks

## 1. Estrutura e leitura da API

- [ ] 1.1 Criar `src/animy/index.js`, `src/animy/api.js` e `src/animy/extractor.js` com JSDoc, `PROVIDER_NAME = 'Animy'`, validação de entrada (`tmdbId` numérico, `mediaType` `movie`/`tv`, temporada e episódio ≥ 1 em série) e `getStreams` como única captura de erro; verificar que `node build.js animy` empacota sem erro.
- [ ] 1.2 Implementar `searchAnime(query)` em `api.js` com `GET /api/v1/animes`, `limit=24`, `offset=0`, `sort=popular`, `search`, perfil `api`, validando `{ items, total }` e os campos `id`, `t`, `kind`, `audio`, `altTitles`; verificar com teste offline que `items: []` é resposta válida e `items` ausente lança erro de estrutura.
- [ ] 1.3 Implementar `fetchAnime(id)` e `fetchEpisode(id, season, episode)` validando `kind`, `audio`, `episodes[]` (`season`, `number`) e `streams[]` (`kind`, `url`, `audio`); a rota de reprodução usa `fetch` direto para ler o `404 {"error":"episode not found"}` como ausência; verificar com fixtures reais sanitizadas em `test/fixtures/animy/` que `episodes`/`streams` fora do esquema lançam erro e `streams` vazio é ausência.

## 2. Identidade, variantes e episódio

- [ ] 2.1 Montar os termos de busca a partir de `getMediaInfo` (título PT-BR, original, alternativos, romaji com a temporada pedida), normalizar com `slugify` e limitar a oito termos; verificar com testes que "Your Name." encontra "Kimi no na wa" pelo romaji e que termos repetidos não geram segunda chamada.
- [ ] 2.2 Implementar a confirmação de candidato por `t`, `nativeTitle` e `altTitles[].title`, com `kind` obrigatório e ano apenas como desempate; verificar que um filme é descartado em pedido de série, que "Akira" é aceito apesar de `y: 2024` e que uma busca sem correspondência devolve `[]`.
- [ ] 2.3 Agrupar as entradas confirmadas por variante de áudio e resolver até quatro entradas, isolando falha com `console.warn` e agregando o erro quando nenhuma produzir stream; verificar com teste que Demon Slayer dublado + legendado devolve as duas opções e que a mesma URL não aparece duas vezes.
- [ ] 2.4 Selecionar o episódio por `season`/`number` e o filme pela primeira entrada de `episodes`; verificar com teste que S02E01 escolhe `season: 2, number: 1`, que um par não publicado devolve `[]` e que a resposta `404` com `{"error":"episode not found"}` é ausência, não erro.

## 3. Contrato dos streams

- [ ] 3.1 Montar cada stream com `buildStream`, `format` (`FORMATTER.AUTO`, `addon: 'Animy'`, título, ano, temporada, episódio e `filename` quando houver), `type` do campo `kind`, `provider: 'Animy'` e idioma a partir de `audio`; verificar que nenhum stream tem `name`/`title` e que `language` é um dos seis valores do enum.
- [ ] 3.2 Omitir `headers` e não adicionar sonda, `Range`, timeout, cache ou settings; verificar por inspeção do pacote gerado e por teste que a URL publicada sai intacta e que a qualidade fica `Desconhecida` quando não há resolução nos textos.
- [ ] 3.3 Preencher `test/animy.test.js` com filme, episódio dublado, episódio legendado, duas variantes no mesmo pedido, episódio ausente, busca vazia, `404` de ausência, `5xx`, JSON inválido e estrutura sem `items`/`episodes`/`streams`; verificar com `node --test test/animy.test.js`.

## 4. Manifest, build e documentação do método

- [ ] 4.1 Adicionar a entrada `animy` em `manifest.json` (`name: "Animy"`, `description`, `version: "1.0.0"`, `supportedTypes: ["movie", "tv"]`, `filename: "providers/animy.js"`, `enabled: true`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, `logo` https do favicon do domínio) e rodar `node build.js animy`; verificar que `providers/animy.js`, `gdrive/providers/animy.js`, `prism/providers/animy.js` e os `<formato>/manifest.json` foram gerados.
- [ ] 4.2 Rodar `npm run lint` e `npm test`; verificar que as suítes de manifest, catálogo e build passam com a nova entrada.
- [ ] 4.3 Adicionar a seção do método em `docs/provider-investigation.md` (API REST de catálogo com variantes de áudio, endpoints, ausência `404`, MP4 sem cabeçalhos, limites de qualidade e ano) com referências a `src/animy/` e `test/animy.test.js`; verificar que o guia distingue o método em uso da hipótese e que o lint de Markdown/documentação do repositório passa.
- [ ] 4.4 Adicionar `animy: { "exclusiveTag": "anime" }` em `test/online/profiles.json`, atualizar `revision`/`curatedAt` e confirmar ao menos cinco filmes e cinco séries com a tag `anime`; verificar com `node --test test/online-catalog.test.js`.
- [ ] 4.5 Atualizar `providers.md` com a linha e a seção do Animy, incluindo o status inicial `Não verificado` e o bloco da rodada; verificar com `node --test test/providers-catalog.test.js`.

## 5. Verificação online

- [ ] 5.1 Rodar `npm run test:online -- --provider animy` com `TMDB_API_KEY` do ambiente e registrar a rodada em `providers.md`; verificar que a saída contém a data, o status e os casos por título, sem URLs assinadas ou chaves.
- [ ] 5.2 Conferir manualmente um filme (Akira ou Kimi no na wa) e um episódio de série (Demon Slayer S01E01 ou Jujutsu Kaisen S01E01) no pacote final; verificar `206`/`video/mp4` e a presença de `language` coerente com o áudio publicado.

## Workflow follow-up

- Arquivar a change somente com os testes offline e a rodada online concluídos, ou com o que ficou fora declarado em `design.md`.
