import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TargetsSection from './TargetsSection.vue'

const targets = [
  { id: 'app', name: 'Application log', path: '/var/log/app.log' },
]

describe('TargetsSection', () => {
  it('selects a target when it is clicked', async () => {
    const wrapper = mount(TargetsSection, {
      props: {
        targets,
        selectedTarget: null,
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('select-target')).toEqual([[targets[0]]])
  })
})
