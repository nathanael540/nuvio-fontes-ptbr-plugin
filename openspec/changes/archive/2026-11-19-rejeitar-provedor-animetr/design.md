# Design

## Context

Ver `proposal.md` — Why. A investigação de 19/11/2026 observou a fonte pública `https://animetr.co/` e a página de um episódio recente:

1. O HTML declara `lang="tr"`, `content-language: tr`, `og:locale: tr_TR` e o título “Anime İzle | AnimeTR - Türkçe Altyazılı Anime ve Donghua”.
2. O JSON-LD do episódio informa `inLanguage: "tr"` e `subtitleLanguage: "tr"`; o FAQ da própria página confirma legenda turca e, em alguns casos, dublagem turca.
3. A busca pública é `GET /seriler?title=<termo>` e devolve cartões com título, ano, tipo e imagem; o catálogo não publica áudio nem legenda em português.
4. Os players do episódio são Vip (exige login), Google Drive, VK, Vidmoly, Voe, OK.ru e Abyss. O iframe principal em `asyaanimeleri.pw` respondeu `HTTP 404` na consulta direta.

O repositório declara escopo de conteúdo em português do Brasil (`contentLanguage: "pt"`, dublado e legendado) e o enum `LANGUAGE` não tem valor para “turco”; os streams só poderiam sair como `Gringo`, sem utilidade para o público do catálogo.

## Goals / Non-Goals

**Goals:**

1. Registrar o AnimeTR como fonte rejeitada por escopo, com data, categoria fechada, domínios, motivo, evidência e critério de reavaliação.
2. Manter a entrada fora de `manifest.json` e `providers.md`, sem código de provedor, build ou pacote gerado.
3. Reaproveitar a validação existente de `rejected-providers.md`.

**Non-Goals:**

1. Implementar provedor, resolver players ou sondar mídia.
2. Atualizar `docs/provider-investigation.md`, porque a investigação não introduziu método reutilizável novo.
3. Alterar `AGENTS.md`, `README.md`, `docs/arch.md` ou `docs/tests.md`; as regras de rejeição e a suíte já existem.

## Decisions

### D1. Categoria `Escopo ou duplicidade`

1. A rejeição usa `Escopo ou duplicidade` porque o impedimento definitivo é o idioma do catálogo, não a indisponibilidade momentânea de um player.
2. Alternativa descartada: `Sem mídia utilizável`, motivada pelo `HTTP 404` do iframe principal. O player pode voltar e a fonte continuaria fora do escopo; registrar pelo sintoma levaria a uma reavaliação inútil.
3. Alternativa descartada: implementar mesmo assim classificando os streams como `Gringo`. Contraria o escopo declarado no `README.md`, em `AGENTS.md` e no `contentLanguage` do manifest.

### D2. Identidade do registro

1. Nome exibido `AnimeTR`, ID `animetr` em kebab-case, único e ausente de `manifest.json`.
2. Domínios investigados: `animetr.co` (catálogo) e `asyaanimeleri.pw` (player principal).
3. Data da rejeição `2026-11-19`, no fuso local da investigação.

### D3. Escopo documental mínimo

1. A mudança altera apenas `rejected-providers.md` e o delta da capability `rejected-providers-registry`.
2. A suíte `test/rejected-providers.test.js` valida o arquivo real e não precisa de caso novo, porque o formato já é coberto e a entrada é dado, não comportamento novo.
3. A evidência não inclui URL de player com caminho efêmero, cookie, token ou hash; cita domínio e resultado observado.

## Risks / Trade-offs

1. **A fonte passar a publicar PT-BR** → Mitigação: o critério de reavaliação exige áudio ou legenda em português do Brasil e nova proposta OpenSpec.
2. **O `HTTP 404` ser temporário e esconder uma fonte tecnicamente viável** → Mitigação: o motivo registrado é o escopo; o 404 entra apenas como evidência secundária.
3. **Categoria `Escopo ou duplicidade` não distinguir escopo de duplicidade** → Mitigação: o campo `Motivo` detalha que se trata de idioma turco, sem equivalência com provedor já publicado.

## Validation

1. `openspec validate rejeitar-provedor-animetr --strict` aprovou o delta.
2. `node --test test/rejected-providers.test.js` aprovou os 4 testes, incluindo a estrutura, a categoria, os seis campos, a sanitização e a ausência de conflito com o manifest.
3. `npm run lint` concluiu com código de saída 0.
4. `npm test` aprovou os 1.875 testes, com 0 falhas e 0 testes ignorados.
5. A verificação do diff confirmou que a mudança é documental. A busca pelo ID `animetr` nos três manifests e em `providers.md` não encontrou ocorrências.
