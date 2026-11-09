import 'fake-indexeddb/auto'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { ANALYSIS_DB_NAME, useRecording } from './useRecording'

// IndexedDB real (fake-indexeddb) e Dexie real: valida a migração do schema v1 para v2 (#37).
describe('useRecording — migração do Quadro v1 → v2', () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await Dexie.delete(ANALYSIS_DB_NAME)
  })

  it('um Quadro gravado na v1 continua exportável e gravável após o upgrade', async () => {
    const legacy = new Dexie(ANALYSIS_DB_NAME)
    legacy.version(1).stores({ recordedLogs: '++id, content, offset' })
    await legacy.table('recordedLogs').bulkAdd([
      { content: 'antiga 1', offset: 9 },
      { content: 'antiga 2', offset: 18 },
    ])
    legacy.close()

    let downloaded: Blob | null = null
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => { downloaded = blob; return 'blob:x' },
      revokeObjectURL: () => {},
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const activeTargetId = ref<string | null>('app')
    let recording: ReturnType<typeof useRecording> | null = null
    const wrapper = mount(defineComponent({
      setup() {
        recording = useRecording(activeTargetId)
        return () => h('div')
      },
    }))

    recording!.toggleRecord()
    await recording!.recordLines([{ content: 'nova', offset: 27 }], () => true)
    expect(recording!.recordError.value).toBeNull()
    await recording!.exportRecord()

    expect(await downloaded!.text()).toBe('antiga 1\nantiga 2\nnova')

    wrapper.unmount()
    const migrated = new Dexie(ANALYSIS_DB_NAME)
    await migrated.open()
    expect(migrated.verno).toBe(2)
    expect(migrated.table('recordedLogs').schema.indexes).toHaveLength(0)
    migrated.close()
  })
})
