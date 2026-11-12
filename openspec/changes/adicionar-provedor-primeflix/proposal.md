# Proposal

## Why

O Primeflix (`https://primeflix.sh/`) publica filmes e séries em português com catálogo e player públicos, sem conta e sem chave, e entrega mídia direta em MKV ou HLS. Nenhum provedor deste repositório consulta esse acervo. Na investigação de 12/11/2026 a série resolveu HLS dublado, mas o arquivo de filme devolveu HTTP 403 `secure_link`; por isso a change começa por um gate de viabilidade e só avança para o tipo de mídia que o pacote final confirmar.

## What Changes

1. Adicionar o provedor `primeflix`, com `movie` e `tv` (sujeito ao gate), em `src/primeflix/`, registrado no `manifest.json` como versão `1.0.0` e empacotado nos três formatos.
2. Buscar por título PT-BR, título original e alternativos no JSON público `/live-search?q=<termo>`, com reserva na página HTML `/search?q=<termo>`. Como a busca não traz ano nem tipo, confirmar cada candidato na ficha pelo título, pelo ano exibido e pela presença de `season=`/`episode=` ou marcador de série no player (série) ou de um `v_id` sem marcador (filme).
3. Filme: resolver `/vvv?id=<v_id>&mobile=1&get=video` até a URL final do arquivo direto (`.mkv`/`.mp4`), usando `Range: bytes=0-0` para obter a URL sem baixar a mídia. Só montar o stream quando a URL final for HTTP(S) de mídia.
4. Série: exigir que a ficha liste `season=<temporada>&episode=<episódio>` para o par pedido e resolver `/vvv?id=<v_id>&season=<s>&episode=<e>&mobile=1&get=video` até a playlist HLS final; playlist de mídia com segmentos `.ts`.
5. Classificar o idioma somente pela evidência do caminho/nome do arquivo (`dub`/`dublado` como `Dublado`, `leg`/`legendado` como `Legendado`; sem evidência, `Idioma Desconhecido`) e a qualidade pelos textos já obtidos (`1080p`, `CAM`, `4K` etc.), sem requisição extra e sem inventar valores.
6. Distinguir ausência de falha: busca sem candidato, tipo ou ano incompatível, par de temporada/episódio não listado e ficha removida resultam em lista vazia; layout sem `v_id`, `/vvv` com 404 para mídia anunciada, 403/5xx e URL final que não é mídia lançam erro. Só `getStreams` captura, registra `console.error('[Primeflix] ...')` e devolve `[]`.
7. Cobrir com testes Node offline e fixtures sanitizadas filme, episódio, ausência, tipo/ano incompatível, layout alterado, falha do player, playlist HLS e arquivo direto, além de qualidade e idioma comprovados ou desconhecidos.
8. Adicionar a linha e a seção em `providers.md` com status inicial `🟠 Não verificado` e registrar em `docs/provider-investigation.md` o método de CMS próprio com busca JSON e player `/vvv` que redireciona para mídia direta ou HLS assinada.
9. Executar, antes da implementação, o gate de viabilidade com respostas reais: confirmar uma série e um filme com mídia resolvida e primeiro segmento/arquivo acessível pelo fluxo público. Se o filme continuar recusado, a change segue somente com `tv` e `formats` `["m3u8"]`; se nenhum dos dois confirmar, a change não é implementada nem arquivada como provedor funcional.

## Capabilities

### New Capabilities

- `primeflix-provider`: busca no catálogo, confirmação de identidade e tipo, resolução de filme e de episódio, classificação de idioma e qualidade, tratamento de ausência e falha e contrato dos streams do Primeflix.

### Modified Capabilities

Nenhuma. A verificação online continua regida pela capability `provider-online-verification`; o novo provedor apenas entra no perfil generalista.

## Impact

1. Código: `src/primeflix/` (novo), `test/primeflix.test.js` e fixtures em `test/fixtures/primeflix/`.
2. Configuração: `manifest.json`, `providers.md` e `docs/provider-investigation.md`. Nenhum bloco novo; `src/_blocks/index.md` não muda.
3. Saída gerada: `providers/primeflix.js`, `gdrive/providers/primeflix.js`, `prism/providers/primeflix.js` e os `<formato>/manifest.json`, todos pelo build.
4. Dependência externa: apenas o site público e o player `/vvv`, sem conta, cookie ou chave. `TMDB_API_KEY` continua vindo do app e não entra no repositório.
5. Risco: o token `secure_link` do arquivo de filme foi recusado na investigação, e o endpoint `/vvv` não é documentado. O gate e a rodada online decidem o escopo (`movie`/`tv`) e o status; nenhum tipo é promovido sem evidência.
6. Sem migração de dados e sem quebra de contrato para os provedores existentes.
