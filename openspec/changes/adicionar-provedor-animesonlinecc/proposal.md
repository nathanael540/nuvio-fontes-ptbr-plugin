# Proposal

## Why

O AnimesOnlineCC é um catálogo PT-BR de animes de longa data, com páginas de episódio que publicam as opções dublada e legendada em `div[id^="option-"]`. Nenhum provedor deste repositório lê essa estrutura, e o Prisma já roteia a fonte pelo slug `animes3=`. Adicionar o provedor amplia a cobertura de animes com um acervo e um conjunto de hosts independentes dos demais catálogos. A busca `GET /?s=<termo>`, a ficha `/anime/<slug>/` e as opções da página de episódio foram verificadas em 14/11/2026; em 16/11/2026, a opção Blogger respondeu MP4 206 com formatos 144p e 360p, e a segunda opção (legendada) não publicou `streamingData` na amostra. A evidência do método é o código publicado do Prisma e essas observações pontuais; não é prova de funcionamento do pacote, que depende da rodada online prevista nas tarefas.

## What Changes

1. Adicionar o provedor `animesonlinecc`, somente `tv`, em `src/animesonlinecc/`, com versão `1.0.0` e registro no `manifest.json`.
2. Obter título PT-BR, original, alternativos e romaji com `getMediaInfo`; consultar `GET https://animesonlinecc.to/?s=<termo>` para cada variante e acumular os candidatos por `/anime/<slug>/`.
3. Confirmar a identidade na ficha `/anime/<slug>/` pelo `h1` limpo e pelo ano de `span.date`, com tolerância de um ano; abrir no máximo quatro fichas no total, priorizando os candidatos de maior similaridade. O primeiro resultado parecido não é confirmação.
4. Selecionar a temporada por `div.se-c` + `span.se-t` e o episódio por `div.numerando`/`div.episodiotitle a`, usando o `href` publicado; temporada ou episódio ausente é ausência reconhecida, sem mapeamento por posição.
5. Ler `div[id^="option-"]` na página do episódio, aceitando o `src` no próprio `div` (formato do Prisma) ou no `iframe` interno (formato observado), e associar o rótulo pelo `ul.idTabs a[href="#option-N"]` (`Dublado`, `Legendado`). Sem opções na página do episódio, tentar uma vez a página `/anime/<slug>/`; sem opções nas duas, devolver lista vazia.
6. Resolver cada opção em isolamento: Blogger pelo bloco `blogger-video`, mídia direta `.mp4`/`.m3u8`, e adaptadores locais para MixDrop, Streamtape, Dood e Byse. Host desconhecido é triagem, não falha; a falha de uma opção gera `console.warn('[AnimesOnlineCC] Opção <rótulo> descartada: <causa>')` e preserva as demais; se todas falharem, o erro agregado sobe.
7. Montar todo stream com `buildStream` e `format`, sem `name`/`title`, com idioma pelo rótulo da opção, qualidade pelo rótulo do Blogger ou descoberta local, com `Desconhecida` sem correspondência, `type` e `provider` do host, e os cabeçalhos de reprodução que o resolvedor exigir. Sem timeout próprio, sem sonda de mídia, sem cache e sem requisição extra para descobrir qualidade.
8. Cobrir com testes Node e fixtures reais sanitizadas: busca com candidato confirmado, busca sem resultado, ano/tipo divergente, episódio com duas opções, Blogger com formatos progressivos, opção Blogger sem `streamingData`, fallback para `/anime/<slug>/`, página sem `option-*`, host desconhecido, uma opção falhando e outra funcionando, todas falhando, WAF/403, temporada/episódio ausente, temporada agrupada e deduplicação.
9. Registrar o provedor em `manifest.json`, `providers.md` (status inicial `🟠 Não verificado`), `test/online/profiles.json` (nicho `anime`) e atualizar `docs/provider-investigation.md` com o método de página de episódio com opções `option-*`.
10. Fora do escopo: filmes, mapeamento de temporadas publicadas como arco/título próprio, login, bypass de WAF, download, legendas externas, sonda de mídia, cache, timeout próprio e bloco compartilhado novo. O Blogger foi confirmado com mídia; MixDrop, Streamtape, Dood e Byse continuam previstos pelo código publicado do Prisma, sem observação própria nesta fonte.

## Capabilities

### New Capabilities

- `animesonlinecc-provider`: busca e confirmação de séries de anime no AnimesOnlineCC pelo TMDB, seleção de temporada e episódio pela lista publicada, leitura das opções `option-*`, resolução de hosts e contrato dos streams devolvidos.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/animesonlinecc/` (novo), `test/animesonlinecc.test.js` e fixtures em `test/fixtures/animesonlinecc/`.
2. Configuração: `manifest.json`, `providers.md` e `test/online/profiles.json`.
3. Documentação: `docs/provider-investigation.md`.
4. Saída gerada: `providers/animesonlinecc.js`, `gdrive/providers/animesonlinecc.js`, `prism/providers/animesonlinecc.js` e os `<formato>/manifest.json`, todos pelo build.
5. Dependências: nenhuma nova; blocos existentes `tmdb-info`, `title-match`, `http`, `stream-build`, `custom-formatter`, `language-discovery`, `quality-discovery`, `slugify`, `blogger-video` e `fireplayer` (`unpackPacker`). `script-extract` não é necessário nesta versão porque as opções estão em atributos HTML; se uma variante futura publicar o `src` em script, o bloco passa a ser usado. Os adaptadores de host são locais, com a origem registrada em comentário.
6. Sem migração de dados, sem mudança de contrato para os provedores atuais e sem nova chave ou serviço externo. A única chave continua sendo `TMDB_API_KEY`, fornecida pelo app.
7. Limite conhecido da fonte: a página agrupa temporadas em uma única lista contínua em parte dos títulos (Naruto Shippuden aparece como `Temporada 1` com centenas de episódios), então temporadas do TMDB acima da publicada ficam sem resultado em vez de serem mapeadas por posição.
