import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SIDEBAR_WIDTH_STORAGE_KEY, useSidebarWidth } from './useSidebarWidth'

describe('useSidebarWidth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sem largura salva, usa o padrão da casca (undefined)', () => {
    expect(useSidebarWidth().value).toBeUndefined()
  })

  it('lê a largura salva', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '340')
    expect(useSidebarWidth().value).toBe(340)
  })

  it('ignora valor inválido', () => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'abc')
    expect(useSidebarWidth().value).toBeUndefined()
  })

  it('persiste a nova largura e remove ao voltar ao padrão', async () => {
    const width = useSidebarWidth()

    width.value = 320
    await nextTick()
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('320')

    width.value = undefined
    await nextTick()
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBeNull()
  })

  it('degrada sem persistir quando o storage falha', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const width = useSidebarWidth()
    expect(width.value).toBeUndefined()

    width.value = 300
    await nextTick()
    expect(width.value).toBe(300)
  })
})
