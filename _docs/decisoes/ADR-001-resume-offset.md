# ADR-001 — Estratégia de Retomada de Stream (Pausa/Play)

> **Status:** Aceito
> **Data:** 2026-03-30 (extraído retroativamente do contrato já implementado na Onda 1 — ver `_docs/ARCHITECTURE.md` §7.1)

## Contexto

O CA2 do PRD (`_docs/PRD.md`) exige que, ao pausar o stream e retomar com "Play", a leitura recomece exatamente de onde parou, sem lacuna nem sobreposição de linhas.

## Decisão

O backend (`backend/src/app.js`) rastreia, por conexão WebSocket, o **byte offset** final do último chunk enviado (`currentOffset`), não a contagem de linhas. Ao pausar (`PAUSE_STREAM`), o servidor apenas encerra o `ReadStream` corrente e descarta o estado de streaming; o offset vive no cliente. Ao retomar (`START_STREAM` com `offset`), o frontend reenvia esse offset e o servidor abre um novo `fs.createReadStream` com `start: offset`, seguindo o arquivo a partir do byte exato.

O acompanhamento de arquivo em crescimento (tail) é feito por polling: quando o stream chega ao fim (`stream.on('end')`), o servidor agenda uma nova checagem de `fs.stat` a cada 1s (`scheduleRead`) e só reabre o `ReadStream` se `stats.size` tiver avançado além do offset atual.

## Consequências

- **Precisão depende do offset armazenado no frontend.** Se o frontend perder ou calcular errado o offset acumulado, a retomada gera lacuna (offset adiantado) ou duplicação de linhas (offset atrasado) — ver limitação já registrada em `_docs/ARCHITECTURE.md` §7.3.
- **Truncamento do arquivo é tratado defensivamente:** se `stats.size < currentOffset` (rotação/truncamento do log), o servidor realinha `currentOffset` para `stats.size` antes de continuar, evitando erro de leitura fora do arquivo.
- **Escolha de offset em bytes, não linha**, foi necessária porque o protocolo de streaming (`LOG_CHUNK`) trafega chunks de texto arbitrários, não linhas delimitadas — a contagem por byte é a unidade que o `ReadStream` do Node entende nativamente via `start`/`end`.

## Alternativas consideradas

- **Retomada por número de linha:** rejeitada — exigiria o servidor re-parsear o arquivo desde o início a cada reconexão para contar linhas, custo O(n) por retomada em arquivos grandes, além de ambiguidade quando uma linha é cortada no meio por um chunk.
- **Estado de offset mantido no servidor (por target, não por conexão):** rejeitada para a Onda 1 — adicionaria necessidade de persistência entre reconexões de múltiplos clientes e não é exigida pelo CA2 (retomada é por sessão de usuário, não global).
