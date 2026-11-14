# Proposal

## Why

O EmbedMovies já devolve HLS das opções do PlayerFlix, mas descarta a opção `WatchPlay` por triagem porque a playlist não declara `RESOLUTION`. Em 2026-11-13 (2026-11-14T02:51Z UTC), a página WatchPlay do filme "Clube da Luta" (TMDB `550`) respondeu HTTP 200 e publicou uma playlist `playlist.m3u8` VOD válida: `#EXTM3U`, `#EXT-X-PLAYLIST-TYPE:VOD`, `#EXT-X-ENDLIST`, 1692 segmentos; o primeiro segmento respondeu HTTP 206. O pacote publicado `1.0.0` devolveu 0 streams para esse filme porque as opções restantes eram triagem (WatchPlay sem `RESOLUTION`, Embed Play fora do conjunto e Premium com `budget danger`). A proposta original pedia exatamente essa opção para filmes, mas fixava 720p sem evidência; a playlist não tem `#EXT-X-STREAM-INF`, então a qualidade correta é `Desconhecida`.

## What Changes

1. Adicionar ao bloco `fireplayer` um resolvedor `WatchPlay` opt-in, acionado por `resolveWatchplay: true` no contexto; sem a flag, o comportamento atual (triagem de `watchplay.shop`) permanece para DooPlay e FirePlayer PT-BR.
2. Ler a página `v1.watchplay.shop`, seguir o redirecionamento público para `v2.watchplay.shop`, extrair a URL `playlist.m3u8` publicada em `createMyPlayer` e validar o manifesto com `#EXTM3U`.
3. Reaproveitar `interpretPlaylist`, `chooseLanguage` e `buildStreams`: master com variantes continua adaptativo; playlist de mídia sem `RESOLUTION` vira um stream com qualidade `Desconhecida`, sem sonda extra e sem 720p inventado.
4. Usar o `lang` da opção do PlayerFlix como dica de idioma (`pt-br` → `Dublado`), o host final do player como `provider` e os cabeçalhos de reprodução da página final; não inventar idioma quando o rótulo não classificar.
5. Passar `resolveWatchplay: true` em `src/embedmovies/extractor.js`; nenhum outro provedor muda.
6. Cobrir o caminho com testes de bloco e do provedor: playlist VOD sem variantes, master com variantes, página sem playlist como falha isolada, filme cuja única opção jogável é WatchPlay, série com coordenadas e ausência/falha das demais opções.
7. Atualizar `src/_blocks/index.md`, `docs/provider-investigation.md` (variação de playlist de mídia sem `RESOLUTION`), `providers.md` com nova rodada online e a versão do manifest para `1.1.0`.
8. Rejeitar a qualidade fixa de 720p e o escopo “somente filmes” da proposta: a playlist de série também respondeu VOD válida (1396 S01E01, 697 segmentos) e o caminho do bloco é o mesmo; a única qualidade comprovada é a ausência de `RESOLUTION`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `embedmovies-catalog`: inclusão da resolução opt-in da opção WatchPlay, com playlist VOD sem `RESOLUTION` preservada como `Desconhecida`, e ajuste da triagem de opções para deixar de classificar WatchPlay como host não suportado quando a flag está ativa.

## Impact

1. Código: `src/_blocks/fireplayer/index.mjs` (novo handler e propriedade opcional de contexto), `src/_blocks/index.md` (catálogo do bloco) e `src/embedmovies/extractor.js` (flag).
2. Manifest e saída: `manifest.json` (versão `1.1.0`), `providers/embedmovies.js`, `gdrive/providers/embedmovies.js`, `prism/providers/embedmovies.js` e os manifests de formato, todos gerados por build.
3. Testes: `test/blocks/fireplayer/index.test.mjs`, `test/embedmovies.test.js` e fixtures em `test/fixtures/embedmovies/`; as suítes de DooPlay e FirePlayer PT-BR continuam com o comportamento padrão e devem ser reexecutadas.
4. Documentação: `providers.md` (rodada online do pacote novo) e `docs/provider-investigation.md` (seção de HLS/MP4/legendas). `docs/arch.md` não muda.
5. Serviços externos: `embedmovies.org`, `myembed.biz`, `playerflix.ink`, `v1.watchplay.shop` e `v2.watchplay.shop`, todos públicos, sem conta, chave ou DRM.
6. Sem mudança de contrato global, de build, de dependências ou de settings do app.
