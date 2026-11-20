# Tasks

## 1. Estrutura do provedor e cadastro

- [x] 1.1 Criar `src/cineveo/site.js` com a base `https://cineveo.cfd`, os caminhos da API e da página do episódio, os grupos de áudio e o padrão do 404 documentado; verificar com `npm run lint` que o arquivo respeita o runtime do QuickJS.
- [x] 1.2 Criar `src/cineveo/index.js` com a fronteira de `getStreams` (`[Cineveo]`, captura única, `[]` em falha) e `src/cineveo/extractor.js` com a validação de entrada e a orquestração inicial; verificar que `node build.js cineveo` empacota o esqueleto sem erro.
- [x] 1.3 Adicionar a entrada `cineveo` em `src/manifest.json` (`movie` e `tv`, `mp4`, `contentLanguage: ["pt"]`, `filename: providers/cineveo.js`, logo `https`) e confirmar com `npm test` que o manifest e os catálogos continuam consistentes.

## 2. Detalhe por TMDB e filme

- [x] 2.1 Implementar a consulta `action=details` com `fetch` e `HEADER_PROFILES.api`, classificando o 404 documentado como ausência e os demais status/corpos como falha; cobrir em `test/cineveo.test.js` com fixtures de sucesso, 404 documentado, 404 inesperado e JSON inválido.
- [x] 2.2 Validar `type` e `tmdb_id` da resposta antes de usar o item, lançando erro em divergência; cobrir com testes de tipo trocado e identificador diferente.
- [x] 2.3 Ler `servers.dub[]` e `servers.leg[]` do filme, usando `url` ou `download`, resolvendo caminhos relativos e isolando servidor sem endereço; cobrir com testes de um servidor, dois áudios, `download` apenas e endereço relativo.
- [x] 2.4 Montar os streams de filme com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'Cineveo'`, título e ano inteiro), idioma pelo grupo, qualidade por `quality`/nome e `type` do servidor; cobrir com testes de campos, `1080p`, `HD` e `Desconhecida`.
- [x] 2.5 Criar as fixtures de filme em `test/fixtures/cineveo/` com respostas reais sanitizadas (token e URLs de mídia substituídos) e confirmar que os testes de filme passam sem rede.

## 3. Série e página do episódio

- [x] 3.1 Selecionar o episódio por `season`/`episode` e `available === true`, devolvendo ausência para par não listado ou indisponível; cobrir com testes de episódio disponível, não listado e indisponível.
- [x] 3.2 Abrir `/series/<slug>-t<S>-ep<E>.html` com `fetchPage` e ler `<script id="initialEpisodeData">`; lançar erro quando o bloco faltar e ausência quando a coordenada divergir; cobrir com testes de página válida, bloco ausente, coordenada divergente e série com `tmdb_id` diferente.
- [x] 3.3 Ler `servers.dub[]` e `servers.leg[]` da página do episódio com `download` ou `url` e montar os streams com temporada e episódio no `format`; cobrir com testes de episódio dublado, episódio legendado e `download` relativo.
- [x] 3.4 Criar as fixtures de série e episódio em `test/fixtures/cineveo/` com respostas reais sanitizadas e confirmar que os testes de série passam sem rede.

## 4. Falhas, triagem e contrato do stream

- [x] 4.1 Isolar cada servidor como opção independente, registrar `console.warn('[Cineveo] Opção <rótulo> descartada: <causa>')` e subir erro agregado quando nenhum stream sair e algum falhar; cobrir com testes de uma opção falhando e outra válida, todas falhando e todas ausentes.
- [x] 4.2 Descartar tipo de servidor diferente de `mp4`/`hls` por triagem, com aviso, sem derrubar as demais opções; cobrir com teste de tipo não suportado.
- [x] 4.3 Validar temporada e episódio de `tv` antes da primeira requisição e ignorar coordenadas em `movie`; cobrir com testes de coordenadas ausentes, zero, fracionárias e filme com `null`.
- [x] 4.4 Garantir que `name`, `title`, `headers`, `size`, `subtitles` e `provider` não sejam informados pelo provedor e que a deduplicação una mesma URL e mesmo idioma; cobrir com testes de campos opcionais e duplicata.
- [x] 4.5 Confirmar que o provedor não usa cache, timeout, `AbortController`, retentativa nem settings e que `getStreams` é o único ponto de captura; verificar por inspeção do código e pelos testes de falha.

## 5. Documentação e cadastro público

- [x] 5.1 Atualizar `docs/provider-investigation.md` com a seção do método da API JSON por TMDB e da página de episódio, incluindo referências de código, testes e limites, sem tokens ou URLs assinadas.
- [x] 5.2 Adicionar a linha e a seção do `cineveo` em `providers.md` com status `🟠 Não verificado` e a descrição do escopo; confirmar com `npm test` que o catálogo de provedores continua consistente.
- [x] 5.3 Revisar o texto da spec `cineveo-catalog` e do `design.md` da mudança para refletir o comportamento implementado; corrigir divergências antes da rodada online.
- [x] 5.4 Corrigir `docs/arch.md` para declarar que `contentLanguage` é uma lista com `"pt"` (ex.: `["pt"]`), alinhada a `src/manifest.json` e a `test/manifest.test.js`; verificar com `rg -n 'contentLanguage' docs/arch.md` que não restou a forma de string isolada e com `npm test` que o catálogo de provedores continua consistente.

## 6. Integração e evidência online

- [x] 6.1 Executar `npm run lint` e `npm test` e registrar no `design.md` o resultado, sem esconder falhas.
- [x] 6.2 Executar `node build.js cineveo`, confirmar `providers/cineveo.js`, `gdrive/providers/cineveo.js`, `prism/providers/cineveo.js` e os manifests gerados.
- [x] 6.3 Executar `npm run build:min` e `npm run test:online -- --provider cineveo`, conferir pelo menos uma resolução por tipo suportado e registrar a rodada em `providers.md` conforme `docs/tests.md`; se algum tipo não resolver, atualizar o status para `Parcial` ou `Instável` conforme a regra.
- [x] 6.4 Verificar que fixtures, logs, relatórios e documentação não contêm token ativo, URL assinada, cookie ou header de sessão; usar busca textual no repositório e corrigir qualquer ocorrência.

## Workflow follow-up

- Arquivar a mudança somente após os testes da spec passarem e a rodada online estar registrada em `providers.md`.
- Atualizar o status do provedor em `providers.md` se uma rodada posterior mudar a evidência.
