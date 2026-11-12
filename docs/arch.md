# Arquitetura

Estrutura, padrões e convenções globais do repositório. Este documento só muda quando um deles muda.

Referências:

1. [Documentação oficial de provedores do Nuvio](https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md).
2. Código do app [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile): leitura dos plugins em `features/plugins/runtime/PluginRuntime.kt`, `require` em `features/plugins/runtime/js/JsBindings.kt`, modelo de stream em `features/streams/StreamModels.kt` e P2P em `features/p2p/`.
3. Código do app [NuvioTV](https://github.com/NuvioMedia/NuvioTV): runtime em `core/plugin/PluginRuntime.kt` e resultado do plugin em `domain/model/Plugin.kt`.
4. Quando a documentação oficial e o código do app divergem, vale o código.

## 1. Visão geral

1. O Nuvio baixa um `manifest.json` deste repositório pela URL raw do GitHub, no branch `main`: o da raiz ou o `<formato>/manifest.json` do template de formatação escolhido.
2. Para cada entrada em `scrapers`, o app baixa o arquivo indicado em `filename` (`providers/<id>.js`), relativo à pasta do manifest.
3. O app executa o arquivo no motor JavaScript QuickJS e chama `getStreams(tmdbId, mediaType, season, episode)`.
4. O provedor consulta a fonte, extrai URLs diretas (m3u8, mp4, mkv) ou links de torrent e devolve uma lista de streams.

## 2. Estrutura de pastas

1. `src/<id>/`: código-fonte de cada provedor, em módulos ES. Ponto de entrada obrigatório: `index.js`.
2. `src/_template/`: modelo para novos provedores, já montado com os blocos no fluxo típico do catálogo: `index.js` (contrato do app, captura única de erros e ordenação por qualidade) e `extractor.js` (TMDB, busca, escolha do resultado, extração no player e montagem dos streams, com os pontos a adaptar comentados). Pastas com prefixo `_` não são empacotadas.
3. `src/_blocks/`: blocos reutilizáveis pelos provedores. `src/_blocks/index.md` é o catálogo; cada bloco fica em `src/_blocks/<bloco>/index.mjs` (inglês, kebab-case). O provedor importa só os blocos que usa, com o caminho completo (`../_blocks/<bloco>/index.mjs`), e o build os inclui no arquivo final.
4. `providers/<id>.js`: saída do build lida pelo app, versionada no Git. Sorteia o template de formatação a cada carregamento.
5. `gdrive/` e `prism/`: uma pasta por template de formatação, cada uma com `manifest.json` e `providers/<id>.js` com o template fixo. Geradas pelo build e versionadas.
6. `manifest.json`: registro do repositório e dos provedores publicados, escrito à mão. Os `<formato>/manifest.json` são gerados a partir dele.
7. `build.js`: empacotador (esbuild) de `src/<id>/` para `providers/<id>.js` e as variantes de formato, e gerador dos `<formato>/manifest.json`.
8. `test/`: toda a infraestrutura de testes, só em Node, sem o app instalado: suítes `node:test`, testes de blocos em `test/blocks/<bloco>/index.test.mjs`, fixtures em `test/fixtures/`, utilitários em `test/support/`, servidor local `test/server.js` e saídas geradas em `test/artifacts/` (ignorada pelo Git). Detalhes em [tests.md](tests.md).
9. `openspec/`: especificações (`specs/`) e mudanças (`changes/`, com as concluídas em `changes/archive/`).
10. `docs/`: arquitetura (`arch.md`) e testes (`tests.md`).
11. `providers.md`: tabela dos provedores publicados, com uma seção de status por provedor. O teste `test/providers-catalog.test.js` o confere contra o `manifest.json`.

Nunca edite manualmente `providers/`, `<formato>/providers/` nem `<formato>/manifest.json`.

## 3. Runtime do app (QuickJS)

1. O NuvioMobile e o NuvioTV executam cada provedor no QuickJS. A documentação oficial ainda descreve o Hermes, de versões anteriores do app.
2. A saída do build é um único arquivo CommonJS com `module.exports = { getStreams }`. O app não resolve `import` entre arquivos.
3. O build transpila para `es2016` (sem `async`/`await`), como o build oficial, por compatibilidade com versões anteriores do app.
4. APIs exclusivas do Node (`fs`, `crypto`, `Buffer` etc.) não existem no app.
5. Disponíveis nos dois apps: as globais `fetch`, `console`, `URL`, `URLSearchParams`, `AbortController`, `AbortSignal`, `atob`, `btoa`, `module`, `TMDB_API_KEY`, `SCRAPER_ID` e `SCRAPER_SETTINGS`, e via `require` apenas `cheerio-without-node-native` (também aceito como `cheerio` ou `react-native-cheerio`) e `crypto-js`. Esses módulos são externos no build. `TextEncoder`, `TextDecoder`, `crypto`, `setTimeout`/`setInterval` e `WebAssembly` existem só no NuvioMobile e não devem ser usados. O lint aplica essa lista.
6. `axios` não está disponível: os apps lançam `Module 'axios' is not available`, apesar de a documentação oficial citá-lo. Use o `fetch` global.
7. No NuvioTV, o `cheerio` é uma implementação própria sobre o jsoup, com API reduzida: `load`, seleção por CSS, `eq`, `find`, `text`, `html`, `attr`, `next` e `prev`. As coleções têm `length`, mas não expõem elementos por índice (`colecao[i]`); use `colecao.eq(i)`.
8. Nada de rede ou trabalho pesado no carregamento do módulo; toda a lógica fica dentro de `getStreams`.
9. Os dois apps criam a global `TMDB_API_KEY` antes de executar o plugin (chave do usuário ou do app). Nenhuma chave fica no repositório.
10. Confirmados no QuickJS dos dois apps: `String.prototype.normalize('NFD')`, `new Error(mensagem, { cause })` preservando `cause`, `response.url` preenchido pelo `fetch`, `response.arrayBuffer` e os recursos de regex usados pelos blocos. `Promise.allSettled` não foi confirmado: converta cada promessa em resultado ou falha antes de `Promise.all`.
11. Alterar um `URL` por `searchParams.set` ou `searchParams.append` não atualiza o `href`. Monte a query como texto, por exemplo `` `${base}?${new URLSearchParams(params)}` ``.
12. O `URLSearchParams` dos apps é um polyfill sem `Symbol.iterator`: `for (const par of params)` e `[...params]` lançam `value is not iterable`. Use `params.entries()`, `params.keys()` ou `params.forEach()`. Chaves repetidas não se acumulam: `append` substitui o valor.
13. Serviços externos (bypass, proxy, VPN ou outro) só são usados quando forem abertos, públicos e utilizáveis sem conta e sem chave. A única chave externa é `TMDB_API_KEY`. Cálculo local no aparelho é permitido. `hasSettings` e `SCRAPER_SETTINGS` não carregam segredo.

## 4. Contrato do provedor

1. Entrada: `tmdbId` (string), `mediaType` (`"movie"` ou `"tv"`), `season` e `episode` (números a partir de 1; `null` para filmes). Os apps entregam o ID numérico do TMDB, mesmo para títulos de catálogos baseados em IMDb.
2. Saída: `Promise` de lista de streams. Campos de cada stream:
   1. `url` (obrigatório): URL direta HTTP(S) de vídeo (mp4, mkv, m3u8), link magnet ou `torrent://<hash>/<índice>` (item 3). O app descarta, sem aviso, streams sem `url`.
   2. `name` e `title` (obrigatórios): gerados pelo bloco `custom-formatter` a partir do campo `format` (item 8). `buildStream` rejeita `name` e `title` informados pelo provedor.
   3. `quality` (obrigatório): ex.: `"1080p"`, `"720p"`, `"4K"`, `"CAM"` ou `"Desconhecida"`. Sem qualidade informada pela fonte, ela é descoberta localmente nos textos já obtidos (`qualityHints`, arquivo, pasta, URL); sem correspondência, vale `"Desconhecida"`. Não há requisição extra só para descobrir qualidade. O stream com qualidade desconhecida é preservado e fica no fim da ordenação.
   4. `size`: tamanho em texto, ex.: `"2.5 GB"`.
   5. `language`: um dos seis valores do enum `LANGUAGE` (bloco `language-discovery`): `"Dublado"`, `"Dublado (Não PT-BR?)"`, `"Legendado"`, `"Legendado (Não PT-BR?)"`, `"Não PT-BR"` e `"Idioma Desconhecido"`. Os sufixos `(Não PT-BR?)` indicam português confirmado sem região brasileira comprovada; o `?` é parte do valor. Na entrada de `buildStream`, informe só classificação confiável ou omita; sem ela, o idioma é descoberto em `format.filename`, `format.folderName` e `languageHints` (textos confiáveis da opção). A saída sempre traz um membro do enum.
   6. `headers`: cabeçalhos HTTP enviados na reprodução, ex.: `User-Agent` e `Referer`. O app ignora `Range`.
   7. `subtitles`: legendas externas, cada uma com `url` e `language` (sem ele o app exibe "Unknown"), e `name` e `headers` opcionais.
   8. `infoHash`: hash do torrent, em streams magnet e `torrent://`.
   9. `provider`: servidor, hospedagem ou catálogo de origem dentro da fonte, ex.: `"Filemoon"`.
   10. `type`: tipo do stream em texto.
   11. `seeders` e `peers`: inteiros, em streams de torrent.
   12. `behaviorHints`: `audioDelayMs` e `audioDelayLanguage`. Lido só pelo NuvioTV.
3. Torrent:
   1. Magnet no formato `magnet:?xt=urn:btih:<hash>`, com hash hexadecimal de 40 caracteres. Hash base32 é convertido pelo provedor; o app aceita o stream, mas o P2P falha.
   2. Inclua `dn`, `xl` e `tr` no magnet e o mesmo hash em `infoHash`. `headers` não se aplica.
   3. Sem índice de arquivo, o app toca o maior arquivo do torrent. Episódio em pacote de temporada sai como `torrent://<hash>/<índice>`, com o índice do arquivo na lista do `.torrent` (blocos `torrent-files` e `stream-build`, `buildTorrentFileUrl`). Sem exatamente um arquivo identificado como o episódio, o pacote é descartado; nunca sai como magnet sem índice para episódio. O runtime não repassa `fileIdx` nem `behaviorHints.filename` ao motor P2P.
   4. O app pede o aceite do P2P antes de reproduzir; o provedor não trata esse passo. O IP do usuário fica visível aos demais participantes.
4. Campos opcionais são informados sempre que a fonte os fornecer, mesmo os que o app ainda não usa.
5. Falhas: só `getStreams` captura erros genericamente; registra com `console.error('[Nome] ...')` e retorna `[]`.
6. Dentro do provedor, erros de rede e parsing são lançados. Exceção: cada opção de mídia independente (player, host, playlist ou arquivo) é resolvida isoladamente; a falha de uma descarta só essa opção, com `console.warn('[Nome] Opção <rótulo> descartada: <causa>')`. Se nenhuma opção produzir stream e alguma tiver falhado, o provedor lança um erro com a causa de cada uma. Descarte por critério de triagem documentado não é falha. Etapas anteriores às opções (entrada, TMDB, busca, página do conteúdo) continuam fatais.
7. Tempo: o provedor não impõe limite de tempo nem cancela por demora; o app encerra os provedores após a espera configurada pelo usuário. Espelhos e alternativas são tentados por falha, não por lentidão.
8. Formatação: o provedor monta todo stream com `buildStream` e o campo `format` (`template: FORMATTER.AUTO`, nome do provedor em `addon` e o máximo de detalhes da release: título, ano, temporada, episódio, `filename`, `folderName`, `folderSize`). Os blocos de montagem (`torrent-release`, `wordpress-torrent` e `fireplayer`) sempre formatam seus streams. Regras dos templates:
   1. Os apps mostram só o `name` e uma linha própria com qualidade, tamanho e idioma; o `title` não aparece na lista. O `name` leva o cabeçalho com a qualidade e os detalhes que o app não mostra; o `title` traz todas as linhas.
   2. Tipo de entrega derivado da `url`: `🧲 P2P` para `magnet:` e `torrent://`, `🌐 HTTP` para http(s).
   3. Áudio numa linha única `🗣️ <valor do enum>`. Para filtrar só dublado brasileiro, compare a linha inteira com `^🗣️ Dublado$`.
   4. Em P2P, seeders e peers (`👥` no Google Drive, `🌱` no Prism), com `?` para contagem ausente.
   5. Qualidade desconhecida no cabeçalho: `<addon> Desconhecida` no Google Drive e `❓ Desconhecida` no Prism.
   6. Textos cortados por limite de caracteres (tabela `LIMITS` do bloco); arquivo e pasta cortados no meio. A pasta só aparece no `title`.
9. O NuvioMobile reordena os streams de um provedor na lista; a ordem devolvida não é garantida na tela.
10. Sites da mesma rede (mesmo acervo e mesmos hashes) entram como catálogos de um único provedor: cada catálogo roda isolado e os resultados são unidos sem repetir torrent (`infoHash` no magnet; hash e índice no `torrent://`).

## 5. Manifest

1. Objeto com `name`, `version` e `scrapers`.
2. Campos obrigatórios em cada entrada de `scrapers`: `id`, `name`, `description`, `version`, `author`, `supportedTypes`, `filename`, `enabled`, `formats`, `contentLanguage` e `logo`.
3. `logo` é uma URL `https` de imagem que identifica a fonte, ex.: `https://www.google.com/s2/favicons?domain=<dominio>&sz=128`.
4. Campos opcionais da documentação oficial, usados só quando necessários: `limited`, `disabledPlatforms`, `supportsExternalPlayer` e `hasSettings`.
5. `contentLanguage` usa `"pt"`. Dublado ou legendado vai na `description` e no `language` de cada stream.
6. `formats` descreve o que o provedor entrega (ex.: `["m3u8"]`, `["magnet"]`); o app não o usa para decidir a reprodução.
7. Convenções verificadas pelos testes: `id` em kebab-case e único; `filename` igual a `providers/<id>.js`; `version` em semver; `supportedTypes` não vazio, só com `movie` e/ou `tv`; `formats` não vazio; `contentLanguage` com `"pt"`; `logo` em `https`; o arquivo exporta `getStreams`.
8. Cada `<formato>/manifest.json` repete o `version` e as entradas do `manifest.json`, na mesma ordem e com os mesmos `id` e `filename`, e só acrescenta ` (<formato>)` ao `name`. Quem instala dois manifests vê cada stream repetido.
9. O NuvioMobile acrescenta `/manifest.json` a toda URL de repositório que não termina assim e resolve o `filename` pela pasta do manifest. Por isso cada variante é uma pasta com seu próprio `manifest.json`.
10. Atualizar o repositório no NuvioMobile baixa de novo o manifest e o código de cada provedor, sem depender de mudar `version`.

## 6. Build, lint e dependências

1. `npm run build` empacota todos os provedores; `node build.js <id>` só os informados. Cada provedor gera o arquivo base e uma variante por template (o `define` do esbuild fixa `NUVIO_FORMATTER`), e toda execução gera de novo os `<formato>/manifest.json`. A lista de templates vem do enum `FORMATTER` do bloco `custom-formatter`.
2. `npm run build:min` gera a versão minificada. O build sai com código 1 se algum arquivo falhar.
3. `npm run lint` roda o ESLint com três perfis em `eslint.config.mjs`: runtime do app (`src/`, só as globais e módulos da seção 3, item 5), blocos (`src/_blocks/**/index.mjs`, mais JSDoc completo nas funções exportadas) e Node (scripts da raiz e `test/`).
4. Requer Node.js `^22.22.2 || >=24.15.0` (campo `engines`).
5. `overrides` do `package.json` fixa `minimatch@^11.0.5`, versão corrigida exigida pelas dependências do ESLint. Remova quando elas aceitarem a versão corrigida sem o override.
6. Antes de publicar, `npm audit` deve terminar sem vulnerabilidades.
7. Publicação pelo branch `main`; renomeá-lo quebra a URL de quem já adicionou o repositório.

## 7. Convenção de commits

1. Conventional Commits, com tipos em inglês e descrição em pt-BR. As regras ficam em [AGENTS.md — Commits](../AGENTS.md#commits), com exemplos no [README](../README.md#commits).
