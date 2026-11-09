import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultTargetsPath = path.resolve(__dirname, '../targets.json');
const defaultConfigPath = path.resolve(__dirname, '../config.json');
// Base dos `path` relativos do targets.json. No container é /app (onde o compose monta wkr/);
// fora dele, os scripts npm do backend apontam LOGZORD_LOG_ROOT para a raiz do repo.
const defaultLogRoot = path.resolve(process.env.LOGZORD_LOG_ROOT || path.resolve(__dirname, '..'));
const ROTATION_ID_PATTERN = /^(.+)::(\d{4}-\d{2}-\d{2})$/;
// CA5: downloads acima de 5MB saem em .gz; a compressão é por stream, sem limite de tamanho.
export const COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024;
// Página de Rewind/Fast Forward em linhas; limitada ao teto do buffer do frontend.
export const DEFAULT_CONFIG = { pageLines: 50 };
const MAX_PAGE_LINES = 2000;

// Bytes finais que iniciam um caractere UTF-8 ainda incompleto (0 se o buffer termina num caractere
// inteiro ou em bytes inválidos). Retidos entre leituras em vez de virarem U+FFFD (#31).
export function incompleteUtf8TailLength(buffer) {
  const stop = Math.max(0, buffer.length - 3);
  for (let i = buffer.length - 1; i >= stop; i -= 1) {
    const byte = buffer[i];
    if ((byte & 0xc0) === 0x80) {
      continue;
    }
    let needed = 1;
    if (byte >= 0xc2 && byte <= 0xdf) needed = 2;
    else if (byte >= 0xe0 && byte <= 0xef) needed = 3;
    else if (byte >= 0xf0 && byte <= 0xf4) needed = 4;
    const available = buffer.length - i;
    return available < needed ? available : 0;
  }
  return 0;
}

function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function loadTargetTree(targetsPath) {
  if (!fs.existsSync(targetsPath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
}

// Relido a cada request; arquivo ausente, inválido ou valor fora do tipo cai no default.
function loadConfig(configPath) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { ...DEFAULT_CONFIG };
  }

  const pageLines = raw?.pageLines;
  return {
    pageLines: Number.isInteger(pageLines)
      ? Math.min(Math.max(pageLines, 1), MAX_PAGE_LINES)
      : DEFAULT_CONFIG.pageLines,
  };
}

// A arvore mistura nos 'group' (so navegacao) e 'target' (folha streamavel);
// busca recursiva ignora 'group' e desce em 'children' de ambos os tipos.
function findTargetById(nodes, id) {
  for (const node of nodes) {
    if (node.type === 'target' && node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findTargetById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function resolveTargetPath(target, logRoot) {
  return path.resolve(logRoot, target.path);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolve um targetId que pode ser um target estatico ou uma rotacao dinamica
// (`${targetId}::AAAA-MM-DD`, nunca aceita path vindo do cliente).
function resolveLogPath(tree, targetId, logRoot) {
  const target = findTargetById(tree, targetId);
  if (target) {
    return resolveTargetPath(target, logRoot);
  }

  const rotationMatch = ROTATION_ID_PATTERN.exec(targetId);
  if (!rotationMatch) {
    return null;
  }

  const [, baseId, date] = rotationMatch;
  const baseTarget = findTargetById(tree, baseId);
  if (!baseTarget) {
    return null;
  }

  return `${resolveTargetPath(baseTarget, logRoot)}.${date}`;
}

export function createApp({
  targetsPath = defaultTargetsPath,
  configPath = defaultConfigPath,
  logRoot = defaultLogRoot,
} = {}) {
  const app = express();
  app.use(cors());

  app.get('/api/config', (req, res) => {
    res.json(loadConfig(configPath));
  });

  app.get('/api/targets', (req, res) => {
    try {
      res.json(loadTargetTree(targetsPath));
    } catch (error) {
      res.status(500).json({ error: 'Failed to read targets' });
    }
  });

  app.get('/api/targets/:id/rotations', (req, res) => {
    try {
      const tree = loadTargetTree(targetsPath);
      const target = findTargetById(tree, req.params.id);

      if (!target) {
        res.status(404).json({ error: 'Target not found' });
        return;
      }

      const logPath = resolveTargetPath(target, logRoot);
      const dir = path.dirname(logPath);
      const basename = path.basename(logPath);

      if (!fs.existsSync(dir)) {
        res.json([]);
        return;
      }

      const pattern = new RegExp(`^${escapeRegExp(basename)}\\.(\\d{4}-\\d{2}-\\d{2})$`);
      const rotations = fs.readdirSync(dir)
        .map((entry) => pattern.exec(entry))
        .filter((match) => match !== null)
        .map((match) => ({
          id: `${target.id}::${match[1]}`,
          date: match[1],
          label: match[1],
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      res.json(rotations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read rotations' });
    }
  });

  app.get('/api/targets/:id/download', (req, res) => {
    let logPath;
    try {
      logPath = resolveLogPath(loadTargetTree(targetsPath), req.params.id, logRoot);
    } catch (error) {
      res.status(500).json({ error: 'Failed to read targets' });
      return;
    }

    if (!logPath) {
      res.status(404).json({ error: 'Target not found' });
      return;
    }

    fs.stat(logPath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        res.status(404).json({ error: 'Log file not found' });
        return;
      }

      const filename = path.basename(logPath);
      const compress = stats.size > COMPRESSION_THRESHOLD_BYTES;
      const streams = [fs.createReadStream(logPath)];

      if (compress) {
        streams.push(zlib.createGzip());
        // attachment() deduz o Content-Type pela extensão; type() depois fixa o tipo real.
        res.attachment(`${filename}.gz`).type('application/gzip');
      } else {
        res.attachment(filename).type('text/plain; charset=utf-8');
      }

      pipeline(...streams, res, (pipelineError) => {
        if (pipelineError && !res.headersSent) {
          res.status(500).json({ error: 'Failed to read log file' });
        }
      });
    });
  });

  return app;
}

export const WS_PATH = '/ws';
// Mensagens do protocolo têm poucos bytes; o padrão do ws (100MB) só abre espaço para abuso (#30).
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;

function attachWebSocketServer(server, targetsPath, logRoot, heartbeatIntervalMs) {
  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: WS_MAX_PAYLOAD_BYTES });

  // Heartbeat: quem não responder ao ping até o próximo ciclo é derrubado, liberando timer e estado (#30).
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    // Erros de protocolo (ex.: payload acima de maxPayload) são emitidos aqui; sem listener viram exceção
    // não tratada e derrubam o processo. O ws já fecha a conexão.
    ws.on('error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });
    let currentStream = null;
    let currentTargetPath = null;
    // Byte do arquivo até onde já foi lido; o offset enviado desconta os bytes retidos em pendingBytes.
    let currentOffset = 0;
    let pendingBytes = Buffer.alloc(0);
    let isStreaming = false;
    let watchTimer = null;
    // streamId opcional do START_STREAM, devolvido em LOG_CHUNK/STREAM_END/ERROR para o cliente descartar
    // mensagens em voo de um stream anterior (#24). Sem ele, as mensagens saem como antes.
    let currentStreamId;

    function tagged(message, streamId = currentStreamId) {
      return streamId === undefined ? message : { ...message, streamId };
    }

    function cleanupCurrentStream() {
      if (currentStream) {
        currentStream.destroy();
        currentStream = null;
      }
    }

    function stopWatching() {
      if (watchTimer) {
        clearTimeout(watchTimer);
        watchTimer = null;
      }
    }

    function scheduleRead() {
      watchTimer = null;

      if (!isStreaming || !currentTargetPath || currentStream) {
        return;
      }

      fs.stat(currentTargetPath, (statError, stats) => {
        if (!isStreaming || !currentTargetPath || statError) {
          if (statError && isStreaming) {
            sendMessage(ws, tagged({ type: 'ERROR', message: statError.message }));
          }
          return;
        }

        if (stats.size < currentOffset) {
          currentOffset = stats.size;
          pendingBytes = Buffer.alloc(0);
        }

        if (stats.size === currentOffset) {
          watchTimer = setTimeout(scheduleRead, 1000);
          return;
        }

        let stream;
        try {
          stream = fs.createReadStream(currentTargetPath, {
            start: currentOffset,
            end: stats.size - 1,
          });
        } catch (readError) {
          // Fora do try/catch do handler de mensagem: sem isso a exceção derruba o processo (#30).
          isStreaming = false;
          sendMessage(ws, tagged({ type: 'ERROR', message: readError.message }));
          return;
        }
        currentStream = stream;
        // Fixado na criação: dados já lidos de um stream destruído saem com o id antigo.
        const streamId = currentStreamId;

        stream.on('data', (chunk) => {
          currentOffset += chunk.length;
          const bytes = pendingBytes.length > 0 ? Buffer.concat([pendingBytes, chunk]) : chunk;
          const completeLength = bytes.length - incompleteUtf8TailLength(bytes);
          pendingBytes = bytes.subarray(completeLength);
          if (completeLength === 0) {
            return;
          }
          sendMessage(ws, tagged({
            type: 'LOG_CHUNK',
            content: bytes.toString('utf8', 0, completeLength),
            offset: currentOffset - pendingBytes.length,
          }, streamId));
        });

        stream.on('end', () => {
          if (currentStream !== stream) {
            return;
          }

          currentStream = null;
          sendMessage(ws, tagged({ type: 'STREAM_END' }, streamId));
          if (isStreaming) {
            watchTimer = setTimeout(scheduleRead, 1000);
          }
        });

        stream.on('error', (streamError) => {
          if (currentStream !== stream) {
            return;
          }

          currentStream = null;
          sendMessage(ws, tagged({ type: 'ERROR', message: streamError.message }, streamId));
        });
      });
    }

    function stopStreaming() {
      isStreaming = false;
      stopWatching();
      cleanupCurrentStream();
      currentTargetPath = null;
      currentOffset = 0;
      pendingBytes = Buffer.alloc(0);
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'START_STREAM') {
          const targetId = data.targetId;
          const startOffset = data.offset === undefined ? 0 : data.offset;
          const requestedStreamId = Number.isInteger(data.streamId) ? data.streamId : undefined;

          if (typeof targetId !== 'string') {
            sendMessage(ws, tagged({ type: 'ERROR', message: 'Invalid targetId' }, requestedStreamId));
            return;
          }

          if (!Number.isSafeInteger(startOffset) || startOffset < 0) {
            sendMessage(ws, tagged({ type: 'ERROR', message: 'Invalid offset' }, requestedStreamId));
            return;
          }
          const tree = loadTargetTree(targetsPath);
          const logPath = resolveLogPath(tree, targetId, logRoot);

          if (!logPath) {
            sendMessage(ws, tagged({ type: 'ERROR', message: 'Target not found' }, requestedStreamId));
            return;
          }

          if (!fs.existsSync(logPath)) {
            sendMessage(ws, tagged({ type: 'ERROR', message: `Log file not found: ${targetId}` }, requestedStreamId));
            return;
          }

          cleanupCurrentStream();
          stopWatching();
          currentStreamId = requestedStreamId;
          currentTargetPath = logPath;
          currentOffset = startOffset;
          pendingBytes = Buffer.alloc(0);
          // Fast Forward: pula para a cauda do arquivo, mas nunca recua antes do offset do cliente.
          if (Number.isInteger(data.fromEnd) && data.fromEnd > 0) {
            const { size } = fs.statSync(logPath);
            currentOffset = Math.max(startOffset, size - data.fromEnd);
          }
          isStreaming = true;
          scheduleRead();
        } else if (data.type === 'PAUSE_STREAM') {
          stopStreaming();
        }
      } catch (error) {
        console.error('WebSocket Error:', error);
        sendMessage(ws, { type: 'ERROR', message: 'Invalid WebSocket message' });
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      stopStreaming();
    });
  });

  return wss;
}

export function createServer({
  targetsPath = defaultTargetsPath,
  configPath = defaultConfigPath,
  logRoot = defaultLogRoot,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
} = {}) {
  const app = createApp({ targetsPath, configPath, logRoot });
  const server = http.createServer(app);
  const wss = attachWebSocketServer(server, targetsPath, logRoot, heartbeatIntervalMs);

  return { app, server, wss };
}
