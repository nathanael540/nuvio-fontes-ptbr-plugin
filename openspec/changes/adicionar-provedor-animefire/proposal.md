# Proposal

## Why

O AnimeFire é um catálogo brasileiro dedicado a animes, com filmes e séries dublados e legendados, e publica uma API JSON pública usada pelo próprio site. O repositório ainda não tem provedor desse acervo; sem ele, títulos de anime cobertos apenas pelo AnimeFire ficam fora do Nuvio. A fonte também permite confirmar temporada e episódio pela estrutura da API, sem depender de seletores visuais.

## What Changes

1. Adicionar o provedor `animefire`, com `movie` e `tv`, em `src/animefire/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Localizar o título pelo ID do TMDB usando `getMediaInfo` e a busca textual pública `GET https://api.animefire.one/animes/pesquisar?q=<título>&page=<n>`, tentando título PT-BR, título original e alternativos do Brasil. A confirmação usa título e ano com `findBestMatch`; a ficha é aceita somente quando o campo `format` da API corresponde ao tipo pedido (`movie` ou `tv`).
3. Selecionar o episódio pelo par `season`/`number` declarado na ficha (`GET /anime/<id>`), nunca pela posição visual. Para filme, usar a única entrada de episódio da ficha de `format: movie`; para série, devolver lista vazia quando o par pedido não existir.
4. Resolver a mídia por `GET /episode/<id>` e devolver um stream HLS por opção de áudio publicada (`dublado` ou `legendado`), preservando o idioma da fonte, a qualidade máxima declarada em `qualities`, os cabeçalhos de reprodução do CDN e os detalhes de formatação. Opções marcadas como `is_offline` são descartadas; a falha de uma opção preserva as demais.
5. Não adicionar chave, conta, proxy ou serviço externo: o TMDB continua usando apenas `TMDB_API_KEY` entregue pelo app, e a API e o CDN do AnimeFire são públicos.
6. Cobrir busca, filme, episódio avulso, temporada posterior, ausência, opção offline e falha isolada com testes Node e fixtures reais sanitizadas.
7. Configurar a verificação online com o perfil exclusivo `anime` e registrar a rodada em `providers.md`. O status inicial é `🟠 Não verificado` até a execução explícita do pacote.
8. Atualizar `docs/provider-investigation.md` com o método reaproveitável de descoberta e consumo da API pública de uma SPA, incluindo paginação, confirmação de tipo e limites de retenção da mídia.

## Capabilities

### New Capabilities

- `animefire-provider`: localização e confirmação de filmes e séries de anime no AnimeFire a partir do TMDB, seleção de temporada e episódio, resolução da API de episódio e contrato dos streams HLS devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, apenas com um novo perfil de nicho.

## Impact

1. Código: `src/animefire/` (novo), `test/animefire.test.js` e fixtures em `test/fixtures/animefire/`.
2. Configuração: `manifest.json`, `test/online/profiles.json` (perfil `anime`), `providers.md`, `docs/provider-investigation.md` e, se necessário, `src/_blocks/index.md` apenas para registrar o fluxo sem novo bloco.
3. Saída gerada: `providers/animefire.js`, `gdrive/providers/animefire.js`, `prism/providers/animefire.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem migração de dados e sem quebra de contrato para os provedores existentes.
5. Limite conhecido da fonte: episódios antigos podem continuar anunciados com `is_offline: false` e devolver HTTP 404 no CDN. O provedor entrega a URL publicada pela API, sem sondar a mídia; a retenção real é registrada no design e acompanhada na rodada online.
