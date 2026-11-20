<p align="center">
  <a href="https://nathanael540.github.io/nuvio-fontes-ptbr-plugin/"><img src="assets/branding/logo.png" alt="Nuvio Fontes PT-BR" width="460"></a>
</p>

<p align="center">
  <a href="https://nathanael540.github.io/nuvio-fontes-ptbr-plugin/"><img src="https://img.shields.io/badge/Gerar-manifest-orange" alt="Gerar manifest"></a> <a href="providers.md"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fnathanael540%2Fnuvio-fontes-ptbr-plugin%2Fmain%2Fsrc%2Fmanifest.json&query=%24.scrapers.length&label=provedores&color=brightgreen" alt="Provedores"></a> <a href="https://discord.com/invite/YvCqRYe9gw"><img src="https://img.shields.io/badge/Comunidade_no-Discord-blue?logo=discord&logoColor=white" alt="Discord"></a> <a href="https://discord.com/invite/YvCqRYe9gw"><img src="https://img.shields.io/discord/1539847210143981619?label=discord&logo=discord&logoColor=white" alt="Discord Online"></a> <a href="https://github.com/tapframe/NuvioStreaming"><img src="https://img.shields.io/badge/Feito_para_o-Nuvio-purple" alt="Feito para o Nuvio"></a>
</p>

Repositório de provedores (plugins) para o [Nuvio](https://github.com/tapframe/NuvioStreaming) focado em conteúdo em **português do Brasil** (dublado e legendado).

## Provedores

A tabela dos provedores, com o status de cada um (🟢 Estável, 🔵 Parcial, 🔴 Instável, 🟠 Não verificado ou ⚫ Desativado) e a data da última verificação online, está em [providers.md](providers.md).

## Como este repositório é construído

> **O código e a documentação deste repositório são gerados por agentes de IA.**

1. O desenvolvimento é feito por agentes de IA guiados pela metodologia [OpenSpec](https://openspec.dev) (desenvolvimento orientado a especificações): cada mudança parte de uma especificação em [openspec/](openspec/), e as regras que os agentes seguem estão em [AGENTS.md](AGENTS.md).
2. O mantenedor define o escopo, aprova as decisões de arquitetura (refletidas em [docs/arch.md](docs/arch.md)) e exige testes Node de desenvolvimento e evidência online antes de publicar.
3. Lint e testes Node reduzem erros, mas não os eliminam. O código é fornecido como está, sem garantias: se for usar, adaptar ou redistribuir, revise-o antes, principalmente porque os provedores rodam no seu aparelho.

## Usar no Nuvio

1. Acesse o [gerador de manifest](https://nathanael540.github.io/nuvio-fontes-ptbr-plugin/) para escolher idioma, tipo de stream, qualidade mínima e formatação, e copie a URL gerada.
2. No app, abra **Configurações > Conteúdo e descoberta > Plugins**.
3. Toque em **Adicionar repositório** e cole a URL de **um** manifest. Para mudar os filtros depois, remova o manifest atual antes de adicionar o novo para não repetir streams.
4. Toque em **Atualizar** para carregar a lista de provedores do manifest.
5. Ative cada provedor desejado. Adicionar o repositório não ativa nenhum provedor sozinho.

## Desenvolvimento

### Organização dos testes

1. `test/` é a pasta principal de toda a infraestrutura de testes.
2. Testes Node e fixtures ficam em `test/`; cada teste de bloco fica em `test/blocks/<bloco>/index.test.mjs` e o código em `src/_blocks/<bloco>/index.mjs`.
3. O servidor está em `test/server.js`.
4. Pacotes temporários, fluxos gerados, relatórios, logs e capturas ficam em `test/artifacts/`, ignorada pelo Git, pelo lint e pela descoberta de testes.
5. `npm test` continua offline; `npm run test:online -- --provider <id>` é a verificação explícita com rede real e usa os catálogos em `test/online/`.
6. `npm test`, `npm run lint` e `npm start` foram preservados; a descoberta Node seleciona explicitamente apenas `*.test.js` e `*.test.mjs` sob `test/`. `build.js`, código publicado e specs ficam fora de `test/`; os catálogos de referência da verificação online ficam em `test/online/catalogs/`.

## Scripts

1. `npm run build` — empacota todos os provedores de `src/`.
2. `npm run build:min` — empacota com minificação (publicação).
3. `npm run lint` — verifica o código com ESLint: restrições do runtime do app em `src/` e JSDoc obrigatório nos blocos.
4. `npm test` — valida o manifest, o catálogo de provedores (`providers.md`), o pipeline de build, o catálogo de blocos, os blocos, o servidor local e os provedores com respostas controladas, sem internet.
5. `npm run test:online -- --provider <id>` — executa o pacote publicado com rede real, sorteia cinco títulos por tipo e registra a evidência online (ver [test/README.md](test/README.md)).
6. `npm start` — servidor estático local de manifests e pacotes (ver [test/README.md](test/README.md)).

## Documentação

1. [providers.md](providers.md) — tabela dos provedores, status visual, data da última verificação e resumo da última rodada.
2. [rejected-providers.md](rejected-providers.md) — histórico de fontes investigadas ou removidas e rejeitadas para publicação, com data, categoria e motivo.
3. [docs/arch.md](docs/arch.md) — arquitetura, restrições do runtime e contrato do provedor.
4. [src/\_blocks/index.md](src/_blocks/index.md) — catálogo de blocos reutilizáveis para montar provedores.
5. [test/README.md](test/README.md) — comandos e operação da infraestrutura de testes.
6. [docs/tests.md](docs/tests.md) — tipos de teste, regras e limites.
7. [AGENTS.md](AGENTS.md) — regras para agentes e contribuidores.
8. [openspec/](openspec/) — especificações e mudanças (OpenSpec).
9. [docs/provider-investigation.md](docs/provider-investigation.md) — guia de investigação de novos provedores, com métodos usados, referências de código e limites.
10. [Documentação oficial de provedores do Nuvio](https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md).

## Contribuindo

Contribuições são bem-vindas, feitas por pessoas ou com ajuda de agentes de IA. Em qualquer caso, quem envia é responsável por revisar e testar o que propõe.

### Issues

1. **Provedor com problema:** abra uma issue informando o app (NuvioMobile ou NuvioTV), a versão (full, estável ou beta), a plataforma, o título testado (nome e ID do TMDB) e, se disponíveis, trechos sanitizados do Logcat (tag `PluginRuntime`). Não publique logs brutos com credenciais ou URLs assinadas.
2. **Sugestão de fonte:** descreva a fonte (conteúdo em PT-BR, dublado ou legendado, filmes, séries, animes ou doramas) e como ela localiza os títulos.
3. Não publique em issues links diretos para conteúdo protegido por direitos autorais.

### Fork e pull request

1. Faça um fork e crie um branch descritivo, ex.: `add-<id>` para um provedor novo ou `fix-<id>` para uma correção.
2. Leia o [AGENTS.md](AGENTS.md) e siga as regras de código, blocos e validação. Mudanças de comportamento (provedor novo, contrato, build ou manifest) começam por uma proposta em `openspec/changes/`.
3. Monte o provedor a partir de `src/_template/` e dos blocos do [catálogo](src/_blocks/index.md). Código reutilizável entre provedores vai para `src/_blocks/`, com JSDoc e testes.
4. Antes de abrir o PR, rode `npm run lint`, `npm test` e `node build.js <id>`. Cubra o provedor com testes Node de desenvolvimento, conforme [docs/tests.md](docs/tests.md); eles rodam em Node, sem o app Nuvio instalado e sem internet. Gere os pacotes de publicação com `npm run build:min`. A evidência de funcionamento é a rodada online explícita com `npm run test:online -- --provider <id>`, também descrita em [docs/tests.md](docs/tests.md).
5. Inclua no PR os arquivos gerados, a entrada em `src/manifest.json` e a linha e a seção do provedor em [providers.md](providers.md).
6. Nunca inclua chaves, tokens ou senhas: o repositório é público. Bypass, proxy, VPN e qualquer outro serviço são permitidos quando forem abertos, públicos e utilizáveis sem conta e sem chave. É proibido o que exige chave, token, senha ou criação de conta. A única chave externa é a do catálogo, entregue pelo app (`TMDB_API_KEY`). Cálculo local, sem conta e sem chave, é permitido.

### Commits

1. Use [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), com tipo em inglês e descrição em pt-BR: `tipo(escopo): descrição`. O escopo é opcional.
2. As regras completas de tipos, escopos, descrição, conteúdo do commit, quebras de compatibilidade e referência ao OpenSpec estão em [AGENTS.md — Commits](AGENTS.md#commits).

Exemplos:

```text
feat(fonte-exemplo): adiciona suporte a filmes e séries
fix(blocks): preserva cabeçalhos na montagem dos streams
docs(openspec): propõe inclusão da fonte exemplo
build: atualiza o esbuild
```

Exemplo com referência à mudança OpenSpec:

```text
fix(fonte-exemplo): corrige seleção do episódio

Usa o número do episódio para distinguir resultados com o mesmo título.

OpenSpec: corrigir-selecao-episodio
```

### Segurança

Se encontrar uma vulnerabilidade, não abra issue pública: use o [reporte privado de vulnerabilidades](https://github.com/nathanael540/nuvio-fontes-ptbr-plugin/security/advisories/new) do GitHub.

## Licença

[GPL-3.0](LICENSE). Código reaproveitado de outros repositórios GPL deve manter a atribuição de origem. Ao contribuir, você concorda em licenciar sua contribuição sob a mesma licença.

### Créditos

- Prisma Stream Addon (`codeberg.org/prismastream/install`, GPL-3.0): Otakulogia, AnimesOnlineCC e OverFlix.
- Ivadz Nuvio Repo (`github.com/Ivadzf/ivadz-nuvio-repo`, GPL-3.0): fluxo VenoPlay e catálogos CineGratis e VisionCine.

## Aviso

Este repositório não hospeda conteúdo. Os provedores apenas localizam links em fontes de terceiros; a responsabilidade pelo uso é de quem os utiliza.

Streams por link magnet usam P2P (torrent): o app pede o aceite do usuário antes de reproduzir, e o IP fica visível para os demais participantes.
