# Logzord — Contexto Operacional

> Arquivo adaptado para GitHub Copilot. Fonte canônica: `_docs/ia-context/project-overlay/CLAUDE.md`.
>
> **Ativação:** Copilot lê instruções de `.github/copilot-instructions.md`.
> Para ativar, criar symlink ou copiar este arquivo:
> ```bash
> ln -s ../_docs/ia-context/project-overlay/copilot-instructions.md .github/copilot-instructions.md
> ```
> Instruções path-específicas adicionais podem ser criadas em `.github/instructions/NAME.instructions.md`
> com frontmatter `applyTo: "glob/pattern/**"`.

## Produto

Visualizador de logs em tempo real.
SPA Vue 3 + Node.js backend com streaming de arquivos de log via WebSocket.
Núcleo: listagem de alvos de log, streaming contínuo, play/pause com retomada por offset.

## Stack

- **Frontend:** Vue 3 · TypeScript · Vite · Tailwind CSS
- **Backend:** Node.js · JavaScript · Express · WebSocket (`ws`)
- **Persistência:** Arquivos de log do filesystem (read-only) · `targets.json`
- **Infraestrutura:** Podman/Docker Compose (`compose.yaml`) · Containerfile por serviço

## APIs existentes

| Método | Rota | Auth |
|--------|------|------|
| GET | `/api/targets` | — |

**WebSocket (porta 3001):** `START_STREAM` (targetId, offset) → `LOG_CHUNK` / `STREAM_END` / `ERROR`; `PAUSE_STREAM`

## Comandos

```bash
npm run build          # valida sintaxe após implementação
make stop              # para container local
make build             # gera nova imagem (corrigir falhas antes de prosseguir)
make run               # sobe a aplicação com as mudanças
```

Não testar via navegador web. Para demandas multi-fase, trabalhar em etapas.

## Regras obrigatórias

Preservar comportamento atual salvo instrução explícita. Operar no escopo mínimo sem melhorias paralelas. Não inferir fatos sem evidência no código. Declarar suposições quando faltar contexto. Não alterar protocolo WebSocket ou contrato de API sem justificativa. Preferir solução simples sobre abstração prematura.

Conflito de fontes: código-fonte > `_docs/ARCHITECTURE.md` > `README.md` > overlay de projeto > docs auxiliares.

Proibido: inventar endpoints/arquivos/comportamentos · omitir conflito documental · responder sem âncora em evidências · expandir escopo sem solicitação.

## Convenções UI/Frontend

- Ícones: `lucide-vue-next` — sem SVG inline em novos componentes
- Componentes em `frontend/src/components/`

## MCP disponíveis

| Server | Capabilities | Status |
|--------|-------------|--------|
| `context7` | docs.search · docs.read · docs.extract · docs.summarize · docs.cite | ativo |

## Entrega padrão

Após toda implementação entregar: resumo das mudanças · arquivos alterados · impactos · validações recomendadas · commit message em inglês (conventional commits).

## Referência detalhada

| Documento | Conteúdo |
|-----------|----------|
| `_docs/ia-context/core/rules.md` | Regras universais e guardrails MCP |
| `_docs/ia-context/core/workflow.md` | Fluxo de execução padrão |
| `_docs/ia-context/core/output-contracts.md` | Contratos de saída e checklist anti-alucinação |
| `_docs/ia-context/core/skills/` | Skills: generate-demand · documentation-blueprint |
| `_docs/ia-context/core/templates/` | Templates de demanda: 01-simple → 04-full |
| `_docs/ia-context/project-overlay/context.md` | Baseline factual do produto |
| `_docs/ia-context/project-overlay/mcp-policy.md` | Política de autorização MCP |
