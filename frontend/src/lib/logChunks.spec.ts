import { describe, expect, it } from 'vitest'
import { dropLeadingBytes, routeChunk, splitLines, takeLeadingBytes, type StreamCursor } from './logChunks'

describe('splitLines', () => {
  it('devolve linhas completas com o byte final e o fragmento sem \\n como pending', () => {
    expect(splitLines('a\nbé\n\nc', 10)).toEqual({
      lines: [{ content: 'a', offset: 12 }, { content: 'bé', offset: 16 }],
      pending: 'c',
    })
  })

  it('dropFirst descarta a primeira linha (parcial)', () => {
    expect(splitLines('ial\nl1\n', 0, true).lines).toEqual([{ content: 'l1', offset: 7 }])
  })
})

describe('recorte por bytes UTF-8', () => {
  it('dropLeadingBytes e takeLeadingBytes contam bytes, não caracteres', () => {
    expect(dropLeadingBytes('éa', 2)).toBe('a')
    expect(dropLeadingBytes('abc', 0)).toBe('abc')
    expect(takeLeadingBytes('éab', 3)).toBe('éa')
  })
})

describe('routeChunk', () => {
  const live = (expectedOffset: number | null): StreamCursor => ({ expectedOffset, navigation: { kind: 'live' } })

  it('pausado (expectedOffset null) descarta o chunk', () => {
    const cursor = live(null)
    expect(routeChunk(cursor, 'x\n', 2)).toEqual({ cursor, effect: { kind: 'none' } })
  })

  it('recorta a sobreposição e avança o offset esperado', () => {
    expect(routeChunk(live(3), 'abcdef', 6)).toEqual({
      cursor: live(6),
      effect: { kind: 'append', text: 'def' },
    })
  })

  it('descarta chunk já recebido e lacuna fora do Fast Forward', () => {
    expect(routeChunk(live(10), 'abc', 8).effect).toEqual({ kind: 'none' })
    expect(routeChunk(live(10), 'abc', 20)).toEqual({ cursor: live(10), effect: { kind: 'none' } })
  })

  it('lacuna no Fast Forward vira salto e acumula a cauda contígua', () => {
    const jumped = routeChunk({ expectedOffset: 10, navigation: { kind: 'fastForward' } }, 'abc', 50)
    expect(jumped.cursor.navigation).toEqual({ kind: 'fastForwardJump', start: 47, end: 50, text: 'abc' })

    const next = routeChunk(jumped.cursor, 'cde', 52)
    expect(next.cursor.navigation).toEqual({ kind: 'fastForwardJump', start: 47, end: 52, text: 'abcde' })
    expect(routeChunk(next.cursor, 'zz', 60).cursor).toBe(next.cursor)
  })

  it('Fast Forward sem salto vira Play comum', () => {
    expect(routeChunk({ expectedOffset: 4, navigation: { kind: 'fastForward' } }, 'ab', 6)).toEqual({
      cursor: live(6),
      effect: { kind: 'append', text: 'ab' },
    })
  })

  it('Rewind acumula até alcançar o fim da página', () => {
    const cursor: StreamCursor = { expectedOffset: 0, navigation: { kind: 'rewind', start: 0, end: 6, text: '' } }
    const partial = routeChunk(cursor, 'abc', 3)
    expect(partial.effect).toEqual({ kind: 'none' })

    const done = routeChunk(partial.cursor, 'defgh', 8)
    expect(done.effect).toEqual({ kind: 'finishRewind' })
    expect(done.cursor).toEqual({ expectedOffset: 8, navigation: { kind: 'rewind', start: 0, end: 6, text: 'abcdefgh' } })
  })
})
