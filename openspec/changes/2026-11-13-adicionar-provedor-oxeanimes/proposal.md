# Proposal

## Why

O OxeAnimes é um catálogo brasileiro de animes com páginas separadas para dublado e legendado, busca JSON e um proxy de streaming próprio que entrega HLS. O repositório não tem provedor desse acervo. A verificação de 2026-11-13 (UTC de 2026-11-14) confirmou a cadeia completa: busca, página da obra, API de episódio e master HLS `#EXTM3U` em 720p pelo proxy, sem conta, chave ou DRM; o CDN de origem responde 403 e o proxy exige `Referer`.

## What Changes

1. Adicionar o provedor `oxeanimes`, com `movie` e `tv`, em `src/oxeanimes/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Localizar a obra pelo TMDB com `getMediaInfo` e pela busca pública `GET https://oxeanimes.com.br/api/chat-search?q=<termo>`, acumulando título PT-BR, original, alternativos brasileiros e romaji/romanizados. Para série com temporada maior que 1, incluir também o nome/romaji da temporada do TMDB.
3. Classificar cada resultado em dublado ou legendado pelo título e pelo slug (`dublado`); escolher o melhor candidato de cada áudio separadamente, com `titleSimilarity` e limiar de 0,60. As duas opções são independentes.
4. Abrir a página `/anime/<slug>`, mapear os links `/watch/<id>?anime=...&slug=...` e ler o número do episódio no texto ou no `alt` do cartão. Para série, escolher o número pedido; para filme, usar o único episódio da página.
5. Consultar `GET /api/episode/<id>?slug=<slug>` com `Referer` e usar `streamUrl` ou a primeira fonte `type: "hls"`; devolver a URL do proxy `/api/stream?url=...` como stream HLS, com `Referer` do site nos cabeçalhos de reprodução.
6. Não sondar a master, não instalar timeout, não aceitar settings e não usar `name`/`title`; a qualidade fica `Desconhecida` quando o rótulo da fonte não declara resolução. O idioma vem do `tipo`/título do episódio.
7. Cobrir busca com dublado e legendado, escolha por título exato contra página de arco, filme, série, ausência, página sem episódio e falha isolada de um áudio com testes Node e fixtures reais sanitizadas.
8. Configurar a verificação online com o perfil `anime` e registrar a rodada em `providers.md`; o status inicial é `🟠 Não verificado`.
9. Atualizar `docs/provider-investigation.md` com o método “proxy de streaming próprio com Referer” e o limite de opções 502.

## Capabilities

### New Capabilities

- `oxeanimes-provider`: localização e confirmação de filmes e séries de anime no OxeAnimes a partir do TMDB, seleção do episódio na página da obra e resolução das opções dublada e legendada pelo proxy HLS.

### Modified Capabilities

Nenhuma. A verificação online usa a capability `provider-online-verification` com o perfil `anime` já existente.

## Impact

1. Código: `src/oxeanimes/` (novo), `test/oxeanimes.test.js` e fixtures em `test/fixtures/oxeanimes/`.
2. Configuração: `manifest.json`, `test/online/profiles.json`, `providers.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/oxeanimes.js`, `gdrive/providers/oxeanimes.js`, `prism/providers/oxeanimes.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para provedores existentes.
5. Limite conhecido: o proxy pode responder HTTP 502 em episódios específicos (observado no dublado de `kimetsu-no-yaiba`); sem sonda, o provedor devolve a URL publicada e a reprodução depende do backend da fonte.
