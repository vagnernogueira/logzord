# Logzord — Contexto do Projeto

## Escopo do projeto (baseline)

- Produto: visualizador de logs em tempo real.
- Arquitetura: SPA Vue 3 + backend HTTP/WS com streaming de arquivos de log via WebSocket.
- Núcleo funcional: listagem de alvos de log, streaming em tempo real, play/pause com retomada por offset.

## Baseline factual ancorado no estado atual

### Stack principal

- Frontend: Vue 3, TypeScript, Vite, Tailwind CSS.
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
