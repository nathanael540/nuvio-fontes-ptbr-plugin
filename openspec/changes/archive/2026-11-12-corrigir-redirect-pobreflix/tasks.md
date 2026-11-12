# Tasks

## 1. Regra de redirect por base

- [x] 1.1 Criar `ALLOWED_DOMAIN_BASES` com `pobreflixtv`, `flixtv` e `thepobretvflix` e substituir a comparação de origem completa por `base.tld`/`www.base.tld` com TLD de um rótulo; testar bases permitidas, `evilpobreflixtv.com`, `pobreflixtv.evil.com`, `sub.pobreflixtv.town` e HTTP.
- [x] 1.2 Atualizar `fetchAjax` para seguir um único redirect HTTPS permitido, rejeitar cascata e continuar as chamadas seguintes na origem final do conteúdo/episódio; testar redirect permitido, redirect fora da regra e redirect repetido.
- [x] 1.3 Adicionar teste de integração do fluxo `.golf` → `.town` cobrindo busca, página com TMDB confirmado, `episodesList`/`playerData` no host final e opções de player; atualizar os testes existentes que assumem a lista fixa de domínios.

## 2. Build e evidência online

- [x] 2.1 Subir a versão do Pobreflix HD no `manifest.json`, executar `node build.js pobreflixtv` e confirmar os três pacotes gerados e `test/manifest.test.js`.
- [x] 2.2 Executar `npm run lint`, `npm test` e `openspec validate corrigir-redirect-pobreflix --strict`; registrar no design as falhas preexistentes e o resultado dos testes do provedor.
- [x] 2.3 Com `TMDB_API_KEY` no ambiente, executar `npm run test:online -- --provider pobreflixtv --record` usando o pacote final e confirmar no relatório e em `providers.md` se o Pobreflix HD deixou de falhar por redirect; registrar o resultado real, inclusive se os players ainda falharem.

## Workflow follow-up

- Arquivar a change depois da revisão e da rodada online do pacote final.
