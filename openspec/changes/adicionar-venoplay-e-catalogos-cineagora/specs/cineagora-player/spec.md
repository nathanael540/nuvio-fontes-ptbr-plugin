# Spec Delta

## MODIFIED Requirements

### Requirement: Descoberta dos espelhos de áudio

O provedor SHALL ler os elementos com `data-link` de cada catálogo — CineAgora `.mirrors .button`, CineGratis `.player__mirrors .mirror`, VisionCine `.mirrors a.nav-link` —, manter somente links de `watch.brstream.cc` e associar o texto do elemento à opção. Elemento sem `data-link`, trailer e host desconhecido SHALL ser descartados por triagem.

#### Scenario: Filme com dublado e legendado

- **WHEN** a página publica um botão `Dublado` e outro `Legendado` para o player BrStream
- **THEN** o provedor trata cada botão como uma opção independente.

#### Scenario: Somente trailer

- **WHEN** a página só oferece trailer do YouTube
- **THEN** o provedor reconhece ausência e não produz streams.

#### Scenario: Host desconhecido

- **WHEN** um botão aponta para host diferente de `watch.brstream.cc`
- **THEN** ele é descartado sem interromper as demais opções.

#### Scenario: Rótulo de áudio desconhecido

- **WHEN** o botão BrStream não traz `Dublado` nem `Legendado`
- **THEN** o provedor preserva a opção e usa o nome da release como dica de idioma.

#### Scenario: Espelho do CineGratis

- **WHEN** a página do CineGratis publica um `.player__mirrors .mirror` com `data-link` para o BrStream
- **THEN** o provedor lê a opção e associa o texto `DUBLADO` ou `LEGENDADO` ao idioma.

#### Scenario: Espelho do VisionCine

- **WHEN** a página do VisionCine publica um `.mirrors a.nav-link` com `data-link` para o BrStream
- **THEN** o provedor lê a opção e associa o texto do link ao idioma.

#### Scenario: Elemento sem `data-link`

- **WHEN** a área de espelhos tem um elemento sem `data-link`, como o botão de trailer
- **THEN** o provedor o ignora sem lançar erro e continua com os demais.

#### Scenario: Nenhum espelho BrStream

- **WHEN** a página não publica nenhum elemento com `data-link` para `watch.brstream.cc`
- **THEN** o provedor reconhece ausência daquele catálogo e não produz streams.
