import { describe, expect, it } from 'vitest'
import { makeLineMatcher } from './lineMatcher'

describe('makeLineMatcher', () => {
  it('texto vazio aceita qualquer linha nos dois modos', () => {
    expect(makeLineMatcher('', 'substring').matches('qualquer')).toBe(true)
    expect(makeLineMatcher('', 'regex').matches('qualquer')).toBe(true)
  })

  it('substring trata metacaracteres como literais', () => {
    const { matches, error } = makeLineMatcher('a.b', 'substring')
    expect(error).toBeNull()
    expect(matches('xa.bx')).toBe(true)
    expect(matches('axb')).toBe(false)
  })

  it('regex interpreta a expressão', () => {
    const { matches } = makeLineMatcher('^ERROR.*timeout', 'regex')
    expect(matches('ERROR db timeout')).toBe(true)
    expect(matches('WARN ERROR timeout')).toBe(false)
  })

  it('os dois modos são case-sensitive', () => {
    expect(makeLineMatcher('error', 'substring').matches('ERROR')).toBe(false)
    expect(makeLineMatcher('error', 'regex').matches('ERROR')).toBe(false)
  })

  it('regex inválida não casa nada e expõe o erro', () => {
    const { matches, error } = makeLineMatcher('foo(', 'regex')
    expect(matches('foo(')).toBe(false)
    expect(error).toBeTruthy()
  })

  it('o mesmo texto inválido como regex é válido como substring', () => {
    const { matches, error } = makeLineMatcher('foo(', 'substring')
    expect(error).toBeNull()
    expect(matches('call foo(1)')).toBe(true)
  })
})
