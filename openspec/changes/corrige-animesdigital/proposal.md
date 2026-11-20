# Proposal

## Why

A rodada pública de 20/11/2026 registrou dez resultados vazios. A reprodução do pacote publicado mostrou que o iframe do player Anivideo mudou de `videohls.php?d=<manifesto>` para `/cdn/<token>`; a rota nova só responde 2xx com `Sec-Fetch-Dest: iframe` e publica o manifesto HLS nas `sources` do jwplayer. O código reconhecia apenas a rota antiga e tratava a página sem `d` como ausência, então os títulos encontrados terminavam em lista vazia sem aviso.

## What Changes

1. Reconhecer o iframe atual `api.anivideo.net/cdn/<token>`, abrir a página do player com `Sec-Fetch-Dest: iframe` e `Referer` da fonte, ler `sources[].file` e aceitar somente manifesto HLS `.m3u8` http(s).
2. Preservar o iframe legado `videohls.php?d=` e o descarte isolado por opção; o stream da rota nova leva `Referer`, porque o manifesto respondeu 403 sem contexto e 200 com ele.
3. Cobrir a falha com fixtures sanitizadas e testes offline; revalidar o pacote final online e registrar que os demais vazios são ausência ou limitação de catálogo.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

1. `animesdigital-provider`: a resolução do player Anivideo passa a aceitar as duas formas de iframe, e o contrato dos streams documenta o `Referer` exigido pela rota nova.

## Impact

1. `src/animesdigital/player.js`, `src/animesdigital/index.js`, `test/animesdigital.test.js` e fixtures em `test/fixtures/animesdigital/`.
2. Pacotes gerados (`providers/`, `gdrive/providers/` e `prism/providers/`), `providers.md`, `docs/provider-investigation.md` e a spec delta de `animesdigital-provider`.
3. Revalidação online do pacote Prism `all/all/all`; os títulos fora de `/anime/a/`, as séries longas e o filme publicado como arco continuam fora do contrato atual.
