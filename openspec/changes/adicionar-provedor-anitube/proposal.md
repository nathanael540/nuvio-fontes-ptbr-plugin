# Proposal

## Why

O AniTube é uma fonte de animes em português do Brasil com filmes e séries dublados e legendados, mas o repositório ainda não tem um provedor exclusivo de anime. A fonte usa títulos em romaji, separa temporadas por sufixos e nomes de arco e publica dois players distintos na mesma página; os provedores atuais não cobrem essa combinação. Sem um provedor dedicado, esse acervo fica fora do Nuvio e a busca por títulos como `Shingeki no Kyojin`, `Boku no Hero Academia` e `Kimetsu no Yaiba` não encontra o conteúdo.

## What Changes

1. Adicionar o provedor `anitube`, com `movie` e `tv`, em `src/anitube/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0`.
2. Buscar no site com os títulos do TMDB, incluindo títulos alternativos em romaji e o título da temporada quando o TMDB o registra (ex.: `Kimetsu no Yaiba: Mugen Ressha-hen` para a 2ª temporada). O bloco `tmdb-info` passa a expor `romajiTitles` com a temporada indicada e `seasons` com ano, nome e quantidade de episódios, ambos derivados da resposta já existente, sem requisição adicional ao TMDB.
3. Confirmar a identidade na ficha da fonte por título, tipo (filme ou série), ano da temporada e marcador de temporada; descartar spin-offs e temporadas conflitantes. A ausência reconhecida do título ou do episódio devolve lista vazia.
4. Selecionar o episódio pelo número declarado na lista da série, não pela posição visual. Para filmes, aceitar a ficha direta do filme ou as entradas de filme de uma página agregadora, preservando as opções dublada e legendada quando existirem.
5. Resolver os dois players da fonte como opções independentes: o player FHD entrega HLS direto e o Player 1 passa por `api.anivideo.net` até o player do Blogger, que entrega MP4 progressivo. A falha de um player descarta apenas aquela opção; se nenhuma opção produzir stream, o erro sobe com as causas.
6. Montar cada stream com `buildStream` e `format`, preenchendo qualidade pelo rótulo do player, idioma pelo rótulo da fonte, `provider` pelo player e `type` pelo formato. A fonte não oferece legendas externas nem tamanho; esses campos não são inventados.
7. Cobrir filme, episódio avulso, episódio de temporada posterior, filme agregado, ausência, spin-off e falha isolada de player com testes Node e fixtures reais sanitizadas.
8. Configurar a verificação online com o perfil exclusivo `anime`, usando os cinco filmes e as seis séries de anime já presentes nos catálogos, e registrar a rodada em `providers.md`.
9. Atualizar `docs/provider-investigation.md` com os métodos reaproveitáveis observados: títulos romaji do TMDB para fontes de anime, confirmação de temporada por ano e os dois players. Atualizar o catálogo de blocos para o novo contrato do `tmdb-info`.

## Capabilities

### New Capabilities

- `anitube-provider`: localização e confirmação de animes no AniTube por títulos do TMDB, seleção de temporada, episódio e filme, resolução dos players e contrato dos streams devolvidos.

### Modified Capabilities

Nenhuma. A verificação online segue a capability `provider-online-verification` existente, apenas com um novo perfil de nicho.

## Impact

1. Código: `src/anitube/` (novo), `src/_blocks/tmdb-info/index.mjs` (campos `romajiTitles` e `seasons`), `test/blocks/tmdb-info/index.test.mjs`, `test/anitube.test.js` e fixtures em `test/fixtures/anitube/`.
2. Configuração: `manifest.json`, `test/online/profiles.json` (perfil `anime`), `providers.md`, `src/_blocks/index.md` e `docs/provider-investigation.md`.
3. Saída gerada: `providers/anitube.js`, `gdrive/providers/anitube.js`, `prism/providers/anitube.js` e os `<formato>/manifest.json`, todos pelo build.
4. Sem chave, conta ou serviço externo novo: o TMDB continua usando apenas `TMDB_API_KEY` entregue pelo app; os players são públicos e sem chave.
5. Limites conhecidos da fonte: busca em página única nos exemplos observados, tokens de player por página, URLs do Blogger assinadas e ligadas ao IP, segmentos HLS com extensão `.webp` e temporadas identificadas por sufixo, arco ou “Final Season”. A rodada online e o status só entram em `providers.md` depois do build e da execução explícita.
