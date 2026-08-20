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
  it('returns the configured targets when targets.json exists', async () => {
    const targetsPath = path.join(tempDir, 'targets.json');
    const targets = [
      { id: 'service-test', name: 'Serviço de teste', path: 'wkr/sample.log' },
    ];
    fs.writeFileSync(targetsPath, JSON.stringify(targets));

    const response = await request(createApp({ targetsPath })).get('/api/targets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(targets);
  });

  it('returns an empty list when targets.json does not exist', async () => {
    const targetsPath = path.join(tempDir, 'missing-targets.json');

    const response = await request(createApp({ targetsPath })).get('/api/targets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
