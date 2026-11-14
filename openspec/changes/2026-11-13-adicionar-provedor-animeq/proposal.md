# Proposal

## Why

O AnimeQ é um catálogo WordPress/DooPlay de animes com player próprio (abas `animeq-player`), páginas de episódio e de filme, fontes diretas em MP4 e iframes do Blogger. O repositório não cobre esse catálogo: os provedores de anime atuais usam APIs e players de outras redes. Observado em 13/11/2026 (14/11/2026 UTC): home `https://animeq.cloud/` respondeu HTTP 200 `text/html`; a busca de `demon slayer` devolveu 200 com 9 cartões; `/episodio/kimetsu-no-yaiba-hashira-geiko-hen-episodio-01` publicou `<source src="https://animeflix.blog/.../01-sd.mp4">`, que respondeu HTTP 206 `video/mp4` com assinatura `ftyp`; `/filme/jujutsu-kaisen-0-o-filme` expandiu `FullHD / HLS` para um `jwplayer?source=` com MP4 em `aniplay.online` que respondeu HTTP 200 `video/mp4`; o episódio de Jujutsu Kaisen publicou um iframe do Blogger cujo HTML traz `streamingData.formats` com um MP4 360p que respondeu HTTP 206 `video/mp4`.

## What Changes

1. Adicionar o provedor `animeq`, com `movie` e `tv`, em `src/animeq/`, empacotado nos formatos publicados e registrado no `manifest.json` como versão `1.0.0`.
2. Localizar o título pelo ID do TMDB com `getMediaInfo` e a busca `GET https://animeq.cloud/?s=<termo>`; confirmar título e ano nos cartões `div.result-item` antes de abrir a página de detalhe.
3. Selecionar série em `/anime/<slug>` pelos blocos `div.se-c`/`span.se-t` e cartões `div.episode-card[data-episode-number]`, escolhendo o par temporada/episódio exato; filme em `/filme/<slug>` usa as opções DooPlay da própria página.
4. Ler os players do episódio em `div.animeq-player__source[data-animeq-source]` (com `<source src>` ou `<iframe src>`) e o rótulo em `button[data-animeq-switch][data-source-name]`; ler as opções de filme em `li.dooplay_player_option` e expandir por `POST /wp-admin/admin-ajax.php` (`action=doo_player_ajax`).
5. Resolver as famílias comprovadas: MP4 direto, `jwplayer?source=<url>` (com `Referer` quando o host for `aniplay.online`) e Blogger (`blogger.com/video.g`, lendo `streamingData.formats`). Iframes `animeshd.cloud` (Embed69/Proof-of-Work) e `animes.strp2p.com` (Vidstack) ficam fora por triagem.
6. Consumir o bloco `blogger-video` entregue pela change `2026-11-13-extrair-bloco-blogger-video`, que move a extração do AniTube e a cobre com teste próprio; esta change não cria nem altera o bloco, nem o AniTube.
7. Montar cada stream com `buildStream` e `format`, com `type` conforme a mídia, `provider` do player, idioma pelo rótulo (`Dublado`/`Legendado`) e cabeçalhos somente quando comprovados.
8. Cobrir com testes Node e fixtures reais sanitizadas: busca, série, episódio com fonte direta, episódio só com Blogger, filme, host não suportado, ausência e falha estrutural.
9. Registrar a rodada online em `providers.md` com status `🟠 Não verificado` e atualizar `docs/provider-investigation.md` com o método do player AnimeQ e do Blogger.

**Duplicidade observada:** `animeshd.to` e `animesdrive.cloud` entregaram o mesmo token do Blogger e a mesma URL direta de Jujutsu Kaisen S01E01 que `animeq.cloud`; são o mesmo acervo/rede e não viram provedores separados nesta rodada.

## Capabilities

### New Capabilities

- `animeq-catalog`: localização e confirmação de filmes e séries de anime no AnimeQ a partir do TMDB, seleção de episódio pela estrutura DooPlay, leitura do player AnimeQ e resolução das fontes diretas, `jwplayer` e Blogger.

### Modified Capabilities

Nenhuma. O bloco `blogger-video` é entregue pela change `2026-11-13-extrair-bloco-blogger-video`; esta change apenas o consome.

## Impact

1. Código: `src/animeq/` (novo), `test/animeq.test.js` e fixtures em `test/fixtures/animeq/`; nenhum arquivo do AniTube ou do bloco é alterado por esta change.
2. Configuração: `manifest.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/animeq.js`, `gdrive/providers/animeq.js`, `prism/providers/animeq.js` e os `<formato>/manifest.json`, todos pelo build.
4. Blocos existentes usados: `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract`, `language-discovery`, `quality-discovery`, `custom-formatter` e `stream-build`. Bloco consumido: `blogger-video`, entregue pela change `2026-11-13-extrair-bloco-blogger-video`.
5. Limites conhecidos: parte das fontes diretas está morta (`mangas.cloud` respondeu 404 em todos os testes; `cldup.com` 404); o Blogger entrega 360p; Embed69 e Vidstack ficam fora do contrato. A cobertura real depende da rodada online.
