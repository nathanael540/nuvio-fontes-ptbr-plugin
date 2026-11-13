# Spec Delta

## REMOVED Requirements

### Requirement: Consulta ao catálogo Raflix por TMDB

**Reason**: O provedor Raflix foi removido do repositório e não será distribuído.

**Migration**: Nenhuma. Pedidos de filme e série deixam de consultar o catálogo Raflix e permanecem disponíveis apenas nos demais provedores publicados.

### Requirement: Resolução no boot do VidRift

**Reason**: A cadeia do VidRift existia apenas para atender ao provedor Raflix, que foi removido.

**Migration**: Nenhuma. Não há substituto no repositório para a resolução no boot do VidRift.

### Requirement: Seleção de áudio PT-BR e legenda PT

**Reason**: A seleção de faixas e legendas era específica do catálogo Raflix e do VidRift, removidos nesta mudança.

**Migration**: Nenhuma. Os demais provedores mantêm suas próprias regras de idioma e legenda.

### Requirement: Contingência H.264 via /api/source

**Reason**: A contingência dependia do `playbackToken` e dos provedores internos do VidRift, sem outro consumidor no repositório.

**Migration**: Nenhuma. A resolução de mídia de filmes e séries continua a cargo dos provedores que permanecem publicados.

### Requirement: Contrato dos streams HLS

**Reason**: O contrato descrevia exclusivamente os streams HLS montados a partir do catálogo Raflix e do VidRift.

**Migration**: Nenhuma. O contrato global dos streams permanece em `docs/arch.md` e nas specs dos demais provedores.

### Requirement: Ausência e falhas preservadas

**Reason**: O tratamento de ausência e falhas era delimitado pela cadeia do Raflix, que deixou de existir.

**Migration**: Nenhuma. Cada provedor restante mantém o próprio contrato de ausência e de falha.
