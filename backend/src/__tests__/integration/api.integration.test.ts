import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { COMPRESSION_THRESHOLD_BYTES, DEFAULT_CONFIG, createApp } from '../../app.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logzord-api-test-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('GET /api/targets', () => {
  it('returns the configured target tree when targets.json exists', async () => {
    const targetsPath = path.join(tempDir, 'targets.json');
    const tree = [
      {
        type: 'group',
        id: 'ns:demo',
        label: 'demo',
        children: [
          { type: 'target', id: 'service-test', label: 'Serviço de teste', path: 'wkr/sample.log' },
        ],
      },
    ];
    fs.writeFileSync(targetsPath, JSON.stringify(tree));

    const response = await request(createApp({ targetsPath })).get('/api/targets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(tree);
  });

  it('returns an empty list when targets.json does not exist', async () => {
    const targetsPath = path.join(tempDir, 'missing-targets.json');

    const response = await request(createApp({ targetsPath })).get('/api/targets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe('GET /api/targets/:id/rotations', () => {
  it('lists rotated files matching the target basename', async () => {
    const testDir = fs.mkdtempSync(path.join(tempDir, 'rotations-'));
    const targetsPath = path.join(testDir, 'targets.json');
    const logPath = path.join(testDir, 'sample.log');
    fs.writeFileSync(logPath, 'current content\n');
    fs.writeFileSync(`${logPath}.2026-08-21`, 'older content\n');
    fs.writeFileSync(`${logPath}.2026-08-22`, 'newer content\n');
    fs.writeFileSync(`${logPath}.bak`, 'not a rotation\n');
    fs.writeFileSync(
      targetsPath,
      JSON.stringify([{ type: 'target', id: 'sample', label: 'Sample', path: logPath }]),
    );

    const response = await request(createApp({ targetsPath })).get('/api/targets/sample/rotations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 'sample::2026-08-22', date: '2026-08-22', label: '2026-08-22' },
      { id: 'sample::2026-08-21', date: '2026-08-21', label: '2026-08-21' },
    ]);
  });

  it('returns 404 when the target does not exist', async () => {
    const targetsPath = path.join(tempDir, 'targets-empty.json');
    fs.writeFileSync(targetsPath, JSON.stringify([]));

    const response = await request(createApp({ targetsPath })).get('/api/targets/missing/rotations');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/targets/:id/download', () => {
  function setup(content: string | Buffer) {
    const testDir = fs.mkdtempSync(path.join(tempDir, 'download-'));
    const targetsPath = path.join(testDir, 'targets.json');
    const logPath = path.join(testDir, 'sample.log');
    fs.writeFileSync(logPath, content);
    fs.writeFileSync(
      targetsPath,
      JSON.stringify([{ type: 'target', id: 'sample', label: 'Sample', path: logPath }]),
    );
    return { app: createApp({ targetsPath }), logPath };
  }

  function binaryParser(res: NodeJS.ReadableStream & { setEncoding: (e: string) => void }, done: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  }

  it('serves files up to the threshold uncompressed as an attachment', async () => {
    const { app } = setup('linha 1\nlinha 2\n');

    const response = await request(app).get('/api/targets/sample/download');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['content-disposition']).toBe('attachment; filename="sample.log"');
    expect(response.text).toBe('linha 1\nlinha 2\n');
  });

  it('gzips files above the threshold', async () => {
    const line = 'x'.repeat(1023) + '\n';
    const content = Buffer.from(line.repeat(Math.ceil(COMPRESSION_THRESHOLD_BYTES / line.length) + 1));
    const { app } = setup(content);

    const response = await request(app)
      .get('/api/targets/sample/download')
      .buffer(true)
      .parse(binaryParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/gzip');
    expect(response.headers['content-disposition']).toBe('attachment; filename="sample.log.gz"');
    expect(zlib.gunzipSync(response.body).equals(content)).toBe(true);
  });

  it('downloads a rotation by its id', async () => {
    const { app, logPath } = setup('current\n');
    fs.writeFileSync(`${logPath}.2026-08-21`, 'older\n');

    const response = await request(app).get(`/api/targets/${encodeURIComponent('sample::2026-08-21')}/download`);

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toBe('attachment; filename="sample.log.2026-08-21"');
    expect(response.text).toBe('older\n');
  });

  it('returns 404 for an unknown target', async () => {
    const { app } = setup('');

    const response = await request(app).get('/api/targets/missing/download');

    expect(response.status).toBe(404);
  });

  it('returns 404 when the log file does not exist', async () => {
    const { app, logPath } = setup('');
    fs.rmSync(logPath);

    const response = await request(app).get('/api/targets/sample/download');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/config', () => {
  function getConfig(content) {
    const configPath = path.join(fs.mkdtempSync(path.join(tempDir, 'config-')), 'config.json');
    if (content !== undefined) {
      fs.writeFileSync(configPath, content);
    }
    return request(createApp({ configPath })).get('/api/config');
  }

  it('returns the configured pageLines', async () => {
    const response = await getConfig(JSON.stringify({ pageLines: 80 }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pageLines: 80 });
  });

  it('falls back to the defaults when config.json does not exist', async () => {
    const response = await getConfig(undefined);

    expect(response.body).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to the default for invalid JSON or a non-integer value', async () => {
    expect((await getConfig('{ not json')).body).toEqual(DEFAULT_CONFIG);
    expect((await getConfig(JSON.stringify({ pageLines: '80' }))).body).toEqual(DEFAULT_CONFIG);
    expect((await getConfig(JSON.stringify({ pageLines: 12.5 }))).body).toEqual(DEFAULT_CONFIG);
  });

  it('clamps pageLines to 1..2000', async () => {
    expect((await getConfig(JSON.stringify({ pageLines: 0 }))).body).toEqual({ pageLines: 1 });
    expect((await getConfig(JSON.stringify({ pageLines: 5000 }))).body).toEqual({ pageLines: 2000 });
  });
});
