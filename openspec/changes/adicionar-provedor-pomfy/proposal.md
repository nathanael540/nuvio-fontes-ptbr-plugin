# Proposal

## Why

A API Pomfy (`https://api.pomfy.stream/`) publica um catálogo de filmes e séries indexado por ID do TMDB e resolve o player em um segundo salto. O player Flyfile expõe uma API pública sem conta e sem chave que entrega HLS adaptativo, com faixas de áudio e legendas; nenhum provedor atual do repositório cobre esse catálogo.

A investigação de 12/11/2026 também encontrou o player Byse, que só libera a mídia depois de captcha, attestation de dispositivo e playback AES-GCM no navegador. Esse caminho não é reproduzível no runtime QuickJS nem deve ser tratado como API pública do plugin. O provedor cobre somente o Flyfile e é declarado parcial: títulos publicados apenas no Byse devolvem lista vazia.

## What Changes

1. Novo provedor `pomfy` no `manifest.json`, com `supportedTypes` `["movie", "tv"]`, `formats` `["m3u8"]`, `contentLanguage` `["pt"]` e versão `1.0.0`.
2. Uso direto do ID do TMDB em `GET /filme/<id>` e `GET /serie/<id>/<temporada>/<episódio>`, sem busca textual e sem consulta ao TMDB.
3. Leitura do `statusToken` embutido na página da API Pomfy e troca por `GET /api/play-token?t=<token>`, que devolve `flyfileUrl` ou `byseUrl`.
4. Resolução somente de endereço Flyfile: `flyfileUrl` ou, quando ele for nulo, `url` cujo host seja `flyfile.app` ou `flyf.lat`; extração do ID do embed, consulta a `https://api.flyfile.app/api/public/file/<id>` com os cabeçalhos de embed e a `https://api.flyfile.app/api/streaming/assign/<id>`, seguida da montagem do HLS `https://<servidor>/hls/<token>/master.m3u8`.
5. Montagem de um stream por título com qualidade da maior `quality` pronta, tamanho da qualidade, `filename` sanitizado da release, bitrate e duração do metadado original, `provider` `Flyfile` e `type` `hls`.
6. Classificação de idioma pelo áudio padrão e pelas legendas: áudio português com região Brasil vira `Dublado`; áudio estrangeiro com legenda portuguesa vira `Legendado`; áudio português sem região brasileira vira `Dublado (Não PT-BR?)`; sem evidência, `Idioma Desconhecido`.
7. Legendas externas do Flyfile incluídas quando o arquivo as anuncia, com o idioma normalizado e sem `headers` que a fonte não exige.
8. Ausência reconhecida, sem erro: página sem `statusToken`, `flyfileUrl` nulo (título só no Byse), arquivo fora de `READY`, sem qualidade pronta ou sem `videoAsset`. Falha de rede, HTTP fora de 2xx, resposta sem JSON válido ou `assign` sem `url`/`token` continuam fatais.
9. Testes Node offline com fixtures sanitizadas para filme, episódio, ausência, Byse-only, idioma, legendas, falhas e layout alterado; build dos três formatos; entrada e seção em `providers.md` com status inicial `🟠 Não verificado`.
10. Registro em `docs/provider-investigation.md` do método novo: catálogo por ID do TMDB com token de embed, troca por player e API pública do Flyfile; o Byse fica registrado como hipótese não integrada e seus limites.

## Capabilities

### New Capabilities

- `pomfy-catalog`: leitura do catálogo Pomfy por ID do TMDB, troca do token de embed, seleção do player Flyfile, resolução do HLS, classificação de idioma, legendas, ausência e contrato dos streams.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/pomfy/` (entrada e extrator), reutilizando `custom-formatter`, `http`, `language-discovery`, `quality-discovery`, `script-extract` e `stream-build`; nenhum bloco novo.
2. Manifest e saída: `manifest.json`, `providers/pomfy.js`, `gdrive/providers/pomfy.js`, `prism/providers/pomfy.js` e os manifests de formato.
3. Testes: `test/pomfy.test.js` e fixtures em `test/fixtures/pomfy/`.
4. Documentação: `providers.md` (linha e seção do provedor) e `docs/provider-investigation.md` (novo método e limite do Byse).
5. Serviço externo: Flyfile, usado pela API pública que o próprio catálogo aciona, sem conta e sem chave. O Byse não é integrado nem contornado.
6. Sem mudança de contrato global, de build ou de dependências; `docs/arch.md` e `src/_blocks/index.md` não mudam.
