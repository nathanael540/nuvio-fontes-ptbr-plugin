# Tasks

## 1. Estrutura, manifest e perfil

- [x] 1.1 Criar `src/topanimes/` com `index.js`, `extractor.js`, `catalog.js` e `players.js`.
- [x] 1.2 Registrar `topanimes` em `manifest.json` com `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8", "mp4"]` e versão `1.0.0`.
- [x] 1.3 Adicionar `topanimes` a `test/online/profiles.json` com `exclusiveTag: "anime"`.
- [x] 1.4 Adicionar a linha e a seção inicial em `providers.md` com status `🟠 Não verificado`.

## 2. Busca e identidade

- [x] 2.1 Implementar `buildSearchTerms` com título PT-BR, original, alternativos e romaji, priorizando romaji da temporada.
- [x] 2.2 Implementar a busca `GET /?s=<termo>` e a leitura de `article` com `.title a`, `.year` e tipo pela rota.
- [x] 2.3 Implementar `cleanTitle` para `Dublado`, `Legendado`, `(TV)`, `(CAM-RIP)`, `Online`, `Filme` e sufixos de temporada.
- [x] 2.4 Implementar a confirmação por tipo, similaridade ≥ 0,88, prefixo em série e ano da temporada com tolerância de um.
- [x] 2.5 Implementar a confirmação final pelo `h1` da ficha e o descarte de ficha 404.

## 3. Episódios

- [x] 3.1 Implementar `selectEpisode` pelo par `temporada - episódio` de `.numerando`.
- [x] 3.2 Implementar a numeração absoluta por `.epnumber` com a soma de `episodeCount` das temporadas anteriores.
- [x] 3.3 Implementar a exceção de página que declara a temporada no título.
- [x] 3.4 Usar sempre o `href` publicado e tratar par ausente como ausência.

## 4. Opções e players

- [x] 4.1 Ler `li.dooplay_player_option` e o iframe de `#source-player-<nume>`, descartando o trailer.
- [x] 4.2 Resolver Booonceivu JSON com HLS, mapa SD/LD/FD e legendas VTT.
- [x] 4.3 Resolver Booonceivu Zuplay com jwplayer e MP4 assinado.
- [x] 4.4 Resolver o wrapper `/antivirusN` com jwplayer e HLS.
- [x] 4.5 Resolver Blogger com `blogger-video` e `User-Agent` na reprodução.
- [x] 4.6 Resolver Ruplay/IncVideo (`csst.online`, `fsst.online`, `incvideo*.online`) com limpeza do sufixo `&poster=` malformado, `Playerjs/file` multi-qualidade e `Referer` da origem final.
- [x] 4.7 Resolver Filemoon/Byse com `api/videos/<código>/`, decifragem AES-256-GCM local, fontes HLS de `sources` e legendas de `tracks`.
- [x] 4.8 Tratar KojimaCDN com `file` vazio, VidGuard, StreamWarp, Streamtape, MixDrop, AON, Tera, Abyss, UP, `doflix.net` e `api.anivideo.net` como triagem.
- [x] 4.9 Isolar cada opção com `console.warn` e subir erro agregado quando todas falharem.

## 5. Streams e testes offline

- [x] 5.1 Montar todo stream com `buildStream` e `format`, sem `name`/`title`, deduplicando por URL e qualidade.
- [x] 5.2 Classificar `Dublado` pelo título, `Legendado` por legenda PT em página não dublada e preservar legendas.
- [x] 5.3 Criar fixtures sanitizadas de busca, ficha de filme, ficha de série, episódio, Booonceivu JSON, Booonceivu HTML, Blogger, `/antivirus`, Ruplay (`Playerjs`) e Filemoon (`playback` válido e inválido).
- [x] 5.4 Criar `test/topanimes.test.js` cobrindo filme, série por `numerando`, série por numeração absoluta, ausência, busca sem resultado, estrutura inválida, triagem, falha isolada, erro agregado, `/aviso/` com `&poster=` malformado, Ruplay multi-qualidade, Filemoon decifrado e playback inválido.
- [x] 5.5 Rodar `npm run lint` e `npm test`.

## 6. Build e documentação

- [x] 6.1 Rodar `node build.js topanimes` e conferir os três pacotes gerados.
- [x] 6.2 Atualizar `docs/provider-investigation.md` com o método de DooPlay com `.numerando`, Ruplay/IncVideo, Filemoon/Byse, hosts mistos e limites.
- [x] 6.3 Revisar `providers.md` e `README.md` se necessário.

## 7. Verificação online

- [x] 7.1 Rodar `npm run test:online -- --provider topanimes --seed 163f594d3926f0441149e54b4b4d35eb --record` com `TMDB_API_KEY` do ambiente.
- [x] 7.2 Registrar a rodada em `providers.md` com `--record` se a execução concluir.
- [x] 7.3 Arquivar a mudança com a rodada de 19/11/2026 em `Estável` (movie 2/5, tv 4/5), sincronizando a spec e registrando os casos sem resultado como ausência de acervo na amostra.

## 8. Commit

- [x] 8.1 Commitar com `feat(topanimes): adiciona provedor TopAnimes` e `OpenSpec: add-topanimes`.
- [x] 8.2 Conferir a árvore limpa.
