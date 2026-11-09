import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { bulkAddMock, records, pageReads, gzipBlobMock, liveQueryMock, liveCount } = vi.hoisted(() => {
  // Observable mínimo: simula o liveQuery do Dexie, que reemite a contagem a cada escrita (de qualquer aba).
  const liveCount = {
    observers: new Set<{ next: (value: number) => void }>(),
    emit(value: number) {
      liveCount.observers.forEach(o => o.next(value))
    },
  }
  return {
    bulkAddMock: vi.fn(),
    // Conteúdo do Quadro para o export; ids crescentes como o '++id' do Dexie.
    records: [] as Array<{ id: number, content: string }>,
    pageReads: { count: 0 },
    gzipBlobMock: vi.fn(async () => new Blob(['gz'], { type: 'application/gzip' })),
    liveCount,
    liveQueryMock: vi.fn(() => ({
      subscribe(observer: { next: (value: number) => void }) {
        liveCount.observers.add(observer)
        return { unsubscribe: () => liveCount.observers.delete(observer) }
      },
    })),
  }
})

vi.mock('@/lib/gzip', () => ({ gzipBlob: gzipBlobMock }))

vi.mock('dexie', () => ({
  liveQuery: liveQueryMock,
  default: class {
    version() {
      return { stores: () => {} }
    }
    table() {
      return {
        bulkAdd: bulkAddMock,
        // where('id').above(x).limit(n).toArray(): a leitura paginada do export.
        where: () => ({
          above: (lastId: number) => ({
            limit: (n: number) => ({
              toArray: async () => {
                pageReads.count++
                return records.filter(r => r.id > lastId).slice(0, n)
              },
            }),
          }),
        }),
      }
    }
  },
}))

import { COMPRESSION_THRESHOLD_BYTES, EXPORT_PAGE_SIZE, useRecording } from './useRecording'

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
    bulkAddMock.mockReset()
    liveCount.observers.clear()
    activeTargetId.value = null
  })

  it('não altera a gravação sem aba em foco', () => {
    mount(TestHarness)

    recording!.toggleRecord()

    expect(recording!.isRecording.value).toBe(false)
  })

  const line = (content: string, offset: number) => ({ content, offset })

  it('grava somente enquanto a aba que ativou a gravação está em foco', async () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()
    expect(recording!.isRecording.value).toBe(true)

    activeTargetId.value = 'worker'
    expect(recording!.isRecording.value).toBe(false)
    await recording!.recordLines([line('linha do worker', 10)], () => true)
    expect(bulkAddMock).not.toHaveBeenCalled()

    activeTargetId.value = 'app'
    await recording!.recordLines([line('linha do app', 20)], () => true)
    await flushPromises()
    expect(bulkAddMock).toHaveBeenCalledWith([{ content: 'linha do app', offset: 20 }])
  })

  it('grava somente as linhas aceitas pelo matcher do filtro', async () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()
    const matches = (content: string) => content.startsWith('ERROR')

    await recording!.recordLines([line('INFO ok', 1), line('ERROR falhou', 2)], matches)
    await recording!.recordLines([line('INFO só', 3)], matches)

    expect(bulkAddMock).toHaveBeenCalledTimes(1)
    expect(bulkAddMock).toHaveBeenCalledWith([{ content: 'ERROR falhou', offset: 2 }])
  })

  it('um chunk de N linhas vira uma única escrita', async () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()
    const chunk = Array.from({ length: 500 }, (_, i) => line(`l${i}`, i))

    await recording!.recordLines(chunk, () => true)

    expect(bulkAddMock).toHaveBeenCalledTimes(1)
    expect(bulkAddMock.mock.calls[0]![0]).toHaveLength(500)
  })

  it('falha da escrita não rejeita: vira log e recordError, limpo na próxima escrita', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()
    bulkAddMock.mockRejectedValueOnce(new Error('QuotaExceededError'))

    await expect(recording!.recordLines([line('x', 1)], () => true)).resolves.toBeUndefined()
    expect(recording!.recordError.value).toBe('QuotaExceededError')
    expect(consoleError).toHaveBeenCalled()

    bulkAddMock.mockResolvedValueOnce(undefined)
    await recording!.recordLines([line('y', 2)], () => true)
    expect(recording!.recordError.value).toBeNull()
    consoleError.mockRestore()
  })

  it('recordedCount acompanha a contagem emitida pelo liveQuery, inclusive escritas de outra aba', () => {
    mount(TestHarness)
    expect(liveCount.observers.size).toBe(1)

    liveCount.emit(3)
    expect(recording!.recordedCount.value).toBe(3)

    liveCount.emit(0)
    expect(recording!.recordedCount.value).toBe(0)
  })

  it('cancela a observação da contagem ao desmontar', () => {
    const wrapper = mount(TestHarness)
    expect(liveCount.observers.size).toBe(1)

    wrapper.unmount()

    expect(liveCount.observers.size).toBe(0)
  })

  it('forgetTarget descarta o estado de gravação da aba', () => {
    mount(TestHarness)
    activeTargetId.value = 'app'
    recording!.toggleRecord()

    recording!.forgetTarget('app')

    expect(recording!.isRecording.value).toBe(false)
  })

  describe('exportRecord', () => {
    let downloaded: Blob | null = null

    function setRecords(contents: string[]) {
      records.length = 0
      contents.forEach((content, i) => records.push({ id: i + 1, content }))
      pageReads.count = 0
    }

    function captureDownloads() {
      const names: string[] = []
      vi.stubGlobal('URL', {
        createObjectURL: (blob: Blob) => { downloaded = blob; return 'blob:x' },
        revokeObjectURL: () => {},
      })
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
      setRecords(['linha 1', 'linha 2'])
      mount(TestHarness)

      await recording!.exportRecord()

      expect(gzipBlobMock).not.toHaveBeenCalled()
      expect(names).toEqual(['logzord_analysis.txt'])
      expect(await downloaded!.text()).toBe('linha 1\nlinha 2')
    })

    it('lê o Quadro em páginas e junta as linhas na ordem, sem separador sobrando entre páginas', async () => {
      const names = captureDownloads()
      const contents = Array.from({ length: EXPORT_PAGE_SIZE * 2 + 1 }, (_, i) => `l${i}`)
      setRecords(contents)
      mount(TestHarness)

      await recording!.exportRecord()

      expect(pageReads.count).toBe(3)
      expect(names).toEqual(['logzord_analysis.txt'])
      expect(await downloaded!.text()).toBe(contents.join('\n'))
    })

    it('Quadro vazio não baixa nada', async () => {
      const names = captureDownloads()
      vi.stubGlobal('alert', vi.fn())
      setRecords([])
      mount(TestHarness)

      await recording!.exportRecord()

      expect(names).toEqual([])
      expect(alert).toHaveBeenCalledOnce()
    })

    it('comprime em .gz acima do limite', async () => {
      const names = captureDownloads()
      setRecords(['x'.repeat(COMPRESSION_THRESHOLD_BYTES + 1)])
      mount(TestHarness)

      await recording!.exportRecord()

      expect(gzipBlobMock).toHaveBeenCalledOnce()
      expect(names).toEqual(['logzord_analysis.txt.gz'])
    })
  })
})
