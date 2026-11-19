# Tasks

## 1. Estrutura, origem e manifest

- [x] 1.1 Criar `src/superanimes/index.js`, `src/superanimes/api.js`, `src/superanimes/text.js`, `src/superanimes/catalog.js`, `src/superanimes/episodes.js` e `src/superanimes/extractor.js` a partir do contrato de `src/_template/`, com `PROVIDER_NAME = 'Super Animes'` e a captura única em `getStreams`.
- [x] 1.2 Confirmar que a implementação não copia código de terceiros e que toda a cadeia veio da observação das duas URLs públicas e da documentação do repositório.
- [x] 1.3 Adicionar a entrada `superanimes` ao `manifest.json` com nome `Super Animes`, versão `1.0.0`, autor `nathanael540`, `supportedTypes: ["movie", "tv"]`, `formats: ["mp4"]`, `contentLanguage: ["pt"]`, `enabled: true`, `filename: "providers/superanimes.js"`, descrição em pt-BR e logo `https://www.google.com/s2/favicons?domain=animestvs.org&sz=128`.
- [x] 1.4 Rodar `node build.js superanimes` e confirmar que `providers/superanimes.js`, `gdrive/providers/superanimes.js`, `prism/providers/superanimes.js` e os `<formato>/manifest.json` são gerados sem erro; não editar os arquivos gerados à mão.

## 2. Transporte e catálogo

- [x] 2.1 Implementar `fetchCatalog` e `fetchEpisodeList` com `fetchJson`, `profile: 'api'`, sem timeout, retentativa, cache ou credencial.
- [x] 2.2 Validar o envelope como lista JSON em todas as três rotas; HTTP fora de 2xx, corpo não JSON ou objeto no lugar da lista é erro, nunca ausência.
- [x] 2.3 Ler `titulo`, `audio`, `tipo`, `episodios` e `ano` do catálogo; normalizar `audio` minúsculo e ignorar entradas sem áudio reconhecido.
- [x] 2.4 Verificar que `GET /animes?titulo=` é exato, não substring, e que a seleção local sobre o catálogo completo é necessária para arcos e temporadas.

## 3. Identidade de filme e série

- [x] 3.1 Remover o sufixo `(Dublado)`/`(Legendado)` antes de comparar os títulos, preservando o áudio da entrada.
- [x] 3.2 Implementar a seleção de filme por exatamente um episódio, similaridade mínima e ano dentro de um; escolher uma entrada por áudio, com o ano exato como desempate.
- [x] 3.3 Implementar a identidade de série por prefixo do título do TMDB ou similaridade mínima de 0,85, excluindo derivados que apenas contêm o nome da obra.
- [x] 3.4 Verificar com testes: filme dublado e legendado, filme de outro ano, filme sem entrada, série na temporada 1, derivado com o nome da obra no meio e áudio minúsculo.

## 4. Temporada, partes e episódio

- [x] 4.1 Implementar a temporada 1 pela entrada de base, com desempate por similaridade e pela contagem mais próxima da temporada do TMDB.
- [x] 4.2 Implementar temporadas acima de 1 pelo marcador explícito (`Season N`, `Nth Season`, `Temporada N`, `Nª Temporada` e número final), pelo romaji específico da temporada e pelo romaji de arco sem número com ano compatível.
- [x] 4.3 Não ler como temporada um marcador que já faz parte do título do TMDB (`Koori no Jouheki 2nd Season`).
- [x] 4.4 Ordenar as partes por `Part N` e ano, descontar a contagem de cada parte e localizar o episódio pedido.
- [x] 4.5 Implementar a numeração absoluta sobre a entrada que publica a série inteira quando a temporada não tem entrada própria.
- [x] 4.6 Implementar o episódio pelo rótulo `Episódio NNN` ou `Filme`; linha ausente é ausência e `link_video` inválido é falha da opção.
- [x] 4.7 Verificar com testes: temporada por romaji específico, por marcador explícito, por parte acumulada, por numeração absoluta, com número final, com marcador no nome da obra e com buraco de numeração.

## 5. Qualidade, áudio e streams

- [x] 5.1 Mapear `fullhd` para `1080p`, `hd3`/`hd2` para `720p` e `iphoneb` para `420p`; deixar `like`, `thunder3` e caminhos sem diretório como `Desconhecida`.
- [x] 5.2 Confirmar a resolução dos diretórios nos arquivos publicados com `Range` mínimo e leitura de `tkhd`, sem baixar mídia e sem registrar URLs.
- [x] 5.3 Mapear `Dublado`/`dublado` para `LANGUAGE.DUBBED` e `Legendado`/`legendado` para `LANGUAGE.SUBTITLED`, sem supor idioma pelo título.
- [x] 5.4 Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'Super Animes'`, título, ano e coordenadas), `type: 'mp4'`, `provider: 'AnimesTVS'`, sem `name`, `title` ou cabeçalhos.
- [x] 5.5 Deduplicar por URL exata e ordenar com `sortByQuality` no ponto de entrada.
- [x] 5.6 Verificar com testes: `fullhd`, `hd2`, `hd3`, `iphoneb`, `like`, filme com URL duplicada, dois áudios e `name`/`title` gerados pelo formatador.

## 6. Erros e fronteira

- [x] 6.1 Implementar a captura única em `getStreams`, com `console.error('[Super Animes] Falha em <tipo> <id>: <causa>')` e retorno de lista vazia.
- [x] 6.2 Validar `mediaType` em `movie`/`tv` e exigir `season`/`episode` inteiros a partir de 1 em série antes de qualquer requisição; filme ignora as coordenadas.
- [x] 6.3 Isolar cada áudio com `console.warn('[Super Animes] Opção <áudio> <título> descartada: <causa>')`; se nada produzir stream e algum falhar, lançar erro agregado; se todos forem ausência, devolver lista vazia.
- [x] 6.4 Verificar com testes: catálogo com HTTP 500, catálogo fora do esquema, catálogo não JSON, uma lista de episódios falhando, as duas falhando, uma lista fora do esquema, `link_video` inválido e episódio ausente.
- [x] 6.5 Confirmar que não há `AbortController`, `setTimeout`, `setInterval`, retentativa, cache ou sonda de mídia no código do provedor.

## 7. Fixtures e suíte offline

- [x] 7.1 Criar `test/fixtures/superanimes/` com catálogo sanitizado de 40 entradas e listas de episódios cobrindo filmes, série na temporada 1, temporadas por romaji/marcador/parte, numeração absoluta, áudio ausente, duplicata e `link_video` inválido.
- [x] 7.2 Substituir hosts de mídia por `cdn.example` e remover qualquer cookie, token, URL assinada ou dado pessoal; verificar que nenhuma fixture contém URL de mídia real.
- [x] 7.3 Criar `test/superanimes.test.js` com `buildProvider` em diretório temporário e `fetch` simulado, cobrindo identidade, temporada, episódio, streams, deduplicação, ordenação e erros.
- [x] 7.4 Confirmar que os testes exercitam o pacote gerado, não só o código-fonte, e que as asserções verificam `url`, `quality`, `language`, `type`, `provider`, `name` e `title`.

## 8. Documentação e perfil

- [x] 8.1 Adicionar em `providers.md` a linha com `Super Animes`, ID em crase, tipos `filme, série`, formato `MP4`, status `🟠 Não verificado` e data `—`, além da seção `## Super Animes` com `**Status: 🟠 Não verificado.**`.
- [x] 8.2 Atualizar `docs/provider-investigation.md` com a seção “Catálogo JSON completo e listas de episódios por áudio”, marcada como em uso no Super Animes, com as três rotas, a seleção local, a temporada por marcador/romaji/parte/numeração, a qualidade pelo diretório e os limites.
- [x] 8.3 Adicionar `superanimes` a `test/online/profiles.json` com `exclusiveTag: "anime"` e revisão nova.
- [x] 8.4 Revisar `README.md`, `docs/arch.md`, `docs/tests.md`, `test/README.md` e `src/_blocks/index.md`; alterar somente se o novo provedor mudar uma lista, convenção ou regra global.
- [x] 8.5 Confirmar que nenhum bloco novo foi criado e que `src/_blocks/index.md` permanece inalterado.

## 9. Build e validação

- [x] 9.1 Rodar `npm run lint` e corrigir qualquer violação do perfil de runtime, sem desativar regra do lint.
- [x] 9.2 Rodar `npm test` e confirmar que as suítes de provedores, manifest, catálogo, build, servidor e infraestrutura online passam.
- [x] 9.3 Rodar `node build.js superanimes` e confirmar o build nos três formatos, sem editar os arquivos gerados manualmente.
- [x] 9.4 Rodar `node --test test/superanimes.test.js`, `test/manifest.test.js`, `test/providers-catalog.test.js` e `test/online-catalog.test.js`; registrar no `design.md` qualquer exclusão ou caso não coberto.
- [x] 9.5 Conferir que `providers/superanimes.js` não usa `async`/`await` no arquivo final e que exporta apenas `getStreams`.

## 10. Verificação online e workflow

- [x] 10.1 Executar `node build.js superanimes` imediatamente antes da rodada para que o pacote avaliado seja o final.
- [x] 10.2 Rodar `npm run test:online -- --provider superanimes --record` com `TMDB_API_KEY` apenas no ambiente local, perfil `anime`, e conferir a seção gerada em `providers.md`.
- [x] 10.3 Atualizar o status e a data em `providers.md` conforme os critérios de `docs/tests.md`; a rodada de 2026-11-19 resolveu 5/5 filmes e 5/5 séries e o status ficou `🟢 Estável`.
- [x] 10.4 Arquivar a mudança somente com os testes previstos passando e a rodada online registrada; `openspec validate add-superanimes --strict` passou.
- [x] 10.5 Preparar o commit `feat(superanimes): adiciona provedor Super Animes`, com o corpo `OpenSpec: add-superanimes`, incluindo `src/superanimes/`, `providers/`, `gdrive/providers/`, `prism/providers/`, `manifest.json`, `providers.md`, `docs/provider-investigation.md`, `test/superanimes.test.js`, `test/fixtures/superanimes/`, `test/online/profiles.json` e `openspec/changes/archive/2026-11-19-add-superanimes/`.
- [x] 10.6 Conferir que o commit não inclui arquivos gerados fora da mudança, `test/artifacts/`, chaves, tokens ou URLs de mídia.
