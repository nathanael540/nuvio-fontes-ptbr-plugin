# Tasks

## 1. Investigação e bloqueio

- [x] 1.1 Consultar cada alias por interface pública, registrar status, destino sanitizado e sinais de identidade, sem contornar controles de acesso.
- [x] 1.2 Comprovar identidade e contrato de eventual origem candidata, ou registrar o bloqueio e encerrar sem alterar o provedor se não houver evidência suficiente.
- [x] 1.3 Documentar evidências, limitações e solução específica no design antes de implementar; não aprovar origem por semelhança de nome.

## 2. Implementação condicionada à evidência

- [x] 2.1 Se comprovada uma solução segura, atualizar o provedor sem alterar o Pobreflix HD e preservar rejeição de origem não aprovada, validação de identidade e fallback.
- [x] 2.2 Acrescentar fixtures reais sanitizadas e testes offline para filme, episódio, ausência, falha de origem, identidade desconhecida e alias alternativo, conforme aplicáveis.
- [x] 2.3 Executar testes específicos, `npm run lint`, `npm test` e `node build.js pobreflix-nixplay`; corrigir falhas relacionadas.

## 3. Revalidação e documentação

- [x] 3.1 Coordenar o uso de saídas compartilhadas, executar `npm run build:min` e `npm run test:online -- --provider pobreflix-nixplay` sobre o pacote final; preservar relatórios de outras threads.
- [x] 3.2 Conferir identidade e resultados dos cinco casos por tipo em `prism/all/all/all`; registrar rodada e classificação conforme `docs/tests.md` em `providers.md`, inclusive falhas ou inconclusões.
- [x] 3.3 Sincronizar documentação aplicável e registrar no design casos não verificados, resultados e limitações antes de arquivar.
