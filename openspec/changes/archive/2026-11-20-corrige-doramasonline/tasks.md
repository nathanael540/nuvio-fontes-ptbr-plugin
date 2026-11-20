# Tasks

## 1. Identidade com título decorado

- [x] 1.1 Adicionar em `test/fixtures/doramasonline/` as fixtures sanitizadas de busca e ficha de `Even If This Love Disappears Tonight (Se Esse Amor Desaparecesse Hoje)`, de `Round 6 (Squid Game)` (ficha e S01E01) e de `Wall to Wall (Meus 84 m²)`, além de uma variação do cartão de `Round 6 (Squid Game)` com ano 2023; verificar que o teste de sanitização de fixtures continua passando e que nenhuma URL de mídia, cookie, token ou hash foi incluído.
- [x] 1.2 Adicionar em `test/doramasonline.test.js` os casos de `Se Esse Amor...` (12 streams, 2 avisos isolados), `Round 6` (2 MP4, `q1n.net` em triagem), `Wall to Wall` (0 streams, sem erro) e `Round 6 (Squid Game)` com ano 2023 (rejeitado por ano); verificar que os casos novos falham antes da correção pelos motivos esperados, não por fixture inválida.
- [x] 1.3 Implementar em `src/doramasonline/catalog.js` as variantes do título (completo, cada segmento entre parênteses e o título sem parênteses) e aplicá-las em `bestTitleScore`, mantendo o limiar 0,85, o tipo de caminho e a igualdade de ano; verificar que `node --test test/doramasonline.test.js` passa com os casos novos e com os existentes.
- [x] 1.4 Confirmar que `Pousando no Amor`, `Hotel del Luna`, `Vincenzo`, `Parasita`, `The Glory`, busca vazia, tipo conflitante, opção quebrada e ausência continuam com o mesmo resultado; verificar pelos casos da suíte `test/doramasonline.test.js`.

## 2. Controles offline e build

- [x] 2.1 Rodar `npm run lint` e `npm test`; verificar código de saída 0 e registrar qualquer aviso que não seja falha.
- [x] 2.2 Rodar `node build.js doramasonline`; verificar que os pacotes base, `gdrive` e `prism` são gerados sem erro e que o manifest do provedor mantém os campos obrigatórios; se a versão for alterada, registrar o motivo no `design.md`.

## 3. Revalidação online

- [x] 3.1 Rodar `npm run build:min`; verificar que os pacotes publicados foram regenerados e que o build termina sem erro.
- [x] 3.2 Rodar `npm run test:online -- --provider doramasonline --seed 20261120` com `TMDB_API_KEY` somente no ambiente e `prism/all/all/all`; verificar a expectativa de filme 1/5 (`Se Esse Amor...` resolvido) e série 4/5 (`Round 6` resolvido, `Itaewon` em falha externa), registrando desvios com título, etapa e categoria.
- [x] 3.3 Se a rodada confirmar a correção, atualizar `providers.md` com a nova rodada e a classificação obtida; verificar com `node --test test/providers-catalog.test.js` que a tabela, a seção e o bloco da última rodada continuam consistentes. Se a rodada não confirmar, manter o status atual e registrar o bloqueio no `design.md` da change.

## 4. Documentação do método

- [x] 4.1 Atualizar `docs/provider-investigation.md` na seção do Doramas Online com a leitura do título decorado, os escores observados e os limites (`png.strp2p.com` em manutenção/404, `/do/v4/` quebrado na fonte e `q1n.net` como lander de anúncio); verificar que os links de código e teste continuam válidos.

## Workflow follow-up

- Arquivar a change somente depois de a rodada online registrar os casos esperados ou de as exclusões ficarem declaradas no `design.md`.
- Verificar a spec arquivada em `openspec/specs/doramasonline-provider/spec.md` e o bloco de `providers.md`.
