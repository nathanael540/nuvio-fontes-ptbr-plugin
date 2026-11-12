# Tasks

## 1. Estrutura, dependência, manifest e fixtures

- [ ] 1.1 Criar `src/brflix/` com `index.js`, `api.js`, `payload.js` e `streams.js`, seguindo o contrato de `src/_template/` e os padrões de `src/megaembed/`; verificar que `npm run lint` aceita a estrutura inicial e que os quatro arquivos existem.
- [ ] 1.2 Adicionar `crypto-js` às `devDependencies`, rodar `npm install` e confirmar que `node -e "require('crypto-js')"` funciona no ambiente de teste; verificar que o build mantém `crypto-js` externo.
- [ ] 1.3 Adicionar a entrada `brflix` ao `manifest.json` com nome `BRFlix`, versão `1.0.0`, autor `nathanael540`, tipos `movie` e `tv`, formatos `m3u8` e `mp4`, `contentLanguage` `pt` e logo HTTPS; verificar com `node --test test/manifest.test.js` e `node build.js brflix`.
- [ ] 1.4 Criar `test/fixtures/brflix/` com respostas reais sanitizadas: filme com MP4 e HLS, série, `ok:false`, candidato somente `iframe`, resposta sem cifra e estrutura inválida; verificar que nenhum arquivo contém URL de mídia em texto claro, `md5=`, `expires=`, cookie ou token e que o ciphertext pode ser lido como opaco.
- [ ] 1.5 Conferir os arquivos gerados `providers/brflix.js`, `gdrive/providers/brflix.js`, `prism/providers/brflix.js` e os `<formato>/manifest.json`; verificar que os três pacotes exportam `getStreams` e que o build termina sem erro.

## 2. Consulta e decifragem do payload

- [ ] 2.1 Implementar em `api.js` a validação de `tmdbId` e `mediaType`, a exigência de temporada e episódio positivos para `tv` e a montagem da URL `https://brflix.lat/best-stream-resolve` com `dubbed=1` e `hq=0`; verificar com testes de filme, série, entrada inválida e ausência de `season`/`episode` em filme.
- [ ] 2.2 Implementar em `payload.js` a leitura de `enc`/`payload`, a decifragem AES-256-GCM pelo keystream AES-CTR com `crypto-js` (`AES`, `mode.CTR`, `pad.NoPadding`, `enc.Hex` e `enc.Base64`) e a aceitação de resposta sem cifra; verificar com um payload sintético gerado por `node:crypto` e com o payload real da fixture, sem persistir URL assinada.
- [ ] 2.3 Validar o JSON decifrado e a estrutura `ok`/`candidates`/`url`, lançando erro em `payload` ausente, IV diferente de 12 bytes, Base64 inválido, JSON inválido ou resultado sem `ok`; verificar com testes de cada falha e com `ok:false` devolvendo ausência reconhecida.
- [ ] 2.4 Documentar no código a origem da chave pública (`https://brflix.lat/app.js`, consultada em 12/11/2026) e a decisão de não verificar a tag GCM; verificar que `npm run lint` passa e que a mensagem de erro não imprime a chave nem o payload completo.

## 3. Triagem dos candidatos e streams

- [ ] 3.1 Implementar em `streams.js` a leitura de `candidates[]` com fallback para a URL de nível superior, o descarte de `iframe`, a resolução de URL relativa contra `https://brflix.lat/`, a deduplicação por URL final e a triagem de tipo `hls`/`mp4`; verificar com testes de MP4 e HLS, somente `iframe`, URL repetida, URL relativa, um candidato com URL inválida preservando o outro e todos os candidatos inválidos lançando erro agregado.
- [ ] 3.2 Montar cada stream com `buildStream` e `format: { template: FORMATTER.AUTO, addon: 'BRFlix' }`, `provider` do candidato, `type` do formato, `language` de `dubbed`, `headers` de `playbackHeaders('https://brflix.lat/')` e `quality` somente quando o valor for inteiro plausível de resolução; verificar com testes de HLS dublado, MP4 legendado, qualidade fracionária ignorada e campos ausentes.
- [ ] 3.3 Implementar `index.js` com o nome `BRFlix`, validação de entrada, `sortByQuality` e a fronteira de erro única: `console.error('[BRFlix] ...')` e retorno `[]`; verificar com testes de falha total, `ok:false` sem erro, aviso de opção descartada e duas chamadas gerando URLs distintas no mock.
- [ ] 3.4 Cobrir a suíte do provedor em `test/brflix.test.js` com o pacote gerado, usando `fetch` simulado e `test/support/basic-html.js` quando necessário; verificar com `node --test test/brflix.test.js` e conferir que os casos de filme, série, ausência, `iframe`, falha HTTP, JSON inválido, payload inválido e candidato inválido passam.

## 4. Documentação e catálogo

- [ ] 4.1 Adicionar a linha `BRFlix` e a seção `## BRFlix` em `providers.md` com status `🟠 Não verificado`, `—` na última verificação e sem bloco de verificação online; verificar com `node --test test/providers-catalog.test.js`.
- [ ] 4.2 Atualizar `docs/provider-investigation.md` com o método “agregador com resposta cifrada no cliente”, registrando a descoberta do endpoint, o formato `iv:tag:ciphertext`, a decifragem por keystream, a triagem `iframe`, as referências de código/teste e os limites de expiração e cobertura; verificar que o guia cita `src/brflix/`, `test/brflix.test.js` e a spec.
- [ ] 4.3 Confirmar que nenhum bloco novo é necessário e que `src/_blocks/index.md` e `docs/arch.md` não mudam; verificar com `node --test test/blocks-catalog.test.js` e com a revisão do diff de documentação.

## 5. Integração e verificação online

- [ ] 5.1 Rodar `npm run lint`, `npm test` e `node build.js brflix`, corrigindo falhas de estilo, JSDoc, fixture ou contrato; verificar que a suíte completa e o build terminam sem falhas.
- [ ] 5.2 Executar `npm run test:online -- --provider brflix` com o pacote já construído e conferir o relatório em `test/artifacts/online/`; se a rodada for inconclusiva ou falhar por bloqueio externo, registrar o motivo e manter o status `🟠 Não verificado` sem inventar evidência.
- [ ] 5.3 Registrar a rodada em `providers.md` quando houver resultado válido, ajustando o status conforme `docs/tests.md`; verificar com `node --test test/providers-catalog.test.js` e com a leitura do bloco final.

## Workflow follow-up

- Arquivar a mudança após os testes previstos passarem ou após as exclusões e os motivos estarem declarados.
- Conferir o resultado arquivado em `openspec/specs/brflix-provider/spec.md`.
