# Proposal

## Why

O BRFlix é um agregador brasileiro que publica uma API pública de resolução, `GET /best-stream-resolve`, a qual consulta vários servidores e devolve candidatos MP4 e HLS dublados ou legendados. Nenhum provedor deste repositório consome esse agregado. Com uma única consulta por título, o BRFlix amplia a cobertura de filmes e séries em PT-BR e oferece uma alternativa quando os provedores individuais de cada servidor não resolvem.

## What Changes

1. Adicionar o provedor `brflix` em `src/brflix/`, com `movie` e `tv`, formatos `m3u8` e `mp4`, versão `1.0.0`, registrado no `manifest.json` e empacotado nos três formatos.
2. Consultar `GET https://brflix.lat/best-stream-resolve` com `mediaType`, `tmdbId`, `dubbed=1` e, para série, `season` e `episode`. A fonte recebe o ID do TMDB diretamente, sem busca textual e sem `getMediaInfo`.
3. Decifrar o campo `payload` com AES-256-GCM no aparelho, usando `crypto-js` e a chave simétrica pública embutida no `/app.js` do BRFlix. A chave é uma constante de protocolo do player público, não um segredo, conta ou token; ela não identifica usuário nem libera acesso. A tag GCM não será verificada, porque o `crypto-js` não expõe GHASH; o JSON decifrado será validado estruturalmente.
4. Tratar `ok: false` como ausência reconhecida, devolvendo lista vazia. Erro de rede, HTTP fora de 2xx, JSON inválido, payload ausente ou falha de decifragem sobem como erro até `getStreams`, que registra `[BRFlix] ...` e devolve lista vazia.
5. Selecionar somente candidatos jogáveis (`type` HLS ou MP4). Candidatos `iframe` são descartados por triagem; URLs relativas são resolvidas contra `https://brflix.lat/`; candidatos repetidos são deduplicados por URL.
6. Montar cada stream com `buildStream` e `format`, informando `provider` do candidato, `type` correspondente, `language` como Dublado ou Legendado conforme `dubbed`, cabeçalhos de reprodução do BRFlix e qualidade apenas quando o valor da fonte for uma resolução confiável. Campos que a fonte não fornece serão omitidos.
7. Não adicionar conta, cookie, token, proxy externo ou chave de serviço. O provedor não fará cache das URLs assinadas: cada chamada obtém candidatos novos, porque os links do BRFlix expiram.
8. Cobrir com testes Node e fixtures reais sanitizadas: filme com MP4 e HLS, série, ausência (`ok: false`), candidato somente `iframe`, estrutura inválida, payload com decifragem inválida e falha HTTP. Adicionar `crypto-js` às `devDependencies` para os testes; o app já fornece o módulo em produção.
9. Registrar a linha e a seção em `providers.md` com status inicial `🟠 Não verificado`, sem inventar evidência online, e atualizar `docs/provider-investigation.md` com o método de agregador com resposta cifrada no cliente.
10. Não criar bloco novo: a decifragem e a triagem do BRFlix são específicas desta fonte e ficam em `src/brflix/`, conforme a regra de extrair blocos apenas de padrões observados em provedores reais.

## Capabilities

### New Capabilities

- `brflix-provider`: resolução de filmes e séries no agregado BRFlix pelo ID do TMDB, incluindo a consulta pública, a decifragem local do payload, a triagem dos candidatos e o contrato dos streams MP4 e HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online continua regida pela capability `provider-online-verification`; o novo provedor apenas entra na amostra existente.

## Impact

1. Código: `src/brflix/` (novo), `test/brflix.test.js` e fixtures em `test/fixtures/brflix/`.
2. Configuração: `manifest.json`, `package.json` (`crypto-js` em `devDependencies`), `providers.md` e `docs/provider-investigation.md`. Nenhum bloco novo em `src/_blocks/`.
3. Saída gerada: `providers/brflix.js`, `gdrive/providers/brflix.js`, `prism/providers/brflix.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para os provedores existentes.
5. Riscos conhecidos da fonte: a API pode mudar o esquema cifrado, a chave pública pode ser trocada, os candidatos `iframe` não são jogáveis no contrato atual e as URLs de mídia expiram. A rodada online confirmará a cobertura real; a aprovação offline não autoriza publicação.
