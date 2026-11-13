# Testes — comandos

Comandos e operação da infraestrutura de testes. Os testes de desenvolvimento rodam em Node, sem o app Nuvio instalado e sem internet; a verificação online é um comando separado, com rede real. Os tipos de teste, regras e limites estão em [docs/tests.md](../docs/tests.md).

## Estrutura

1. `test/*.test.js`: suítes de provedores, manifest, catálogos, build e servidor.
2. `test/blocks/<bloco>/index.test.mjs`: uma suíte por bloco de `src/_blocks/`.
3. `test/fixtures/<fonte>/`: respostas gravadas das fontes (HTML, JSON, playlists).
4. `test/support/`: utilitários dos testes (`temp-dir.js`, `basic-html.js`).
5. `test/server.js`: servidor HTTP local de manifests e pacotes.
6. `test/artifacts/`: saídas geradas (temporários Node em `test/artifacts/node/`), ignorada pelo Git.
7. `test/online/catalogs/`: catálogos de referência `movie.json` e `tv.json` da verificação online.
8. `test/online/profiles.json`: nichos exclusivos por provedor usados no filtro da amostra.
9. `test/online/run.mjs` e `test/online/lib/`: runner, carregador, amostragem, classificação, relatório e resumo da verificação online.
10. `test/artifacts/online/<run-id>/result.json`: relatório transitório sanitizado de cada rodada.

## Catálogos e perfis

1. Os catálogos `test/online/catalogs/movie.json` e `tv.json` têm no mínimo 20 títulos distintos cada e não têm limite máximo: todos os candidatos podem ser sorteados. Não há divisão por nicho em arquivos separados.
2. Cada título identifica `tmdbId`, `title`, `year` e `tags`. Filmes não têm coordenadas de episódio; séries acrescentam `season` e `episode` positivos de um episódio já lançado. O mesmo `tmdbId` pode existir nos dois catálogos, mas não se repete dentro do mesmo tipo.
3. A referência de popularidade (`popularitySource`), a data de curadoria (`curatedAt`), a revisão (`revision`) e a referência de conferência dos IDs (`verificationSource`) ficam versionadas no próprio catálogo. O ranking é um recorte datado, não uma promessa de atualização automática.
4. As tags são curadas em kebab-case (`anime`, `dorama` e outras que forem necessárias). Elas não criam tipos de mídia: o escopo continua sendo `supportedTypes` do manifest.
5. `test/online/profiles.json` mapeia um provedor ao seu nicho exclusivo. Sem entrada, o provedor é generalista e usa todos os candidatos do tipo. Hoje `animefire` usa `exclusiveTag: "anime"` e `doramogo` usa `exclusiveTag: "dorama"`; os demais provedores não têm entrada e seguem generalistas.
6. Um perfil exclusivo precisa manter ao menos cinco candidatos elegíveis por tipo suportado. Exemplo de formato, validado pelo teste:

```json
{ "providers": { "animefire": { "exclusiveTag": "anime" }, "doramogo": { "exclusiveTag": "dorama" } } }
```

7. ID de provedor fora do manifest, tag desconhecida e amostra insuficiente falham na preparação. O teste `test/online-catalog.test.js` cobre esses casos e não acessa a internet.

## Resumo em providers.md

1. A tabela de `providers.md` resume o status atual e a data da última verificação. Os indicadores são `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado`. A coluna de data mostra apenas `AAAA-MM-DD`.
2. Cada seção de provedor tem um bloco delimitado com somente a última rodada: data ISO 8601, ID, status, versão do pacote, perfil, revisões dos catálogos, semente, algoritmo e casos por título com temporada/episódio quando aplicáveis, resultado, contagem de streams e motivo saneado. Hashes não aparecem no resumo.
3. `--record` substitui a rodada anterior e recalcula a linha da tabela. Sem a opção, nenhum arquivo versionado é alterado. A mesma rodada reimportada não é duplicada; um ID repetido com conteúdo diferente é rejeitado.
4. A evidência só vale para a versão do pacote, o perfil e as revisões de catálogo atuais. Se esses dados mudarem, a rodada antiga permanece no bloco, mas a tabela fica `Não verificado` até uma nova execução. Uma nova tentativa inconclusiva substitui a anterior e também deixa o status `Não verificado`.
5. Não edite o bloco manualmente sem manter o formato: `test/providers-catalog.test.js` confere tabela, seções, data, emoji e a última rodada.

## Comandos

1. Instalar dependências: `npm install` (Node.js `^22.22.2 || >=24.15.0`).
2. Lint: `npm run lint`.
3. Todos os testes: `npm test`.
4. Uma suíte: `node --test test/<id>.test.js` ou `node --test test/blocks/<bloco>/index.test.mjs`.
5. Build de um provedor: `node build.js <id>`; de todos: `npm run build`.
6. Verificação online: `node build.js <id>` e depois `npm run test:online -- --provider <id>`.

## Verificação online

1. O comando `npm run test:online -- --provider <id>` usa o arquivo já gerado em `providers/<id>.js`; ele não reconstrói o pacote. Rode `node build.js <id>` antes.
2. A amostra tem cinco títulos por tipo declarado em `supportedTypes`, sorteados com semente. `--seed <valor>` repete a seleção; sem ela, o runner registra uma semente nova. `--timeout <ms>` troca o limite externo por caso (padrão 120000 ms).
3. Provedores que consultam o TMDB exigem `TMDB_API_KEY` no ambiente local, nunca em arquivo versionado. Exemplos: `$env:TMDB_API_KEY="sua-chave"; npm run test:online -- --provider dooplay` no PowerShell ou `TMDB_API_KEY=sua-chave npm run test:online -- --provider dooplay` em shell POSIX. Provedores que não consultam o TMDB rodam sem a chave.
4. `--record` acrescenta a rodada em `providers.md`, inclusive resultados negativos e inconclusivos. Sem a opção, o comando grava apenas o relatório transitório e o resumo no terminal.
5. Relatórios ficam em `test/artifacts/online/<run-id>/result.json`, sem streams completos, URLs, respostas brutas, cabeçalhos ou credenciais. A pasta é ignorada pelo Git.
6. Códigos de saída: `0` funcionamento comprovado em todos os tipos, `1` falta de resolução em algum tipo, `2` avaliação inconclusiva e `3` argumento, preparação ou registro inválido.
7. A verificação usa `fetch` real e o `cheerio-without-node-native` real. Fixtures, `basic-html` e módulos falsos não entram nesse caminho.
8. O Node não reproduz o QuickJS e o harness não reproduz vídeo nem P2P. A rodada comprova a resolução do pacote no Node, com os campos do contrato, não a reprodução no app.

## Servidor local

1. `npm start` serve por HTTP local, na porta 3000 (`PORT=xxxx` para trocar), somente:
   1. `/manifest.json` e `/providers/<id>.js`;
   2. `/<formato>/manifest.json` e `/<formato>/providers/<id>.js` para cada formato (`gdrive`, `prism`).
2. Outras rotas respondem 404. O endereço na rede local aparece no terminal.
3. O servidor entrega os arquivos gerados; rode o build antes. Ele não faz parte dos testes.
