# Design

## Context

A investigação partiu do enum fechado de `src/_blocks/language-discovery/index.mjs` e de amostras reais dos catálogos em 12/11/2026:

1. **LimeFilmes.** Todos os botões observados dizem `1080p | 3.50 GB | Dual Áudio`; o `dn` do magnet também traz `DUAL`. O provedor extraía `Dual Áudio` e chamava `normalizeLanguage`, que devolvia `null`; o stream saía `Idioma Desconhecido`.
2. **Starck Filmes.** O cartão de busca publica `.footer-audio-type` (`Dual Áudio`) e os botões repetem `Dublado` ou `Dual ÁudioHDR`. O `audioType` era lido apenas para o teste de busca e não entrava na classificação.
3. **Baixa Rápido.** As fichas publicam `Idioma:` (Baixa Rápido), `Idiomas :` (Limpo Torrent) e `Idioma:` (Salve Torrent) em tabelas, `.info_p` ou `#informacoes`. Só `download-row` lia `specs.Idiomas`; os outros leitores ignoravam o campo e dependiam do rótulo do magnet.
4. **BeTor.** A API devolve `languages`, mas o campo mistura áudio e legenda embutida: um release `Wednesday.S01.WEBRip.x264-ION10`, com 297 arquivos `.srt`, devolveu `["pt","en"]` sem áudio português. Por isso o campo não é usado como prova de áudio.
5. **MegaEmbed.** Playlists HLS com `#EXT-X-MEDIA` trazem `LANGUAGE="eng"` ou `"spa"`; o classificador só olhava `en`/`eng`/`english` e devolvia `null` quando não havia legenda PT, resultando em `Idioma Desconhecido`.
6. **Testes existentes.** `languageFromTexts` vencia a primeira correspondência; um `dn` com `English` antes de um rótulo `Dublado` podia produzir `Não PT-BR`.

O contrato do enum e os seis valores estão em `docs/arch.md`, seção 4, item 2.5. O bloco `language-discovery` continua sendo a única implementação do enum; nenhum provedor cria valor novo.

## Goals / Non-Goals

**Goals:**

1. Reduzir `Idioma Desconhecido` usando evidência que a fonte já publica, sem requisição adicional.
2. Preservar a regra de não promover português sem região a `Dublado`.
3. Corrigir a promoção indevida de legenda estrangeira a `Legendado`.
4. Manter o enum, o contrato de `buildStream` e os formatadores inalterados.
5. Cobrir a mudança com testes Node offline e rebuild dos provedores afetados.

**Non-Goals:**

1. Adivinhar idioma por país de origem, idioma original do TMDB, gênero ou interface do catálogo.
2. Usar `item.languages` do BeTor como prova de áudio.
3. Sondar mídia, decodificar áudio ou ler faixas MP4 além do que os provedores já leem.
4. Criar valor novo no enum, como `Dual Áudio`.
5. Alterar manifest, versão de provedor ou status em `providers.md` sem nova rodada online.

## Decisions

### 1. Dual/Tri Áudio vira Dublado (Não PT-BR?)

Em fonte PT-BR, `Dual Áudio` e `Tri Áudio` indicam mais de uma faixa de áudio e, por convenção do catálogo, incluem português. A fonte não comprova a região brasileira, então o valor é `Dublado (Não PT-BR?)`, não `Dublado`. `Dual Áudio PT-BR` continua `Dublado`; `Dual Áudio Portugal`/`PT-PT` continua `Dublado (Não PT-BR?)`.

`Dublado` explícito no mesmo texto vence a convenção Dual/Tri (`Dublado Dual Áudio` → `Dublado`), porque a modalidade explícita é mais forte que a multiplicidade.

### 2. Campos de página são evidência local

`src/baixarapido/common.js` ganha `readPageLanguage(html)`, que remove scripts/estilos/tags e procura `Idioma`, `Idiomas` ou `Áudio` seguido de `:`. Ele ignora `Qualidade de Áudio`/`Qualidade do Áudio` e para no próximo rótulo conhecido (`Qualidade`, `Tamanho`, `Duração`, `Formato`, etc.). O valor bruto segue para `classifyMagnetOption` no campo `audio`, que já é consumido por `languageFromTexts`.

A leitura é textual e não depende de classes CSS, porque a rede usa tabelas, `dl` e spans `.info_p`. O helper é chamado uma vez por ficha; nenhuma requisição nova é feita.

### 3. Texto estrangeiro não anula português posterior

`languageFromTexts` passa a fazer duas passagens: primeiro áudio/legenda reconhecidos; depois `Não PT-BR`/`Idioma Desconhecido` como reserva. Assim `["Filme.English.1080p", "Dublado"]` vira `Dublado`, sem alterar a prioridade de áudio sobre legenda.

### 4. Legenda estrangeira não é Legendado

Quando o texto tem `sub`/`legenda` e também um idioma estrangeiro conhecido, sem português explícito, o resultado é `Não PT-BR`. `English sub` e `Legendado Inglês` deixam de ser `Legendado`; `Legendado` sozinho continua `Legendado`, pela convenção PT-BR já existente.

### 5. HLS: áudio estrangeiro comprovado vira Não PT-BR

Em `megaembed`, a classificação de `#EXT-X-MEDIA` usa `normalizeLanguage` além dos conjuntos locais. Se todas as faixas de áudio são estrangeiras conhecidas, o stream sai `Não PT-BR`; se houver legenda PT, sai `Legendado`. Em `fireplayer`, o conjunto de idiomas estrangeiros é ampliado para não deixar espanhol, japonês e outros como desconhecidos.

### 6. BeTor continua sem usar `languages`

O campo `languages` do BeTor não distingue áudio de legenda embutida; usá-lo marcaria releases legendados como dublados. A classificação do BeTor continua pelos nomes e pelo `dn`, agora com Dual/Tri reconhecidos.

## Risks / Trade-offs

1. **Dual Áudio pode ser estrangeiro.** Um release `Dual Áudio` com inglês + espanhol em fonte não brasileira seria rotulado `Dublado (Não PT-BR?)`. O repositório só cataloga fontes PT-BR e o sufixo `?` comunica a incerteza; o risco fica registrado.
2. **Campo de página pode descrever o site.** `readPageLanguage` procura o primeiro rótulo na página; um seletor de idioma do site poderia interferir. Os rótulos observados ficam na ficha do conteúdo e os testes cobrem `Qualidade de Áudio`; o helper não inventa idioma.
3. **Sem região comprovada.** `Português / Inglês` e `Dual Áudio` continuam `Dublado (Não PT-BR?)`, não `Dublado`; quem filtra `^🗣️ Dublado$` não vê esses streams. A decisão preserva a regra atual.
4. **MegaEmbed MP4.** O `mdhd` observado é `und` na maioria dos arquivos; sem faixa HLS ou legenda, o stream continua `Idioma Desconhecido`.
5. **Evidência online.** O ambiente desta execução não tem `TMDB_API_KEY`; a rodada online do pacote final fica pendente e os status de `providers.md` não foram alterados.

## Migration Plan

1. Alterar os blocos e provedores.
2. Atualizar testes e documentação.
3. Rodar `npm run lint`, `npm test`, `npm run build` e reconstruir os provedores afetados.
4. Antes de publicar, rodar `npm run test:online -- --provider <id>` para os provedores alterados e atualizar `providers.md` na mesma mudança de release.

## Open Questions

Nenhuma.
