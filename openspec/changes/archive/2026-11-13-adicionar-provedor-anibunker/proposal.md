# Proposal

## Why

O AniBunker é um catálogo público de animes dublados e legendados que o repositório ainda não cobre. A proposta original usa `anibunker.net`, que não resolve; o domínio canônico atual é `anibunker.com` e foi confirmado em 13/11/2026 (BRT) com busca, página de obra, episódio, carregador PHP e mídia final. A cadeia pública entrega MP4 do Blogger e do Google Drive, MP4/HLS do carregador e MP4 do Sendvid sem conta, chave ou DRM.

## What Changes

1. Adicionar o provedor `anibunker`, com `movie` e `tv`, em `src/anibunker/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Resolver o título pelo TMDB com `getMediaInfo` e usar `title`, `originalTitle`, `alternativeTitles` e `romajiTitles`. Os títulos romaji já vêm do TMDB e evitam chamadas ao AniList/Kitsu que a proposta original previa.
3. Buscar com `POST https://anibunker.com/php/search.php` e formulário `query=<termo>`, lendo o corpo JSON (`name` e `url`) apesar do `Content-Type: text/html`. Confirmar a obra na página `/anime/<slug>` pelo `h1`, ano, formato e contagem de áudios; para série, confirmar a temporada pelo título romaji/arcos e pela numeração de episódios.
4. Selecionar episódio de série pelo par temporada/número e pelas opções de áudio anunciadas (`Adicionados: N legendado e M dublado`); selecionar filme como a entrada única `-episodio-1-<audio>`.
5. No episódio, ler `data-video-id` e `data-player-id` e resolver cada player em isolamento via `POST /php/loader.php` (`player_id` e `video_id`).
6. Resolver os alvos: token do Blogger com prefixo `AD6v5d` e extração de `streamingData.formats` já presente no HTML (sem `batchexecute`); Google Drive como download direto MP4; `url_hd*` como MP4 ou HLS conforme o caminho; Sendvid pelo `<source type="video/mp4">` do embed; `url_mega` descartado por triagem.
7. Montar cada stream com `buildStream` e `format`, classificar `quality` e `language` apenas pelo que a fonte anuncia, preservar `Referer` do Blogger quando necessário e deduplicar por URL.
8. Cobrir busca, filme, episódio dublado, episódio legendado, player com falha isolada, `url_mega` descartado e ausência com testes Node e fixtures reais sanitizadas.
9. Configurar a verificação online com o perfil exclusivo `anime` e registrar a rodada em `providers.md`. O status inicial é `🟠 Não verificado` até a execução explícita do pacote.
10. Não introduzir timeout próprio, espera, retentativa com pausa, sonda obrigatória, `audioPreference`, `minQuality`, `qualityFallback`, `name` ou `title`; esses itens da proposta original contrariam o contrato do repositório.

## Capabilities

### New Capabilities

- `anibunker-provider`: localização e confirmação de filmes e séries no catálogo AniBunker a partir do TMDB, seleção de episódio por temporada, número e áudio, resolução dos players públicos e contrato dos streams MP4/HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, apenas com um novo perfil de nicho.

## Impact

1. Código: `src/anibunker/` (novo), `test/anibunker.test.js` e fixtures em `test/fixtures/anibunker/`.
2. Configuração: `manifest.json`, `test/online/profiles.json` (perfil `anime`), `providers.md` e `docs/provider-investigation.md` para registrar o método de busca PHP e de resolução Blogger/Drive.
3. Saída gerada: `providers/anibunker.js`, `gdrive/providers/anibunker.js`, `prism/providers/anibunker.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para os provedores existentes.
5. Limites conhecidos: o site agrupa arcos em páginas próprias; temporadas contínuas do TMDB divididas em mais de uma página (por exemplo, Jujutsu Kaisen) podem ficar sem episódio na primeira versão, o que deve ser declarado e coberto como ausência. Episódios divididos em players externos não suportados são triagem, não falha.
