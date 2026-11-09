import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, WS_MAX_PAYLOAD_BYTES } from '../../app.js';

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

async function createTestServer(logContent = 'first line\nsecond line\n', serverOptions = {}) {
  const testDir = fs.mkdtempSync(path.join(tempDir, 'case-'));
  const targetsPath = path.join(testDir, 'targets.json');
  const logPath = path.join(testDir, 'sample.log');
  fs.writeFileSync(logPath, logContent);
  fs.writeFileSync(targetsPath, JSON.stringify([
    { type: 'target', id: 'sample', label: 'Sample', path: logPath },
  ]));

  const testServer = createServer({ targetsPath, ...serverOptions });
  await new Promise((resolve) => testServer.server.listen(0, resolve));
  const address = testServer.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine test server port');
  }

  return {
    ...testServer,
    logPath,
    origin: `ws://127.0.0.1:${address.port}`,
    url: `ws://127.0.0.1:${address.port}/ws`,
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

  it('echoes the optional streamId in LOG_CHUNK and STREAM_END', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const streamMessages = waitForStreamEnd(ws);
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample',
      offset: 0,
      streamId: 7,
    }));

    const messages = await streamMessages;
    expect(messages.find((message) => message.type === 'LOG_CHUNK').streamId).toBe(7);
    expect(messages.find((message) => message.type === 'STREAM_END')).toEqual({ type: 'STREAM_END', streamId: 7 });
  });

  it('tags the ERROR of a rejected START_STREAM with its streamId', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const errorMessage = waitForMessage(ws, (message) => message.type === 'ERROR');
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'does-not-exist',
      offset: 0,
      streamId: 3,
    }));

    expect(await errorMessage).toEqual({ type: 'ERROR', message: 'Target not found', streamId: 3 });
  });

  it('tags chunks read after a restart with the new streamId', async () => {
    testServer = await createTestServer('aaaa\n');
    ws = await openWebSocket(testServer.url);

    ws.send(JSON.stringify({ type: 'START_STREAM', targetId: 'sample', offset: 0, streamId: 1 }));
    await waitForMessage(ws, (message) => message.type === 'STREAM_END');

    const restarted = waitForMessage(ws, (message) => message.type === 'LOG_CHUNK');
    ws.send(JSON.stringify({ type: 'START_STREAM', targetId: 'sample', offset: 0, streamId: 2 }));

    const chunk = await restarted;
    expect(chunk).toEqual({ type: 'LOG_CHUNK', content: 'aaaa\n', offset: 5, streamId: 2 });
  });

  it('starts at the tail of the file when fromEnd is given', async () => {
    testServer = await createTestServer('aaaa\nbbbb\ncccc\n');
    ws = await openWebSocket(testServer.url);

    const streamMessages = waitForStreamEnd(ws);
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample',
      offset: 0,
      fromEnd: 10,
    }));

    const chunk = (await streamMessages).find((message) => message.type === 'LOG_CHUNK');
    expect(chunk.content).toBe('bbbb\ncccc\n');
    expect(chunk.offset).toBe(15);
  });

  it('holds a partial multibyte UTF-8 character until the writer completes it', async () => {
    const euro = Buffer.from('€', 'utf8');
    testServer = await createTestServer(Buffer.concat([Buffer.from('abc\n'), euro.subarray(0, 2)]));
    ws = await openWebSocket(testServer.url);

    const chunks = [];
    ws.on('message', (rawMessage) => {
      const message = JSON.parse(rawMessage.toString());
      if (message.type === 'LOG_CHUNK') chunks.push(message);
    });

    const firstRead = waitForStreamEnd(ws);
    ws.send(JSON.stringify({ type: 'START_STREAM', targetId: 'sample', offset: 0 }));
    await firstRead;
    expect(chunks).toEqual([{ type: 'LOG_CHUNK', content: 'abc\n', offset: 4 }]);

    fs.appendFileSync(testServer.logPath, Buffer.concat([euro.subarray(2), Buffer.from('\n')]));
    await waitForMessage(ws, (message) => message.type === 'STREAM_END');

    const fileContent = fs.readFileSync(testServer.logPath);
    expect(chunks.map((chunk) => chunk.content).join('')).toBe(fileContent.toString('utf8'));
    expect(chunks.at(-1).offset).toBe(fileContent.length);
  });

  it('never moves before the client offset when fromEnd is given', async () => {
    testServer = await createTestServer('aaaa\nbbbb\ncccc\n');
    ws = await openWebSocket(testServer.url);

    const streamMessages = waitForStreamEnd(ws);
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: 'sample',
      offset: 10,
      fromEnd: 15,
    }));

    const chunk = (await streamMessages).find((message) => message.type === 'LOG_CHUNK');
    expect(chunk.content).toBe('cccc\n');
    expect(chunk.offset).toBe(15);
  });

  it.each([
    ['negative', -5],
    ['non-integer', 1.5],
    ['string', '10'],
    ['null', null],
  ])('rejects a %s offset with ERROR and keeps serving other connections', async (_label, offset) => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const errorMessage = waitForMessage(ws, (message) => message.type === 'ERROR');
    ws.send(JSON.stringify({ type: 'START_STREAM', targetId: 'sample', offset, streamId: 4 }));
    expect(await errorMessage).toEqual({ type: 'ERROR', message: 'Invalid offset', streamId: 4 });

    const other = await openWebSocket(testServer.url);
    try {
      const streamMessages = waitForStreamEnd(other);
      other.send(JSON.stringify({ type: 'START_STREAM', targetId: 'sample', offset: 0 }));
      const chunk = (await streamMessages).find((message) => message.type === 'LOG_CHUNK');
      expect(chunk.content).toBe('first line\nsecond line\n');
    } finally {
      await closeWebSocket(other);
    }
  });

  it('rejects a non-string targetId with ERROR', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const errorMessage = waitForMessage(ws, (message) => message.type === 'ERROR');
    ws.send(JSON.stringify({ type: 'START_STREAM', targetId: { id: 'sample' }, offset: 0 }));
    expect(await errorMessage).toEqual({ type: 'ERROR', message: 'Invalid targetId' });
  });

  it('rejects upgrades outside /ws', async () => {
    testServer = await createTestServer();

    await expect(openWebSocket(`${testServer.origin}/qualquer`)).rejects.toThrow();
    await expect(openWebSocket(testServer.origin)).rejects.toThrow();
  });

  it('closes a connection whose message exceeds maxPayload', async () => {
    testServer = await createTestServer();
    ws = await openWebSocket(testServer.url);

    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send('x'.repeat(WS_MAX_PAYLOAD_BYTES + 1));
    expect(await closed).toBe(1009);
  });

  it('terminates a client that stops answering pings', async () => {
    testServer = await createTestServer('', { heartbeatIntervalMs: 50 });
    ws = new WebSocket(testServer.url, { autoPong: false });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const closed = new Promise((resolve) => ws.once('close', resolve));
    await closed;
    await vi.waitFor(() => expect(testServer.wss.clients.size).toBe(0));
  });

  it('keeps a client that answers pings', async () => {
    testServer = await createTestServer('', { heartbeatIntervalMs: 50 });
    ws = await openWebSocket(testServer.url);

    await wait(300);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });
});
