# Design

## Context

Ver `proposal.md` para a motivação. As observações abaixo foram feitas em 13/11/2026 (BRT), entre 02:47Z e 03:04Z de 14/11/2026, contra `https://anibunker.com`; URLs assinadas, tokens de mídia e cookies não são registrados aqui.

1. `anibunker.net` não resolve (NXDOMAIN). `https://anibunker.com/` respondeu HTTP 200 com `text/html`.
2. A busca é `POST https://anibunker.com/php/search.php` com formulário `query=<termo>` e cabeçalhos de AJAX. Respondeu HTTP 200 com `Content-Type: text/html` e corpo JSON, por exemplo `[{"name":"Jujutsu Kaisen","url":"jujutsu-kaisen"}, ...]`. Não houve CSRF, cookie ou token.
3. A página `/anime/<slug>` respondeu HTTP 200 e publicou `h1`, `Ano`, `Formato` (`Anime` ou `Filme`) e `Adicionados: N legendado e M dublado`. A página de Jujutsu Kaisen listou 24 episódios em links `-episodio-<n>-legendado`; a lista dublada exige o formulário `POST /anime/<slug>#episodes` com `type=0`, mas a URL `-episodio-<n>-dublado` respondeu HTTP 200 diretamente.
4. A página do episódio respondeu HTTP 200 e publicou `data-video-id` e botões `data-player-id`: `token` (YTube), `url_drive` (Gdrive), `url_hd`/`url_hd_2`/`url_hd_3`, `sendvid` e, em alguns episódios, `url_mega`.
5. `POST https://anibunker.com/php/loader.php` com `player_id` e `video_id` respondeu HTTP 200 `application/json` com `{success:true,url}`. O `Origin` do catálogo é obrigatório: sem ele, a resposta é HTTP 403 com `{"success":false,"message":"Access denied."}`, mesmo com `Referer` e cookie. `url_mega` foi descartado por impossibilidade de reprodução direta.
6. O player `token` abre `https://www.blogger.com/video.g?token=AD6v5d<token>`, que respondeu HTTP 200 `text/html` com `WIZ_global_data` e `streamingData.formats` (itags 18 e 22, MP4 progressivo). Não foi necessário `batchexecute`. A URL `googlevideo.com/videoplayback` respondeu HTTP 206 `video/mp4` com assinatura `ftyp` quando enviado `Referer: https://www.blogger.com/`; sem esse cabeçalho respondeu HTTP 403.
7. O player `url_drive` entregou um identificador; `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t` respondeu HTTP 206 `video/mp4` com `ftyp`, sem cabeçalhos especiais.
8. `url_hd` entregou MP4 em CDN (`rumble.cloud`) que respondeu HTTP 206 `video/mp4`; `url_hd_2` entregou HLS (`index.m3u8`) que respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U`. Ambos responderam sem `Referer`.
9. O player `sendvid` entregou um embed que respondeu HTTP 200 `text/html` com `<source type="video/mp4">`; o MP4 respondeu HTTP 206 `video/mp4` sem cabeçalhos especiais.
10. O filme "Kimi no Na wa." publicou `1 legendado e 1 dublado` e uma entrada `-episodio-1-legendado`; a URL `-episodio-1-dublado` também respondeu HTTP 200. "Akira" publicou `0 legendado e 1 dublado`. O carregador devolveu MP4 para o filme.
11. O site não expôs limite de tempo ou cabeçalho de sessão nas rotas testadas. A ausência de um player é ausência da opção; uma URL de mídia inválida é falha da opção.
12. A busca do TMDB já expõe títulos romaji e a temporada de cada variante; "Kimi no Na wa." e os arcos de Demon Slayer foram encontrados por esses títulos.

## Goals / Non-Goals

**Goals:**

1. Confirmar título, ano, formato e temporada antes de resolver a mídia, sem aceitar o primeiro resultado parecido.
2. Selecionar o episódio pelo número e pela faixa de áudio anunciada, com dublado e legendado como opções independentes.
3. Resolver Blogger, Google Drive, players HD e Sendvid como opções isoladas; descartar Mega por triagem.
4. Preservar o contrato de streams, a captura única de erros e a testabilidade offline.

**Non-Goals:**

1. Usar `batchexecute`, cookies ou sessão do Blogger; o HTML do player já publica `streamingData` nos exemplos.
2. Sondar mídia, baixar playlists ou medir qualidade; a qualidade vem de itag ou rótulo já obtido.
3. Implementar `audioPreference`, `minQuality`, `qualityFallback`, timeout, retentativa com pausa ou cache.
4. Mapear temporadas contínuas do TMDB que a fonte dividiu em páginas sem relação explícita, como os 59 episódios de Jujutsu Kaisen.
5. Cobrir players externos que não entregam mídia direta ou embed legível.

## Decisions

### D1. Domínio canônico, busca e confirmação

1. Usar `https://anibunker.com` como base; `anibunker.net` fica fora.
2. Consultar a busca com `fetchJson` do bloco `http`, `method: 'POST'`, `profile: 'api'` e `form: { query }`, aceitando JSON mesmo com `Content-Type: text/html`; o bloco apenas interpreta o corpo.
3. Montar as consultas na ordem: título PT-BR, título original, alternativos brasileiros e títulos romaji. Para série com temporada maior que 1, priorizar o romaji cuja temporada é a pedida e, depois, `título + nome da temporada do TMDB`.
4. Usar `titleSimilarity`/`findBestMatch` para ordenar os candidatos e abrir no máximo quatro páginas. Confirmar a página por `h1`, ano e `Formato`; para série, exigir marcador de temporada compatível no título/romaji ou a temporada declarada na página. Sem marcador, só aceitar a temporada 1 quando o título base for compatível.
5. Alternativas descartadas:
   1. Usar `anibunker.net`: domínio inexistente.
   2. Integrar AniList/Kitsu como a proposta original: chamadas e timeouts adicionais sem ganho, porque `getMediaInfo` já entrega romaji e temporada.
   3. Aceitar o primeiro resultado: a busca devolve arcos e temporadas com o mesmo título base.

### D2. Episódio, temporada e áudio

1. Validar `season` e `episode` como inteiros positivos quando `mediaType` for `tv`.
2. Ler a contagem `N legendado e M dublado` da página do anime. Para série, uma faixa só é viável quando `N >= episode` ou `M >= episode`. Para filme, basta a contagem ser maior que zero.
3. Montar a URL `<slug>-episodio-<episode>-<audio>` e buscar a página; HTTP 404 é ausência daquela faixa; HTTP 2xx sem `data-video-id` ou sem player é falha daquela opção.
4. Para filme, usar sempre `episode = 1` e as faixas anunciadas; não exigir temporada.
5. Alternativa descartada: trocar a lista via `POST /anime/<slug>` com `type=0`; a URL direta com o sufixo de áudio respondeu 200 e é mais simples.

### D3. Resolução dos players

1. Cada `data-player-id` é uma opção independente. A busca do `video_id` e a chamada do carregador são compartilhadas; a falha de um player não interrompe os demais. O carregador recebe `Origin: https://anibunker.com`; sem esse cabeçalho responde HTTP 403 e nenhuma opção resolve.
2. `token`: exigir `success:true`, montar `https://www.blogger.com/video.g?token=AD6v5d<token>` e ler os MP4 progressivos de `streamingData.formats`. Extrair URLs `googlevideo.com/videoplayback`, desescapar `\u003d`, `\u0026`, `\&quot;` e `\"`, agrupar por `itag` e mapear 18→360p, 22→720p, 37→1080p e 59→480p; itag desconhecido fica sem qualidade. Não usar `adaptiveFormats` para não devolver vídeo sem áudio.
3. `url_drive`: montar `https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t`, tipo MP4, qualidade desconhecida.
4. `url_hd*`: aceitar a URL absoluta do carregador; `.m3u8` no caminho define HLS, o restante define MP4. A qualidade vem do rótulo `HD` (720p), `FHD` (1080p) ou `SD` (480p); `HD+`, `HD 2` e `HD 3` contam como HD.
5. `sendvid`: o carregador pode devolver o MP4 direto (com assinatura) ou o embed; no embed, extrair o primeiro `<source src="..." type="video/mp4">` (ou `og:video` quando o `<source>` não existe). Tipo MP4 e qualidade desconhecida. Sem mídia, a opção falha. O mesmo embed pode aparecer em `url_hd_3`; nesse caso, seguir o embed em vez de tratar a URL como MP4.
6. `url_mega`: descartar por triagem, sem aviso de falha.
7. Player desconhecido: aceitar somente URL absoluta HTTP(S) de mídia direta; embed sem `<source>`/`og:video` falha com aviso.
8. Alternativas descartadas:
   1. `batchexecute`: não foi necessário; exigiria cookies e sessão, aumentando a fragilidade.
   2. Sonda `Range` por player: a resposta do carregador e a extensão já distinguem MP4 de HLS nos exemplos; a sonda não é padrão do repositório.
   3. Retornar apenas o melhor itag: perderia as opções 360p/720p que o player publica.

### D4. Streams, qualidade e idioma

1. Montar cada stream com `buildStream`:
   1. `url` da mídia.
   2. `format: { template: FORMATTER.AUTO, addon: 'AniBunker', title: media.title, year: media.year }`, acrescentando `season` e `episode` em série.
   3. `provider` com o rótulo do player (`YTube`, `Gdrive`, `HD+`, `Sendvid` etc.).
   4. `type: 'mp4'` ou `'hls'`.
   5. `language` `Dublado`/`Legendado` conforme o sufixo da página; sem áudio reconhecido, omitir e deixar a descoberta local.
   6. `qualityHints` com o itag/rótulo quando houver; sem dica, o bloco decide e preserva `Desconhecida`.
   7. `headers` somente no Blogger: `playbackHeaders('https://www.blogger.com/')`; Drive, HD e Sendvid responderam sem cabeçalhos.
2. Deduplicar por URL e ordenar com `sortByQuality` no ponto de entrada.
3. Se todas as opções falharem e nenhuma produzir stream, lançar erro com a causa de cada uma; se nenhuma faixa de áudio for anunciada ou o episódio não existir, devolver lista vazia.

### D5. Erros

1. Entrada inválida, TMDB, busca e página do anime são fatais; a página do episódio e cada player são opções isoladas.
2. `getStreams` captura tudo, registra `[AniBunker] ...` e devolve `[]`.
3. HTTP 404 de uma faixa de áudio é ausência; HTTP 5xx, JSON inválido ou HTML sem a estrutura esperada é falha.

### D6. Testes, build e documentação

1. Fixtures reais sanitizadas em `test/fixtures/anibunker/`: busca com resultado, busca vazia, página de série com duas faixas, página de filme, página de episódio dublado e legendado, respostas do carregador para token/Drive/HD/Sendvid/Mega, página do Blogger com itags 18/22 (URLs de mídia substituídas por placeholders), embed Sendvid e estruturas inválidas.
2. Casos em `test/anibunker.test.js`: filme (Kimi no Na wa), série S01E01 dublada e legendada, temporada posterior, áudio ausente, `url_mega` descartado, um player falhando, todos falhando, busca vazia e JSON inválido.
3. Manifest: `id` `anibunker`, nome `AniBunker`, versão `1.0.0`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `pt` e logo HTTPS.
4. Verificação online: perfil `anime` em `test/online/profiles.json`; a rodada usa os catálogos existentes. Status inicial `🟠 Não verificado`.
5. Documentação: atualizar `providers.md` e `docs/provider-investigation.md` com o método “busca PHP + carregador de players + token do Blogger”, citando `src/anibunker/`, os testes e a spec. Nenhum bloco novo é necessário.

## Risks / Trade-offs

1. **Token do Blogger e prefixo fixo** → o prefixo `AD6v5d` pode mudar. A falha vira erro da opção; o restante dos players continua.
2. **HTML do Blogger sem `streamingData`** → o player YTube falha isolado; não há fallback `batchexecute` nesta mudança.
3. **Google Drive com confirmação ou limite** → o download direto pode devolver HTML em vez de mídia. O provedor entrega a URL construída, sem sonda; a limitação fica registrada.
4. **Temporadas divididas em páginas** → Jujutsu Kaisen tem 59 episódios no TMDB e páginas separadas no site. Episódios fora da página base podem ficar sem resultado; não mapear por posição.
5. **Busca textual** → títulos comuns devolvem arcos e temporadas; a confirmação por título, ano, formato e temporada reduz falsos positivos.
6. **Players externos** → Mega e embeds sem `<source>` são triagem, não falha. Um episódio só com eles fica sem stream.
7. **Cloudflare** → as rotas testadas responderam sem desafio; um desafio futuro vira erro HTTP, não ausência.
8. **Sem cache** → cada chamada repete busca e carregador; o app controla a espera e não há timeout próprio.

## Migration Plan

1. Criar `src/anibunker/` e os testes com fixtures sanitizadas; rodar `node build.js anibunker`.
2. Adicionar a entrada no `manifest.json`, a linha e a seção em `providers.md` e o perfil `anime` em `test/online/profiles.json`.
3. Atualizar `docs/provider-investigation.md` com o método reaproveitável.
4. Rodar `npm run lint`, `npm test` e o build; confirmar os arquivos gerados.
5. Executar `npm run test:online -- --provider anibunker` com `TMDB_API_KEY` apenas no ambiente e registrar a rodada.
6. Arquivar somente com os testes previstos passando ou com exclusões declaradas.
7. Rollback: remover a entrada do manifest, os arquivos gerados, o perfil e a seção de `providers.md`; nenhum bloco existente é alterado.

## Open Questions

1. Confirmar na rodada online se o player YTube continua publicando `streamingData` em todo o acervo e se o prefixo `AD6v5d` permanece.
2. Medir a cobertura de temporadas contínuas divididas em páginas; se for relevante, uma mudança futura pode adicionar um mapa de páginas por título.
3. Confirmar se o Google Drive mantém o download direto para arquivos grandes ou passa a exigir confirmação adicional.
