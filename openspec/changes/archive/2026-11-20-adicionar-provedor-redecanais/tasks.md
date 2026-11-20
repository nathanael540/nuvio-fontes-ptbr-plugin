# Tasks

## 1. Estrutura, manifest e catálogo

- [x] 1.1 Criar `src/redecanais/` com `index.js`, `extractor.js`, `search.js`, `episodes.js` e `player.js`, seguindo o contrato de `src/_template/`; verificar que `node build.js redecanais` gera `providers/redecanais.js`, `gdrive/providers/redecanais.js` e `prism/providers/redecanais.js`.
- [x] 1.2 Registrar `redecanais` em `src/manifest.json` com nome `RedeCanais`, versão `1.0.0`, `supportedTypes` `["movie", "tv"]`, `formats` `["mp4"]`, `contentLanguage` `["pt"]` e logo em `https`; verificar que a suíte `test/manifest.test.js` passa.
- [x] 1.3 Adicionar a linha e a seção inicial em `providers.md` com status `🟠 Não verificado`; verificar que `test/providers-catalog.test.js` passa.
- [x] 1.4 Confirmar que a base é `https://redecanais.lt` e que `.phd`, `.by`, `.deals` e `.in` não entram como fallback; verificar a constante de base e um teste que falha se uma requisição sair para outro domínio.

## 2. Busca, tipo e identidade

- [x] 2.1 Implementar a leitura do TMDB com `getMediaInfo` e a lista de até oito termos (PT-BR, original, alternativos e romaji, priorizando romaji da temporada); verificar com teste de termos deduplicados e com o limite de oito.
- [x] 2.2 Implementar `GET /search.php?keywords=<termo>` com `encodeURIComponent`, paginação `&page=<n>` e teto de cinco páginas; verificar teste de duas páginas, página sem cartões e página sem o título de busca.
- [x] 2.3 Implementar a leitura de `div.thumbnail .caption h3 a` e a separação pela pista `-lista-de-episodios_` e pela estrutura da ficha; verificar teste de cartão de filme, cartão de série, série sem marcador na rota e tipo divergente.
- [x] 2.4 Implementar a limpeza do título, a similaridade 0,85, a tolerância de ano e a confirmação pelo `h1`/JSON-LD; verificar testes de filme confirmado, série confirmada, ano divergente, ficha sem ano e título divergente.

## 3. Temporada e episódio

- [x] 3.1 Implementar a leitura de `div[itemprop="description"]` e o par `(\d+)a-temporada-episodio-(\d+)` do `href`, usando o link publicado; verificar teste com links relativos, absolutos, `-dublado`, `-leg` e temporadas múltiplas.
- [x] 3.2 Implementar a seleção exata pela temporada e episódio pedidos e a conferência do `h1` do episódio; verificar teste de par encontrado, par ausente e coordenadas divergentes.
- [x] 3.3 Implementar a ausência para par não publicado e erro de estrutura para página de série sem o bloco de episódios; verificar os dois casos na suíte offline.

## 4. Player, streams e idioma

- [x] 4.1 Implementar a abertura de `iframe[name="Player"]` com `Referer` da ficha e a leitura de `SRC`, `SOURCE_FORMAT` e `SOURCE_MIME`; verificar teste de MP4, HLS declarado, player sem `SRC` e ficha sem iframe.
- [x] 4.2 Implementar o `type`, o `provider` do parâmetro `server` e a qualidade do cartão/ficha; verificar teste de `quality` `1080p`, `provider` `R2` e qualidade ausente caindo em `Desconhecida`.
- [x] 4.3 Implementar a montagem com `buildStream` e `format`, a ordenação por qualidade e a deduplicação por URL sem query assinada e idioma; verificar teste de dois áudios do mesmo arquivo e de duas qualidades.
- [x] 4.4 Implementar a precedência de idioma (marcador do episódio, rótulo da série, desconhecido) e o descarte do texto genérico `Dublado e Legendado`; verificar testes de filme dublado, filme legendado, episódio `[LEG]`, episódio sem marcador e ausência de evidência.
- [x] 4.5 Implementar o isolamento por opção com `console.warn('[RedeCanais] Opção <rótulo> descartada: <causa>')`, o erro agregado e o tratamento de 404 de candidato; verificar teste de uma opção falhando, todas falhando e candidato removido.

## 5. Fixtures e suíte do provedor

- [x] 5.1 Criar fixtures reais sanitizadas em `test/fixtures/redecanais/` para busca, filme dublado, filme legendado, série, episódio, episódio `[LEG]`, player MP4, player sem `SRC` e ausência; verificar que nenhuma fixture contém `exp`, `sig`, cookie ou URL assinada.
- [x] 5.2 Criar `test/redecanais.test.js` cobrindo filme, série, ausência, busca sem resultado, estrutura inválida, 404, uma opção falhando, todas falhando, formato não suportado e deduplicação; verificar que o teste passa com `fetch` simulado e sem rede.
- [x] 5.3 Rodar `npm run lint` e `npm test` e conferir que as suítes do provedor, do manifest e do catálogo passam.

## 6. Documentação do método

- [x] 6.1 Adicionar a seção 3.50 em `docs/provider-investigation.md` descrevendo o catálogo PhpMelody, a busca, o par de episódio, o player `player3` e o MP4 assinado, com referências para `src/redecanais/` e `test/redecanais.test.js` e sem URLs assinadas; verificar que a seção distingue método em uso, bloco disponível e hipótese.
- [x] 6.2 Revisar `providers.md` e `src/_blocks/index.md` para confirmar que nenhum bloco novo foi criado e que a linha do provedor está coerente com o manifest; verificar com `npm test`.

## 7. Build, verificação online e revisão

- [x] 7.1 Rodar `node build.js redecanais` e `npm run build:min` e conferir os pacotes base, `gdrive` e `prism` e os manifests gerados.
- [x] 7.2 Rodar `npm run test:online -- --provider redecanais` com `TMDB_API_KEY` do ambiente e registrar a rodada em `providers.md` com `--record`, atualizando o status conforme os critérios de `docs/tests.md`.
- [x] 7.3 Revisar o diff completo, confirmar que não há segredo, URL assinada, cookie ou arquivo gerado editado à mão, e conferir que `providers.md` e a spec refletem o comportamento implementado.

## Workflow follow-up

- Arquivar a mudança com `/opsx:archive` depois da revisão e da rodada online.
- Commitar com `feat(redecanais): adiciona provedor RedeCanais` e `OpenSpec: adicionar-provedor-redecanais`.
