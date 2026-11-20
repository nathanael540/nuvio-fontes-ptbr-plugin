# Tasks

## 1. Investigação e bloqueio

- [x] 1.1 Investigar interfaces públicas atuais sem contornar controles e registrar no `design.md` data, método, respostas sanitizadas e limites; confirmar filme e episódio ou declarar bloqueio.
- [x] 1.2 Comprovar contrato, disponibilidade sem conta ou chave e reprodução de mídia permitida; se não comprovados, interromper a implementação e registrar próximos passos verificáveis.
- [x] 1.3 Revisar proposta, design e delta após descoberta, incluindo anime, legendas e 4K quando aplicáveis; validar que não há contrato presumido antes de implementar.

## 2. Correção condicionada à descoberta

- [x] 2.1 Adaptar `src/kairou/` à interface comprovada e criar fixtures reais sanitizadas; confirmar com testes Node que filme e episódio identificam corretamente o conteúdo.
- [x] 2.2 Cobrir ausência comprovada, HTTP 404, resposta inválida, anime, opções independentes, legendas, qualidade, 4K e deduplicação quando aplicáveis; verificar que falhas não viram ausência silenciosa.
- [x] 2.3 Executar `node build.js kairou`, `npm run lint` e `npm test` e registrar resultados e limitações no `design.md`.

## 3. Revalidação final

- [x] 3.1 Executar `npm run build:min` e `npm run test:online -- --provider kairou`, com `TMDB_API_KEY` apenas no ambiente; confirmar pacote final e combinação `prism/all/all/all` conforme `docs/tests.md`.
- [x] 3.2 Registrar em `providers.md` a rodada, identidade, amostra, resultados e limitações; definir status somente conforme critérios de `docs/tests.md`, sem tratar aprovação offline como publicação comprovada.
- [x] 3.3 Conferir arquivos gerados, documentação e specs consistentes; validar a change e registrar casos não cobertos antes do arquivamento.
