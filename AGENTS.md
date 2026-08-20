# Logzord — Contexto Operacional

> Arquivo autônomo para agentes que carregam `AGENTS.md`. As instruções operacionais são mantidas alinhadas ao `CLAUDE.md`; skills de documentação e geração de demandas são fornecidas pelo mecanismo nativo de skills (xskills) do agente.

## Produto

Visualizador de logs em tempo real.
SPA Vue 3 + Node.js backend com streaming de arquivos de log via WebSocket.
Núcleo: listagem de alvos de log, streaming contínuo, play/pause com retomada por offset.

## Stack

- **Frontend:** Vue 3 · TypeScript · Vite · Tailwind CSS
- **Shell de UI:** `@vagnernogueira/vsshellcode` `^1.0.1`, pacote Vue 3 via GitHub Packages
- **Backend:** Node.js · JavaScript · Express · WebSocket (`ws`)
- **Persistência:** Arquivos de log do filesystem (read-only) · `targets.json`
- **Infraestrutura:** Podman/Docker Compose (`compose.yaml`) · Containerfile por serviço

## APIs existentes

| Método | Rota | Auth |
|--------|------|------|
| GET | `/api/targets` | — |

**WebSocket (porta 3001):**

| Mensagem (cliente→servidor) | Campos | Resposta (servidor→cliente) |
|-----------------------------|--------|-----------------------------|
| `START_STREAM` | `targetId`, `offset` | `LOG_CHUNK` (content, offset) · `STREAM_END` · `ERROR` |
| `PAUSE_STREAM` | — | — |

## Comandos

```bash
npm run build          # valida sintaxe após implementação
npm run lint           # executa lint no pacote afetado
npm run test           # executa testes existentes
make stop              # para container local
make build             # gera nova imagem (corrigir falhas antes de prosseguir)
make run               # sobe a aplicação com as mudanças
```

> Não testar via navegador web. Para demandas multi-fase, trabalhar em etapas.

## Regras obrigatórias

- **MUST** preservar comportamento atual salvo instrução explícita em contrário
- **MUST** operar no escopo mínimo — sem melhorias paralelas não solicitadas
- **MUST NOT** inferir fatos sem evidência no código ou documentação
- **MUST** declarar suposições quando faltar contexto
- **MUST NOT** alterar protocolo WebSocket ou contrato de API sem justificativa explícita
- **MUST NOT** adicionar funcionalidades fora da demanda
- **SHOULD** preferir solução simples sobre abstração prematura
- **MUST** tratar MCP como camada opcional com fallback — nunca declarar sucesso sem evidência retornada

### Conflito de fontes (precedência decrescente)

Código-fonte > `_docs/ARCHITECTURE.md` > `README.md` > docs auxiliares em `_docs/`

Em conflito: explicitar, adotar a fonte de maior precedência e registrar a decisão técnica no resultado.

### Anti-padrões

Inventar endpoints/arquivos/comportamentos · omitir conflito documental · responder sem âncora em evidências · expandir escopo sem solicitação.

## Convenções UI/Frontend

- Ícones: `lucide-vue-next` — sem SVG inline em novos componentes
- Componentes em `frontend/src/components/`
- `frontend/src/App.vue` compõe `ShellActivityBar`, `ShellSidebar`, `ShellTabs`, `ShellPanel`, `ShellStatusBar` e `ShellCommandPalette` de `@vagnernogueira/vsshellcode/vue`; views declaradas em `frontend/src/views.config.ts`
- `frontend/src/main.ts` importa o tema e o shell CSS do pacote antes de `frontend/src/style.css`
- Bridging de cor VS Code → Tailwind: variáveis `--vscode-*` do shell são a fonte única; tokens semânticos Tailwind/shadcn derivam delas em `frontend/src/style.css` (`tailwind.config.js` com suporte a alpha via `color-mix`)
- Instalação de `@vagnernogueira/vsshellcode` via `.npmrc` na raiz (`@vagnernogueira` → `https://npm.pkg.github.com`, credencial via `${GITHUB_TOKEN}`, nunca versionada); build local injeta o token como secret de arquivo (`make build`), CI injeta como build secret (`.github/workflows/docker-publish.yml`)

## MCP disponíveis

| Server | Transport | Capabilities | Status |
|--------|-----------|-------------|--------|
| `context7` | http/ws | docs.search · docs.read · docs.extract · docs.summarize · docs.cite | ativo |

Endpoint context7: `https://mcp.context7.com/mcp` · auth: token por variável de ambiente.

## Contratos de saída

### Análise técnica

- Resumo da demanda (1–3 linhas)
- Evidências no projeto
- Opções com trade-offs
- Recomendação
- Riscos e mitigação

### Plano de implementação

- Objetivo por etapa
- Arquivos afetados
- Mudanças previstas
- Critérios de aceite
- Riscos

### Implementação

- O que foi alterado
- Arquivos modificados
- Impacto funcional esperado
- Validação recomendada ao solicitante

### Revisão e refatoração

- Problemas encontrados
- Melhorias aplicadas ou propostas
- Compatibilidade e regressão potencial
- Próximos ajustes sugeridos

### Checklist anti-alucinação

- [ ] Usei a fonte de maior precedência disponível?
- [ ] Detectei e tratei conflitos documentais?
- [ ] Tudo que afirmei existe no código atual ou está marcado como proposta?
- [ ] Minhas suposições estão explícitas?
- [ ] Evitei extrapolar escopo?
- [ ] Defini critérios de aceite verificáveis?

## Fluxo operacional

- Trabalhar em etapas quando a demanda for multi-fase.
- Fazer build/compile simples ao final da implementação para verificar erros de sintaxe e corrigi-los quando aplicável ao escopo.
- Em implementações que envolvam frontend ou backend, executar também `npm run lint` no pacote afetado e, em seguida, `npm run test` para validar os testes existentes.
- Após implementação, quando aplicável, usar `make stop`, `make build` e `make run`; corrigir falhas de build antes de prosseguir.
- Não efetuar testes no navegador web.

## Entrega padrão

Após toda implementação entregar:

1. Resumo objetivo das mudanças
2. Lista de arquivos alterados
3. Impactos identificados
4. Validações recomendadas
5. Sugestão de commit message em inglês (conventional commits)

## Referências do projeto

- `CLAUDE.md` — contexto operacional consolidado
- `_docs/ARCHITECTURE.md` — arquitetura do sistema
- `README.md` — onboarding e comandos principais
