# Logzord — Contexto do Projeto

## Escopo do projeto (baseline)

- Produto: visualizador de logs em tempo real.
- Arquitetura: SPA Vue 3 + backend HTTP/WS com streaming de arquivos de log via WebSocket.
- Núcleo funcional: listagem de alvos de log, streaming em tempo real, play/pause com retomada por offset.

## Baseline factual ancorado no estado atual

### Stack principal

- Frontend: Vue 3, TypeScript, Vite, Tailwind CSS.
- Shell de UI: `@vagnernogueira/vsshellcode` `^1.0.1`, consumido como pacote Vue 3 pelo GitHub Packages.
- Backend: Node.js, JavaScript, Express, WebSocket (`ws`).
- Infraestrutura: Podman/Docker Compose (`compose.yaml`), Containerfile por serviço.

### Persistência

- Arquivos de log do filesystem montados como volumes read-only no container backend.
- Configuração de alvos em `targets.json` (raiz e `backend/targets.json`).
- Sem banco de dados — leitura direta de arquivos de log via `fs.createReadStream`.

### APIs existentes

- `GET /api/targets` — lista alvos de log configurados (lê `targets.json`)
- WebSocket (porta 3001): protocolo de mensagens:
  - `START_STREAM` (targetId, offset) → `LOG_CHUNK` (content, offset) / `STREAM_END` / `ERROR`
  - `PAUSE_STREAM` — interrompe o stream atual (destroy do ReadStream)

### Regras de UI/Frontend

- Ícones: preferir `lucide-vue-next`.
- Evitar SVG inline em novos componentes.
- Estrutura de componentes em `frontend/src/components/`.
- `frontend/src/App.vue` compõe `ShellActivityBar`, `ShellSidebar`, `ShellTabs`, `ShellPanel`, `ShellStatusBar` e `ShellCommandPalette` de `@vagnernogueira/vsshellcode/vue`; as views são declaradas em `frontend/src/views.config.ts`.
- `frontend/src/main.ts` importa o tema e o shell CSS do pacote antes de `frontend/src/style.css`.
- O bridging de cor segue VS Code → Tailwind: as variáveis `--vscode-*` do shell são a fonte única e os tokens semânticos Tailwind/shadcn derivam delas em `frontend/src/style.css`; `tailwind.config.js` mantém suporte a alpha via `color-mix`.
- A instalação de `@vagnernogueira/vsshellcode` usa `frontend/.npmrc`, que aponta `@vagnernogueira` para `https://npm.pkg.github.com` e referencia `${GITHUB_TOKEN}` em vez de versionar credenciais.

### Dependências de instalação e CI

- O repositório atualmente não possui `.github/workflows/`.
- Um workflow futuro que instale a dependência scoped deverá fornecer `GITHUB_TOKEN` ou PAT com scope `read:packages`.
- O branch `pilot/vsshellcode-integration` é local-only e foi superseded pela adoção do pacote; após o merge, deve ser descartado conforme decisão do humano. Esta sessão não deleta o branch.
