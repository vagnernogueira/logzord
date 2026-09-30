import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addMock } = vi.hoisted(() => ({ addMock: vi.fn() }))

vi.mock('dexie', () => ({
  default: class {
    version() {
      return { stores: () => {} }
    }
    table() {
      return { add: addMock, count: async () => addMock.mock.calls.length }
    }
  },
}))

import { useRecording } from './useRecording'

const activeTargetId = ref<string | null>(null)
let recording: ReturnType<typeof useRecording> | null = null

const TestHarness = defineComponent({
  name: 'TestHarness',
  setup() {
    recording = useRecording(activeTargetId)
    return () => h('div')
  },
})

describe('useRecording', () => {
  beforeEach(() => {
    addMock.mockReset()
    activeTargetId.value = null
  })

  it('não altera a gravação sem aba em foco', () => {
    mount(TestHarness)

    recording!.toggleRecord()

    expect(recording!.isRecording.value).toBe(false)
  })

  it('grava somente enquanto a aba que ativou a gravação está em foco', async () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()
    expect(recording!.isRecording.value).toBe(true)

    activeTargetId.value = 'worker'
    expect(recording!.isRecording.value).toBe(false)
    await recording!.recordLine('linha do worker', 10, '')
    expect(addMock).not.toHaveBeenCalled()

    activeTargetId.value = 'app'
    await recording!.recordLine('linha do app', 20, '')
    await flushPromises()
    expect(addMock).toHaveBeenCalledWith({ content: 'linha do app', offset: 20 })
  })

  it('forgetTarget descarta o estado de gravação da aba', () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()

    recording!.forgetTarget('app')

    expect(recording!.isRecording.value).toBe(false)
  })
})
