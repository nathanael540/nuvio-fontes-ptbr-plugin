# Design

## Context

1. A motivação e o contrato observável estão em [proposal.md](proposal.md) e [specs/betor-search/spec.md](specs/betor-search/spec.md).
2. A API do BeTor retornou, em 12/11/2026:
   1. `tmdb_id=13` sem `item_type`: 1 item, `item_type: ""`, release de Forrest Gump.
   2. `tmdb_id=13&item_type=movie`: 0 itens.
   3. `imdb_id=tt0109830`: 0 itens, com ou sem `item_type`.
3. O ID do TMDB é único apenas dentro de cada tipo. A API oficial confirmou `movie/13` (Forrest Gump) e `tv/13` (Suiyō Dōdeshō); `movie/102` (Corações Livres) e `tv/102` (Driven) também existem. A API pública de sugestão do IMDb confirmou os títulos e os tipos com IDs IMDb distintos.
4. O código atual em `src/betor/extractor.js` prefere `imdb_id` e sempre envia `item_type`; por isso não alcança itens indexados apenas por `tmdb_id` ou sem classificação.

## Goals / Non-Goals

**Goals:**

1. Encontrar itens indexados por IMDb, por TMDB com tipo e por TMDB sem tipo.
2. Nunca aceitar item de outro tipo ou de outro título apenas porque o número do TMDB coincide.
3. Preservar paginação, mensagens de erro e o contrato de streams.

**Non-Goals:**

1. Alterar o formato da API do BeTor, o contrato do app ou o formato dos streams.
2. Implementar busca por título quando o identificador não existe ou a API não responde.
3. Corrigir itens ausentes no catálogo do BeTor.

## Decisions

### 1. Fallback em três tentativas, somente após resultado vazio válido

1. Tentar `imdb_id` + `item_type` quando o TMDB fornecer IMDb.
2. Se a tentativa concluir com zero itens, tentar `tmdb_id` + `item_type`.
3. Se ainda houver zero, tentar `tmdb_id` sem `item_type`.
4. Erro HTTP, JSON inválido, `total` inválido ou paginação inconsistente interrompe a busca imediatamente, sem fallback. Isso preserva a distinção entre ausência e falha.
5. Alternativa considerada: consultar `tmdb_id` primeiro. Foi descartada porque mudaria o comportamento atual e faria mais requisições no caso comum em que o IMDb resolve.

### 2. Não remover o filtro de tipo globalmente

1. `item_type` continua sendo o discriminador explícito quando preenchido.
2. Itens com `item_type` diferente do pedido são descartados.
3. Itens com `item_type` vazio só são aceitos com evidência local de título e ano, porque o mesmo número de TMDB pode identificar um filme e uma série diferentes.
4. Alternativa considerada: remover `item_type` de todas as consultas. Foi descartada pelo risco de misturar filme e série.

### 3. Validação local por título, ano e triagem existente

1. Usar `normalizeText` do bloco `slugify` para comparar o texto de `torrent_name`/`magnet_dn` com `title`, `originalTitle` e `alternativeTitles`.
2. Exigir o ano para `movie` quando `media.year` existir; para `tv`, exigir o título e manter a triagem de temporada e episódio, porque releases de episódio frequentemente omitem o ano.
3. Para `tv`, depois da validação de título/ano, manter a triagem de temporada e episódio já existente; o item sem tipo não pode ignorar essa checagem.
4. Itens sem tipo que não comprovem título/ano são descartados por triagem, sem compor falha agregada.
5. Alternativa considerada: aceitar qualquer item sem tipo retornado pelo ID. Foi descartada pela colisão de IDs entre tipos e títulos.

### 4. Reutilizar a paginação em uma função interna

1. Extrair a leitura paginada para um helper que recebe os parâmetros da tentativa e mantém as validações atuais de `items`, `total`, página vazia, página truncada e limite de páginas.
2. A busca principal apenas decide a ordem das tentativas e devolve a primeira lista não vazia.
3. A lista final é filtrada pela compatibilidade antes de `collectStreams`; itens incompatíveis não entram na contagem de falhas.

## Risks / Trade-offs

1. Release com título diferente dos títulos do TMDB → falso negativo seguro; a busca atual já depende de identificadores exatos, e o item não é aceito sem evidência.
2. Item sem tipo de outro título com o mesmo ID → descartado pela validação de título/ano; o custo é uma possível ausência não detectada.
3. Fallback adiciona até duas requisições quando não há resultados → executado somente após zero itens, sem tentativa automática em erro.
4. A API pode mudar o formato de `item_type` ou `seasons`/`episodes` → os testes de contrato existentes e os novos casos de tipo/título falham de forma explícita.

## Migration Plan

1. Alterar `src/betor/extractor.js` e os testes em `test/betor.test.js`.
2. Subir a versão do provedor no `manifest.json` e rodar `node build.js betor`.
3. Executar `npm run test:online -- --provider betor --record` com o pacote final e atualizar `providers.md`.
4. Reverter o código e os arquivos gerados em conjunto se a fonte voltar a um comportamento incompatível; não manter uma aprovação online de outro pacote.

## Validação da implementação

1. `node --test test/betor.test.js`: 14 testes passaram, incluindo o fallback de IMDb para TMDB com e sem tipo, item sem `item_type` compatível, título/ano divergente, tipo conflitante, erro sem fallback, paginação do fallback e triagem de episódio para série sem tipo.
2. `npm run lint`: passou.
3. `npm test`: 1013 testes, 989 passaram e 24 falharam. As 24 falhas são as mesmas suítes legadas preexistentes que importam `test/maestro/` e `test/scenarios/`, ausentes desde o reset; nenhuma falha nova.
4. `openspec validate corrigir-busca-betor --strict`: passou.
5. Rodada online com o pacote 1.2.0, semente `20261113`, ID `2026-11-12T17-22-57-848Z-betor-20261113-3481`: `tmdb_id=13` (Forrest Gump) passou a `Resolvido` com 1/1 stream aproveitável, `movie 1/5`, `tv 0/5`, status `Parcial`. Na versão 1.1.0 o mesmo título era `Sem resultado`.
6. `providers.md` foi atualizado com a nova rodada e sem hashes, URLs ou chave no resumo público.
