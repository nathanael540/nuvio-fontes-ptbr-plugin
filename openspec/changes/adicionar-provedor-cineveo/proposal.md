# Proposal

## Why

O Cineveo é um catálogo PT-BR de filmes e séries indexado pelo ID do TMDB, com API JSON pública, opções de áudio dublado e legendado e MP4 servido por CDN própria. Nenhum provedor atual cobre essa combinação de consulta direta por TMDB e página de episódio com os servidores já resolvidos.

A investigação de 20/11/2026 confirmou que `https://cineveo.cfd` responde ao `fetch` direto, sem conta, cookie, chave ou desafio anti-bot. A API devolve os servidores por áudio para filme e a página do episódio publica o mesmo contrato para série; o MP4 respondeu `206` sem `Referer` nem `Origin`. O acervo cobre filmes e séries, então o provedor nasce para os dois tipos.

## What Changes

1. Adicionar o provedor `cineveo`, para `movie` e `tv`, em `src/cineveo/`, com versão `1.0.0` e registro em `src/manifest.json`.
2. Consultar `GET https://cineveo.cfd/api?action=details&type=movie|series&id=<tmdbId>` e validar `type`, `tmdb_id` e a estrutura da resposta. A fonte usa o próprio ID do TMDB, então o provedor não consulta o TMDB nem exige `TMDB_API_KEY`.
3. Em filme, ler `servers.dub[]` e `servers.leg[]` e usar `url` ou `download` de cada servidor como endereço de reprodução.
4. Em série, selecionar o episódio pelo par `season`/`episode` com `available === true`, abrir `GET /series/<slug>-t<temporada>-ep<episódio>.html` e ler o JSON de `<script id="initialEpisodeData">`; usar `servers.dub[]` e `servers.leg[]` com `download`.
5. Tratar HTTP 404 da API com o corpo de 404 documentado como ausência; resposta 200 sem servidores, episódio não publicado e coordenada divergente na página do episódio também são ausência. JSON inválido, layout sem `initialEpisodeData` e demais respostas fora de 2xx são falha.
6. Montar cada stream com `buildStream` e `format` (`FORMATTER.AUTO`, `addon: 'Cineveo'`, título, ano, temporada e episódio), `type` do servidor (`mp4` na amostra), idioma pelo grupo (`dub` → Dublado, `leg` → Legendado) e qualidade do rótulo do servidor; sem `headers`, tamanho, legendas ou `provider` inventado.
7. Deduplicar por URL e idioma, ordenar com `sortByQuality` e isolar a falha de cada servidor com `console.warn('[Cineveo] Opção <rótulo> descartada: <causa>')`; se nenhum servidor produzir stream e algum falhar, subir o erro agregado.
8. Cobrir com testes Node e fixtures reais sanitizadas: filme dublado com um e com vários servidores, série com episódio dublado, série com opções dublada e legendada, ausência de título (404 documentado), tipo divergente, episódio não publicado, página sem `initialEpisodeData`, uma opção falhando e outra válida, todas falhando e deduplicação.
9. Registrar o provedor em `providers.md` com status inicial `🟠 Não verificado`, atualizar `docs/provider-investigation.md` com o método da API JSON por TMDB e da página de episódio, criar a spec `cineveo-catalog` e corrigir `docs/arch.md` para descrever `contentLanguage` como lista com `"pt"` (ex.: `["pt"]`), como já fazem `src/manifest.json` e `test/manifest.test.js`.
10. Fora do escopo: busca textual por título, fallback por metadados do TMDB, downloads, legendas externas, HLS, cadeia `/player/` por token, espelhos de domínio, cache, timeout próprio, settings e bloco compartilhado novo.

## Capabilities

### New Capabilities

- `cineveo-catalog`: consulta por ID do TMDB, confirmação de tipo e identidade, seleção de episódio pela coordenada publicada, leitura dos servidores dublado/legendado e devolução de MP4 com qualidade e idioma.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/cineveo/` (novo), `test/cineveo.test.js` e fixtures em `test/fixtures/cineveo/`.
2. Configuração: `src/manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md`, na seção de métodos observados; `docs/arch.md`, na convenção de `contentLanguage`; e a nova spec `openspec/specs/cineveo-catalog/spec.md` após o arquivamento.
4. Saída gerada: `providers/cineveo.js`, `gdrive/providers/cineveo.js`, `prism/providers/cineveo.js` e os manifests de instalação, todos pelo build.
5. Dependências: nenhuma nova; blocos existentes `http`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
6. Sem migração de dados e sem mudança de contrato para os provedores atuais. Nenhuma chave externa é necessária; a única chave do repositório continua sendo `TMDB_API_KEY`, e este provedor não a usa.
7. Limites conhecidos: o acervo é indexado pelo TMDB e não há busca textual nesta versão; o token de `vod-resolve` de filme expira em cerca de cinco horas e é resolvido a cada pedido; a URL final da CDN não é guardada; a qualidade é a declarada pelo servidor (`HD` normaliza para `720p`); a amostra só encontrou MP4. O domínio é único e uma troca exige nova proposta.
