import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../app.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logzord-ws-test-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const handleOpen = () => {
      ws.off('error', handleError);
      resolve(ws);
    };
    const handleError = (error) => {
      ws.off('open', handleOpen);
      reject(error);
    };

    ws.once('open', handleOpen);
    ws.once('error', handleError);
  });
}

function waitForMessage(ws, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeout);

    const handleMessage = (rawMessage) => {
      const message = JSON.parse(rawMessage.toString());
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', handleMessage);
      ws.off('error', handleError);
    };

    ws.on('message', handleMessage);
    ws.once('error', handleError);
  });
}

function waitForStreamEnd(ws, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket stream end'));
    }, timeout);
    const messages = [];

    const handleMessage = (rawMessage) => {
      const message = JSON.parse(rawMessage.toString());
      messages.push(message);
      if (messages.some((item) => item.type === 'LOG_CHUNK')
        && messages.some((item) => item.type === 'STREAM_END')) {
        cleanup();
        resolve(messages);
      }
    };
    const handleError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', handleMessage);
      ws.off('error', handleError);
    };

    ws.on('message', handleMessage);
    ws.once('error', handleError);
  });
}

async function closeWebSocket(ws) {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise((resolve) => {
    ws.once('close', resolve);
    ws.close();
  });
}

async function closeServer({ server, wss }) {
  for (const client of wss.clients) {
    client.close();
  }

  await new Promise((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createTestServer(logContent = 'first line\nsecond line\n') {
  const testDir = fs.mkdtempSync(path.join(tempDir, 'case-'));
  const targetsPath = path.join(testDir, 'targets.json');
  const logPath = path.join(testDir, 'sample.log');
  fs.writeFileSync(logPath, logContent);
  fs.writeFileSync(targetsPath, JSON.stringify([
    { type: 'target', id: 'sample', label: 'Sample', path: logPath },
  ]));

  const testServer = createServer({ targetsPath });
  await new Promise((resolve) => testServer.server.listen(0, resolve));
  const address = testServer.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine test server port');
  }

  return {
    ...testServer,
    logPath,
    url: `ws://127.0.0.1:${address.port}`,
  };
}

describe('WebSocket log streaming', () => {
  let testServer;
  let ws;

  afterEach(async () => {
    await closeWebSocket(ws);
    if (testServer) {
      await closeServer(testServer);
    }
    ws = null;
    testServer = null;
  });

  it('streams a target and reports the end of the current read', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const streamMessages = waitForStreamEnd(ws);
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample',
      offset: 0,
    }));

    const messages = await streamMessages;
    const chunk = messages.find((message) => message.type === 'LOG_CHUNK');
    const streamEnd = messages.find((message) => message.type === 'STREAM_END');
    expect(chunk.content).toBe('first line\nsecond line\n');
    expect(chunk.offset).toBe(Buffer.byteLength(chunk.content, 'utf8'));
    expect(streamEnd).toEqual({ type: 'STREAM_END' });
  });

  it('streams a rotated file via a composite rotation id', async () => {
    testServer = await createTestServer();
    fs.writeFileSync(`${testServer.logPath}.2026-08-21`, 'rotated line\n');
    ws = await openWebSocket(testServer.url);

    const streamMessages = waitForStreamEnd(ws);
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample::2026-08-21',
      offset: 0,
    }));

    const messages = await streamMessages;
    const chunk = messages.find((message) => message.type === 'LOG_CHUNK');
    expect(chunk.content).toBe('rotated line\n');
  });

  it('reports an error for an unknown target id', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const errorMessage = waitForMessage(ws, (message) => message.type === 'ERROR');
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'does-not-exist',
      offset: 0,
    }));

    const message = await errorMessage;
    expect(message).toEqual({ type: 'ERROR', message: 'Target not found' });
  });

  it('stops polling after PAUSE_STREAM', async () => {
    testServer = await createTestServer('before pause\n');
    ws = await openWebSocket(testServer.url);

    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample',
      offset: 0,
    }));
    await waitForMessage(ws, (message) => message.type === 'LOG_CHUNK');

    const messages = [];
    const handleMessage = (rawMessage) => {
      messages.push(JSON.parse(rawMessage.toString()));
    };
    ws.on('message', handleMessage);
    ws.send(JSON.stringify({ type: 'PAUSE_STREAM' }));
    await wait(50);
    fs.appendFileSync(testServer.logPath, 'after pause\n');
    await wait(1200);
    ws.off('message', handleMessage);

    expect(messages.filter((message) => message.type === 'LOG_CHUNK')).toEqual([]);
  });
});
