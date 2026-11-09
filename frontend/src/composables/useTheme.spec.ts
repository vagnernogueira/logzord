import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'logzord-theme'

async function loadTheme() {
  vi.resetModules()
  return (await import('./useTheme')).useTheme()
}

function stubMatchMedia(prefersLight: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: prefersLight, media: query })))
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sem preferência salva, segue o sistema', async () => {
    stubMatchMedia(true)
    const { theme } = await loadTheme()

    expect(theme.value).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('sem matchMedia nem preferência, cai no escuro', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const { theme } = await loadTheme()

    expect(theme.value).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('a preferência salva prevalece sobre o sistema', async () => {
    stubMatchMedia(true)
    localStorage.setItem(KEY, 'dark')
    const { theme } = await loadTheme()

    expect(theme.value).toBe('dark')
  })

  it('ignora valor salvo inválido', async () => {
    stubMatchMedia(false)
    localStorage.setItem(KEY, 'sepia')
    const { theme } = await loadTheme()

    expect(theme.value).toBe('dark')
  })

  it('toggleTheme alterna o atributo e persiste a escolha', async () => {
    stubMatchMedia(false)
    const { theme, toggleTheme } = await loadTheme()

    toggleTheme()
    await nextTick()

    expect(theme.value).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(KEY)).toBe('light')
  })

  it('storage indisponível não quebra leitura nem alternância', async () => {
    stubMatchMedia(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { theme, toggleTheme } = await loadTheme()

    expect(theme.value).toBe('light')
    expect(() => toggleTheme()).not.toThrow()
    await nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
