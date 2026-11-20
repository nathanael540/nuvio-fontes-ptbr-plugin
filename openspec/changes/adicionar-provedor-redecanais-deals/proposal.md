# Proposal

## Why

O `redecanais.deals` é uma instância separada da marca RedeCanais, com catálogo e IDs próprios, busca pública, episódios publicados e um player `action=resolve` que devolve JSON com MP4 assinado. A investigação de 20/11/2026 confirmou busca sem paginação, ausência explícita, `vid` com o ID do TMDB e MP4 `206` sem `Referer`. Nenhum provedor atual cobre essa combinação, e o `.lt` planejado em `adicionar-provedor-redecanais` tem contrato, IDs e player diferentes.

A fonte é **dublada** na amostra. A página aceita `?audio=leg` e muda o título para `(Legendado)`, mas o `resolve` devolve o mesmo MP4 e o `download` aponta `audio=dub`; a variante legendada é uma fachada. O provedor SHALL classificar o idioma pelo `audio` do arquivo resolvido, não pelo rótulo da página.

## What Changes

1. Adicionar o provedor `redecanais-deals`, para `movie` e `tv`, em `src/redecanais-deals/`, com versão `1.0.0` e registro em `src/manifest.json`.
2. Obter título PT-BR, original, alternativos e ano com `getMediaInfo`; consultar `GET https://redecanais.deals/search.php?keywords=<termo>` com até oito termos deduplicados.
3. Ler a lista de resultados no formato `Título - AAAA - Qualidade (Dublado)` com link `Acessar`; a página sem resultados publica `Nenhum conteúdo encontrado.` e a busca é tratada como uma única página, sem paginação inventada.
4. Separar filme de série pela rota: série publica `-lista-de-episodios_<hash>.html?audio=dub`; filme publica `<slug>_<hash>.html?audio=dub`.
5. Confirmar a identidade pelo título/ano e pelo `vid` do player, que carrega o TMDB (`m<tmdb>.mp4` em filme e `e<tmdb>-<temporada>-<episódio>.mp4` em série). `vid` com TMDB diferente do pedido SHALL descartar o candidato.
6. Em série, ler os links de episódio publicados na página, selecionar o par `Nª Temporada - Episódio N` e usar o `href` da fonte, sem montar URL por posição.
7. Abrir `iframe[name="Player"]`, ler `var SOURCE_URL` e consultar `action=resolve`; aceitar somente `{ok: true, src}` com URL HTTP(S) e tratar `ok` falso, `src` ausente ou JSON inválido como falha da opção.
8. Classificar o idioma pelo `audio` do `download`/`src` resolvido (`dub` → `Dublado`, `leg` → `Legendado`); o rótulo `(Legendado)` da página e o parâmetro `?audio=leg` NÃO são prova do arquivo. Sem marcador, usar `Idioma Desconhecido`.
9. Montar todo stream com `buildStream` e `format`, com `type` `mp4`, `provider` do parâmetro `server` do player (`XT`), qualidade do título e detalhes de título, ano, temporada e episódio; sem `headers`, tamanho ou legendas quando a fonte não os fornece.
10. Isolar cada candidato e cada áudio: falha gera `console.warn('[RedeCanais Deals] Opção <rótulo> descartada: <causa>')`; se nenhum produzir stream e algum falhar, subir erro agregado. Busca, TMDB e estrutura de página são fatais; ausência de resultado, página 404, `vid` divergente ou par de episódio ausente são ausência.
11. Cobrir com testes Node e fixtures reais sanitizadas: filme dublado, série, episódio, ausência, busca sem resultado, estrutura inválida, 404, `vid` divergente, `ok:false`, `src` ausente, uma opção falhando e outra funcionando, e todas falhando.
12. Registrar o provedor em `providers.md` com status inicial `🟠 Não verificado` e atualizar `docs/provider-investigation.md` com o método do player `action=resolve` e do `vid` com TMDB.
13. Fora do escopo: o `.lt` e o `.phd` (change separada), `.by` e `.in` (sem caminho público utilizável), download `download.php`, HLS não observado, espelhos de domínio, bypass de anti-bot, sonda de mídia, cache, timeout próprio, settings e bloco compartilhado novo.

## Capabilities

### New Capabilities

- `redecanais-deals-catalog`: busca e confirmação de filmes e séries no catálogo `redecanais.deals`, seleção de episódio pelo par publicado, leitura do player `action=resolve` e devolução de MP4 com idioma comprovado pelo arquivo.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/redecanais-deals/` (novo), `test/redecanais-deals.test.js` e fixtures em `test/fixtures/redecanais-deals/`.
2. Configuração: `src/manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md`, na seção de métodos observados.
4. Saída gerada: `providers/redecanais-deals.js`, `gdrive/providers/redecanais-deals.js`, `prism/providers/redecanais-deals.js` e os manifests de instalação, todos pelo build.
5. Dependências: nenhuma nova; blocos existentes `tmdb-info`, `title-match`, `slugify`, `http`, `script-extract`, `stream-build`, `custom-formatter`, `language-discovery` e `quality-discovery`.
6. Sem migração de dados e sem mudança de contrato para os provedores atuais. A única chave externa continua sendo `TMDB_API_KEY`, fornecida pelo app.
7. Limites conhecidos: catálogo dublado na amostra; a variante `?audio=leg` é fachada; busca sem paginação observada; URL de mídia assinada com `X-Amz-Expires=18000`; MP4 como único formato; domínio de clone/parceiro que pode mudar.
