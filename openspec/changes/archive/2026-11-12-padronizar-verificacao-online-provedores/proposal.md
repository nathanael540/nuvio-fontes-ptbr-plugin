# Proposal

## Why

O status publicado dos provedores hoje representa cobertura com respostas gravadas, que pode continuar verde quando a fonte real deixa de responder. Precisamos verificar a resolução online de títulos reais antes da publicação e registrar evidência comparável, mantendo testes offline exclusivamente como apoio ao desenvolvimento.

## What Changes

1. Criar exatamente dois catálogos de referência, `movie` e `tv`, cada um com no mínimo 20 títulos populares, sem limite máximo, identificados pelo TMDB e classificados com tags de nicho.
2. Sortear cinco títulos distintos por tipo suportado após filtrar os candidatos pelo nicho exclusivo do provedor, quando existir. Registrar a seleção e permitir reproduzi-la.
3. Executar o pacote do provedor com rede real, registrando resolução, ausência de resultado, falha ou execução inconclusiva por título, com temporada e episódio para `tv`.
4. Considerar o provedor funcionando quando resolver pelo menos um título de cada tipo que declara suportar. A quantidade e a proporção de títulos resolvidos servem exclusivamente como indicativo indireto de acervo na amostra.
5. **BREAKING**: substituir os critérios de status e publicação baseados em cobertura offline por evidência online; remover contagens de testes unitários de `providers.md`, sem excluir as suítes de desenvolvimento.
6. Manter a tabela resumida com status visual (`🟢`, `🔵`, `🔴`, `🟠`, `⚫`) e apenas a data da última verificação, e um bloco por provedor com somente a última rodada: identificação da execução, versão do pacote, perfil, catálogos, seleção e resultados individuais por título com coordenadas de episódio, sem hashes.
7. Manter `npm test` offline e introduzir execução online explícita, sem reprodução de vídeo, download P2P ou dependência do app instalado.

## Capabilities

### New Capabilities

1. `provider-online-verification`: catálogos por tipo, elegibilidade por tags, amostragem reproduzível, resolução online, critério de funcionamento e registro público das verificações.

### Modified Capabilities

Nenhuma. O repositório não tem specs principais após o reset; os critérios atuais estão documentados em `docs/tests.md` e serão substituídos na implementação.

## Impact

1. Infraestrutura nova sob `test/`, scripts do `package.json` e dependências de desenvolvimento necessárias para executar os módulos externos reais usados pelos provedores.
2. `test/providers-catalog.test.js` e novas suítes unitárias da infraestrutura: validar consistência do catálogo e dos registros sem executar rede ou determinar funcionamento real por fixtures.
3. `providers.md`, `README.md`, `docs/tests.md`, `docs/arch.md`, `test/README.md` e `AGENTS.md`: atualizar convenções, comandos, significado dos status e localização do resumo operacional.
4. `manifest.json`, `build.js`, `src/` e os pacotes publicados preservam seus contratos; `supportedTypes` continua definindo os tipos avaliados. A configuração de nicho pertence à infraestrutura de teste.
5. A chave `TMDB_API_KEY`, quando exigida pelo provedor, entra apenas pelo ambiente local de execução. Nenhuma chave, URL de stream ou resposta bruta sensível entra no resumo público.
