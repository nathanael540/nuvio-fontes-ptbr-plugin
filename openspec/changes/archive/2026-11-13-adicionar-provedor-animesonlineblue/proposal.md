# Proposal

## Why

O Animes Online Blue é um catálogo brasileiro de séries de anime que publica busca JSON, a grade de temporadas e episódios pelo protocolo React Server Components (RSC) do Next.js e os players do episódio por uma API interna. O repositório não tem provedor desse acervo. A verificação de 2026-11-13 (UTC de 2026-11-14) confirmou a cadeia pública até o player do Blogger em episódios dublados e legendados de `kimetsu-no-yaiba` (TMDB 85937) e `jujutsu-kaisen` (TMDB 95479), sem conta, chave ou desafio.

## What Changes

1. Adicionar o provedor `animesonlineblue`, somente `tv`, em `src/animesonlineblue/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`. A fonte também publica páginas de filme, mas elas ficam fora do escopo; pedido de filme devolve lista vazia.
2. Localizar o título pelo TMDB com `getMediaInfo` e pela busca pública `GET https://animesonline.blue/api/search?q=<termo>`, acumulando os termos PT-BR, original, alternativos brasileiros e títulos romaji/romanizados. A escolha usa título e ano com `findBestMatch`; o título romaji é essencial porque a busca pelo título PT-BR de Demon Slayer devolveu a página do filme de 2025, não a série de 2019.
3. Ler a grade de temporadas e episódios de `GET https://animesonline.blue/anime/<slug>?_rsc=1` com o cabeçalho `RSC: 1`, extraindo o bloco `temporadas` da resposta `text/x-component`. Selecionar a temporada por `numero` e o episódio por `eps[].num`; temporada ou episódio ausente é ausência reconhecida.
4. Resolver cada áudio publicado no episódio (`leg` e `dub`) em separado por `GET /api/episodio/<id>` com `Referer` da página do anime. O campo `tipo` da resposta confirma "Legendado" ou "Dublado"; `playerUrl` aponta para o Blogger.
5. Extrair os MP4 progressivos do player do Blogger a partir de `streamingData.formats` no HTML de `blogger.com/video.g?token=...`, sem `batchexecute` e sem executar script remoto. O formato traz `itag`, `mimeType`, `qualityLabel` e `url` em `googlevideo.com`.
6. Consumir o bloco `blogger-video` entregue pela change `2026-11-13-extrair-bloco-blogger-video`, que move a extração de `streamingData.formats` do `src/anitube/players.js` e a cobre com teste próprio; esta change não cria nem altera o bloco, nem o AniTube.
7. Remover da proposta original as preferências de áudio/qualidade, o timeout de sondagem, a sonda `Range`, a chave TMDB padrão e os campos `name`/`title`. O provedor não instala timeout, não sonda mídia, não aceita settings e usa somente `TMDB_API_KEY` do app.
8. Cobrir busca, escolha de candidato, temporada, episódio com um e com dois áudios, falha isolada de um áudio, ausência e estrutura inválida com testes Node e fixtures reais sanitizadas.
9. Configurar a verificação online com o perfil `anime` e registrar a rodada em `providers.md`; o status inicial é `🟠 Não verificado`.
10. Atualizar `docs/provider-investigation.md` com o método “Next.js RSC e player do Blogger” e o limite de mídia do `googlevideo.com`.

## Capabilities

### New Capabilities

- `animesonlineblue-provider`: localização e confirmação de séries de anime no Animes Online Blue a partir do TMDB, leitura da grade por RSC, seleção do episódio e resolução das opções dublada e legendada até os MP4 do Blogger.

### Modified Capabilities

Nenhuma. O bloco `blogger-video` é entregue pela change `2026-11-13-extrair-bloco-blogger-video`; esta change apenas o consome. A verificação online usa a capability `provider-online-verification` com o perfil já existente.

## Impact

1. Código: `src/animesonlineblue/` (novo), `test/animesonlineblue.test.js` e fixtures em `test/fixtures/animesonlineblue/`; nenhum arquivo do AniTube ou do bloco é alterado por esta change.
2. Configuração: `manifest.json`, `test/online/profiles.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/animesonlineblue.js`, `gdrive/providers/animesonlineblue.js`, `prism/providers/animesonlineblue.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para provedores existentes.
5. Limite conhecido: a URL de `googlevideo.com` respondeu HTTP 403 na rede da triagem, embora o HTML do Blogger publique os formatos. O provedor devolve a URL publicada, sem sonda; a reprodução fica como hipótese a confirmar na rodada online e no aparelho.
