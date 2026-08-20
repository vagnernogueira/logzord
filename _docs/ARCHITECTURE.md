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

## Guia de Uso da Documentação

### Para leitura humana (onboarding)

1. Ler este hub por completo;
2. Navegar para os módulos conforme o tema da tarefa.

### Para uso com IA (recuperação eficiente)

- Carregar este hub para obter visão geral e contratos centrais;
- Carregar apenas o módulo relevante (`frontend.md`, `backend.md`, `operations.md`) para tarefas específicas.

### Regra de atualização

- Mudanças em contratos ou decisões centrais: atualizar este hub;
- Mudanças locais (componente, rota, deploy): atualizar apenas o módulo afetado.

---

## 1. Visão Arquitetural

O Logzord adota um estilo de **Monólito Modular** em um monorepo TypeScript. A decisão visa simplificar o deploy no Kubernetes e a comunicação entre interface e servidor, mantendo a separação lógica entre a captura de logs (Backend) e a visualização/análise (Frontend).

## 2. Stack de Tecnologias (Resumo)

| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Frontend** | Vue.js 3 + Vite | Agilidade no build e reatividade performática. |
| **UI Kit** | shadcn-vue + radix-vue + Tailwind | Componentes consistentes e primitives de interface para a camada Vue. |
| **Shell de UI** | `@vagnernogueira/vsshellcode` `^1.0.1` | Componentes oficiais Vue 3 para a casca visual; pacote instalado pelo GitHub Packages. |
| **Backend** | Node.js + Express | Gerenciamento eficiente de I/O assíncrono e Streams. |
| **Comunicação** | WebSockets (ws) | Streaming bidirecional em tempo real. |
| **Persistência** | Dexie.js (IndexedDB) | Abstração robusta para o Quadro de Análise e configs. |
| **Qualidade** | Vitest + ESLint | Cobertura de testes e padronização rigorosa. |

## 3. Arquitetura do Frontend

O frontend foi decomposto em uma camada de orquestração em `App.vue`, dois composables de estado e um conjunto de componentes de apresentação. O objetivo da refatoração foi reduzir a responsabilidade do componente raiz e manter os contratos de UI explícitos por props e eventos.

### 3.1 Organização de diretórios

```filesystem
frontend/src/
├── App.vue
├── commands.config.ts
├── views.config.ts
├── components/
│   ├── AnalysisSection.vue
│   ├── LogToolbar.vue
│   ├── LogViewer.vue
│   ├── TargetsSection.vue
│   └── ui/
├── composables/
│   ├── useLogStream.ts
│   └── useRecording.ts
└── types/
  └── index.ts
```

### 3.2 Fluxo de dados

- `App.vue` instancia `useLogStream()` e `useRecording()` e conecta os dois por meio de `setOnLogEntry(...)`.
- `useLogStream` busca os `targets`, mantém `selectedTarget`, `isPlaying`, `filterText`, `filteredLogs` e `currentWsOffset`, e controla a comunicação com a API HTTP e o WebSocket.
- `useRecording` encapsula a persistência local via Dexie/IndexedDB e expõe `isRecording`, `recordedCount`, `toggleRecord`, `recordLine`, `clearRecord` e `exportRecord`.
- `App.vue` compõe a casca com `ShellActivityBar`, `ShellSidebar`, `ShellTabs`, `ShellPanel`, `ShellStatusBar` e `ShellCommandPalette`, todos fornecidos por `@vagnernogueira/vsshellcode/vue`.
- `views.config.ts` declara as views `TargetsSection` e `AnalysisSection`; a view ativa é renderizada pela composição dinâmica da sidebar.
- `App.vue` repassa estado e callbacks para as seções, `LogToolbar` e `LogViewer` por props e eventos.
- `Target` e `LogEntry` ficam centralizados em `frontend/src/types/index.ts` para compartilhar o contrato entre composables e componentes.

### 3.3 Componentes de interface

- `TargetsSection.vue` lista os targets disponíveis.
- `AnalysisSection.vue` mostra o `Quadro de Análise`, com ações de exportação e limpeza do buffer gravado.
- `LogToolbar.vue` concentra o controle de play/pause, o toggle de gravação e o filtro textual.
- `LogViewer.vue` renderiza o fluxo filtrado, aplica destaque simples por conteúdo e mostra estados vazios quando não há logs.
- A casca, incluindo a status bar e o panel, é fornecida pelos componentes oficiais de `@vagnernogueira/vsshellcode/vue`.

### 3.4 Dependências de UI

- A pasta `frontend/src/components/ui/` segue o padrão do `shadcn-vue` e usa `radix-vue` como base para primitives de interface.
- Os componentes locais incluem `Button`, `Card`, `Input`, `Badge`, `Separator`, `Tooltip` e `ScrollArea`.
- `lucide-vue-next` fornece os ícones usados na toolbar.

### 3.5 Shell oficial, registry e tema

- `frontend/package.json` depende de `@vagnernogueira/vsshellcode` na faixa `^1.0.1`.
- O pacote é consumido pelo registry do GitHub Packages. O `.npmrc` na raiz do workspace direciona o escopo `@vagnernogueira` para `https://npm.pkg.github.com` e usa `${GITHUB_TOKEN}` como token de instalação; nenhum token é versionado. O build do frontend recebe esse token como build argument.
- `frontend/src/main.ts` importa `@vagnernogueira/vsshellcode/css/theme.css` e `shell.css` antes de `frontend/src/style.css`.
- O bridging de cor adotado na Fase 6 usa VS Code → Tailwind: as variáveis `--vscode-*` fornecidas pelo shell são a fonte única, e `frontend/src/style.css` mapeia os tokens semânticos do Tailwind/shadcn para elas. `tailwind.config.js` preserva utilitários de opacidade com `color-mix`.
- Hoje não existe `.github/workflows/` no repositório. Um futuro workflow que instale a dependência scoped deverá ter `GITHUB_TOKEN` ou PAT com scope `read:packages`.
- `pilot/vsshellcode-integration` é um branch local-only do piloto, superseded pela adoção do pacote; o destino é descartá-lo após o merge, conforme decisão do humano. Esta sessão não remove o branch.

## 4. Diagrama de Arquitetura

```ascii
[ App.vue ]
   |-- useLogStream() -----> GET /api/targets + WebSocket START_STREAM/PAUSE_STREAM
   |-- useRecording() -----> Dexie / IndexedDB
   |
   +--> @vagnernogueira/vsshellcode/vue
   |      ActivityBar / Sidebar / Tabs / Panel / StatusBar / CommandPalette
   +--> views.config.ts ----> TargetsSection / AnalysisSection
   +--> LogToolbar ---- play / record / filter
   +--> LogViewer ---- filteredLogs / syntaxHighlight
       |
       v
    [ Express Server ] ---- backend/targets.json / FS Streamer
       ^
       |
    [ wkr/generate-logs.sh ] ----> [ wkr/sample.log ]
```

## 5. Estrutura IA-First de Documentação

```filesystem
_docs/
├── ARCHITECTURE.md                # Hub central (este documento)
├── PRD.md                         # Escopo e requisitos do produto
└── ia-context/                    # Contexto operacional e guardrails para IA
```

## 6. Mapa de Módulos Arquiteturais

- **[Frontend](#3-arquitetura-do-frontend):** Camada de UI Vue 3, composables e componentes de apresentação.
- **[Backend](../backend/src/index.js):** Execução do streaming, API HTTP e WebSocket.
- **[Operações](../compose.yaml):** Estrutura de deploy e execução local, com apoio de [Makefile](../Makefile) e dos containerfiles em [backend/Containerfile](../backend/Containerfile) e [frontend/Containerfile](../frontend/Containerfile).

## 7. Contratos e Decisões Centrais

### 7.1 Contratos globais

- **Contrato de Streaming:** O backend deve enviar chunks de texto acompanhados do **byte offset** final daquele chunk.
- **Protocolo de Pausa (CA2):** Ao retomar (Play), o frontend envia o último byte offset recebido; o servidor inicia o `createReadStream` a partir desse ponto exato.

### 7.2 Decisões arquiteturais centrais

- [ADR-001 — Estratégia de Retomada de Stream (Pausa/Play)](./decisoes/ADR-001-resume-offset.md)
- **Shell oficial:** consumir `@vagnernogueira/vsshellcode` como dependência do frontend, em vez de copiar CSS ou manter componentes shell ad-hoc.
- **Fonte de cor:** manter o tema VS Code do shell como fonte única e derivar os tokens Tailwind/shadcn por bridging VS Code → Tailwind.
- **Branch piloto:** `pilot/vsshellcode-integration` permanece local-only e superseded pela adoção do pacote; após o merge, seu descarte depende da decisão do humano e não é executado por esta sessão.

### 7.3 Limitações conhecidas (resumo)

- Retomada de stream requer armazenamento preciso do byte offset pelo frontend; imprecisão resulta em lacuna ou sobreposição de logs.

### 7.4 Logs de teste locais

- `backend/targets.json` centraliza a lista de alvos consumida pelo backend para `/api/targets` e para o streaming WebSocket.
- `wkr/sample.log` é o arquivo de amostra usado no alvo `sample`.
- `wkr/generate-logs.sh` gera novas linhas em modo append e aceita `--reset` para truncar o arquivo antes de iniciar a geração.
- `Makefile` expõe alvos auxiliares para iniciar, parar e resetar o gerador sem precisar executar o script manualmente.

## 8. Arquivos Importantes

| Arquivo | Descrição |
| :--- | :--- |
| `backend/targets.json` | Lista de alvos de log disponíveis para streaming |
| `frontend/package.json` | Dependências e scripts do frontend, incluindo `@vagnernogueira/vsshellcode` |
| `.npmrc` | Registry scoped do GitHub Packages e referência ao `GITHUB_TOKEN` |
| `frontend/src/main.ts` | Imports globais do tema/shell oficial antes do CSS da aplicação |
| `frontend/src/style.css` | Bridging dos tokens `--vscode-*` para os tokens semânticos Tailwind/shadcn |
| `frontend/src/views.config.ts` | Catálogo declarativo das views da sidebar |
| `frontend/src/commands.config.ts` | Comandos integrados à command palette |
| `wkr/generate-logs.sh` | Gerador local de logs de teste com suporte a `--reset` |
| `wkr/sample.log` | Arquivo de log de exemplo consumido pelo alvo `sample` |
| `compose.yaml` | Configuração Docker/Podman Compose |
| `Makefile` | Comandos de build, execução e parada da aplicação |

## 9. Dependências Externas e Integrações

| Dependência | Tipo | Contato/Link | Criticidade | Introduzida na Onda |
| :--- | :--- | :--- | :--- | :--- |
| Filesystem (NFS/local) | Infraestrutura | — | Alta | Onda 1 |
| `@vagnernogueira/vsshellcode` `^1.0.1` | Shell Vue 3 | GitHub Packages (`npm.pkg.github.com`) | Alta no frontend | Onda 8 |
| GitHub Packages | Registry npm | `.npmrc` + `GITHUB_TOKEN`/PAT `read:packages` | Alta para instalação | Onda 8 |

## 10. Histórico de Ondas e Changelog

### 10.1 Registro de Ondas

- **Onda 1 - MVP**
  - **Principais Alterações Arquiteturais:** Estrutura inicial — frontend Vue 3, backend Node.js/Express, streaming de logs via WebSocket com controle por byte offset.
  - **ADRs Relacionados:** [ADR-001](./decisoes/ADR-001-resume-offset.md)

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
