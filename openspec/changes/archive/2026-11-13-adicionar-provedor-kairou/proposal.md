# Proposal

## Why

O Kairou é um catálogo generalista em PT-BR de filmes, séries e animes que expõe uma API JSON pública usada pelo próprio site: `GET /api/extract` recebe o ID do TMDB, tipo, temporada e episódio e devolve streams já resolvidos (HLS e MP4), com qualidade, áudio e legendas. Nenhum provedor deste repositório consulta essa API; adicionar a fonte amplia a cobertura de títulos dublados e legendados sem depender de raspagem da SPA nem de busca textual.

## What Changes

1. Adicionar o provedor `kairou`, com `movie` e `tv`, em `src/kairou/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Usar `getMediaInfo` para obter título PT-BR, ano e classificação (filme, série, anime ou dorama) e consultar `GET https://www.kairou.space/api/extract?tmdbId=<id>&type=<movie|series>&title=<título>&season=<n>&episode=<n>&isAnime=1`.
3. Ler `streams[]` e `subtitles[]` da resposta; resolver as URLs relativas `/api/proxy` contra `https://www.kairou.space` e preservar a URL de reprodução publicada pela fonte, inclusive o proxy público, porque os hosts de origem bloqueiam acesso direto a parte dos MP4.
4. Montar cada stream com `buildStream` e `format`, usando `quality`, `isDub`, `source`, `type` (`hls` ou `mp4`) e as legendas VTT convertidas pelo proxy; descartar por triagem as opções 4K, que a fonte reserva a assinantes; deduplicar por URL resolvida e ordenar por qualidade.
5. Reconhecer ausência quando a API responder `ok: true` com `streams` vazio; tratar HTTP fora de 2xx, JSON inválido, `ok: false` ou estrutura inesperada como erro.
6. Cobrir com testes Node e fixtures reais sanitizadas: filme, episódio, ausência, resposta inválida, HLS, MP4, legendas, duplicata de URL e pedido de série sem temporada/episódio.
7. Registrar o provedor em `providers.md` com status inicial `🟠 Não verificado` e atualizar `docs/provider-investigation.md` com o método reaproveitável de API de extração de uma SPA.
8. Fora do escopo: login, perfis VIP, reprodução 4K restrita a assinatura, downloads, o addon Stremio Pleiades usado pelo site para animes e o contorno de qualquer bloqueio. O provedor usa apenas a API pública, sem chave e sem conta.

## Capabilities

### New Capabilities

- `kairou-provider`: consulta da API de extração do Kairou pelo ID do TMDB, seleção de temporada e episódio, reconhecimento de ausência e contrato dos streams HLS/MP4 e das legendas devolvidos.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/kairou/` (novo), `test/kairou.test.js` e fixtures em `test/fixtures/kairou/`.
2. Configuração: `manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/kairou.js`, `gdrive/providers/kairou.js`, `prism/providers/kairou.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa os blocos existentes `tmdb-info`, `http`, `custom-formatter`, `quality-discovery`, `language-discovery` e `stream-build`.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo.
7. Limite conhecido da fonte: a primeira consulta de um título pode levar cerca de 20 segundos, porque a API resolve as opções no servidor; o provedor não impõe timeout próprio e o app gerencia a espera.
