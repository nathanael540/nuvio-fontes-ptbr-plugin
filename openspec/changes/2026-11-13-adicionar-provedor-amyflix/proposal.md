# Proposal

## Why

A AmyFlix é um catálogo WordPress/DooPlay de filmes e séries GL (Girls' Love), com páginas de série e de episódio e opções de player por botão DooPlay. O repositório não cobre esse acervo: o nicho GL não aparece nos provedores atuais, e o catálogo publica HLS e MP4 públicos na família Rumble. Observado em 13/11/2026 (14/11/2026 UTC): home `https://amyflix.net/` respondeu HTTP 200 `text/html`; a busca de `amor que machuca` devolveu 2 cartões; a série `khom-khlang-the-series-legendado` publicou `ul.episodios` com `li.mark-N`; a opção `Rum HLS` do episódio devolveu um `jwplayer?source=` com um master HLS que respondeu HTTP 200 `application/vnd.apple.mpegurl` com `#EXTM3U` e variantes 1080p/720p; a opção `Rum MP4` devolveu um MP4 que respondeu HTTP 206 `video/mp4` com assinatura `ftyp`.

**Correção em relação à proposta original:** o site não é um catálogo de anime. As buscas por `demon slayer`, `jujutsu kaisen`, `naruto` e `one piece` não devolveram cartões; o menu e os resultados são de doramas GL e filmes. Também não foram observados AnimeQ, `se-c`, Streamcash, Google Drive obrigatório, sonda de mídia, `audioPreference`, `minQuality` ou `qualityFallback`. Este change substitui a receita da proposta pelo que foi observado.

## What Changes

1. Adicionar o provedor `amyflix`, com `movie` e `tv`, em `src/amyflix/`, empacotado nos formatos publicados e registrado no `manifest.json` como versão `1.0.0`.
2. Localizar o título pelo ID do TMDB com `getMediaInfo` e a busca pública `GET https://amyflix.net/?s=<termo>`; tentar título PT-BR, original e alternativos e confirmar o título na página de detalhe. Nos cartões e fichas observados, o ano não aparece; a identidade é por título limpo, e dois candidatos compatíveis sem desempate viram ausência.
3. Distinguir filme (`/filme/<slug>`) de série (`/serie/<slug>`) pela rota e pela estrutura; escolher o episódio em `ul.episodios li.mark-N` pelo par `S - E` de `div.numerando`, nunca pela posição.
4. Expandir as opções `li.dooplay_player_option` via `POST /wp-admin/admin-ajax.php` (`action=doo_player_ajax`, `post`, `nume`, `type`) e tratar cada `embed_url` como opção independente.
5. Resolver duas famílias comprovadas: `jwplayer/?source=<url>` (decodificar o parâmetro e usar o HLS ou MP4) e `rumble.com/embed/<id>` (ler o objeto `p.f["<id>"]` da página e usar `u.hls.url`, com a maior resolução declarada nas chaves de `u.ua.tar`). Google Drive, Ok.ru, Vidmoly, VK, Dailymotion, Secvideo1 e Presto ficam fora por triagem, sem falha fatal.
6. Montar cada stream com `buildStream` e `format`, com `type` conforme a mídia, `provider` do player, idioma pelo rótulo (`Dublado`/`Legendado`) e sem cabeçalhos de reprodução (a mídia Rumble respondeu 200 sem `Referer`).
7. Cobrir com testes Node e fixtures reais sanitizadas: busca com resultado, busca vazia, série com episódio, filme, opção `jwplayer`, opção Rumble, host não suportado e falha estrutural.
8. Registrar a rodada online em `providers.md` com status `🟠 Não verificado` até a execução explícita do pacote.
9. Atualizar `docs/provider-investigation.md` com o método reaproveitável da família Rumble e do `jwplayer?source=` em site DooPlay.

## Capabilities

### New Capabilities

- `amyflix-catalog`: localização e confirmação de filmes e séries GL no catálogo AmyFlix a partir do TMDB, seleção de episódio pela listagem DooPlay, expansão dos botões de player e contrato dos streams HLS/MP4 devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente.

## Impact

1. Código: `src/amyflix/` (novo), `test/amyflix.test.js` e fixtures em `test/fixtures/amyflix/`.
2. Configuração: `manifest.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/amyflix.js`, `gdrive/providers/amyflix.js`, `prism/providers/amyflix.js` e os `<formato>/manifest.json`, todos pelo build.
4. Blocos: `tmdb-info`, `title-match`, `slugify`, `http`, `language-discovery`, `quality-discovery`, `custom-formatter` e `stream-build`; nenhum bloco novo.
5. Limite conhecido da fonte: sem ano publicado, a identidade depende do título; títulos com tradução própria da fonte podem não ser encontrados. A cobertura de séries é a das páginas `/serie/` e `/episodio/` publicadas.
