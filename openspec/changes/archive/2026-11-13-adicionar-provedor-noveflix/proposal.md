# Proposal

## Why

O NoveFlix publica novelas brasileiras e internacionais em `https://noveflix.lol`, um catálogo que o repositório não cobre. A verificação de 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03) confirmou a cadeia pública:

1. Home HTTP 200 `text/html; charset=UTF-8` com 147.589 bytes. A busca `GET /?s=Avenida%20Brasil` respondeu HTTP 200 com 119.250 bytes e um cartão `/assistir/avenida-brasil/`; `A Usurpadora` devolveu `/assistir/a-usurpadora/`.
2. A ficha de `Avenida Brasil` respondeu HTTP 200 com 140.981 bytes, `h1` igual ao título, `span.date` 2012 e um botão `li.dooplay_player_option` com `data-post="7059"`, `data-type="movie"` e `data-nume="1"`. A ficha de `Vale Tudo` publicou `span.date` 1988 e a de `Vale Tudo (2025)` publicou 2025, permitindo separar original e remake.
3. O POST `https://noveflix.lol/wp-admin/admin-ajax.php` com `action=doo_player_ajax&post=7059&nume=1&type=movie` respondeu HTTP 200 `application/json` com `embed_url` em `novefx.biz`.
4. O embed respondeu HTTP 200 com 4.551 bytes e publicou `totalChapters = 179`, o prefixo `AVBR-` e a base `https://redirectnflix.com/?`. O TMDB de `Avenida Brasil` (45815) tem 179 episódios, então o capítulo do site corresponde ao episódio do TMDB.
5. O capítulo 1 e o capítulo 179 percorreram a cadeia completa: gate HTTP 200 em `esportesdavez.com`, iframe `#player-iframe[data-src]` com `safelink_redirect`, HTTP 302 para `nflixpainel.cc`, página de vídeo e `stream.php?slug=...&e=...&t=...` respondendo HTTP 206 `video/mp4` com assinatura `ftyp` (355.834.264 e 415.698.750 bytes).
6. A busca de `Caminho da Vinganca` devolveu a página de busca sem cartões e com marcador de ausência; `A Usurpadora` confirmou a presença de novelas internacionais no catálogo.

A proposta original afirmava `dateCreated` na ficha, qualidade fixa 480p e três retentativas por chamada. O campo `dateCreated` não existe na página observada (o ano está em `span.date`), a resolução não é publicada no MP4 e a retentativa não é usada pelo repositório. A implementação adota o que foi observado e mantém a qualidade `Desconhecida` até a fonte declarar um número.

## What Changes

1. Adicionar o provedor `noveflix`, somente `tv`, em `src/noveflix/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Obter título, original, alternativos e ano com `getMediaInfo` (`tmdb-info`), sem chave embutida.
3. Buscar com `GET https://noveflix.lol/?s=<termo>` e acumular links `/assistir/<slug>/`; confirmar título por similaridade e ano por `span.date`, exigindo igualdade quando os dois anos existirem (`Vale Tudo` 1988 contra `Vale Tudo (2025)`).
4. Ler o botão DooPlay (`data-post`, `data-type`, `data-nume`) e consultar `POST /wp-admin/admin-ajax.php` com `action=doo_player_ajax`, `post`, `nume=1` e `type=movie`; usar o `embed_url` retornado.
5. No embed, ler `totalChapters`, o prefixo `<PREFIX>-` e a base do redirecionador; validar `episode <= totalChapters`; montar `https://nflixpainel.cc/video/<PREFIX>-<NNN>` com três dígitos e codificar em Base64 para a URL do redirecionador.
6. Seguir o gate, ler `#player-iframe[data-src]`, desescapar `&amp;`, pedir a `safelink` em modo manual, seguir o HTTP 302 até a página de vídeo e extrair a URL `stream.php`.
7. Montar o stream com `buildStream` e `format`: MP4, `quality` somente se a fonte declarar resolução (senão `Desconhecida`), `language` `Idioma Desconhecido` porque a ficha não declara áudio nem legenda, sem `headers` de reprodução (o MP4 respondeu 206 sem `Referer` e sem cookie), sem `name`/`title`.
8. Tratar TMDB, busca, ficha e AJAX como etapas fatais; o gate e o `stream.php` pertencem à única opção do título e sobem como erro quando falham. Ausência de cartão, de `data-post` ou de capítulo na faixa é lista vazia.
9. Não instalar timeout, retentativa, cache com validade, sonda de mídia ou settings. Não fixar 480p sem rótulo.
10. Cobrir com testes Node e fixtures reais sanitizadas: busca de novela, original e remake pelo ano, ficha com `data-post`, AJAX, embed com 179 capítulos, gate com `safelink`, página de vídeo com `stream.php`, capítulo acima do total, busca vazia e gate quebrado.
11. Registrar a rodada online no perfil `generalista` e a linha/seção em `providers.md` com status inicial `🟠 Não verificado`.
12. Atualizar `docs/provider-investigation.md` com o método “DooPlay de novela com gate novefx e safelink”.

## Capabilities

### New Capabilities

- `noveflix-provider`: localização de novelas no NoveFlix a partir do TMDB, confirmação por título e ano, resolução DooPlay e travessia do gate novefx até o MP4 assinado.

### Modified Capabilities

Nenhuma. A verificação online usa a capability `provider-online-verification` com o perfil `generalista` já existente.

## Impact

1. Código: `src/noveflix/` (novo), `test/noveflix.test.js` e fixtures em `test/fixtures/noveflix/`.
2. Configuração: `manifest.json`, `test/online/profiles.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/noveflix.js`, `gdrive/providers/noveflix.js`, `prism/providers/noveflix.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para provedores existentes.
5. Limites conhecidos: o MP4 não publica resolução, o gate muda de host (`redirectnflix.com` → `esportesdavez.com`) e a URL `stream.php` tem token de curta duração; nada disso é cacheado.
