# Provedores rejeitados

Histórico de fontes investigadas ou removidas e rejeitadas para publicação neste repositório, mantendo data, categoria e motivo do descarte. As regras de preenchimento e reavaliação estão em [AGENTS.md](AGENTS.md#provedores-rejeitados-rejected-providersmd) e [docs/provider-investigation.md](docs/provider-investigation.md).

| Provedor | ID | Categoria | Motivo resumido | Data |
| --- | --- | --- | --- | --- |
| [TorrentFilmesX](#torrentfilmesx) | `torrentfilmesx` | Bloqueio anti-bot | Desafio gerenciado do Cloudflare (HTTP 403) sem serviço aberto alternativo | 2026-11-09 |
| [Raflix](#raflix) | `raflix` | Escopo ou duplicidade | Removido do catálogo publicado por decisão editorial do mantenedor | 2026-11-12 |

## TorrentFilmesX

1. **Data da rejeição:** 2026-11-09
2. **Categoria:** Bloqueio anti-bot
3. **Domínios investigados:** `www.torrentfilmesx.top`, `www.torrentfilmesx.com`
4. **Motivo:** As rotas públicas testadas (`/` e `/feeds/posts/default`) responderam `HTTP 403` com desafio gerenciado do Cloudflare (`cf-mitigated: challenge`) em `2026-11-07` e `2026-11-09`, sem serviço aberto, público, sem conta e sem chave que entregasse o HTML ao `fetch` dos apps.
5. **Evidência e referência:** Registro histórico pré-reset em [openspec/changes/archive/2026-11-09-evaluate-torrentfilmesx-provider](openspec/changes/archive/2026-11-09-evaluate-torrentfilmesx-provider/) (commit `641809e`).
6. **Critério de reavaliação:** A fonte deixar de exigir desafio anti-bot no `fetch` direto ou surgir alternativa pública, sem conta e sem chave, validada nos apps.

## Raflix

1. **Data da rejeição:** 2026-11-12
2. **Categoria:** Escopo ou duplicidade
3. **Domínios investigados:** `raflix.web.id` (catálogo) e player VidRift
4. **Motivo:** Provedor publicado inicialmente em `2026-11-12` e removido no mesmo dia por decisão de escopo do mantenedor de não distribuí-lo no catálogo publicado deste repositório, sem bloqueio técnico registrado na change de remoção.
5. **Evidência e referência:** Change pós-reset em [openspec/changes/archive/2026-11-12-remover-provedor-raflix](openspec/changes/archive/2026-11-12-remover-provedor-raflix/) (commit `4cf5ad2`).
6. **Critério de reavaliação:** Decisão explícita do mantenedor autorizando reabertura por nova proposta OpenSpec.
