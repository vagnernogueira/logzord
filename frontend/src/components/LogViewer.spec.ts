import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import LogViewer from './LogViewer.vue'
import { useLogStream } from '@/composables/useLogStream'

let syntaxHighlight: (content: string) => string

const Harness = defineComponent({
  setup() {
    syntaxHighlight = useLogStream().syntaxHighlight
    return () => h('div')
  },
})

describe('LogViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', class {
      static OPEN = 1
      static CLOSED = 3
      readyState = 3
      send = vi.fn()
      close = vi.fn()
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [] }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exibe marcação HTML de uma linha de log como texto, sem criar elementos', async () => {
    mount(Harness)
    await flushPromises()
    const payload = '<img src=x onerror="window.__xss = true"><script>window.__xss = true</script>'

    const wrapper = mount(LogViewer, {
      props: {
        filteredLogs: [{ id: '1', offset: 0, content: `[WARN] ${payload}` }],
        isPlaying: true,
        hasTarget: true,
        syntaxHighlight,
      },
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.find('span.text-yellow-500').text()).toBe('[WARN]')
  })
})
