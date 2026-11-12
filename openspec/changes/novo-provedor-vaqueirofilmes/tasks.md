# Tasks

## 1. Estrutura e dependências

- [ ] 1.1 Criar `src/vaqueirofilmes/` com `index.js`, `identity.js`, `catalog.js`, `players.js` e `byse.js`, seguindo o contrato de `src/_template/` e os padrões de `src/dooplay/` e `src/fireplayer/`; verificar que `npm run lint` aceita a estrutura inicial.
- [ ] 1.2 Adicionar a entrada `vaqueirofilmes` ao `manifest.json` com `supportedTypes: ["movie"]`, `formats: ["m3u8"]`, `contentLanguage: ["pt"]`, versão `1.0.0`, autor, logo HTTPS e descrição coerente com o escopo; verificar que `node build.js vaqueirofilmes` gera `providers/vaqueirofilmes.js` e que `node --test test/manifest.test.js` passa.
- [ ] 1.3 Adicionar `crypto-js` às `devDependencies`, rodar `npm install` e confirmar que `node -e "require('crypto-js')"` funciona no ambiente de teste; o build deve manter o módulo externo.
- [ ] 1.4 Criar `test/fixtures/vaqueirofilmes/` com as fixtures iniciais de busca, página do filme e variantes de player, sanitizando URLs assinadas e removendo cookies, tokens efêmeros e identificadores pessoais; verificar que nenhum arquivo contém `cf_clearance`, `api_token` ou URL de mídia completa.

## 2. Catálogo e identidade

- [ ] 2.1 Implementar a busca em `catalog.js` com `getMediaInfo`, consulta PT-BR, fallback para título original quando nenhum candidato for confirmado, duas páginas de 20 e tratamento de nenhum candidato confirmado como ausência; verificar com testes de busca PT-BR, fallback, ausência e erro HTTP.
- [ ] 2.2 Implementar a confirmação de identidade pelo JSON-LD `Movie`, comparando `name`, `alternateName`, `datePublished` e o ano do TMDB, com no máximo três candidatos confirmados e descarte de `TVSeries`; verificar com testes de candidato confirmado, ano divergente, resultado de série e ambiguidade sem correspondência.
- [ ] 2.3 Garantir que pedido `tv` seja recusado antes de qualquer consulta e que pedido `movie` inválido lance erro claro; verificar com testes de entrada inválida e de tipo não suportado.

## 3. Descoberta de player e cadeia EmbedPlay

- [ ] 3.1 Implementar a leitura da variante `?video=0` em `players.js`, mapeando `.vp-source-btn` por rótulo e `href`, e selecionando o botão cujo texto contém `Embedplay`; verificar com fixture de lista de players e testes de EmbedPlay presente, ausente e opções desconhecidas.
- [ ] 3.2 Implementar a abertura da variante EmbedPlay e a leitura do iframe ativo; verificar que a URL do iframe é `embedplayapi.top` e que opção ausente ou iframe de outro host gera triagem/falha explícita.
- [ ] 3.3 Implementar a chamada `ajax/get_stream_link` com `id`, `movie`, `is_init=false`, `captcha=` e `ref=`, validando `success` e `data.link`; verificar com fixtures de sucesso, `success` falso, HTTP fora de 2xx e JSON inválido.
- [ ] 3.4 Implementar a leitura da página `embedplay.vip`, seleção do grupo cujo rótulo é Dublado, descarte do Legendado/VidSrc e POST `action=getPlayer` por opção; verificar com testes de opção dublada válida, opção sem `video_url`, `errors` diferente de `0` e preservação das demais opções quando uma falha.

## 4. Byse, streams e metadados

- [ ] 4.1 Implementar a extração do código Byse de `embedplaybyse.top/e/<código>` e a consulta `api/videos/<código>/`, validando `playback`, `version`, `key_parts`, `iv` e `payload`; verificar com fixtures de playback válido, playback ausente, host não suportado e resposta sem `sources`.
- [ ] 4.2 Implementar a seleção de `key_parts` pela regra `[version, 31 - version]` com fallback para todas as partes, a decodificação base64url e a decifragem AES-256-GCM via keystream AES-CTR com `crypto-js`; verificar com teste que decifra o `payload` real da fixture e rejeita chave de tamanho inválido, IV inválido e JSON inválido.
- [ ] 4.3 Montar os streams com `buildStream`, `FORMATTER.AUTO`, `addon` VaqueiroFilmes, título/ano do TMDB, qualidade por `height`/rótulo com fallback `Desconhecida`, idioma `LANGUAGE.DUBBED` para o grupo Dublado e legendas Byse válidas; verificar com testes de fonte 1080p, qualidade desconhecida, legenda válida e legenda sem URL.
- [ ] 4.4 Implementar `getStreams` e a fronteira de erro: validação de entrada, isolamento por opção com `console.warn`, falha total com `console.error('[VaqueiroFilmes] ...')` e retorno `[]`, sem transformar ausência em falha; verificar com testes de falha total, ausência de EmbedPlay e duas chamadas gerando URLs assinadas distintas no mock.

## 5. Documentação e integração

- [ ] 5.1 Atualizar `providers.md` com a linha `VaqueiroFilmes`, status inicial `⏳ Não verificado`, data e seção do provedor com o escopo de filmes em HLS; verificar que `node --test test/providers-catalog.test.js` passa.
- [ ] 5.2 Adicionar em `docs/provider-investigation.md` o método “catálogo WordPress com player externo e playback cifrado”, com a cadeia observada, referências de código/testes e limites (EmbedPlay, Byse, URL assinada, sem séries/downloads); verificar que o guia continua referenciando os arquivos e testes reais.
- [ ] 5.3 Revisar `README.md` e `docs/arch.md`: só alterar se o novo provedor mudar uma lista, convenção ou regra global; registrar no `design.md` a decisão de não alterar quando não houver mudança de comportamento global.
- [ ] 5.4 Rodar `npm run lint`, `npm test` e `node build.js vaqueirofilmes`; verificar que a suíte inteira e o build passam sem regenerar arquivos manuais fora de `providers/` e `<formato>/providers/`.

## 6. Verificação online

- [ ] 6.1 Rodar `npm run test:online -- --provider vaqueirofilmes --record` com `TMDB_API_KEY` apenas no ambiente e conferir a seção gerada em `providers.md`; se a rodada for inconclusiva ou falhar por bloqueio externo, registrar o motivo e manter a mudança sem arquivar, sem marcar esta tarefa como concluída.

## Workflow follow-up

- Arquivar a mudança após a revisão e a verificação online, ou declarar explicitamente as exclusões e o motivo de não arquivar.
- Conferir o resultado arquivado em `openspec/changes/archive/` e a spec principal da capacidade.
