# Spec Delta

## ADDED Requirements

### Requirement: Resolução de opção pública adicional comprovada

Quando uma ficha confirmada oferecer opção adicional cuja estrutura pública e mídia da obra tenham sido comprovadas, o provedor SHALL resolver essa opção sem exigir conta, segredo ou contorno de controle de acesso. SHALL preservar as demais opções independentes e SHALL rejeitar como mídia links cuja identidade ou natureza não tenha sido comprovada.

#### Scenario: Filme com opção pública comprovada

- **WHEN** uma ficha confirmada de filme oferece uma opção adicional comprovada e acessível publicamente
- **THEN** o provedor devolve o stream correspondente à obra, com idioma e demais dados fornecidos pela fonte.

#### Scenario: Episódio com opção pública comprovada

- **WHEN** o episódio solicitado de uma série confirmada oferece uma opção adicional comprovada e acessível publicamente
- **THEN** o provedor devolve o stream desse episódio sem trocar a obra ou as coordenadas solicitadas.

#### Scenario: Player FHD exige contexto público de iframe

- **WHEN** a página do player FHD só responde 2xx com o contexto público de iframe e publica a mídia em `sources.file`
- **THEN** o provedor lê o HLS da página, sem conta, chave ou cookie, e preserva as demais opções.

#### Scenario: Player 1 exige contexto público de iframe

- **WHEN** o salto final do Player 1 responde 403 sem o contexto público de iframe e 200 com ele
- **THEN** o provedor usa o contexto, segue até o Blogger e preserva as demais opções.

#### Scenario: Opção bloqueada e outra disponível

- **WHEN** uma opção responde HTTP 403 e outra opção independente produz stream válido
- **THEN** o provedor preserva o stream válido e registra aviso para a opção indisponível, sem contornar a restrição.

#### Scenario: Todas as opções indisponíveis

- **WHEN** nenhuma opção de uma ficha confirmada produz stream válido
- **THEN** o provedor registra as causas como falha, sem inventar stream ou tratar a falha como ausência de obra.

#### Scenario: Candidato sem obra confirmada

- **WHEN** nenhuma ficha corresponde à obra solicitada
- **THEN** o provedor devolve lista vazia sem escolher outra obra ou declarar falha de player.
