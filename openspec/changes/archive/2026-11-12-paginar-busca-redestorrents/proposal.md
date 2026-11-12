# Proposal

## Why

O Redes Torrents já é um catálogo do provedor Baixa Rápido, mas a busca do site é por palavras, ordenada por data e dividida em 20 resultados por página. O leitor atual consulta apenas a primeira página, então títulos válidos que aparecem mais adiante não são encontrados. Em 12/11/2026, `The Last of Us - 2ª Temporada` estava na página 6 e `The Last of Us - 1ª Temporada` na página 11 da busca por "the last of us"; o catálogo não as alcançava. Criar um provedor dedicado duplicaria o mesmo acervo e contrariaria a regra de rede do repositório. A correção pertence ao catálogo existente.

## What Changes

1. O Redes Torrents permanece um catálogo do Baixa Rápido; nenhum provedor novo é criado.
2. A busca do catálogo passa a percorrer páginas seguintes quando a página atual não tem ficha confirmada, usando `pagina=<n>` no mesmo endereço `index.php?busca=<termo>`.
3. A paginação para em uma ficha confirmada, na última página (menos de 20 cartões), em estado vazio, em página repetida ou no limite de 12 páginas.
4. O filtro existente de tipo, temporada e relação de título é aplicado em cada página; só candidatos passam para a consulta da ficha.
5. O log do catálogo registra quantas páginas foram lidas e por que a paginação parou.
6. A versão do Baixa Rápido sobe para 1.5.0 e o pacote é reconstruído nos três formatos.
7. Testes offline passam a cobrir busca na página 1, busca em página posterior, página repetida e limite de páginas.
8. O método e os limites da paginação entram em `docs/provider-investigation.md`; a rodada online e o status ficam em `providers.md`.

## Capabilities

### New Capabilities

- `redestorrents-catalog`: busca e seleção de títulos do catálogo Redes Torrents dentro do Baixa Rápido, incluindo paginação limitada.

### Modified Capabilities

Nenhuma.

## Impact

1. Código: `src/baixarapido/download-row.js` e, se necessário para expor o fim da página, `src/baixarapido/gratistorrent.js`.
2. Testes: `test/baixarapido.test.js` e fixtures em `test/fixtures/baixarapido/`.
3. Manifest e saída: `manifest.json` (versão 1.5.0), `providers/baixarapido.js`, `gdrive/providers/baixarapido.js`, `prism/providers/baixarapido.js` e os manifests de formato.
4. Documentação: `providers.md` (rodada online) e `docs/provider-investigation.md` (método e limites).
5. Sem bloco novo, sem provedor novo, sem serviço externo novo e sem chave adicional.
