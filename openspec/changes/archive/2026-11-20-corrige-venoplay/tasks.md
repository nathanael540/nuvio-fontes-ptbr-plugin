# Tasks

## 1. Ausência localizada na busca

- [x] 1.1 Criar `test/fixtures/venoplay/search-empty-pt.html` a partir da página real sanitizada, com zero `div.poster-card`, `Nenhum resultado encontrado` na aba "Todos" e as mensagens de categoria; adicionar teste que executa o pacote e confirma `[]` sem `console.error` com `node --test test/venoplay.test.js`.
- [x] 1.2 Ampliar o reconhecimento de ausência em `src/venoplay/site.js` para aceitar a mensagem em português sem remover a inglesa; verificar os testes de busca em português, busca em inglês, página sem cartões e sem marcador (erro de estrutura) e página com cartões mais mensagem de categoria vazia (cartões processados).
- [x] 1.3 Adicionar teste de regressão para resposta HTTP 5xx na busca, como 522, verificando que o erro é HTTP saneado e não "Busca sem cartões nem mensagem explícita de ausência"; executar `node --test test/venoplay.test.js`.

## 2. HLS `.php` no host aprovado

- [x] 2.1 Criar `test/fixtures/venoplay/mgeb-hls-php.html` com `var sources` contendo uma fonte `type: hls` HTTPS `.php` em `mgeb.space` e dados sintéticos, sem URL de mídia real; adicionar teste que confirma um stream HLS montado e executar `node --test test/venoplay.test.js`.
- [x] 2.2 Atualizar `src/venoplay/player.js` para aceitar caminho `.m3u8` ou `.php` em `mgeb.space`/`mgeb.lat`, mantendo as rejeições de `workers.dev`, userinfo, `username`/`token`/`password`, hosts fora da lista e caminhos não comprovados; verificar os testes de aceitação e de triagem.
- [x] 2.3 Preservar os positivos com testes de `.m3u8` em `mgeb.space` para Grey's Anatomy e Breaking Bad, conferindo quantidade de streams, idioma, qualidade, deduplicação e ausência de avisos; executar `node --test test/venoplay.test.js`.

## 3. Documentação e limites

- [x] 3.1 Atualizar a seção 3.39 de `docs/provider-investigation.md` com o marcador localizado de ausência, o endpoint `.php` comprovado e os limites que continuam fora do contrato (`workers.dev`, MP4 com credencial, `uqload.vc`, 522); verificar que as referências apontam para `src/venoplay/` e `test/venoplay.test.js`.
- [x] 3.2 Confirmar que nenhum bloco de `src/_blocks/` mudou e que `src/_blocks/index.md` continua íntegro; se houver mudança de bloco, atualizar o catálogo e reconstruir os provedores que o usam.

## 4. Build e validação offline

- [x] 4.1 Executar `npm run lint`, `node --test test/venoplay.test.js`, `node build.js venoplay` e `npm test`; registrar os códigos de saída e confirmar que nenhum arquivo gerado foi editado à mão.
- [x] 4.2 Conferir os três pacotes gerados (`providers/venoplay.js`, `gdrive/providers/venoplay.js`, `prism/providers/venoplay.js`) e os manifests de formato; executar `node --test test/build.test.js` e `node --test test/manifest.test.js`.

## 5. Revalidação online

- [x] 5.1 Executar `npm run build:min` e `npm run test:online -- --provider venoplay --seed 20261120` com `TMDB_API_KEY` apenas no ambiente, sem `--record` na primeira execução; conferir os dez títulos e os critérios do design D4, sem sobrescrever o artefato de 20/11.
- [x] 5.2 Verificar especificamente Swallowed Star e Douluo Dalu como `Sem resultado` sem erro, Pantera Negra como `Resolvido` com ao menos um HLS em `mgeb.space`, e Grey's Anatomy e Breaking Bad ainda `Resolvido`; se a rodada for inconclusiva por 522 ou timeout, repetir e registrar o motivo saneado.
- [x] 5.3 Se os critérios passarem, repetir com `--record`, atualizar a linha e a seção do VenoPlay em `providers.md` e rodar `node --test test/providers-catalog.test.js`; se não passarem, manter o status real, registrar o resultado e não declarar a correção como comprovada.
- [x] 5.4 Comparar os dois casos originalmente falhos e os positivos, registrar no design os limites remanescentes e confirmar que nenhum segredo, URL de mídia ou URL assinada foi incluído nos artefatos.

## Workflow follow-up

- Arquivar somente depois da rodada online do pacote final e da revisão; se a rodada não comprovar a correção, declarar explicitamente o que ficou fora e manter a change aberta.
- Não atualizar `providers.md` nesta change de proposta; a atualização de status pertence à implementação que gerar o pacote novo.
