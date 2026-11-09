import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LogViewer from './LogViewer.vue'
import { syntaxHighlight } from '@/lib/syntaxHighlight'

describe('LogViewer', () => {
  it('exibe marcação HTML de uma linha de log como texto, sem criar elementos', () => {
    const payload = '<img src=x onerror="window.__xss = true"><script>window.__xss = true</script>'
    const content = `[WARN] ${payload}`

    const wrapper = mount(LogViewer, {
      props: {
        filteredLogs: [{ id: 1, offset: 0, content, html: syntaxHighlight(content) }],
        isPlaying: true,
        hasTarget: true,
      },
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.find('span.lz-level--warn').text()).toBe('[WARN]')
  })
})
