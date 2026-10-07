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
const ROTATION_ID_PATTERN = /^(.+)::(\d{4}-\d{2}-\d{2})$/;
// CA5: downloads acima de 5MB saem em .gz; a compressão é por stream, sem limite de tamanho.
export const COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024;
// Página de Rewind/Fast Forward em linhas; limitada ao teto do buffer do frontend.
export const DEFAULT_CONFIG = { pageLines: 50 };
const MAX_PAGE_LINES = 2000;

function byteLengthOf(chunk) {
  return Buffer.byteLength(chunk, 'utf8');
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

function resolveTargetPath(target) {
  return path.resolve(__dirname, '..', target.path);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Resolve um targetId que pode ser um target estatico ou uma rotacao dinamica
// (`${targetId}::AAAA-MM-DD`, nunca aceita path vindo do cliente).
function resolveLogPath(tree, targetId) {
  const target = findTargetById(tree, targetId);
  if (target) {
    return resolveTargetPath(target);
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

  return `${resolveTargetPath(baseTarget)}.${date}`;
}

export function createApp({ targetsPath = defaultTargetsPath, configPath = defaultConfigPath } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

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

      const logPath = resolveTargetPath(target);
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
      logPath = resolveLogPath(loadTargetTree(targetsPath), req.params.id);
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

function attachWebSocketServer(server, targetsPath) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentStream = null;
    let currentTargetPath = null;
    let currentOffset = 0;
    let isStreaming = false;
    let watchTimer = null;

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
            sendMessage(ws, { type: 'ERROR', message: statError.message });
          }
          return;
        }

        if (stats.size < currentOffset) {
          currentOffset = stats.size;
        }

        if (stats.size === currentOffset) {
          watchTimer = setTimeout(scheduleRead, 1000);
          return;
        }

        const stream = fs.createReadStream(currentTargetPath, {
          start: currentOffset,
          end: stats.size - 1,
          encoding: 'utf8',
        });
        currentStream = stream;

        stream.on('data', (chunk) => {
          currentOffset += byteLengthOf(chunk);
          sendMessage(ws, {
            type: 'LOG_CHUNK',
            content: chunk,
            offset: currentOffset,
          });
        });

        stream.on('end', () => {
          if (currentStream !== stream) {
            return;
          }

          currentStream = null;
          sendMessage(ws, { type: 'STREAM_END' });
          if (isStreaming) {
            watchTimer = setTimeout(scheduleRead, 1000);
          }
        });

        stream.on('error', (streamError) => {
          if (currentStream !== stream) {
            return;
          }

          currentStream = null;
          sendMessage(ws, { type: 'ERROR', message: streamError.message });
        });
      });
    }

    function stopStreaming() {
      isStreaming = false;
      stopWatching();
      cleanupCurrentStream();
      currentTargetPath = null;
      currentOffset = 0;
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === 'START_STREAM') {
          const targetId = data.targetId;
          const startOffset = data.offset || 0;
          const tree = loadTargetTree(targetsPath);
          const logPath = resolveLogPath(tree, targetId);

          if (!logPath) {
            sendMessage(ws, { type: 'ERROR', message: 'Target not found' });
            return;
          }

          if (!fs.existsSync(logPath)) {
            sendMessage(ws, { type: 'ERROR', message: `Log file not found: ${targetId}` });
            return;
          }

          cleanupCurrentStream();
          stopWatching();
          currentTargetPath = logPath;
          currentOffset = startOffset;
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

export function createServer({ targetsPath = defaultTargetsPath, configPath = defaultConfigPath } = {}) {
  const app = createApp({ targetsPath, configPath });
  const server = http.createServer(app);
  const wss = attachWebSocketServer(server, targetsPath);

  return { app, server, wss };
}

export const { app, server, wss } = createServer();
