# Proposal

## Why

O BeTor deixa de encontrar títulos que existem no catálogo quando o item não tem `item_type` preenchido ou está indexado apenas por `tmdb_id`. No caso observado, `tmdb_id=13` retorna Forrest Gump com `item_type` vazio, mas a busca atual usa `imdb_id` e `item_type=movie`, resultando em zero. O ID do TMDB não é globalmente único: o mesmo número pode existir como filme e como série, então a correção não pode simplesmente remover o filtro de tipo.

## What Changes

1. Buscar primeiro por `imdb_id` + `item_type`, depois por `tmdb_id` + `item_type` como fallback.
2. Se ainda não houver itens, consultar `tmdb_id` sem `item_type` e filtrar localmente: descartar `item_type` conflitante e aceitar item sem tipo somente quando o título/ano da release corresponder ao pedido.
3. Manter erros e paginação atuais; o fallback só ocorre em resultado vazio, nunca em falha.
4. Adicionar testes para o caso Forrest Gump, tipo conflitante, título/ano divergente, erro sem fallback e paginação do fallback.
5. Subir a versão do provedor, reconstruir os pacotes e registrar nova rodada online.

## Capabilities

### New Capabilities

1. `betor-search`: busca por identificador no BeTor, com fallback seguro entre IMDb e TMDB e validação conservadora de tipo, título e ano.

### Modified Capabilities

Nenhuma.

## Impact

1. `src/betor/extractor.js` e `test/betor.test.js`.
2. `manifest.json` (versão do provedor) e arquivos gerados `providers/betor.js`, `gdrive/providers/betor.js` e `prism/providers/betor.js`.
3. `providers.md` após a rodada online do pacote final.
4. Nenhuma mudança no contrato do app, no formato de saída ou no runtime.
