# HANDOFF — logzord#1 / S8 — Itens opcionais

Fonte consultada: `node_modules/@vagnernogueira/vsshellcode/dist/vue/*`.

## Decisões

1. **ShellSecondarySidebar — adotar (deferido)**
   - A API real existe (`open` + slot default), mas o app não tem hoje um modelo de "log selecionado" nem uma visão de detalhe/outline separada.
   - Para usá-la corretamente, seria preciso introduzir seleção e renderização de detalhe, o que já passa do escopo pequeno/isolado desta sessão.

2. **ShellTree / ShellTreeItem — descartar**
   - A listagem atual de targets é plana; não há hierarquia de dados para justificar árvore.
   - Trocar a lista por árvore agora não acrescenta valor funcional e forçaria um modelo artificial.

3. **useViewPlacement — adotar (deferido)**
   - O composable é real e simples (`placements`, `dragProps`, `dropZoneProps`), mas o app não tem ainda um "Editor"/área arrastável separada para receber conteúdo.
   - Integrar drag-and-drop entre Panel e Editor exigiria rearranjo de layout e definição adicional de UX, então ficou para replanejamento.

## Resultado

- Nenhuma implementação feita nesta sessão.
- Nenhum teste/lint/build executado, pois não houve mudança de código.

# HANDOFF — logzord#1 / S9 — Consolidação, testes e documentação

## Entrega

- Criado `frontend/src/App.spec.ts` com mocks dos componentes oficiais do `@vagnernogueira/vsshellcode/vue` e cobertura da composição do `App.vue`: troca de view, colapso da sidebar, tabs e toggle do panel.
- Atualizados `_docs/ARCHITECTURE.md` e `_docs/ia-context/project-overlay/context.md` com a dependência `@vagnernogueira/vsshellcode` `^1.0.1`, GitHub Packages/`.npmrc` (raiz), bridging VS Code → Tailwind, requisito futuro de `read:packages` em CI e destino do branch piloto.
- `pilot/vsshellcode-integration` permanece local-only, superseded pela adoção do pacote; deve ser descartado após o merge por decisão do humano. O branch não foi deletado.

## Validação

- Gate delegado `pi-usko-usher` (`dev-intern`): **green** — `npm run lint`, `npm run test` (5/5) e `npm run build` no frontend.
- `make build`: **green** — build das imagens concluído (`0 units compiled`).
- Registro do dispatch: `/home/vagner/agents/dev-lead/state/ticket-memory/logzord-1.cost-ledger.jsonl`, role `internal-gate:S9`.

## Commits

- `a8627c5 test(frontend): cover App shell composition`
- Este handoff e a documentação estão no commit `docs: finalize vsshellcode adoption documentation` desta etapa.

# HANDOFF — logzord#1 / Correção pós-auditoria

## Entrega

- RED-0: registry do GitHub Packages movido para o `.npmrc` raiz; o Containerfile e o Compose propagam `GITHUB_TOKEN` ao build do frontend.
- RED-2: offset WebSocket renderizado com `currentWsOffset.value`.
- RED-3: props das views declaradas em `frontend/src/views.config.ts`, sem seleção por id no `App.vue`.
- RED-6: área `.editor-area` adicionada e as paletas dos componentes de análise, toolbar e viewer derivadas dos tokens VS Code → Tailwind.
- RED-8: README atualizado com autenticação, scripts do frontend e links válidos.

## Validação

- `npm install` na raiz com `GITHUB_TOKEN` obtido via GitHub CLI: **green**.
- `make build`: **green** — imagens backend e frontend construídas com o pacote scoped.
- `make run`: **green** — containers `logzord-backend` e `logzord-frontend` subiram.
- Gate delegado `pi-gloria-grant` (`dev-intern`): **green** — lint, test e build do frontend passaram.
- Dispatch registrado em `/home/vagner/agents/dev-lead/state/ticket-memory/logzord-1.cost-ledger.jsonl` como `internal-gate:fix-audit`.

## Commits

- `e7b8fd7 fix(build): configure GitHub Packages authentication`
- `d03436b fix(frontend): render the live websocket offset`
- `03d30a2 refactor(frontend): move view props into declarative config`
- `b6008e4 refactor(frontend): bridge editor surfaces to shell tokens`
- `892566a docs: document frontend installation and validation`
