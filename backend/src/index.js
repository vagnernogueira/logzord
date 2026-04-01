import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function byteLengthOf(chunk) {
  return Buffer.byteLength(chunk, 'utf8')
}

// Load targets
const targetsPath = path.resolve(__dirname, '../targets.json');

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
    if (!isStreaming || !currentTargetPath || currentStream) {
      return;
    }

    fs.stat(currentTargetPath, (statError, stats) => {
      if (statError) {
        ws.send(JSON.stringify({ type: 'ERROR', message: statError.message }));
        return;
      }

      if (stats.size < currentOffset) {
        currentOffset = stats.size;
      }

      if (stats.size === currentOffset) {
        watchTimer = setTimeout(scheduleRead, 1000);
        return;
      }

      currentStream = fs.createReadStream(currentTargetPath, {
        start: currentOffset,
        end: stats.size - 1,
        encoding: 'utf8',
      });

      currentStream.on('data', (chunk) => {
        currentOffset += byteLengthOf(chunk);
        ws.send(JSON.stringify({
          type: 'LOG_CHUNK',
          content: chunk,
          offset: currentOffset,
        }));
      });

      currentStream.on('end', () => {
        currentStream = null;
        if (isStreaming) {
          watchTimer = setTimeout(scheduleRead, 0);
        }
      });

      currentStream.on('error', (streamError) => {
        currentStream = null;
        ws.send(JSON.stringify({ type: 'ERROR', message: streamError.message }));
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
        const startOffset = data.offset || 0; // ADR-001: Play/Pause resumption via byte offset
        
        // Find target path
        const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
        const target = targets.find(t => t.id === targetId);
        
        if (!target) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Target not found' }));
          return;
        }

        const logPath = path.resolve(__dirname, '..', target.path);
        
        if (!fs.existsSync(logPath)) {
           ws.send(JSON.stringify({ type: 'ERROR', message: `Log file not found: ${target.path}` }));
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
    } catch (e) {
      console.error('WebSocket Error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    stopStreaming();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Logzord Backend is running on port ${PORT}`);
});
