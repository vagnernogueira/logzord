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

        if (currentStream) {
          currentStream.destroy();
        }

        // Stream from byte offset
        let currentOffset = startOffset;
        currentStream = fs.createReadStream(logPath, {
          start: startOffset,
          encoding: 'utf8' // reading as string chunks
        });

        currentStream.on('data', (chunk) => {
          // Send chunk and the current byte offset after this chunk
          currentOffset += Buffer.byteLength(chunk, 'utf8');
          ws.send(JSON.stringify({
            type: 'LOG_CHUNK',
            content: chunk,
            offset: currentOffset
          }));
        });

        currentStream.on('end', () => {
          ws.send(JSON.stringify({ type: 'STREAM_END' }));
        });

        currentStream.on('error', (err) => {
          ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        });
      } else if (data.type === 'PAUSE_STREAM') {
        if (currentStream) {
          currentStream.destroy();
          currentStream = null;
        }
      }
    } catch (e) {
      console.error('WebSocket Error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (currentStream) {
      currentStream.destroy();
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Logzord Backend is running on port ${PORT}`);
});
