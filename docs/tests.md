# Testes

Tipos de teste do repositório, o que cada um cobre e seus limites. Os comandos estão em [test/README.md](../test/README.md).

Todos os testes rodam em Node, sem o app Nuvio instalado, sem aparelho e sem internet. Não há plataforma de validação obrigatória fora do Node.

## 1. Camadas

1. **Lint** (`npm run lint`): aplica as restrições do runtime do app em `src/` (globais e módulos permitidos, sem APIs do Node) e exige JSDoc completo nas funções exportadas dos blocos. É a barreira contra código que só falharia no QuickJS.
2. **Testes Node** (`npm test`): `node:test` nativo. Validam a lógica dos blocos, dos provedores, do build, do manifest e dos catálogos com respostas controladas.
3. **Build** (`node build.js <id>`): confirma que o provedor empacota em CommonJS `es2016` no arquivo base e em cada formato.

## 2. Suítes

1. **Blocos** (`test/blocks/<bloco>/index.test.mjs`): uma suíte por bloco, importando `src/_blocks/<bloco>/index.mjs` diretamente. `globalThis.fetch` é substituído por respostas controladas. O teste `test/blocks-catalog.test.js` exige exatamente uma suíte por bloco e confere o catálogo `src/_blocks/index.md` contra as pastas existentes.
2. **Provedores** (`test/<id>.test.js`): empacotam o provedor com `buildProvider` em diretório temporário, nos formatos publicados, e executam o pacote gerado com `fetch` simulado a partir de `test/fixtures/<fonte>/`. O teste exercita o mesmo arquivo publicado, não só o código-fonte. Os casos do provedor (filme, episódio avulso, episódio em pacote e ausência, quando aplicáveis) ficam aqui.
3. **Manifest** (`test/manifest.test.js`): campos obrigatórios e convenções de `docs/arch.md` (seção Manifest) e sincronia dos `<formato>/manifest.json` com o `manifest.json`.
4. **Catálogo de provedores** (`test/providers-catalog.test.js`): `providers.md` lista exatamente os provedores do manifest, com o mesmo nome, status válido, `Desativado` somente para `enabled: false`, e uma seção `## <nome>` com a linha `**Status: <status>.**`.
5. **Build** (`test/build.test.js`): o template empacota em CommonJS sem `async`/`await`; provedor ou formato inexistente falha de forma explícita; os formatos vêm do bloco `custom-formatter`; os manifests de formato são gerados corretamente.
6. **Servidor** (`test/server.test.js`): rotas permitidas, CORS e 404 fora das rotas do servidor local.

## 3. O que um teste de provedor confere

1. Lista devolvida por `getStreams` para filme, episódio avulso, episódio em pacote e ausência, quando aplicáveis.
2. `url` de cada stream: HTTP(S), magnet com hash hexadecimal de 40 caracteres ou `torrent://<hash>/<índice>` com o índice do arquivo do episódio.
3. `quality`, `language` (um dos seis valores do enum), `size`, `infoHash`, `seeders`, `peers`, `headers` de reprodução e `subtitles`, quando a fonte os fornece.
4. `name` e `title` gerados pelo formatador nos formatos publicados.
5. Caso negativo: lista vazia sem erro fatal. Falha de uma opção de mídia: descarte só daquela opção, com o aviso no `console.warn`.

## 4. Regras para escrever testes

1. Sem acesso à internet: toda resposta de fonte vem de fixture ou de resposta montada no próprio teste.
2. Fixtures ficam em `test/fixtures/<fonte>/`: respostas reais da fonte, com o mínimo necessário e sem dados pessoais, cookies, tokens ou URLs assinadas.
3. Temporários e saídas ficam em `test/artifacts/` (use `createTempDir` de `test/support/temp-dir.js`); a pasta é ignorada pelo Git, pelo lint e pela descoberta de suítes.
4. `test/support/basic-html.js` é um substituto mínimo do cheerio (seleção CSS, `find`, `text`, `html`, `attr`). Use no provedor só a API básica do cheerio listada em `docs/arch.md`.
5. Só arquivos `*.test.js` e `*.test.mjs` sob `test/` são suítes; servidor e utilitários não rodam por estarem na pasta.
6. Ao alterar um bloco, rode as suítes dos provedores que o usam, porque o bloco entra no pacote de cada um.

## 5. Limites

1. O Node não reproduz o QuickJS: as diferenças conhecidas de `URL`, `URLSearchParams`, cheerio e globais (`docs/arch.md`, seção Runtime) são barradas pelo lint e pelas regras de código, não pelos testes.
2. Fixtures envelhecem: uma fonte que muda o HTML ou a API quebra no uso real com os testes ainda verdes. Ao corrigir, grave a resposta nova da fonte e atualize a fixture; enquanto isso, o provedor fica Instável em `providers.md`.

## 6. Status dos provedores

O status em `providers.md` mede a cobertura dos testes Node, não um teste no app.

1. **Estável:** filme, episódio, pacote e ausência (os aplicáveis) cobertos por testes Node passando, com fixtures de respostas reais da fonte.
2. **Parcial:** parte dos casos sem teste Node, ou cobertura ainda não conferida depois do reset de 12/11/2026.
3. **Instável:** os testes passam, mas a fonte real mudou ou está fora do ar e as fixtures não a representam mais.
4. **Desativado:** `enabled: false` no manifest.
3. Reprodução, P2P e tempo de resposta não são verificados: os testes conferem os campos devolvidos (`url`, `headers`, `infoHash`, índice do arquivo), não o vídeo.
