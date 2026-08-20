import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultTargetsPath = path.resolve(__dirname, '../targets.json');

function byteLengthOf(chunk) {
  return Buffer.byteLength(chunk, 'utf8');
}

function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

export function createApp({ targetsPath = defaultTargetsPath } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/targets', (req, res) => {
    try {
      if (fs.existsSync(targetsPath)) {
        const data = fs.readFileSync(targetsPath, 'utf8');
        res.json(JSON.parse(data));
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to read targets' });
    }
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
          const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
          const target = targets.find((item) => item.id === targetId);

          if (!target) {
            sendMessage(ws, { type: 'ERROR', message: 'Target not found' });
            return;
          }

          const logPath = path.resolve(__dirname, '..', target.path);

          if (!fs.existsSync(logPath)) {
            sendMessage(ws, { type: 'ERROR', message: `Log file not found: ${target.path}` });
            return;
          }

          cleanupCurrentStream();
          stopWatching();
          currentTargetPath = logPath;
          currentOffset = startOffset;
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

export function createServer({ targetsPath = defaultTargetsPath } = {}) {
  const app = createApp({ targetsPath });
  const server = http.createServer(app);
  const wss = attachWebSocketServer(server, targetsPath);

  return { app, server, wss };
}

export const { app, server, wss } = createServer();
