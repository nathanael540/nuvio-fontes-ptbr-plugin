# Design

## Context

1. A motivação e o contrato estão em [proposal.md](proposal.md) e [specs/pobreflix-domain-redirect/spec.md](specs/pobreflix-domain-redirect/spec.md).
2. Hoje `src/pobreflixtv/site.js` compara a origem completa em `isAllowedDomain`. O domínio `.golf` responde com `{"redirect":"https://www.pobreflixtv.town/..."}`; como `.town` não está em `DOMAINS`, o `fetchAjax` lança erro e o provedor tenta os aliases seguintes.
3. Seguindo o redirect manualmente, o fluxo `.town` funciona: a busca retorna o card, a página confirma `data-tmdb-id` e `data-video-id`, o `playerData` retorna os players e os embeds MixDrop/DoodStream respondem; o Streamtape da amostra retornou 404.
4. Os testes atuais já cobrem redirect para o domínio canônico da lista e rejeição para `site-malicioso.com`; eles precisam ser atualizados para a nova regra.

## Goals / Non-Goals

**Goals:**

1. Permitir troca de TLD quando a base do domínio continua sendo a mesma marca.
2. Manter a rejeição de origens arbitrárias, lookalikes, subdomínios não previstos e HTTP.
3. Continuar a descoberta no host final permitido, sem depender de repetir o redirect em cada chamada.

**Non-Goals:**

1. Aceitar qualquer redirect HTTPS.
2. Resolver TLDs compostos como `.com.br` sem uma lista de sufixos públicos.
3. Alterar o contrato de streams, a identidade por TMDB ou a triagem de players.

## Decisions

### 1. Allowlist de bases, não de URLs completas

1. Definir `ALLOWED_DOMAIN_BASES` com `pobreflixtv` (marca real dos domínios atuais e do `.town`), `flixtv` e `thepobretvflix` (exemplos fornecidos pelo mantenedor).
2. A grafia `poble` foi corrigida para `pobre`; não existe base `poble` na lista.
3. Manter `DOMAINS` como sementes de tentativa; a lista de bases governa somente redirect.
4. Alternativa considerada: adicionar `www.pobreflixtv.town` à lista de URLs completas. Foi descartada porque repete o problema na próxima troca de TLD.

### 2. Casamento por rótulo exato, com qualquer TLD de um rótulo

1. Aceitar somente HTTPS.
2. Normalizar o hostname para minúsculas, remover um único prefixo `www.` e exigir exatamente dois rótulos no restante: `base.tld`.
3. Aceitar quando `base` está em `ALLOWED_DOMAIN_BASES` e `tld` é alfabético com dois ou mais caracteres.
4. Rejeitar `evilpobreflixtv.com`, `pobreflixtv.evil.com`, `sub.pobreflixtv.town`, `http://...` e qualquer host com mais de um rótulo depois da base.
5. Alternativa considerada: `hostname.includes(base)`. Foi descartada porque aceitaria `evilpobreflixtv.com` e domínios em que a marca aparece no meio.
6. Alternativa considerada: lista fixa de TLDs. Foi descartada porque o requisito é acompanhar qualquer TLD novo da mesma marca.

### 3. Continuidade no host final

1. A busca pode começar em `.golf` e seguir para `.town`; os links de candidatos já vêm absolutos no host final.
2. Depois de confirmar a página, usar a origem da página do conteúdo/episódio para as chamadas seguintes (`episodesList` e `playerData`), em vez de reutilizar o domínio inicial.
3. Manter a regra de um único redirect por requisição; se o destino permitido devolver outro redirect, falhar explicitamente.
4. Alternativa considerada: confiar que cada chamada em `.golf` redireciona novamente. Funciona hoje, mas aumenta latência e depende de o redirect continuar existindo em todos os endpoints.

## Risks / Trade-offs

1. Qualquer TLD da mesma base é aceito; um agente que registre `pobreflixtv.<novo-tld>` poderia ser seguido. Mitigação: lista explícita de bases, revisão periódica e rejeição de lookalikes/subdomínios.
2. As bases `flixtv` e `thepobretvflix` vieram de exemplos; se não forem oficiais, removê-las reduz a superfície de risco.
3. TLDs compostos não são aceitos. Se um domínio oficial usar `.com.br`, será necessário evoluir a regra com uma lista de sufixos públicos.
4. O redirect `.golf` → `.town` pode mudar novamente; a regra por base reduz o impacto, mas a base ainda precisa ser mantida.

## Migration Plan

1. Alterar `isAllowedDomain`/`fetchAjax` e a continuidade de domínio em `src/pobreflixtv/site.js`.
2. Atualizar `test/pobreflixtv.test.js` com os cenários de bases, rejeições e fluxo `.golf` → `.town`.
3. Subir a versão do provedor, rodar `node build.js pobreflixtv` e executar a rodada online com `--record`.
4. Reverter código e arquivos gerados juntos se a nova regra não for aceita; não manter uma aprovação online de outro pacote.

## Validation

1. `npm run lint` passou sem erros.
2. `openspec validate corrigir-redirect-pobreflix --strict` passou.
3. `test/pobreflixtv.test.js`: 32/32 passaram, incluindo a allowlist por base, o redirect único, a cascata rejeitada e o fluxo `.golf` → `.town`.
4. `node build.js pobreflixtv` gerou `providers/pobreflixtv.js`, `gdrive/providers/pobreflixtv.js`, `prism/providers/pobreflixtv.js`, `gdrive/manifest.json` e `prism/manifest.json`; `test/manifest.test.js` passou 17/17.
5. `npm test`: depois da rodada online, 993 testes passaram e 24 falharam.
   1. As 24 falhas são preexistentes e vêm de arquivos ausentes na árvore atual: `test/maestro/prepare-session.mjs`, `test/maestro/run-provider-validation.mjs` e `test/scenarios/index.mjs` (`ERR_MODULE_NOT_FOUND` nas suítes `provider-session`, `provider-validation`, `scenario-inventory`, `scenarios` e `server`).
   2. Antes da rodada online havia uma 25ª falha esperada em `test/providers-catalog.test.js`: a tabela ainda mostrava `🔴 Instável` para o pacote 1.1.0. A rodada com `--record` atualizou a linha para `🟢 Estável` e a suíte passou.
6. Rodada online (`npm run test:online -- --provider pobreflixtv --record`, pacote 1.2.0, perfil `generalista`, `TMDB_API_KEY` somente do ambiente): 5/5 filmes e 4/5 séries resolvidos, status `Estável`.
   1. Nenhum caso falhou por redirect; a mensagem "Redirecionamento para fora da lista de domínios" desapareceu do relatório.
   2. A única falha, `tv 456` (Os Simpsons, S01E01), foi de hosts: MixDrop sem script empacotado, Streamtape HTTP 404 e DoodStream HTTP 403.
   3. O relatório transitório sanitizado da rodada é `test/artifacts/online/2026-11-12T17-58-40-524Z-pobreflixtv-a7a03ebf-6b41/result.json`.
