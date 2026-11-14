# Spec Delta

## Purpose

Localizar animes no catálogo público do Animy a partir do ID do TMDB, escolher a variante de áudio e o episódio corretos e devolver os streams MP4 diretos publicados pela fonte, no contrato do Nuvio.

## ADDED Requirements

### Requirement: Busca e identidade pelo título do TMDB

O provedor SHALL consultar `GET https://animy.net/api/v1/animes` com `limit=24`, `offset=0`, `sort=popular` e `search=<termo>`, usando o título PT-BR, o título original, os alternativos e os títulos romaji do TMDB como termos. O provedor SHALL aceitar o candidato cujo título, `nativeTitle` ou `altTitles` corresponda ao termo e cujo `kind` seja `movie` para filme ou `tv` para série; candidato de tipo conflitante SHALL ser descartado.

#### Scenario: Título PT-BR encontra a série

- **WHEN** o TMDB informa "Demon Slayer: Kimetsu no Yaiba" e a busca do Animy devolve a entrada `kind: tv` com esse título
- **THEN** o provedor confirma o candidato e prossegue para a seleção do episódio.

#### Scenario: Título romaji encontra o filme

- **WHEN** o TMDB informa "Your Name." e o termo romaji "Kimi no Na wa." encontra a entrada `kind: movie` "Kimi no na wa (Dublado)"
- **THEN** o provedor confirma o candidato e usa a entrada de filme.

#### Scenario: Tipo conflitante é descartado

- **WHEN** a busca devolve um filme e uma série com títulos parecidos e o pedido é de série
- **THEN** o provedor descarta o filme e considera apenas a entrada `kind: tv`.

#### Scenario: Ano do catálogo divergente não elimina o candidato

- **WHEN** o TMDB informa o ano de estreia e a entrada do Animy traz outro ano em `y` (por exemplo, o ano de publicação no catálogo)
- **THEN** o provedor mantém o candidato pelo título e usa o ano apenas como desempate entre candidatos do mesmo tipo.

#### Scenario: Título ausente

- **WHEN** todos os termos de busca terminam sem candidato compatível
- **THEN** o provedor devolve lista vazia, sem tratar a ausência como falha.

### Requirement: Variantes de áudio e seleção de episódio

O provedor SHALL tratar cada entrada do catálogo como uma variante de áudio independente, identificada pelo campo `audio` (`dublado` ou `legendado`), e SHALL unir os streams de todas as variantes confirmadas sem repetir a mesma URL e o mesmo idioma. Para série, SHALL escolher o episódio pelo par `season`/`number` da lista `episodes`; para filme, SHALL usar a única entrada de `episodes`.

#### Scenario: Série com dublado e legendado

- **WHEN** a busca confirma uma entrada dublada e uma legendada da mesma série e o episódio existe nas duas
- **THEN** o provedor devolve streams das duas variantes, com idiomas distintos.

#### Scenario: Episódio escolhido pelo par temporada e número

- **WHEN** a ficha da série contém temporada 2, episódio 1 e o pedido é S02E01
- **THEN** o provedor usa a entrada com `season: 2` e `number: 1`, independentemente da ordem da lista.

#### Scenario: Filme com entrada única

- **WHEN** a ficha confirmada tem `kind: movie` e uma única entrada em `episodes`
- **THEN** o provedor usa essa entrada como a mídia do filme.

#### Scenario: Episódio ou temporada não publicados

- **WHEN** a ficha confirma a série, mas não contém o par `season`/`number` pedido
- **THEN** o provedor descarta essa variante e devolve lista vazia se nenhuma outra variante tiver o episódio.

### Requirement: Contrato dos streams MP4

O provedor SHALL montar cada stream com `buildStream` e `format`, informando `type` do campo `kind` (observado `mp4`), `provider` do catálogo, URL HTTP(S) do campo `url` e idioma classificado pelo campo `audio`. A qualidade SHALL ser `Desconhecida` quando a fonte não a declarar. O provedor MUST NOT sondar a mídia, MUST NOT impor timeout próprio e MUST NOT adicionar cabeçalhos de reprodução sem necessidade comprovada.

#### Scenario: Stream dublado

- **WHEN** a rota de reprodução devolve um stream `kind: mp4` com `audio: dublado`
- **THEN** o stream sai com `language` "Dublado", `type` "mp4" e a URL direta do MP4.

#### Scenario: Stream legendado

- **WHEN** a rota de reprodução devolve um stream `kind: mp4` com `audio: legendado`
- **THEN** o stream sai com `language` "Legendado" e a URL direta do MP4.

#### Scenario: Qualidade não declarada

- **WHEN** a rota de reprodução não informa qualidade nem a URL contém resolução reconhecível
- **THEN** o stream é preservado com "Desconhecida", sem requisição extra para descobrir qualidade.

#### Scenario: Campos ausentes na fonte

- **WHEN** a fonte não oferece tamanho, legendas externas, seeders ou peers
- **THEN** esses campos não aparecem no stream.

### Requirement: Ausência reconhecida e falhas preservadas

O provedor SHALL devolver lista vazia somente para ausência reconhecida de título ou episódio, inclusive a resposta `404` da rota de reprodução com o corpo `{"error":"episode not found"}`. Falha de rede, HTTP fora de 2xx não reconhecido como ausência, JSON inválido ou estrutura inesperada SHALL ser lançada até `getStreams`, que registra com `[Animy]` e devolve lista vazia.

#### Scenario: Episódio não publicado na rota de reprodução

- **WHEN** a rota do episódio responde `404` com `{"error":"episode not found"}`
- **THEN** o provedor trata como ausência da variante e não como falha estrutural.

#### Scenario: Resposta fora do esquema

- **WHEN** a busca responde `200` sem `items` ou a ficha responde sem `episodes`
- **THEN** o provedor lança erro de estrutura, em vez de devolver ausência.

#### Scenario: Falha de rede

- **WHEN** a API responde `5xx` ou a conexão falha
- **THEN** o erro sobe até `getStreams`, é registrado com `[Animy]` e a saída é lista vazia.
