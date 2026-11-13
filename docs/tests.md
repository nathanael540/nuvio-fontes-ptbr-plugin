# Testes

Tipos de teste do repositório, o que cada um cobre e seus limites. Os comandos estão em [test/README.md](../test/README.md).

Todos os testes de desenvolvimento rodam em Node, sem o app Nuvio instalado, sem aparelho e sem internet. A verificação de funcionamento online é um comando separado e explícito, com rede real; ela não roda em `npm test` e não substitui os testes de desenvolvimento. Não há plataforma de validação obrigatória fora do Node.

## 1. Camadas

1. **Lint** (`npm run lint`): aplica as restrições do runtime do app em `src/` (globais e módulos permitidos, sem APIs do Node) e exige JSDoc completo nas funções exportadas dos blocos. É a barreira contra código que só falharia no QuickJS.
2. **Testes Node** (`npm test`): `node:test` nativo. Validam a lógica dos blocos, dos provedores, do build, do manifest e dos catálogos com respostas controladas.
3. **Build** (`node build.js <id>`): confirma que o provedor empacota em CommonJS `es2016` no arquivo base e em cada formato.
4. **Verificação online** (`npm run test:online -- --provider <id>`): executa o pacote publicado com rede real, cinco títulos sorteados por tipo suportado, e produz a evidência de funcionamento usada em `providers.md`. Exige build prévio e, quando o provedor consulta o TMDB, `TMDB_API_KEY` no ambiente local.

## 2. Suítes

1. **Blocos** (`test/blocks/<bloco>/index.test.mjs`): uma suíte por bloco, importando `src/_blocks/<bloco>/index.mjs` diretamente. `globalThis.fetch` é substituído por respostas controladas. O teste `test/blocks-catalog.test.js` exige exatamente uma suíte por bloco e confere o catálogo `src/_blocks/index.md` contra as pastas existentes.
2. **Provedores** (`test/<id>.test.js`): empacotam o provedor com `buildProvider` em diretório temporário, nos formatos publicados, e executam o pacote gerado com `fetch` simulado a partir de `test/fixtures/<fonte>/`. O teste exercita o mesmo arquivo publicado, não só o código-fonte. Os casos do provedor (filme, episódio avulso, episódio em pacote e ausência, quando aplicáveis) ficam aqui.
3. **Manifest** (`test/manifest.test.js`): campos obrigatórios e convenções de `docs/arch.md` (seção Manifest) e sincronia dos `<formato>/manifest.json` com o `manifest.json`.
4. **Catálogo de provedores** (`test/providers-catalog.test.js`): `providers.md` lista exatamente os provedores do manifest, com o mesmo nome e status visual válido, `Desativado` somente para `enabled: false`, uma seção `## <nome>` com `**Status: <status>.**` e consistência entre tabela, seção e a última rodada online.
5. **Build** (`test/build.test.js`): o template empacota em CommonJS sem `async`/`await`; provedor ou formato inexistente falha de forma explícita; os formatos vêm do bloco `custom-formatter`; os manifests de formato são gerados corretamente.
6. **Servidor** (`test/server.test.js`): rotas permitidas, CORS e 404 fora das rotas do servidor local.
7. **Catálogos online** (`test/online-catalog.test.js`): valida os catálogos e os perfis de nicho da verificação online sem acessar a internet. Confere mínimo de 20 títulos, ausência de truncamento, unicidade, coordenadas de episódio, tags, IDs de provedores e amostra elegível por perfil.
8. **Infraestrutura online** (`test/online-*.test.js`): cobre amostragem, classificação, carregador do pacote, `fetch`, worker, relatório, registro em Markdown e argumentos do runner. Nenhuma suíte usa rede; a execução real só ocorre no comando `test:online`.

## 3. Catálogos de referência

1. Existem exatamente dois catálogos, `test/online/catalogs/movie.json` e `tv.json`, com no mínimo 20 títulos reais distintos cada e sem máximo. Não há catálogo por nicho e nenhum título é descartado por passar do mínimo.
2. Cada título tem `tmdbId`, `title`, `year` e `tags`. Filme não aceita `season` nem `episode`; série exige temporada e episódio positivos de conteúdo já lançado. O ID é único dentro do catálogo e pode coincidir entre filme e série.
3. A curadoria registra a referência pública de popularidade, a data e a revisão. A conferência de IDs, anos e episódios usa referências públicas e fica registrada no design da mudança que alterou o catálogo. O ranking é um recorte datado, sem atualização automática.
4. As tags (`anime`, `dorama` e outras em kebab-case) classificam o nicho sem criar tipos de mídia. `test/online/profiles.json` só configura um nicho quando a fonte é exclusiva; sem entrada, o provedor é generalista e usa todo o catálogo do tipo. Hoje o Doramogo usa a tag `dorama`, com filmes e séries elegíveis nos dois catálogos; os demais provedores são generalistas.
5. Um perfil exclusivo precisa de pelo menos cinco candidatos elegíveis por tipo suportado. Provedor desconhecido, tag desconhecida ou amostra insuficiente impedem a preparação, sem reduzir a amostra ou trocar de nicho.

## 4. O que um teste de provedor confere

1. Lista devolvida por `getStreams` para filme, episódio avulso, episódio em pacote e ausência, quando aplicáveis.
2. `url` de cada stream: HTTP(S), magnet com hash hexadecimal de 40 caracteres ou `torrent://<hash>/<índice>` com o índice do arquivo do episódio.
3. `quality`, `language` (um dos seis valores do enum), `size`, `infoHash`, `seeders`, `peers`, `headers` de reprodução e `subtitles`, quando a fonte os fornece.
4. `name` e `title` gerados pelo formatador nos formatos publicados.
5. Caso negativo: lista vazia sem erro fatal. Falha de uma opção de mídia: descarte só daquela opção, com o aviso no `console.warn`.

## 5. Regras para escrever testes

1. Testes de desenvolvimento não acessam a internet: toda resposta de fonte vem de fixture ou de resposta montada no próprio teste. Somente a verificação online, acionada por comando próprio, usa rede real.
2. Fixtures ficam em `test/fixtures/<fonte>/`: respostas reais da fonte, com o mínimo necessário e sem dados pessoais, cookies, tokens ou URLs assinadas.
3. Temporários e saídas ficam em `test/artifacts/` (use `createTempDir` de `test/support/temp-dir.js`); a pasta é ignorada pelo Git, pelo lint e pela descoberta de suítes.
4. `test/support/basic-html.js` é um substituto mínimo do cheerio (seleção CSS, `find`, `text`, `html`, `attr`). Use no provedor só a API básica do cheerio listada em `docs/arch.md`. Na verificação online, o módulo real é usado; `basic-html` nunca entra nesse caminho.
5. Só arquivos `*.test.js` e `*.test.mjs` sob `test/` são suítes; servidor e utilitários não rodam por estarem na pasta.
6. Ao alterar um bloco, rode as suítes dos provedores que o usam, porque o bloco entra no pacote de cada um. A verificação online, quando aplicável, usa o pacote final já reconstruído.

## 6. Limites

1. O Node não reproduz o QuickJS: as diferenças conhecidas de `URL`, `URLSearchParams`, cheerio e globais (`docs/arch.md`, seção Runtime) são barradas pelo lint e pelas regras de código, não pelos testes.
2. Fixtures envelhecem: uma fonte que muda o HTML ou a API quebra no uso real com os testes ainda verdes. A aprovação offline não comprova funcionamento; a rodada online correspondente é que registra a evidência.
3. A verificação online não reproduz vídeo, não baixa mídia por P2P, não mede seeders e não confirma o funcionamento no app. Ela apenas executa o pacote e valida o contrato dos streams devolvidos.

## 7. Status dos provedores

O status em `providers.md` reflete a evidência online aplicável ao pacote e ao perfil avaliados. Aprovação e cobertura de testes offline não participam da classificação. Na tabela, `Estável` usa `🟢`, `Parcial` usa `🔵`, `Instável` usa `🔴`, `Não verificado` usa `🟠` e `Desativado` usa `⚫`.

1. **Estável:** ao menos um título resolvido em cada tipo suportado. A proporção (`movie 1/5`, `tv 1/5`) é apenas um indicativo de acervo na amostra e não muda o requisito mínimo.
2. **Parcial:** ao menos um tipo comprovado e outro concluído sem resolução (todos os cinco casos como `Sem resultado` ou `Falha`).
3. **Instável:** todos os tipos concluídos sem resolução.
4. **Não verificado:** sem evidência online válida para o pacote e o perfil atuais: nenhuma rodada, rodada inconclusiva sem conclusão anterior, falha de preparação, ou pacote/perfil/catálogo diferente do avaliado.
5. **Desativado:** `enabled: false` no manifest tem prioridade sobre qualquer evidência.
6. Casos inconclusivos permanecem visíveis e não reduzem o denominador de cinco. A quantidade de streams e o número de títulos resolvidos não compensam um tipo sem resolução, e um caso inconclusivo não é descrito como ausência no acervo.

## 8. Resumo e registro

1. `providers.md` é a fonte versionada da última evidência online. A tabela exibe `🟢` para `Estável`, `🔵` para `Parcial`, `🔴` para `Instável`, `🟠` para `Não verificado` e `⚫` para `Desativado`, além da data da última verificação em `AAAA-MM-DD`.
2. Cada seção de provedor tem um bloco delimitado com somente a última rodada. Ela registra data com fuso, ID, status, versão do pacote, perfil, revisões dos catálogos, semente, algoritmo e os casos por título com temporada e episódio quando aplicáveis. Hashes não aparecem no resumo público.
3. A evidência só vale para a versão do pacote, o perfil e as revisões de catálogo atuais. Se esses dados mudarem, a rodada antiga permanece no bloco, mas a tabela fica `Não verificado` até uma nova execução.
4. Uma rodada nova substitui a anterior, inclusive quando é inconclusiva. O histórico completo não é mantido no Markdown; os relatórios transitórios ficam em `test/artifacts/online/`.
5. Reprocessar o mesmo ID não duplica a rodada; conteúdo divergente com o mesmo ID é rejeitado. A escrita é atômica e altera somente a linha e o bloco do provedor selecionado.
6. Contagens de testes offline não entram no resumo. Reprodução, download P2P e disponibilidade de seeders não são registrados como resultado online.
