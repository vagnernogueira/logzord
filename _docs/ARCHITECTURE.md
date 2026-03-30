# Logzord - Arquitetura de Software (Hub IA-First)

> **Tipo de documento:** Hub de Arquitetura (central + módulos)
> **Localização:** `_docs/ARCHITECTURE.md`

## Índice Navegável

- [Guia de Uso da Documentação](#guia-de-uso-da-documentação)
- [1. Visão Arquitetural](#1-visão-arquitetural)
- [2. Stack de Tecnologias (Resumo)](#2-stack-de-tecnologias-resumo)
- [3. Diagrama de Arquitetura](#3-diagrama-de-arquitetura)
- [4. Estrutura IA-First de Documentação](#4-estrutura-ia-first-de-documentação)
- [5. Mapa de Módulos Arquiteturais](#5-mapa-de-módulos-arquiteturais)
- [6. Contratos e Decisões Centrais](#6-contratos-e-decisões-centrais)
- [7. Arquivos Importantes](#7-arquivos-importantes)
- [8. Dependências Externas e Integrações](#8-dependências-externas-e-integrações)
- [9. Histórico de Ondas e Changelog](#9-histórico-de-ondas-e-changelog)

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
| **UI Kit** | shadcn/ui + Tailwind | Componentes consistentes e estilização rápida. |
| **Backend** | Node.js + Express | Gerenciamento eficiente de I/O assíncrono e Streams. |
| **Comunicação** | WebSockets (ws) | Streaming bidirecional em tempo real. |
| **Persistência** | Dexie.js (IndexedDB) | Abstração robusta para o Quadro de Análise e configs. |
| **Qualidade** | Vitest + ESLint | Cobertura de testes e padronização rigorosa. |

## 3. Diagrama de Arquitetura

```ascii
[ Browser (UI) ] <------- WebSockets (Logs + Offset) -------> [ Express Server ]
       |                                                         |
       |-- [ Dexie.js (Persistência) ]                           |-- [ FS Streamer ]
       |-- [ Virtual Scroller ]                                  |-- [ NFS Mount ]
       |-- [ Filtros In-Memory ]                                 |
       v                                                         v
[ Quadro de Análise ]                                     [ targets.json ]
```

## 4. Estrutura IA-First de Documentação

```filesystem
_docs/
├── ARCHITECTURE.md                # Hub central (este documento)
├── architecture/
│   ├── frontend.md                # Vue, shadcn, Dexie e Buffer
│   ├── backend.md                 # Express, Streams e Offsets
│   └── operations.md              # Docker, Compose, Makefile e K8s
└── decisoes/
    └── ADR-001-resume-offset.md   # Decisão sobre persistência de byte offset
```

## 5. Mapa de Módulos Arquiteturais

- **[Frontend](./architecture/frontend.md):** Camada de UI e lógica de buffer virtual.
- **[Backend](./architecture/backend.md):** Execução do streaming e leitura direta do FS.
- **[Operações](./architecture/operations.md):** Contém `docker-compose.yaml`, `Makefile` e estratégias de deploy.

## 6. Contratos e Decisões Centrais

### 6.1 Contratos globais

- **Contrato de Streaming:** O backend deve enviar chunks de texto acompanhados do **byte offset** final daquele chunk.
- **Protocolo de Pausa (CA2):** Ao retomar (Play), o frontend envia o último byte offset recebido; o servidor inicia o `createReadStream` a partir desse ponto exato.

### 6.2 Decisões arquiteturais centrais

- [ADR-001 — Estratégia de Retomada de Stream (Pausa/Play)](./decisoes/ADR-001-resume-offset.md)

### 6.3 Limitações conhecidas (resumo)

- Retomada de stream requer armazenamento preciso do byte offset pelo frontend; imprecisão resulta em lacuna ou sobreposição de logs.

## 7. Arquivos Importantes

| Arquivo | Descrição |
| :--- | :--- |
| `targets.json` | Lista de alvos de log disponíveis para streaming |
| `compose.yaml` | Configuração Docker/Podman Compose |
| `Makefile` | Comandos de build, execução e parada da aplicação |

## 8. Dependências Externas e Integrações

| Dependência | Tipo | Contato/Link | Criticidade | Introduzida na Onda |
| :--- | :--- | :--- | :--- | :--- |
| Filesystem (NFS/local) | Infraestrutura | — | Alta | Onda 1 |

## 9. Histórico de Ondas e Changelog

### 9.1 Registro de Ondas

- **Onda 1 - MVP**
  - **Principais Alterações Arquiteturais:** Estrutura inicial — frontend Vue 3, backend Node.js/Express, streaming de logs via WebSocket com controle por byte offset.
  - **ADRs Relacionados:** [ADR-001](./decisoes/ADR-001-resume-offset.md)

### 9.2 Changelog do Documento

- **Versão 1.1**
  - **Data:** 2026-03-30
  - **Autor:** IA
  - **Mudanças:** Adequação ao padrão de blueprints — adição de índice navegável, guia de uso, seções 7/8/9, reestruturação da seção 6 em 6.1/6.2/6.3, correção de links no mapa de módulos, remoção de emojis dos títulos.
