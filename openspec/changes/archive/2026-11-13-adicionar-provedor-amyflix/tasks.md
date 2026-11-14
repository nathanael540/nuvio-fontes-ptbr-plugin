# Tasks

## 1. Catálogo e identidade

- [x] 1.1 Criar `src/amyflix/catalog.js` com a busca `GET /?s=<termo>` via `fetchPage`, leitura de `div.search-page`, `div.no-result` e cartões `div.result-item article` com `.title a`; verificar com fixtures de busca com resultado e de busca vazia.
- [x] 1.2 Filtrar cartões por rota (`/filme/` para filme, `/serie/` para série) e descartar `/episodio/` na busca inicial, caso apareça; verificar com fixture que mistura série e episódio.
- [x] 1.3 Implementar a limpeza do título (`Assistir`, `– Legendado`, `– Dublado`, `– Dublado e Legendado`) e a confirmação com `findBestMatch` sem ano; verificar com testes de título decorado, título ausente e dois candidatos iguais (lista vazia).
- [x] 1.4 Não usar `span.date` como ano; verificar com fixture de série antiga cuja data publicada é recente.

## 2. Episódio e players

- [x] 2.1 Para série, ler `ul.episodios li.mark-*`, extrair `div.numerando` com `(\d+)\s*-\s*(\d+)` e escolher o par exato; verificar com testes de S01E02 fora de ordem, temporada ausente e listagem ausente (erro).
- [x] 2.2 Para filme, usar a própria página `/filme/<slug>`; verificar que a página de filme não é tratada como série.
- [x] 2.3 Expandir `li.dooplay_player_option` com `POST /wp-admin/admin-ajax.php` e formulário `action=doo_player_ajax&post=<post>&nume=<nume>&type=<type>`; ignorar `data-nume` não numérico; verificar com fixtures de AJAX válido, `embed_url` vazio e JSON inválido.
- [x] 2.4 Implementar a resolução `jwplayer/?source=<valor>`: decodificar, aceitar `http(s)`, classificar `hls` por `.m3u8` e `mp4` nos demais; verificar com fixtures de HLS e MP4.
- [x] 2.5 Implementar a resolução `rumble.com/embed/<id>`: localizar `p.f["<id>"]`, ler `u.hls.url` e a maior chave de `u.ua.tar`; verificar com fixture de embed válido, sem `p.f` e com `hls.url` ausente (falha isolada).
- [x] 2.6 Descartar Google Drive, Ok.ru, Vidmoly, VK, Dailymotion, Secvideo1 e Presto por triagem; verificar que uma página só com esses hosts devolve lista vazia.

## 3. Contrato dos streams

- [x] 3.1 Montar cada stream com `buildStream`, `type` conforme a mídia, `provider` do player e `format` com título, ano, temporada e episódio; verificar `url`, `type`, `provider`, `quality` e `language` nos três formatos publicados.
- [x] 3.2 Aplicar idioma pelo rótulo (`Dublado`/`Legendado`) e omitir quando não declarado; verificar a saída do enum e a ausência de classificação inventada.
- [x] 3.3 Usar a qualidade do Rumble e `Desconhecida` no `jwplayer`; verificar que nenhum stream é descartado por qualidade ausente.
- [x] 3.4 Omitir `headers` e confirmar que a mídia Rumble responde sem `Referer`; verificar no teste que nenhum stream traz `headers`.

## 4. Testes offline

- [x] 4.1 Registrar fixtures reais sanitizadas em `test/fixtures/amyflix/`: busca com resultado, busca vazia, série, filme, AJAX `jwplayer` HLS, AJAX `jwplayer` MP4, AJAX Rumble, host não suportado e resposta inválida; substituir o `key` do Rumble por placeholder e conferir que nenhum token ou URL assinada ficou no repositório.
- [x] 4.2 Criar `test/amyflix.test.js` cobrindo filme, episódio avulso, temporada ausente, ausência, host não suportado e falha estrutural, executando o pacote gerado com `fetch` simulado; verificar com `node --test test/amyflix.test.js`.

## 5. Build, manifest e publicação

- [x] 5.1 Adicionar a entrada `amyflix` ao `manifest.json` com nome `AmyFlix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, idioma `pt` e logo HTTPS; verificar com `node -e` e com `node build.js amyflix`.
- [x] 5.2 Conferir `providers/amyflix.js`, `gdrive/providers/amyflix.js`, `prism/providers/amyflix.js` e os `<formato>/manifest.json`; verificar que os três arquivos exportam `getStreams`.
- [x] 5.3 Adicionar a linha e a seção `## AmyFlix` em `providers.md` com status `🟠 Não verificado`; verificar com `node --test test/providers-catalog.test.js`.

## 6. Documentação e verificação online

- [x] 6.1 Atualizar `docs/provider-investigation.md` com o método `jwplayer?source=` e Rumble (`p.f[...].u.hls.url`), incluindo o limite de identidade sem ano; verificar que a seção cita `src/amyflix/`, o teste e a spec.
- [x] 6.2 Rodar `npm run lint`, `npm test` e `node build.js amyflix`; corrigir qualquer falha introduzida.
- [x] 6.3 Confirmar que o catálogo de referência não tem tag `gl` nem títulos GL suficientes. Se não houver, manter o perfil generalista e registrar no `design.md` e em `providers.md` que a rodada não mede o nicho, sem classificar a fonte como `Instável` por ausência de títulos fora do nicho. Se a curadoria de cinco títulos GL por tipo for adicionada, criar `amyflix: { "exclusiveTag": "gl" }` em `test/online/profiles.json` e validar com `node --test test/online-catalog.test.js`.
- [x] 6.3.1 Executar `npm run test:online -- --provider amyflix` com `TMDB_API_KEY` apenas no ambiente e o pacote já construído; registrar a rodada em `providers.md`.
- [x] 6.4 Ajustar o status conforme o resultado e registrar como limitação qualquer título ou host sem resolução; verificar com `node --test test/providers-catalog.test.js`.

## Workflow follow-up

- Arquivar a mudança depois que os testes previstos passarem ou que as exclusões estiverem declaradas.
- Conferir o resultado arquivado em `openspec/specs/amyflix-catalog/spec.md`.
