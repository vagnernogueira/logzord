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
