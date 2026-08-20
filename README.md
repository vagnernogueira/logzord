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

### GitHub Packages

O frontend consome `@vagnernogueira/vsshellcode` pelo GitHub Packages. O `.npmrc` na raiz do workspace direciona o escopo `@vagnernogueira` para o registry npm do GitHub e referencia `GITHUB_TOKEN` sem versionar credenciais.

O token usado para instalar a dependência precisa ter permissão `read:packages`. Com o GitHub CLI autenticado, configure a variável na sessão antes de instalar ou construir:

```bash
export GITHUB_TOKEN="$(gh auth token)"
```

Em CI, forneça `GITHUB_TOKEN` (ou um PAT com `read:packages`) como segredo do job; nunca grave o valor no repositório.

### Instalação e Configuração

Execute os comandos a partir da raiz do repositório:

```bash
# Instalar dependências dos workspaces
npm install
```

Configure os alvos de log em `backend/targets.json`.

### Como Compilar

```bash
npm --workspace=frontend run build
```

### Como Executar

```bash
# Via container (recomendado; requer GITHUB_TOKEN configurado acima)
make build
make run

# Parar
make stop
```

### Como Executar os Testes

```bash
npm --workspace=frontend run lint
npm --workspace=frontend run test
```

## CI/CD

O workflow de PR executa lint e testes de frontend e backend. O workflow de publicação é executado em tags `v*` ou manualmente e publica as imagens privadas no GHCR somente após o gate de testes.

Configure `GH_PACKAGES_TOKEN`, `FRONTEND_HTTP_URL` e `FRONTEND_WS_URL` em **Settings > Secrets and variables > Actions**. `GITHUB_TOKEN` é fornecido automaticamente pelo GitHub Actions e não pode ser criado como secret do repositório:

| Secret | Valor |
| :--- | :--- |
| `GH_PACKAGES_TOKEN` | PAT com permissão `read:packages` para instalar dependências privadas |
| `GITHUB_TOKEN` | Token automático do GitHub Actions, usado para autenticar e publicar no GHCR; não criar manualmente |
| `FRONTEND_HTTP_URL` | `https://logzordsrv.vagnernogueira.com/api` |
| `FRONTEND_WS_URL` | `wss://logzordsrv.vagnernogueira.com` |

As URLs do frontend são incorporadas na imagem durante o build via build-args; no build da imagem, o token é fornecido como build secret e não como build-arg.

## Ondas de Desenvolvimento

| Onda | Nome | Status |
| :--- | :--- | :--- |
| 1 | MVP | Concluída |

## Documentação Adicional

| Documento | Descrição |
| :--- | :--- |
| [`_docs/ARCHITECTURE.md`](./_docs/ARCHITECTURE.md) | Hub arquitetural — visão, contratos e decisões centrais |
| [`_docs/PRD.md`](./_docs/PRD.md) | Requisitos do produto |
| [`_docs/ia-context/project-overlay/context.md`](./_docs/ia-context/project-overlay/context.md) | Contexto operacional do projeto |
