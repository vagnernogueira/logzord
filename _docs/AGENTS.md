# Logzord — Contexto Operacional

> Fonte única de instruções operacionais. `CLAUDE.md` e `AGENTS.md` (raiz) são symlinks para este arquivo.

Visualizador de logs em tempo real: SPA Vue 3 + backend Node.js (Express, `ws`) que faz streaming de arquivos de log, com play/pause e retomada por byte offset. Stack, arquitetura e contratos: `_docs/ARCHITECTURE.md`; onboarding: `README.md`.

## Regras

- Preservar o comportamento atual; operar no escopo mínimo da demanda.
- Ancorar cada afirmação em código ou documentação; declarar como suposição o que faltar.
- Mudar o protocolo WebSocket ou o contrato de API só com justificativa explícita. Contrato atual: `GET /api/targets`, `GET /api/targets/:id/rotations`; WebSocket em `/ws` (`START_STREAM` {`targetId`, `offset`} → `LOG_CHUNK` {content, offset} · `STREAM_END` · `ERROR`; `PAUSE_STREAM`).
- Preferir a solução simples à abstração prematura.
- Tratar MCP como camada opcional: só declarar sucesso com evidência retornada (`context7`, `https://mcp.context7.com/mcp`, token por variável de ambiente).

**Conflito de fontes:** código-fonte > `_docs/ARCHITECTURE.md` > `README.md` > demais docs em `_docs/`. Em conflito, adotar a fonte de maior precedência e registrar a decisão no resultado.

## Frontend

O visual é a casca `@vagnernogueira/vsshellcode` (estilo VS Code); a fonte de verdade da composição é `frontend/src/App.vue` (§3 de `_docs/ARCHITECTURE.md` explica o desenho).

- Estender a UI pelos pontos da casca: view em `frontend/src/views.config.ts`, slot da title bar, item da status bar, comando em `frontend/src/commands.config.ts`. Componentes próprios ficam em `frontend/src/components/`.
- As variáveis `--vscode-*` do shell são a fonte única de cor; os tokens Tailwind/shadcn derivam delas em `frontend/src/style.css`.
- Ícones novos: `lucide-vue-next` nos controles próprios, nomes codicon nos itens da casca.
- Instalar o pacote exige `GITHUB_TOKEN` com escopo `read:packages` (procedimento no `README.md`).

## Validação

- Por pacote alterado, nesta ordem: `npm --workspace=<frontend|backend> run lint`, depois `run test`; ao fim, `npm --workspace=frontend run build` para mudanças de frontend.
- Imagem: `make build` valida que builda, sem subi-la.
- Verificar por build, lint e testes. Para o teste final de UX, use o Playwright instalado globalmente no SO (`playwright@1.63.0` via `npm i -g`, Node do nvm) e o Chromium headless correspondente (`chromium_headless_shell-1243` em `~/.cache/ms-playwright`):
  - O projeto não declara Playwright como dependência, então `npx playwright` resolve para o pacote global.
  - Script Node avulso que faz `require('playwright')`: rodar com `NODE_PATH="$(npm root -g)" node <script>`, guardando o script fora do repo, e chamar `chromium.launch()` sem `executablePath`.
  - Ao atualizar o pacote global, rodar `playwright install chromium` em seguida, porque cada versão do Playwright exige uma build de browser específica.
- Trabalhar em etapas quando a demanda for multi-fase.

## Deploy local

Deploy local = `make stop` + `make run` (pull da imagem publicada em `ghcr.io/vagnernogueira/logzord:latest`).

A versão final em deploy é acessível em https://logzord.vagnernogueira.com/.

`make build` não recebe os build-args `VITE_API_URL`/`VITE_WS_URL`, que só o workflow `.github/workflows/docker-publish.yml` injeta via secrets. Uma imagem local assume os defaults de código (`http://localhost:3001/api`, `ws://localhost:3001/ws`) e quebra o frontend em qualquer acesso que não seja `localhost:3001` direto (domínio público atrás de proxy/Cloudflare). Após um `make build`, restaurar via `make run` depois de confirmar a tag publicada (`gh run list --workflow "Docker publish"`).

## Entrega

Ao concluir uma implementação, entregar: resumo objetivo das mudanças · arquivos alterados · impactos · validações recomendadas · sugestão de commit message em inglês (conventional commits).

Formato por tipo de demanda:

| Demanda | Seções |
|---------|--------|
| Análise técnica | Resumo (1–3 linhas) · Evidências no projeto · Opções com trade-offs · Recomendação · Riscos e mitigação |
| Plano de implementação | Objetivo por etapa · Arquivos afetados · Mudanças previstas · Critérios de aceite · Riscos |
| Revisão e refatoração | Problemas encontrados · Melhorias aplicadas ou propostas · Compatibilidade e regressão potencial · Próximos ajustes |

Antes de entregar, confirmar cada item: fonte de maior precedência usada · conflitos documentais tratados · afirmações ancoradas no código atual ou marcadas como proposta · suposições explícitas · escopo respeitado · critérios de aceite verificáveis.
