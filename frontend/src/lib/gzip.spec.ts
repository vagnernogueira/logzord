// @vitest-environment node
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { gzipBlob } from './gzip'

describe('gzipBlob', () => {
  it('gera um gzip válido do conteúdo', async () => {
    const content = 'linha 1\nação\n'.repeat(1000)

    const gz = await gzipBlob(new Blob([content]))

    expect(gz.type).toBe('application/gzip')
    expect(gz.size).toBeLessThan(content.length)
    expect(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString('utf8')).toBe(content)
  })
})
