# Tasks

## 1. Diagnóstico bloqueante

- [x] 1.1 Reproduzir os dois pedidos que falharam com instrumentação sanitizada e registrar operação, serviço, status e horário no design; verificar se o 404 é reproduzível e qual contrato o explica.
- [x] 1.2 Investigar ao menos um filme e uma série vazios, registrando contagens por etapa e distinção entre ausência, triagem e falha; não registrar segredos ou mídia.
- [x] 1.3 Documentar evidência e solução específica ou registrar bloqueio; não prosseguir para implementação sem causa e correção verificáveis, revisando spec e design se necessário.

## 2. Correção condicionada

- [x] 2.1 Adicionar fixtures reais sanitizadas e testes offline do caso causal, ausência, 404 não comprovado, 429/5xx, resposta inválida e identidade divergente; verificar com a suíte do provedor.
- [x] 2.2 Cobrir filme, episódio avulso, pacote, classificação de idioma e isolamento de opções; verificar resultados e logs com `node --test test/therarbg.test.js`.
- [x] 2.3 Implementar apenas a correção demonstrada preservando contrato e segurança; verificar que os testes direcionados passam.

## 3. Validação e registro

- [x] 3.1 Rodar `node build.js therarbg`, `npm run lint` e `npm test`; registrar resultados e falhas eventuais no design.
- [x] 3.2 Coordenar build compartilhado, rodar `npm run build:min` e revalidar `prism/all/all/all` com semente `20261120` segundo o runner; preservar relatórios alheios e registrar identidade, resultados e limitações.
- [x] 3.3 Se disponíveis, verificar pontualmente filme, episódio e pacote com candidatos elegíveis; registrar evidência sanitizada e distinguir essa verificação da amostra oficial.
- [x] 3.4 Atualizar `providers.md` conforme a rodada final e manter documentação e specs coerentes; verificar os testes de catálogo e declarar eventuais casos não validados antes do arquivamento.

## Workflow follow-up

1. Arquivar somente após a validação aplicável ou declaração explícita das limitações, sem apresentar investigação bloqueada como correção comprovada.
