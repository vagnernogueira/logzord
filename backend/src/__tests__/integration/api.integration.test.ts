import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

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
