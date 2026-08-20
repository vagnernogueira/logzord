import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppSidebar from './AppSidebar.vue'

describe('AppSidebar', () => {
  it('renders the configured targets and recording count', () => {
    const wrapper = mount(AppSidebar, {
      props: {
        targets: [{ id: 'sample', name: 'Sample', path: 'wkr/sample.log' }],
        selectedTarget: null,
        recordedCount: 3,
        isRecording: false,
      },
    })

    expect(wrapper.text()).toContain('Sample')
    expect(wrapper.text()).toContain('3')
  })
})
