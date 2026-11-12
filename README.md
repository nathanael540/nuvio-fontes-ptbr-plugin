# Nuvio Fontes PT-BR

Repositório de provedores (plugins) para o [Nuvio](https://github.com/tapframe/NuvioStreaming) focado em conteúdo em **português do Brasil** (dublado e legendado).

> Histórico do projeto recebeu um reset em 12/11/2026.

## Provedores

A tabela dos provedores, com o status de cada um (🟢 Estável, 🔵 Parcial, 🔴 Instável, 🟠 Não verificado ou ⚫ Desativado) e a data da última verificação online, está em [providers.md](providers.md).

## Como este repositório é construído

> **O código e a documentação deste repositório são gerados por agentes de IA.**

1. O desenvolvimento é feito por agentes de IA guiados pela metodologia [OpenSpec](https://openspec.dev) (desenvolvimento orientado a especificações): cada mudança parte de uma especificação em [openspec/](openspec/), e as regras que os agentes seguem estão em [AGENTS.md](AGENTS.md).
2. O mantenedor define o escopo, aprova as decisões de arquitetura (refletidas em [docs/arch.md](docs/arch.md)) e exige testes Node de desenvolvimento e evidência online antes de publicar.
3. Lint e testes Node reduzem erros, mas não os eliminam. O código é fornecido como está, sem garantias: se for usar, adaptar ou redistribuir, revise-o antes, principalmente porque os provedores rodam no seu aparelho.

## Usar no Nuvio

1. Abra **Settings > Plugins** no app.
2. Adicione a URL raw de **um** dos manifests deste repositório. Eles têm os mesmos provedores e mudam só a apresentação de cada stream na lista:
   1. Formato sorteado a cada carregamento: `https://raw.githubusercontent.com/nathanael540/nuvio-fontes-ptbr-plugin/main/manifest.json`
   2. Formato Google Drive: `https://raw.githubusercontent.com/nathanael540/nuvio-fontes-ptbr-plugin/main/gdrive/manifest.json`
   3. Formato Prism: `https://raw.githubusercontent.com/nathanael540/nuvio-fontes-ptbr-plugin/main/prism/manifest.json`
3. Atualize a lista e ative os provedores desejados. Não instale mais de um manifest: cada stream apareceria repetido.

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
2. [docs/arch.md](docs/arch.md) — arquitetura, restrições do runtime e contrato do provedor.
3. [src/\_blocks/index.md](src/_blocks/index.md) — catálogo de blocos reutilizáveis para montar provedores.
4. [test/README.md](test/README.md) — comandos e operação da infraestrutura de testes.
5. [docs/tests.md](docs/tests.md) — tipos de teste, regras e limites.
6. [AGENTS.md](AGENTS.md) — regras para agentes e contribuidores.
7. [openspec/](openspec/) — especificações e mudanças (OpenSpec).
8. [Documentação oficial de provedores do Nuvio](https://github.com/yoruix/nuvio-providers/blob/template/DOCUMENTATION.md).

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
4. Antes de abrir o PR, rode `npm run lint`, `npm test` e `node build.js <id>`. Cubra o provedor com testes Node de desenvolvimento, conforme [docs/tests.md](docs/tests.md); eles rodam em Node, sem o app Nuvio instalado e sem internet. A evidência de funcionamento para publicação é a rodada online explícita com `npm run test:online -- --provider <id>`, também descrita em [docs/tests.md](docs/tests.md).
5. Inclua no PR os arquivos gerados, a entrada no `manifest.json` e a linha e a seção do provedor em [providers.md](providers.md).
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

[GPL-3.0](LICENSE). Código reaproveitado de outros repositórios GPL deve manter a atribuição de origem. Ao contribuir, você concorda em licenciar sua contribuição sob a mesma licença. Código reaproveitado de outros repositórios GPL deve manter a atribuição de origem.

## Aviso

Este repositório não hospeda conteúdo. Os provedores apenas localizam links em fontes de terceiros; a responsabilidade pelo uso é de quem os utiliza.

Streams por link magnet usam P2P (torrent): o app pede o aceite do usuário antes de reproduzir, e o IP fica visível para os demais participantes.
