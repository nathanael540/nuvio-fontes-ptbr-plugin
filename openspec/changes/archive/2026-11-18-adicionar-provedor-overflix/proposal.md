# Proposal

## Why

O OverFlix é um catálogo generalista em PT-BR de filmes e séries servido pela plataforma VideoBox, a mesma do Pobreflix HD, mas com acervo, rede e política de domínio próprios. Nenhum provedor deste repositório o cobre. A fonte publica MP4 dublado e legendado por servidores VideoBox e troca de domínio com frequência; a sondagem de 2026-11-16 confirmou MixDrop com MP4 206 e viu Streamtape e DoodStream falharem na amostra, então a cobertura prática vem do MixDrop. O Prisma Stream Addon (GPL-3.0) descreve a descoberta e o contrato do VideoBox em `prisma_sites.py` (f2), e o Pobreflix HD já implementa busca, confirmação por TMDB, episódios e `playerData` localmente. Adicionar o OverFlix amplia a cobertura sem dependência nova e sem chave.

A referência de implementação é o código publicado do Prisma, não uma prova de funcionamento. As consultas de reconhecimento de 2026-11-14 registradas no `design.md` confirmam partes do contrato, mas a evidência de funcionamento continua sendo a rodada online do pacote final.

## What Changes

1. Adicionar o provedor `overflix`, com `movie` e `tv`, em `src/overflix/`, empacotado nos três formatos e registrado no `manifest.json` como versão `1.0.0` e formatos `["mp4"]`.
2. Descobrir o domínio a cada chamada: `GET https://www.overflix.win`; usar o host final quando houver redirecionamento; senão ler `window.domainAlertPayload`, decodificar Base64, interpretar o JSON, ler `baseUrl` e decodificar Base64 outra vez para extrair o host; em falha, usar `www.overflix.download`. Sem cache, sem TTL e sem timeout próprio.
3. Usar um cliente VideoBox local: `buscarContent` com `X-Requested-With: XMLHttpRequest`, `Referer` e `User-Agent`; seguir no máximo um `redirect` JSON por requisição e adotar o host de destino; ler cartões `a.block`; confirmar a ficha por `data-tmdb-id`.
4. Selecionar série pela seção `vbEpisodes` (`data-video-id`, `data-season`, `data-current-audio`) e por `episodesList`, comparando o número do episódio como inteiro e removendo o prefixo `serie3=`; nunca escolher pela posição.
5. Ler `playerData` (`players`, `servers_dub`, `servers_leg`): bases padrão de MixDrop, Streamtape, DoodStream e Byse, substituídas por `players` quando o rótulo coincidir; idioma vem do campo (`Dublado` ou `Legendado`).
6. Resolver MixDrop, Streamtape e DoodStream localmente, como no Pobreflix HD; MixDrop foi confirmado com MP4 206, Streamtape e DoodStream podem falhar na fonte, e Byse e host desconhecido são triagem; a falha de um servidor descarta só aquela opção e o erro agregado sobe quando nenhuma produz stream.
7. Montar todo stream com `buildStream` e `format` (`type: 'mp4'`, idioma do campo, `provider` do host, cabeçalhos do resolvedor, título/ano/temporada/episódio no formatador), sem `name`/`title` e com qualidade `Desconhecida` quando a fonte não declarar resolução.
8. Cobrir com testes Node e fixtures reais sanitizadas: descoberta por redirect, por payload Base64 (simples e dupla) e por fallback; busca confirmada, ambígua e vazia; ficha com `data-tmdb-id`; série com `episodesList`; `playerData` com `players` sobrescrevendo base; opções dublada e legendada; um host falhando e outro funcionando; todos falhando (erro agregado); ficha sem servidor anunciado (ausência).
9. Registrar a linha e a seção do OverFlix em `providers.md` com status inicial `🟠 Não verificado` e atualizar `docs/provider-investigation.md` §3.10 com a descoberta por `domainAlertPayload` e a referência ao cliente VideoBox; nenhum bloco novo.
10. Fora do escopo: cache de 6 h, timeout de 8 s e aquecimento paralelo do Prisma; catálogo VOD pré-computado; resolução do Byse ou de HLS; login, VIP, bypass, captcha, sonda de mídia, settings e qualquer alteração no Pobreflix HD.

## Capabilities

### New Capabilities

- `overflix-provider`: descoberta do domínio vigente, busca e confirmação por TMDB, seleção de episódio, leitura de `playerData` e streams MP4 dublados e legendados do OverFlix.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/overflix/` (novo), `test/overflix.test.js` e fixtures em `test/fixtures/overflix/`.
2. Configuração: `manifest.json` e `providers.md`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/overflix.js`, `gdrive/providers/overflix.js`, `prism/providers/overflix.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; o fluxo usa os blocos `tmdb-info`, `title-match`, `http`, `script-extract`, `stream-build` e `custom-formatter` (com `language-discovery`, `quality-discovery` e `slugify` no empacotamento, sem import direto).
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem chave ou serviço externo além do `TMDB_API_KEY` fornecido pelo app.
7. Limite conhecido: o Byse, que apareceu em todas as opções observadas, não entrega mídia extraível pelo método atual e fica como triagem; na amostra de 2026-11-16 o MixDrop entregou MP4 206 para dublado e legendado em filme e em episódio de série, enquanto Streamtape veio com identificador `hide` (404) e DoodStream respondeu 403, então a cobertura prática depende do MixDrop.
