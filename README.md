# Logzord

Visualizador de logs em tempo real com suporte a streaming contínuo, play/pause com retomada por offset e múltiplos alvos de log.

## Visão Geral

O Logzord é uma SPA Vue 3 com backend Node.js que permite monitorar arquivos de log diretamente no navegador via WebSocket. O sistema suporta listagem de alvos de log configurados, streaming contínuo com baixa latência e controle de pausa/retomada a partir do byte exato de interrupção.

## Stack de Tecnologias

| Camada | Tecnologia |
| :--- | :--- |
| **Frontend** | Vue 3 · TypeScript · Vite · Tailwind CSS |
| **Backend** | Node.js · Express · WebSocket (`ws`) |
| **Persistência** | Arquivos de log do filesystem (read-only) · `targets.json` |
| **Infraestrutura** | Podman/Docker Compose |

## Principais Funcionalidades

- Listagem de alvos de log configurados via `targets.json`
- Streaming contínuo de logs via WebSocket
- Controle play/pause com retomada exata por byte offset
- Interface reativa com buffer virtual para grandes volumes de log

## Guia de Onboarding

### Pré-requisitos

- Node.js 18+
- Podman ou Docker com Compose

### Instalação e Configuração

```bash
# Instalar dependências
npm install
```

Configure os alvos de log em `targets.json` na raiz do projeto.

### Como Compilar

```bash
npm run build
```

### Como Executar

```bash
# Via container (recomendado)
make build
make run

# Parar
make stop
```

### Como Executar os Testes

```bash
npm run test
```

## Ondas de Desenvolvimento

| Onda | Nome | Status |
| :--- | :--- | :--- |
| 1 | MVP | Concluída |

## Documentação Adicional

| Documento | Descrição |
| :--- | :--- |
| [`_docs/ARCHITECTURE.md`](./_docs/ARCHITECTURE.md) | Hub arquitetural — visão, contratos e decisões centrais |
| [`_docs/architecture/frontend.md`](./_docs/architecture/frontend.md) | Detalhamento do frontend Vue 3 |
| [`_docs/architecture/backend.md`](./_docs/architecture/backend.md) | Detalhamento do backend Node.js |
| [`_docs/architecture/operations.md`](./_docs/architecture/operations.md) | Infraestrutura, Docker e Makefile |
| [`_docs/decisoes/ADR-001-resume-offset.md`](./_docs/decisoes/ADR-001-resume-offset.md) | Decisão sobre controle de retomada por byte offset |
