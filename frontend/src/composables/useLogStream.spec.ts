import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogStream } from './useLogStream'

const wsInstances: FakeWebSocket[] = []

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = FakeWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor() {
    wsInstances.push(this)
  }
}

const TestHarness = defineComponent({
  name: 'TestHarness',
  setup() {
    useLogStream()
    return () => h('div', [h('div', { id: 'log-container' })])
  },
})

describe('useLogStream', () => {
  beforeEach(() => {
    wsInstances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [],
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rola o log-container após o nextTick quando chega um LOG_CHUNK', async () => {
    const wrapper = mount(TestHarness, { attachTo: document.body })
    await flushPromises()

    const ws = wsInstances[0]
    expect(ws).toBeTruthy()

    const container = wrapper.get('#log-container').element as HTMLElement
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 480,
    })
    container.scrollTop = 0

    const message = ws?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'LOG_CHUNK',
          content: 'linha 1\n',
          offset: 128,
        }),
      }),
    )

    expect(container.scrollTop).toBe(0)

    await message
    await nextTick()

    expect(container.scrollTop).toBe(480)
  })
})
