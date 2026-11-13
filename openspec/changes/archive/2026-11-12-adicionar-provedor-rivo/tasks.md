# Tasks

## 1. Estrutura do provedor, manifest e catálogo

- [x] 1.1 Criar `src/rivo/index.js` no contrato do app, com `PROVIDER_NAME = 'RIVO'`, chamada a `extractStreams`, `sortByQuality`, captura única em `getStreams`, `console.error('[RIVO] ...')` e retorno `[]` em falha. Verificação: o arquivo exporta `getStreams` e não contém `name`/`title` de stream.
- [x] 1.2 Criar `src/rivo/extractor.js` com validação de `tmdbId` numérico positivo, `mediaType` `movie`/`tv` e, em série, temporada e episódio inteiros a partir de 1 antes de qualquer rede; entrada inválida lança `Entrada: ...`. Verificação: `npm run lint` passa em `src/rivo/` e não há APIs do Node nem rede no carregamento.
- [x] 1.3 Acrescentar a entrada `rivo` ao fim de `manifest.json`, versão `1.0.0`, nome `RIVO`, `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8", "mp4"]`, `contentLanguage` `["pt"]`, descrição em pt-BR e logo `https` do favicon do domínio. Verificação: `node --test test/manifest.test.js` passa.
- [x] 1.4 Acrescentar a linha e a seção `## RIVO` em `providers.md` com status inicial `🟠 Não verificado`, tipos `filme, série`, formato `HLS, MP4` e `—` na última verificação. Verificação: `node --test test/providers-catalog.test.js` passa.

## 2. API do player e distribuição por servidores

- [x] 2.1 Implementar `GET https://f.rivo.st/api/servers?v=7` com `fetchJson` do bloco `http`, perfil `api` e `Referer: https://f.rivo.st/`; validar `servers` em array e cada item com `id` e `label`. Verificação: teste com fixture de servidores devolve a lista e resposta sem `servers` lança erro de contrato.
- [x] 2.2 Implementar a consulta de fontes por ID: filme em `/api/source/movie/<tmdbId>?server=<id>` e série em `/api/source/tv/<tmdbId>?s=<temporada>&e=<episódio>&server=<id>`, com query montada por `URLSearchParams(...).toString()`. Verificação: testes de filme e série conferem caminho, `s`, `e` e `Referer` em cada chamada.
- [x] 2.3 Consultar todos os servidores publicados, exceto o servidor `4`, em paralelo com captura individual; concatenar os resultados na ordem da lista. Verificação: teste garante que `server=4` não é chamado e que os streams mantêm a ordem dos servidores, não a ordem de resposta.
- [x] 2.4 Distinguir ausência de falha por servidor: `sources` vazio é ausência; HTTP/JSON/estrutura inválida gera aviso e não interrompe os demais; se nenhum stream sair e ao menos um servidor falhar, lançar erro agregado com o estado de cada servidor. Verificação: testes de servidor vazio, falha isolada e todos os servidores falhando conferem streams e logs.

## 3. Fontes, qualidade, idioma e legendas

- [x] 3.1 Filtrar `kind` `hls`/`mp4`, aceitar somente URL HTTP(S), descartar `dash` por triagem, tratar fonte suportada malformada como falha com aviso e deduplicar por URL. Verificação: testes de fonte HLS, MP4, `dash`, URL inválida, item sem `url` e URL repetida.
- [x] 3.2 Passar `qualityHints: [source.quality]` ao `buildStream`, sem `quality` explícita, para normalizar `1080p (...)`, `1080p Pure Studio Master (...)` e `Auto` (esta como `Desconhecida`). Verificação: teste confere `quality` dos streams e que título/ano não viram qualidade.
- [x] 3.3 Implementar a tabela de idioma do primeiro parêntese final do rótulo: `Brazilian Portuguese` → `Dublado`; `Portuguese` → `Dublado (Não PT-BR?)`; `Portuguese sub` → `Legendado (Não PT-BR?)`; `Brazilian Portuguese sub` → `Legendado`; idioma estrangeiro → `Gringo`; rótulo técnico ou ausente → `Idioma Desconhecido`. Verificação: teste cobre cada caso e confere que a saída pertence ao enum `LANGUAGE`.
- [x] 3.4 Montar legendas do mesmo servidor da fonte: `direct === true` usa a URL; caso contrário usa `https://f.rivo.st/api/subtitle?url=<url codificada>`; `language` recebe o `label`; item sem URL/idioma é descartado com aviso e URL repetida é deduplicada. Verificação: testes de legenda direta, intermediada, repetida, ausente e malformada.
- [x] 3.5 Montar cada stream com `buildStream`, `format` (`FORMATTER.AUTO`, `addon` `RIVO`, título, ano, temporada e episódio), `type` igual ao `kind`, `provider` igual a `subProvider`/rótulo do servidor e `language` somente quando a tabela concluir. Verificação: teste confere `name`/`title` gerados, `format`, `type`, `provider`, `language` e ordenação por qualidade.

## 4. Metadados, ausência, falhas e logs

- [x] 4.1 Buscar `GET https://f.rivo.st/api/meta/movie/<tmdbId>` ou `/api/meta/tv/<tmdbId>` em paralelo com os servidores; usar `title` e `year` no `format`; em falha, registrar aviso e seguir sem título/ano. Verificação: testes de metadados de filme, de série e de metadados indisponíveis com streams preservados.
- [x] 4.2 Garantir que ausência reconhecida (todos os servidores com `sources` vazio ou somente triagem por `kind`) devolve `[]` sem `console.error`; falha da lista de servidores, contrato inválido ou todas as opções falhando sobe até `getStreams`, que registra `[RIVO] ...` e devolve `[]`. Verificação: testes de ausência, falha de contrato e falha agregada conferem `logs`.
- [x] 4.3 Garantir que entrada inválida devolve `[]` sem `fetch` e com log de entrada; `tmdbId` não numérico ou zero, tipo fora de `movie`/`tv` e série sem temporada/episódio válidos. Verificação: teste confere `calls.length === 0` e prefixo `[RIVO]` com `Entrada:`.
- [x] 4.4 Sanitizar avisos e erros: nenhuma URL de mídia, assinatura, token ou hash nas mensagens; nenhuma URL assinada em fixture ou documentação. Verificação: captura de logs dos testes não contém `m3u8`, `Policy=`, `Signature=`, `Key-Pair-Id=` nem hash hexadecimal longo.

## 5. Fixtures e suíte do provedor

- [x] 5.1 Criar `test/fixtures/rivo/servers.json`, `source-movie.json`, `source-tv.json`, `source-empty.json`, `source-dash.json`, `source-malformed.json`, `source-duplicates.json`, `meta-movie.json` e `meta-tv.json`, com hosts e URLs de mídia fictícios, sem `Policy`, `Signature`, `Key-Pair-Id`, token ou URL real. Verificação: os arquivos existem e uma inspeção textual não encontra `http` para hosts reais de mídia.
- [x] 5.2 Criar `test/rivo.test.js` empacotando `src/rivo/` com `buildProvider` nos formatos `gdrive` e `prism`, executando o pacote em `vm` com `fetch` simulado e conferindo filme, série, ausência, falha isolada, todas as falhas, resposta inválida, triagem, idioma, legendas, metadados, deduplicação, ordenação e contrato completo. Verificação: `node --test test/rivo.test.js` passa.
- [x] 5.3 Conferir que o pacote não faz rede no carregamento, não usa `AbortController`, `Promise.allSettled`, `setTimeout` ou APIs do Node, e que a consulta usa `Referer` do player e não chama o servidor `4`. Verificação: o teste de carregamento e o de servidores cobrem essas condições.

## 6. Documentação do método

- [x] 6.1 Atualizar `docs/provider-investigation.md` com a subseção “API de player que aceita o ID do TMDB e distribui a consulta por servidores”: situação em uso, endpoints, campos, referências a `src/rivo/extractor.js` e `test/rivo.test.js`, e limites (servidor 4, URL efêmera, rótulos incompletos e ausência de sondagem). Verificação: a subseção distingue método em uso de hipótese, não contém URL de mídia real e está na seção de APIs/players.
- [x] 6.2 Conferir que `docs/arch.md`, `src/_blocks/index.md` e `README.md` não precisam mudar: nenhum contrato global, bloco ou comando novo. Verificação: `git diff -- docs/arch.md src/_blocks/index.md` está vazio.

## 7. Build, validação e verificação online

- [x] 7.1 Rodar `node build.js rivo` e conferir `providers/rivo.js`, `gdrive/providers/rivo.js`, `prism/providers/rivo.js` e os três manifests de formato. Verificação: o build termina com código 0 e cada pacote exporta `getStreams`.
- [x] 7.2 Rodar `npm run lint` e `node --test test/rivo.test.js test/manifest.test.js test/providers-catalog.test.js`; depois rodar `npm test` e comparar com a linha de base atual (24 falhas por `test/maestro/` e `test/scenarios/` ausentes). Verificação: lint e os testes do provedor passam; `npm test` não ganha novas falhas.
- [x] 7.3 Quando `test/maestro/` e `test/scenarios/` estiverem presentes no checkout, adicionar o cenário e o fluxo Maestro do RIVO e atualizar a contagem do inventário; se continuarem ausentes, registrar a pendência no design e não recriar a infraestrutura nesta mudança. Verificação: `node --test test/scenario-inventory.test.js` passa quando a infraestrutura existe.
- [x] 7.4 Rodar `npm run test:online -- --provider rivo` com o pacote final. Verificação: o runner conclui a rodada e grava `test/artifacts/online/<run-id>/result.json`.
- [x] 7.5 Atualizar a seção do RIVO em `providers.md` com a rodada real: data, ID, status, versão do pacote, perfil, catálogos, semente, algoritmo e os cinco casos de filme e os cinco de série. Verificação: `node --test test/providers-catalog.test.js` passa e a tabela reflete a mesma rodada.
- [x] 7.6 Conferir que `providers/`, `gdrive/` e `prism/` foram gerados pelo build, sem edição manual, e que o diff final contém somente os arquivos previstos. Verificação: `git diff --stat` e `git status --short` não mostram edição manual em saídas geradas.

## Workflow follow-up

- Arquivar a mudança depois da revisão e da evidência online registrada.
- Verificar o resultado arquivado em `openspec/changes/archive/`.
