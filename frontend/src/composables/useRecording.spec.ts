import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { addMock, toArrayMock, gzipBlobMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  toArrayMock: vi.fn(),
  gzipBlobMock: vi.fn(async () => new Blob(['gz'], { type: 'application/gzip' })),
}))

vi.mock('@/lib/gzip', () => ({ gzipBlob: gzipBlobMock }))

vi.mock('dexie', () => ({
  default: class {
    version() {
      return { stores: () => {} }
    }
    table() {
      return { add: addMock, toArray: toArrayMock, count: async () => addMock.mock.calls.length }
    }
  },
}))

import { COMPRESSION_THRESHOLD_BYTES, useRecording } from './useRecording'

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

  describe('exportRecord', () => {
    function captureDownloads() {
      const names: string[] = []
      vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} })
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download)
      })
      return names
    }

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      gzipBlobMock.mockClear()
    })

    it('baixa .txt sem compressão até o limite', async () => {
      const names = captureDownloads()
      toArrayMock.mockResolvedValue([{ content: 'linha 1' }, { content: 'linha 2' }])
      mount(TestHarness)

      await recording!.exportRecord()

      expect(gzipBlobMock).not.toHaveBeenCalled()
      expect(names).toEqual(['logzord_analysis.txt'])
    })

    it('comprime em .gz acima do limite', async () => {
      const names = captureDownloads()
      toArrayMock.mockResolvedValue([{ content: 'x'.repeat(COMPRESSION_THRESHOLD_BYTES + 1) }])
      mount(TestHarness)

      await recording!.exportRecord()

      expect(gzipBlobMock).toHaveBeenCalledOnce()
      expect(names).toEqual(['logzord_analysis.txt.gz'])
    })
  })
})
