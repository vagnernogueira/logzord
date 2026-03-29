
# Logzord — Arquitetura de Software (Hub IA-First) 🏗️

> **Tipo de documento:** Hub de Arquitetura (central + módulos)
> **Localização:** `_docs/ARCHITECTURE.md`

## 1\. Visão Arquitetural 🪵

O Logzord adota um estilo de **Monólito Modular** em um monorepo TypeScript. A decisão visa simplificar o deploy no Kubernetes e a comunicação entre interface e servidor, mantendo a separação lógica entre a captura de logs (Backend) e a visualização/análise (Frontend).

## 2\. Stack de Tecnologias (Resumo) 🚀

| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Frontend** | Vue.js 3 + Vite | Agilidade no build e reatividade performática. |
| **UI Kit** | shadcn/ui + Tailwind | Componentes consistentes e estilização rápida. |
| **Backend** | Node.js + Express | Gerenciamento eficiente de I/O assíncrono e Streams. |
| **Comunicação** | WebSockets (ws) | Streaming bidirecional em tempo real. |
| **Persistência** | Dexie.js (IndexedDB) | Abstração robusta para o Quadro de Análise e configs. |
| **Qualidade** | Vitest + ESLint | Cobertura de testes e padronização rigorosa. |

## 3\. Diagrama de Arquitetura 🗺️

```ascii
[ Browser (UI) ] <------- WebSockets (Logs + Offset) -------> [ Express Server ]
       |                                                         |
       |-- [ Dexie.js (Persistência) ]                           |-- [ FS Streamer ]
       |-- [ Virtual Scroller ]                                  |-- [ NFS Mount ]
       |-- [ Filtros In-Memory ]                                 |
       v                                                         v
[ Quadro de Análise ]                                     [ targets.json ]
```

## 4\. Estrutura IA-First de Documentação 📂

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

## 5\. Mapa de Módulos Arquiteturais 🔗

  - **[Frontend](https://www.google.com/search?q=./architecture/frontend.md):** Camada de UI e lógica de buffer virtual.
  - **[Backend](https://www.google.com/search?q=./architecture/backend.md):** Execução do streaming e leitura direta do FS.
  - **[Operações](https://www.google.com/search?q=./architecture/operations.md):** Contém `docker-compose.yaml`, `Makefile` e estratégias de deploy.

## 6\. Contratos e Decisões Centrais ⚖️

  - **Contrato de Streaming:** O backend deve enviar chunks de texto acompanhados do **byte offset** final daquele chunk.
  - **Protocolo de Pausa (CA2):** Ao retomar (Play), o frontend envia o último byte offset recebido; o servidor inicia o `createReadStream` a partir desse ponto exato.

-----

### Registro de Decisão Arquitetural (ADR) 📝

Agora, vamos formalizar a decisão do **byte offset** seguindo o modelo de ADR que definimos. Isso é crucial para que futuros desenvolvedores entendam por que não usamos apenas o número da linha.

**ADR-001: Estratégia de Retomada de Stream (Pausa/Play)**

  * **Status:** Aceito
  * **Contexto:** O sistema precisa pausar o streaming de logs e retomar exatamente do ponto de interrupção. Arquivos em NFS podem ser extremamente grandes.
  * **Decisão:** Utilizaremos o **byte offset** (posição exata em bytes no arquivo) em vez do número da linha para controlar a retomada.
  * **Consequência Positiva:** Tempo de resposta constante (O(1)) para retomar a leitura, independentemente do tamanho do arquivo. Menor carga de CPU no servidor.
  * **Consequência Negativa:** Exige que o backend converta a posição de interrupção em bytes e a armazene de forma precisa.

-----
