# Logzord - Arquitetura de Software (Hub IA-First)

> **Tipo de documento:** Hub de Arquitetura (central + módulos)
> **Localização:** `_docs/ARCHITECTURE.md`

## Índice Navegável

- [Guia de Uso da Documentação](#guia-de-uso-da-documentação)
- [1. Visão Arquitetural](#1-visão-arquitetural)
- [2. Stack de Tecnologias (Resumo)](#2-stack-de-tecnologias-resumo)
- [3. Arquitetura do Frontend](#3-arquitetura-do-frontend)
- [3.5 Shell oficial, registry e tema](#35-shell-oficial-registry-e-tema)
- [4. Diagrama de Arquitetura](#4-diagrama-de-arquitetura)
- [5. Estrutura IA-First de Documentação](#5-estrutura-ia-first-de-documentação)
- [6. Mapa de Módulos Arquiteturais](#6-mapa-de-módulos-arquiteturais)
- [7. Contratos e Decisões Centrais](#7-contratos-e-decisões-centrais)
- [8. Arquivos Importantes](#8-arquivos-importantes)
- [9. Dependências Externas e Integrações](#9-dependências-externas-e-integrações)
- [10. Histórico de Ondas e Changelog](#10-histórico-de-ondas-e-changelog)

---

## 1. Visão Arquitetural

O Logzord adota um estilo de **Monólito Modular** em um monorepo TypeScript. A decisão visa simplificar o deploy no Kubernetes e a comunicação entre interface e servidor, mantendo a separação lógica entre a captura de logs (Backend) e a visualização/análise (Frontend).

## 2. Stack de Tecnologias (Resumo)

| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Frontend** | Vue.js 3 + Vite | Agilidade no build e reatividade performática. |
| **Shell de UI** | `@vagnernogueira/vsshellcode` `^1.4.0` | Casca visual estilo VS Code (title bar, activity bar, sidebar, tabs, status bar, command palette) e tema; pacote Vue 3 instalado pelo GitHub Packages. |
| **UI Kit** | Componentes `Shell*` + `vscode-elements` (via `vsshellcode`) + CSS próprio em `style.css` | A UI se baseia ao máximo na casca; implementação própria só onde ela não cobre (§3.4), com codicons e tokens `--vscode-*`. Sem Tailwind, shadcn-vue ou lucide (removidos na issue #28). |
| **Backend** | Node.js + Express | Gerenciamento eficiente de I/O assíncrono e Streams. |
| **Comunicação** | WebSockets (ws) | Streaming bidirecional em tempo real. |
| **Persistência** | Dexie.js (IndexedDB) | Abstração robusta para o Quadro de Análise e configs. |
| **Qualidade** | Vitest + ESLint | Cobertura de testes e padronização rigorosa. |

## 3. Arquitetura do Frontend

A interface é uma casca estilo VS Code fornecida por `@vagnernogueira/vsshellcode` (decisão de adoção: ver [§7.2](#72-decisões-arquiteturais-centrais)), que substituiu o layout próprio anterior (`AppSidebar`, `LogToolbar`, `StatusBar` ad-hoc). `App.vue` orquestra a casca e dois composables de estado; o conteúdo específico do Logzord vive em views de sidebar e no `LogViewer`. Contratos de UI são explícitos por props e eventos.

### 3.1 Organização de diretórios

```filesystem
frontend/src/
├── App.vue
├── App.spec.ts
├── commands.config.ts
├── views.config.ts
├── main.ts
├── style.css
├── components/
│   ├── AnalysisSection.vue
│   ├── LogViewer.vue
│   ├── TargetsSection.vue
│   └── TargetsSection.spec.ts
├── composables/
│   ├── useLogSocket.ts
│   ├── useLogStream.ts
│   ├── useLogStream.spec.ts
│   └── useRecording.ts
├── lib/
│   ├── lineMatcher.ts
│   ├── logChunks.ts
│   ├── logTree.ts
│   └── syntaxHighlight.ts
└── types/
    └── index.ts
```

`useRecording.ts` cria o próprio Dexie/IndexedDB (`LogzordAnalysisDB` v2, tabela `recordedLogs` indexada só pela chave `++id`). `lib/lineMatcher.ts` (`makeLineMatcher`) é a fonte única do critério de filtro, usada pela tela (`filteredLogs`) e pelo Quadro (`recordLines`). `lib/syntaxHighlight.ts` escapa e realça uma linha uma única vez, ao criar a `LogEntry` (campo `html`, lido pelo `LogViewer` via `v-html`); o id da entrada é um contador monotônico. `lib/logChunks.ts` concentra, sem Vue nem DOM, o parsing de `LOG_CHUNK` (`splitLines`, recorte por bytes UTF-8) e as guardas de offset da navegação (`routeChunk` sobre `NavigationState`/`expectedOffset`, §7.1). `lib/logTree.ts` busca nós na árvore de targets (`findTargetById`, `firstTarget`) e a converte para `ShellTreeNode` (`toShellTreeNodes`). Testes de componente ficam colocados junto ao arquivo testado (`*.spec.ts`); testes de integração do backend ficam em `backend/src/__tests__/integration/`.

### 3.2 Fluxo de dados

- `App.vue` instancia `useLogStream(logViewer)` e `useRecording()` e conecta os dois por meio de `setOnLogEntries(...)` (um callback por chunk com todas as suas linhas). `logViewer` é o template ref do `LogViewer`, que expõe `isAtBottom`/`scrollToBottom`/`scrollToTop` (`LogViewport`, `defineExpose`): o composable decide quando rolar sem acessar o DOM (issue #40).
- `useLogStream` busca a árvore de targets `tree` (`GET /api/targets`) e as rotações sob demanda (`GET /api/targets/:id/rotations`), baixa o log da aba em foco (`downloadLog` → `GET /api/targets/:id/download`, que o backend entrega como anexo e comprime em `.gz` por stream acima de 5MB — CA5), mantém `selectedTarget`, `isPlaying`, `filterText`, `filteredLogs` e `currentWsOffset`, e controla o stream por WebSocket (protocolo, estado por aba e navegação); o transporte — conexão, reconexão e `wsState` — fica em `useLogSocket.ts`. Também lê `pageLines` de `GET /api/config` e implementa a navegação da história 5 (`rewind`, `fastForward`; ver §7.1).
- `useRecording` encapsula a persistência local via Dexie/IndexedDB (Quadro compartilhado entre abas; `recordedCount` via `liveQuery`) e expõe `isRecording`, `recordedCount`, `recordError`, `toggleRecord`, `recordLines` (um `bulkAdd` por chunk; falha vira log + `recordError`, exibido na view de Análise), `clearRecord` e `exportRecord` (`.txt`, ou `.txt.gz` via `CompressionStream` nativo acima de 5MB — CA5; `lib/gzip.ts`).
- `App.vue` compõe a casca com `ShellTitleBar`, `ShellActivityBar`, `ShellSidebar`, `ShellTabs`, `ShellStatusBar` e `ShellCommandPalette`, todos de `@vagnernogueira/vsshellcode/vue`, e registra atalhos com `useShellKeybindings`. `ShellPanel` não é usado: o painel inferior foi removido da UI (`togglePanel` em `App.vue` é um stub exigido por `useShellKeybindings`).
- `views.config.ts` declara as views `TargetsSection` (id `targets`, título "Logs") e `AnalysisSection` (id `analysis`); a `ShellActivityBar` seleciona a view ativa e `ShellSidebar` renderiza o componente correspondente com as props de `ViewPropsContext`.
- Cada target selecionado abre uma aba em `ShellTabs` (`openTargetIds`); fechar a aba ativa seleciona a última restante, e fechar a última aba limpa a seleção (`clearTarget`).
- Estado por aba em `useLogStream.ts`: play, filtro (texto + modo), logs e offset de retomada. Voltar a uma aba continua do offset salvo, sem reler o arquivo nem regravar no Record; fechar a aba descarta esse estado (`forgetTarget`).
- `commands.config.ts` alimenta a `ShellCommandPalette`; `App.vue` mapeia cada id de comando para um handler (`commandHandlers`).
- `LogEntry` e os tipos da árvore (`LogTreeNode`, `LogTreeTarget`, `LogRotation`) ficam em `frontend/src/types/index.ts`.

### 3.3 Componentes de interface

- **Title bar (`ShellTitleBar`, slots em `App.vue`):** ícone `codicon-output`; campo de filtro com toggle de regex (padrão substring; ambos case-sensitive; regex inválida não casa nada e marca o campo com o erro), botão play/pause, botões rewind/fast-forward (também nos comandos `stream-rewind`/`stream-fast-forward`; Rewind desabilitado com o buffer no início do arquivo) e toggle de gravação. Filtro e toggle de regex usam `ShellTitleBarSearch`/`ShellTitleBarSearchToggle`; as ações usam `ShellTitleBarAction` (28×28, mesmos codicons de `commands.config.ts`, tooltip por `title` nativo; gravação com `pressed` e a classe `lz-recording`).
- **Status bar (`ShellStatusBar`):** estado da conexão WebSocket (esquerda) e `OFFSET` corrente em bytes com `codicon-symbol-ruler` (direita).
- Cada view da sidebar renderiza o próprio `sidebar__section`/`sidebar__title`.
- `TargetsSection.vue` (sidebar) exibe a árvore hierárquica de targets com rotações sob demanda.
- `AnalysisSection.vue` (sidebar) mostra o `Quadro de Análise`, com ações de exportação e limpeza do buffer gravado.
- `LogViewer.vue` (área do editor) renderiza o fluxo filtrado, aplica destaque simples por conteúdo e mostra estados vazios quando não há logs.

### 3.4 Dependências de UI

- **Regra:** a UI se baseia ao máximo no `vsshellcode`, nesta ordem: (1) componentes `Shell*` e classes de `shell.css`; (2) web components do `vscode-elements` 2.5.1 empacotados na casca e registrados por `js/vscode-elements.js` (`vscode-textfield`, `vscode-toolbar-button`, `vscode-button`, `vscode-icon`, `vscode-badge`, `vscode-divider`…); (3) implementação própria em `frontend/src/components/` só onde nenhum dos dois cobrir, com codicons e tokens `--vscode-*`. Um controle genérico que falte na casca vira issue no `vsshellcode` (ex.: controles padrão da title bar, vagnernogueira/vsshellcode#19).
- **Ícones:** codicons (`css/codicon.css` da casca) em toda a UI.
- **Uso atual:** `AnalysisSection.vue` usa `vscode-button` e `vscode-badge`; `vite.config.ts` declara as tags `vscode-*` como custom elements. O atributo `icon` dos web components (`vscode-icon`) exige um `<link id="vscode-codicon-stylesheet">` que o app não tem; o codicon vai como `<span class="codicon …">` no slot.
- **Implementação própria (classes `lz-*` em `frontend/src/style.css`):** o filtro e as ações da title bar vêm da casca desde a 1.4.0 (vagnernogueira/vsshellcode#19); fica aqui só a cor de gravação (`lz-recording`). Também são próprios o rodapé de rotações da `TargetsSection` (itens de lista de 22px) e o `LogViewer`.
- **Sem Tailwind:** shadcn-vue, radix-vue, `lucide-vue-next` e Tailwind foram removidos na issue #28; sem o preflight, a casca fica com `line-height: normal`.

### 3.5 Shell oficial, registry e tema

- `frontend/package.json` depende de `@vagnernogueira/vsshellcode` na faixa `^1.1.8`.
- O pacote é consumido pelo registry do GitHub Packages. O `.npmrc` na raiz do workspace direciona o escopo `@vagnernogueira` para `https://npm.pkg.github.com` e usa `${GITHUB_TOKEN}` como token de instalação; nenhum token é versionado. O `make build` grava o token em um arquivo temporário com permissões restritas e o monta como segredo apenas durante o build do frontend; o token não é interpolado no Compose nem persistido em uma layer da imagem.
- `frontend/src/main.ts` importa `css/theme.css`, `css/shell.css`, `css/codicon.css` e `js/vscode-elements.js` de `@vagnernogueira/vsshellcode` antes de `frontend/src/style.css`.
- As variáveis `--vscode-*` do `theme.css` da casca são a fonte única de cor. `frontend/src/style.css` só completa os tokens que o tema não define (`editorWarning`/`editorInfo` para o realce de níveis, `button-secondary*` e `badge-*` para os `vscode-elements`), com os valores Dark+ em `:root`/`[data-theme="dark"]` e Light+ em `[data-theme="light"]`.
- `pilot/vsshellcode-integration` é um branch local-only do piloto, superseded pela adoção do pacote; o destino é descartá-lo após o merge, conforme decisão do humano. Esta sessão não remove o branch.

### 3.6 CI/CD (`.github/workflows/`)

- `validate.yml` é um workflow reutilizável (`workflow_call`, issue #42) e o gate único de validação: `npm ci` → lint do frontend e do backend → typecheck → testes de frontend e backend → `build` do frontend. `pr-checks.yml` e o job `validate` de `docker-publish.yml` só o chamam, passando `GH_PACKAGES_TOKEN`; o job `build` de `docker-publish.yml` depende dele (`needs: validate`), então falha de validação bloqueia a publicação. Isso elimina a duplicação do job `test` entre os dois workflows, que já tinha divergido.
- `pr-checks.yml` e `docker-publish.yml` seguem o padrão de dois workflows do template `~/dontpad/.github/workflows/`, com duas divergências deliberadas (revisadas na issue #6):
  - **`pr-checks.yml` existe e roda a validação completa em todo PR para `main`.** O dontpad não tem esse workflow — lá o job `test` só roda dentro do `docker-publish.yml`, no momento do release (tag `v*` ou `workflow_dispatch`). Decisão: manter como guardrail mais rigoroso — pega lint/test quebrado antes do merge, não só no release.
  - **`permissions` de `docker-publish.yml` são mais restritas que o template.** O dontpad declara `packages: write` no topo do workflow (herdado por todos os jobs, incluindo `test`). O logzord declara `packages: read` no topo e o job de build (`build`) sobrescreve para `packages: write`; o job `validate` permanece com `read`. Decisão: manter o escopo restrito, por princípio de menor privilégio (a validação não precisa de `write` em packages).
- Todas as actions são fixadas por SHA de commit, com a versão em comentário (`actions/checkout` v7, `actions/setup-node` v7, `docker/login-action` v4, `docker/setup-buildx-action` v4, `docker/metadata-action` v6, `docker/build-push-action` v7), porque o job `build` tem `packages: write`. O Dependabot (`.github/dependabot.yml`) atualiza semanalmente `github-actions` e `npm`; para resolver `@vagnernogueira/vsshellcode` ele usa o registry `npm.pkg.github.com` com o secret de Dependabot `GH_PACKAGES_TOKEN`.
- A instalação de `@vagnernogueira/vsshellcode` (dependência scoped privada via GitHub Packages) é um mecanismo específico do logzord, sem equivalente no template dontpad — usa `GH_PACKAGES_TOKEN` (PAT dedicado com scope `read:packages`, ver decisão da issue #5) passado por `pr-checks.yml` e `docker-publish.yml` ao `validate.yml`, e também como secret de Dependabot.

## 4. Diagrama de Arquitetura

```ascii
[ App.vue ]
   |-- useLogStream() -----> GET /api/targets(/:id/rotations|/:id/download) + WebSocket START_STREAM/PAUSE_STREAM
   |                         (reconexão automática com backoff fixo de 5s em close/error)
   |-- useRecording() -----> Dexie / IndexedDB
   |
   +--> @vagnernogueira/vsshellcode/vue
   |      TitleBar (filtro / play / record) / ActivityBar / Sidebar / Tabs / StatusBar / CommandPalette
   +--> views.config.ts ----> TargetsSection / AnalysisSection (na Sidebar)
   +--> LogViewer ---- filteredLogs (log.html pré-realçado) (área do editor)
       |
       v (porta 3001, único ponto de contato externo do container)
    [ Nginx ] -- estático (dist/) -- proxy /api, /ws --> [ Node/Express (127.0.0.1:3002) ]
                                                              ---- backend/targets.json / FS Streamer
                                                                 ^
                                                                 |
                                                          [ wkr/generate-logs.sh ] ----> [ wkr/sample.log ]
```

Fora do container (dev local sem Nginx), o frontend conecta direto no backend Node, que escuta na porta 3001 por padrão (`process.env.PORT || 3001`, ver `backend/src/index.js`).

## 5. Estrutura de Documentação

```filesystem
_docs/
├── ARCHITECTURE.md                # Hub central (este documento)
└── PRD.md                         # Escopo e requisitos do produto
```

## 6. Mapa de Módulos Arquiteturais

- **[Frontend](#3-arquitetura-do-frontend):** Camada de UI Vue 3, composables e componentes de apresentação.
- **[Backend](../backend/src/index.js):** Execução do streaming, API HTTP e WebSocket.
- **[Operações](../compose.yaml):** Estrutura de deploy e execução local, com apoio de [Makefile](../Makefile) e do [Containerfile](../Containerfile) único (imagem com Nginx + Node sob supervisord).

## 7. Contratos e Decisões Centrais

### 7.1 Contratos globais

- **Contrato de Streaming:** O backend deve enviar chunks de texto acompanhados do **byte offset** final daquele chunk.
- **Protocolo de Pausa (CA2):** Ao retomar (Play), o frontend envia o último byte offset recebido; o servidor inicia o `createReadStream` a partir desse ponto exato.
- **Endpoint de conexão WebSocket:** o frontend conecta em `<origem>/ws` (antes, na raiz). O `WebSocketServer` do backend aceita upgrade só em `/ws` (`path`), limita mensagens a 64KB (`maxPayload`) e derruba por heartbeat ping/pong (30s) quem não responde (#30). `START_STREAM` com `targetId` não-string ou `offset` fora de inteiro ≥ 0 (ausente = 0) recebe `ERROR` (`Invalid targetId`/`Invalid offset`, com o `streamId` quando enviado) — o protocolo de mensagens (`START_STREAM`, `PAUSE_STREAM`, `LOG_CHUNK`, `STREAM_END`, `ERROR`) não muda para clientes válidos.
- **Navegação temporal (história 5):** reposiciona por byte offset, sem timestamp. O tamanho da página é `pageLines` (linhas), lido de `backend/config.json` via `GET /api/config` (default 50, limite 1–2000, arquivo ausente/inválido → default). O cliente converte linhas em bytes pela média de bytes/linha do buffer (200B com buffer vazio) com folga de 2× e corta o resultado em N linhas.
  - **Rewind:** só cliente, sem mudar o protocolo. Lê `[X, inícioDoBuffer)` com `START_STREAM` em X, descarta a primeira linha parcial, envia `PAUSE_STREAM` ao alcançar o início do buffer e **prefixa** as N linhas mais próximas dele. Acima de 2000 linhas saem as mais novas e `currentWsOffset` recua até a última mantida (o Play relê o trecho cortado). Termina pausado.
  - **Fast Forward:** `START_STREAM` com `fromEnd` (bytes, opcional): o servidor começa em `max(offset, tamanho − fromEnd)`, nunca antes do offset do cliente. Sem salto, os chunks são anexados (vira Play); com salto, o cliente acumula a cauda até o `STREAM_END` e substitui o buffer pelas N últimas linhas. Segue tocando.
- **Guarda de continuidade:** o cliente mantém o byte esperado do próximo chunk (`expectedOffset`; nulo quando pausado). Um `LOG_CHUNK` é aceito se começa até esse byte e termina depois dele (a sobreposição é recortada); lacuna é descartada, exceto o salto do Fast Forward. Isso neutraliza chunks em voo de um stream anterior do mesmo alvo.
- **Identificação do stream (`streamId`):** `START_STREAM` aceita um `streamId` inteiro opcional, e o servidor o devolve em `LOG_CHUNK`, `STREAM_END` e `ERROR` daquele stream (o id é fixado na criação de cada leitura, então dados já lidos de um stream substituído saem com o id antigo). O cliente incrementa um contador a cada `START_STREAM` e descarta mensagens com outro id antes da guarda de continuidade; mensagens sem `streamId` seguem como antes. Isso elimina chunks em voo de outra aba e a leitura de um chunk antigo como o salto do Fast Forward (issue #24). Mudança aditiva e retrocompatível do contrato.
- **Reconexão automática:** `useLogSocket.ts` reconecta o WebSocket automaticamente após `close`/`error`, com espera fixa de 5s (`scheduleReconnect`), enquanto o `useLogStream` estiver montado (`shouldReconnect`). Ao reabrir a conexão, se `isPlaying` ainda estiver ativo o cliente reenvia `START_STREAM` com o último `currentWsOffset` conhecido — a retomada após reconexão segue o mesmo contrato de byte offset do Play/Pause manual (ver [ADR-001](./decisoes/ADR-001-resume-offset.md)).

### 7.2 Decisões arquiteturais centrais

- [ADR-001 — Estratégia de Retomada de Stream (Pausa/Play)](./decisoes/ADR-001-resume-offset.md)
- **Shell oficial:** o visual do Logzord é a casca `@vagnernogueira/vsshellcode` (estilo VS Code), adotada em substituição ao layout próprio anterior (`AppSidebar`, `LogToolbar`, `StatusBar`). Consumir o pacote como dependência do frontend, em vez de copiar CSS ou manter componentes shell ad-hoc; novos elementos de UI entram como view da sidebar (`views.config.ts`), slot da title bar, item da status bar ou comando da palette.
- **Fonte de cor:** manter o tema VS Code do shell como fonte única; implementação própria usa `--vscode-*` direto.
- **Controles de UI:** casca primeiro (componentes `Shell*`, depois `vscode-elements` empacotado), implementação própria só onde ela não cobre (§3.4). Substitui a adoção de shadcn-vue/lucide como UI kit.
- **Persistência do Quadro de Análise:** o Quadro (`LogzordAnalysisDB`) persiste no IndexedDB do browser, é compartilhado entre as abas da mesma origem e só zera pelo botão Limpar ou pela limpeza dos dados do site (decisão de produto, issue #22). `recordedCount` vem de `liveQuery` do Dexie, que reemite a contagem a cada escrita, inclusive de outra aba. Não se chama `navigator.storage.persist()`: evita o prompt de permissão do Firefox, ao custo de o storage ser *best-effort* (ver §7.3). O export lê o Quadro em páginas de 10 mil linhas pela chave primária e monta o arquivo como `Blob` em partes, sem string única em memória (issue #24); a regra de gzip acima de 5MB segue valendo.
- **Buffer de logs:** até 2000 linhas por aba em `shallowRef`, substituído inteiro uma vez por `LOG_CHUNK` (entradas imutáveis; mutar no lugar não dispara reatividade). Sem virtualização: a medição da issue #24 mostrou que o custo vinha do `push`+`shift` por linha no array reativo (O(n) por linha com o buffer cheio), não do DOM.
- **Branch piloto:** `pilot/vsshellcode-integration` permanece local-only e superseded pela adoção do pacote; após o merge, seu descarte depende da decisão do humano e não é executado por esta sessão.

### 7.3 Limitações conhecidas (resumo)

- Retomada de stream requer armazenamento preciso do byte offset pelo frontend; imprecisão resulta em lacuna ou sobreposição de logs.
- Integridade por linha (CA2): `LOG_CHUNK` traz texto arbitrário; `useLogStream.ts` retém o fragmento final sem `\n` e só emite linhas completas (`splitLines` em `lib/logChunks.ts`). O offset de retomada (`currentWsOffset`) aponta para o fim da última linha completa; num novo `START_STREAM` da mesma aba o servidor relê o fragmento pendente e o cliente recorta a parte já recebida (guarda de continuidade, §7.1). Ao trocar de aba o fragmento é descartado. Consequência: uma última linha sem `\n` final não é exibida até o escritor completá-la.
- Quadro de Análise *best-effort*: sem `navigator.storage.persist()`, o browser pode despejar o IndexedDB sob pressão de armazenamento, e o WebKit/Safari o apaga pelo ITP após ~7 dias sem interação. Em aba anônima, some ao fechar a janela.

### 7.4 Logs de teste locais

- `backend/targets.json` centraliza a lista de alvos consumida pelo backend para `/api/targets` e para o streaming WebSocket.
- `wkr/sample.log` é o arquivo de amostra usado no alvo `sample`.
- `wkr/generate-logs.sh` gera novas linhas em modo append e aceita `--reset` para truncar o arquivo antes de iniciar a geração.
- `Makefile` expõe alvos auxiliares para iniciar, parar e resetar o gerador sem precisar executar o script manualmente.

## 8. Arquivos Importantes

| Arquivo | Descrição |
| :--- | :--- |
| `backend/targets.json` | Lista de alvos de log disponíveis para streaming |
| `backend/config.json` | Settings de runtime (`pageLines` do Rewind/Fast Forward), servidos em `GET /api/config` |
| `frontend/package.json` | Dependências e scripts do frontend, incluindo `@vagnernogueira/vsshellcode` |
| `.npmrc` | Registry scoped do GitHub Packages e referência ao `GITHUB_TOKEN` |
| `frontend/src/main.ts` | Imports globais do tema, shell, codicon e web components do pacote antes do CSS da aplicação |
| `frontend/src/style.css` | Estilos próprios (`lz-*`) onde a casca não cobre e tokens `--vscode-*` ausentes no tema |
| `frontend/src/views.config.ts` | Catálogo declarativo das views da sidebar (itens da activity bar) |
| `frontend/src/lib/lineMatcher.ts` | Critério de filtro (substring/regex) compartilhado entre tela e Quadro de Análise |
| `frontend/src/lib/logTree.ts` | Busca na árvore de targets e conversão para `ShellTreeNode` |
| `frontend/src/lib/syntaxHighlight.ts` | Escape + realce de nível/ORA de uma linha, aplicado na criação da `LogEntry` |
| `frontend/src/commands.config.ts` | Comandos integrados à command palette |
| `wkr/generate-logs.sh` | Gerador local de logs de teste com suporte a `--reset` |
| `wkr/sample.log` | Arquivo de log de exemplo consumido pelo alvo `sample` |
| `compose.yaml` | Configuração Docker/Podman Compose |
| `Makefile` | Comandos de build, execução e parada da aplicação |
| `Containerfile` | Build multi-stage único (frontend Vite + deps do backend + imagem final Nginx/Node) |
| `nginx.conf` | Roteamento Nginx: estático (`/`), proxy `/api` e `/ws` para o Node interno (`127.0.0.1:3002`) |
| `supervisord.conf` | Supervisão dos processos `nginx` e `backend` (Node) dentro do mesmo container |

## 9. Dependências Externas e Integrações

| Dependência | Tipo | Contato/Link | Criticidade | Introduzida na Onda |
| :--- | :--- | :--- | :--- | :--- |
| Filesystem (NFS/local) | Infraestrutura | — | Alta | Onda 1 |
| `@vagnernogueira/vsshellcode` `^1.1.8` | Shell Vue 3 | GitHub Packages (`npm.pkg.github.com`) | Alta no frontend | Onda 8 |
| GitHub Packages | Registry npm | `.npmrc` + `GITHUB_TOKEN`/PAT `read:packages` | Alta para instalação | Onda 8 |

## 10. Histórico de Ondas e Changelog

### 10.1 Registro de Ondas

- **Onda 1 - MVP**
  - **Principais Alterações Arquiteturais:** Estrutura inicial — frontend Vue 3, backend Node.js/Express, streaming de logs via WebSocket com controle por byte offset.
  - **ADRs Relacionados:** [ADR-001](./decisoes/ADR-001-resume-offset.md)

- **Onda 8 - Shell visual `vsshellcode`**
  - **Principais Alterações Arquiteturais:** Adoção de `@vagnernogueira/vsshellcode` como camada visual (title bar, activity bar, sidebar, tabs, status bar, command palette), em substituição ao layout próprio; tokens Tailwind/shadcn derivados das variáveis `--vscode-*`.
  - **ADRs Relacionados:** —

### 10.2 Changelog do Documento

- **Versão 1.1**
  - **Data:** 2026-03-30
  - **Autor:** IA
  - **Mudanças:** Adequação ao padrão de blueprints — adição de índice navegável, guia de uso, seções 7/8/9, reestruturação da seção 6 em 6.1/6.2/6.3, correção de links no mapa de módulos, remoção de emojis dos títulos.

- **Versão 1.2**
  - **Data:** 2026-04-01
  - **Autor:** IA
  - **Mudanças:** Documentação da refatoração do frontend — inclusão da estrutura de diretórios, dos componentes `AppSidebar`, `LogToolbar`, `LogViewer` e `StatusBar`, dos composables `useLogStream` e `useRecording`, dos tipos `Target` e `LogEntry`, do fluxo `App.vue` -> composables -> componentes e da integração com `shadcn-vue` e `radix-vue`.

- **Versão 1.3**
  - **Data:** 2026-04-01
  - **Autor:** IA
  - **Mudanças:** Documentação do fluxo de logs de teste locais — migração da lista de alvos para `backend/targets.json`, inclusão do gerador `wkr/generate-logs.sh`, do arquivo `wkr/sample.log`, do apoio do `Makefile` e atualização do diagrama para refletir a geração e consumo local dos logs.

- **Versão 1.4**
  - **Data:** 2026-08-20
  - **Autor:** IA
  - **Mudanças:** Registro da adoção do pacote `@vagnernogueira/vsshellcode` via GitHub Packages, do bridging de cor VS Code → Tailwind, da exigência futura de `read:packages` em CI e do destino humano do branch piloto local-only.

- **Versão 1.5**
  - **Data:** 2026-08-20
  - **Autor:** IA
  - **Mudanças:** Consolidação de frontend e backend em uma imagem única (ver issue #8). `Containerfile` único multi-stage substitui `backend/Containerfile`/`frontend/Containerfile`; Nginx passa a ser o único ponto de contato externo do container (porta 3001), servindo os estáticos do build e fazendo proxy reverso para o Node (porta interna 3002, não exposta), com `nginx.conf` e `supervisord.conf` novos. `compose.yaml` e `docker-publish.yml` passam a operar sobre um único serviço/imagem (`ghcr.io/vagnernogueira/logzord`). Endpoint de conexão WebSocket move de raiz para `/ws` (protocolo de mensagens inalterado).

- **Versão 1.6**
  - **Data:** 2026-08-21
  - **Autor:** IA
  - **Mudanças:** Auditoria de aderência doc-código. Criação do `ADR-001` (referenciado desde a v1.1 mas nunca escrito), documentação da reconexão automática de WebSocket (`useLogStream.ts`, implementada na demanda de 2026-04-01 e até então não registrada), atualização do diagrama de arquitetura (§4) para refletir o Nginx como ponto de entrada introduzido na v1.5, e complemento da estrutura de diretórios (§3.1) com `db/`, `lib/` e arquivos de teste existentes. Correção de link quebrado no `README.md` (apontava para `_docs/ia-context/` inexistente).

- **Versão 1.7**
  - **Data:** 2026-09-30
  - **Autor:** IA
  - **Mudanças:** Revisão para refletir a adoção do `vsshellcode` como visual. Remoção de `LogToolbar`/`ShellPanel` (inexistentes no código), inclusão do `ShellTitleBar` (filtro, play, record), do `lib/logTree.ts`, das abas por target, da árvore hierárquica com rotações e do endpoint `/api/targets/:id/rotations`; versão do pacote atualizada para `^1.1.8`; Onda 8 registrada no histórico.

- **Versão 1.8**
  - **Data:** 2026-11-07
  - **Autor:** IA
  - **Mudanças:** Pendências da auditoria (issue #22). Remoção do módulo morto `db/index.ts` (`LogzordDB`, nunca importado) e alinhamento do §3.1: `useRecording.ts` cria o próprio Dexie. Filtro com modo regex alternável (`lib/lineMatcher.ts`), substituindo o placeholder `/regex/` enganoso. Quadro de Análise assumido como persistente por browser (PRD ajustado), com `recordedCount` via `liveQuery` sincronizado entre abas e o despejo *best-effort* registrado em §7.3.

- **Versão 1.9**
  - **Data:** 2026-11-07
  - **Autor:** IA
  - **Mudanças:** Pendências condicionais (issue #24). Buffer de logs em `shallowRef` com uma atribuição por chunk, eliminando o O(n) por linha medido com o buffer cheio; virtualização descartada (§7.2). Export do Quadro paginado em partes de `Blob` (§7.2). `streamId` opcional no protocolo WebSocket (§7.1), removendo a limitação de chunks em voo de §7.3.

- **Versão 1.10**
  - **Data:** 2026-11-08
  - **Autor:** IA
  - **Mudanças:** Regra de UI: basear ao máximo no `vsshellcode` (componentes `Shell*`, depois `vscode-elements` empacotado) e usar implementação própria só onde a casca não cobrir, com codicons e tokens `--vscode-*` (§2, §3.4, §3.5, §7.2). shadcn-vue, radix-vue e `lucide-vue-next` passam a legado em migração (issue #28); controles padrão da title bar propostos na casca (vagnernogueira/vsshellcode#19).

- **Versão 1.11**
  - **Data:** 2026-11-08
  - **Autor:** IA
  - **Mudanças:** Layout alinhado à casca (issue #28): title bar com input e botões próprios 28×28 de codicons, views com `sidebar__section` próprio, Quadro com `vscode-button`/`vscode-badge`, codicon no `OFFSET`. Remoção de Tailwind (e do preflight que alterava o `line-height` da casca), shadcn-vue, radix-vue e `lucide-vue-next`; `style.css` passa a conter só os estilos `lz-*` e os tokens ausentes no tema (§2, §3.1, §3.3, §3.4, §3.5, §7.2, §8).

- **Versão 1.12**
  - **Data:** 2026-11-08
  - **Autor:** IA
  - **Mudanças:** vsshellcode `^1.4.0`: title bar usa `ShellTitleBarSearch`, `ShellTitleBarSearchToggle` e `ShellTitleBarAction` (vagnernogueira/vsshellcode#19) no lugar do input e dos botões próprios; removidos `.lz-filter*` e `.lz-icon-button*` de `style.css` (§2, §3.4, §3.5).

- **Versão 1.13**
  - **Data:** 2026-11-09
  - **Autor:** IA
  - **Mudanças:** `useLogStream` dividido (issue #40): transporte em `useLogSocket.ts`, parsing e guardas de offset em `lib/logChunks.ts` (puro), scroll no `LogViewer` via `defineExpose` (`LogViewport`) em vez de `document.getElementById`. `App.vue` usa `wsState` direto com `WebSocket.OPEN` (§3.1, §3.2, §7.1, §7.3).
