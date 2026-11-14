# Proposal

## Why

O SeuDorama publica doramas asiáticos em MP4 progressivo por uma API pública que recebe o ID do TMDB diretamente. O repositório não cobre esse acervo: `dattebayo` usa outra API e assinatura R2, `anitube` usa a cadeia Blogger de outro catálogo e `doramogo` lê outro site. A verificação de 2026-11-13 (horário local; UTC de 2026-11-14, entre 02:46 e 03:03) confirmou a cadeia:

1. `GET https://serv01.meusdoramas.club/posts/get-video.php?episode_number=1&season_number=1&tmdb=94796` respondeu HTTP 200 `application/json; charset=utf-8` com `{ success: true, videoUrl: <blogger> }`; o mesmo endpoint respondeu `success: false` para o TMDB 1399 e para o filme 496243.
2. A página do Blogger respondeu HTTP 200 `text/html` com `streamingData` e cinco URLs `googlevideo.com/videoplayback`; depois de desescapar `\u0026`, `\/`, `&quot;` e `&amp;`, quatro URLs têm `itag` 18 e 22 e uma tem `sabr` sem `itag`.
3. O MP4 do Google Video respondeu HTTP 206 `video/mp4` com `Content-Range` e assinatura `ftyp` (`00000018 66747970 6d703432`) para `Pousando no Amor` S01E01, `The Glory` S01E01, `Itaewon Class` S01E01 e `Hotel del Luna` S01E01.
4. A segunda temporada também resolveu: `Alice in Borderland` S02E01 e `Sweet Home` S02E01 responderam `success: true` e MP4 206.
5. O MP4 exige `User-Agent` de navegador: sem o cabeçalho respondeu HTTP 403 `text/plain`; com o mesmo UA da descoberta respondeu 206. `Referer` sozinho não liberou.
6. A API não exige chave, conta ou cookie e devolve `success: false` para obra fora do catálogo. Não há `captionTracks`, `.vtt` nem rótulo de áudio na página do Blogger.

A proposta original devolvia lista vazia em qualquer erro, fixava `name`/`title` e afirmava `Legendado` sem prova. A implementação mantém o contrato do repositório: erro estrutural sobe, o stream usa `buildStream`/`format` e o idioma fica `Idioma Desconhecido` enquanto a fonte não o declarar.

## What Changes

1. Adicionar o provedor `seudorama`, somente `tv`, em `src/seudorama/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Validar a entrada, recusar `movie` sem rede e normalizar temporada/episódio para inteiros a partir de 1.
3. Consultar `GET https://serv01.meusdoramas.club/posts/get-video.php` com `episode_number`, `season_number` e `tmdb`, `User-Agent` de navegador e `Accept: application/json, text/plain, */*`.
4. Exigir HTTP 2xx e JSON com `success === true` e `videoUrl` HTTP(S); `success: false` é ausência reconhecida, JSON inválido é erro.
5. Abrir o `videoUrl` do Blogger, desescapar as sequências Unicode/HTML e extrair somente URLs `https://*.googlevideo.com/videoplayback` com `itag` numérico; descartar `sabr` sem `itag`.
6. Mapear `itag` 18/43 para 360p, 22 para 720p e 37 para 1080p; deduplicar por URL e ordenar por qualidade. `itag` fora do mapa fica `Desconhecida`.
7. Montar cada stream com `buildStream` e `format`: MP4, `provider` `SeuDorama`, `quality` pelo `itag`, `headers` com o mesmo `User-Agent` da descoberta e `format` com título, ano, temporada e episódio. Sem `name` e `title`.
8. Não declarar `Legendado` sem prova: a API e o Blogger não publicam áudio nem legenda; o idioma fica `Idioma Desconhecido` até a fonte rotular.
9. Não instalar timeout, retentativa, cache com validade, sonda de mídia ou settings; a URL do Google Video é vinculada ao IP e expira, então é resolvida a cada pedido e nunca entra em log ou fixture.
10. Cobrir com testes Node e fixtures reais sanitizadas: S01E01, S01E02, S02E01, ausência para série fora do catálogo, ausência para filme, Blogger com itag 18/22, `sabr` sem itag, URL sem itag, JSON inválido e HTTP 500.
11. Registrar a rodada online no perfil `dorama` e a linha/seção em `providers.md` com status inicial `🟠 Não verificado`.
12. Atualizar `docs/provider-investigation.md` com o método “API por TMDB com página Blogger e MP4 do Google Video”.

## Capabilities

### New Capabilities

- `seudorama-provider`: consulta do catálogo SeuDorama por ID do TMDB, leitura da página Blogger e extração de MP4 progressivo do Google Video por `itag`.

### Modified Capabilities

Nenhuma. A verificação online usa a capability `provider-online-verification` com o perfil `dorama` já existente.

## Impact

1. Código: `src/seudorama/` (novo), `test/seudorama.test.js` e fixtures em `test/fixtures/seudorama/`.
2. Configuração: `manifest.json`, `test/online/profiles.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/seudorama.js`, `gdrive/providers/seudorama.js`, `prism/providers/seudorama.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para provedores existentes.
5. Limites conhecidos: a URL do Google Video expira e é vinculada ao IP; a página do Blogger não publica legendas; a API é um host separado do site, cuja home responde 403.
