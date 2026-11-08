import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import Dexie, { liveQuery } from 'dexie'
import { gzipBlob } from '@/lib/gzip'

// CA5: exports acima de 5MB saem em .gz.
export const COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024

export function useRecording(activeTargetId: Ref<string | null>) {
  const db = new Dexie('LogzordAnalysisDB')
  db.version(1).stores({
    recordedLogs: '++id, content, offset',
  })

  // Gravação por aba: o botão comanda só a aba em foco; o Quadro de Análise (IndexedDB) é único.
  const recordingTargetIds = ref(new Set<string>())
  const isRecording = computed(() => !!activeTargetId.value && recordingTargetIds.value.has(activeTargetId.value))
  const recordedCount = ref(0)

  function toggleRecord() {
    const id = activeTargetId.value
    if (!id) return
    if (recordingTargetIds.value.has(id)) {
      recordingTargetIds.value.delete(id)
    } else {
      recordingTargetIds.value.add(id)
    }
  }

  function forgetTarget(id: string) {
    recordingTargetIds.value.delete(id)
  }

  // `matches` é o mesmo critério do filtro da tela (lib/lineMatcher): o Quadro guarda só o que está visível.
  async function recordLine(line: string, offset: number, matches: (line: string) => boolean) {
    if (!isRecording.value) return
    if (!matches(line)) return

    await db.table('recordedLogs').add({
      content: line,
      offset,
    })
  }

  async function clearRecord() {
    await db.table('recordedLogs').clear()
  }

  async function exportRecord() {
    const allRecords = await db.table('recordedLogs').toArray()
    if (allRecords.length === 0) {
      alert('Nenhum log gravado no Quadro de Analise.')
      return
    }

    const content = allRecords.map((r: { content: string }) => r.content).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })

    if (blob.size > COMPRESSION_THRESHOLD_BYTES) {
      downloadBlob(await gzipBlob(blob), 'logzord_analysis.txt.gz')
    } else {
      downloadBlob(blob, 'logzord_analysis.txt')
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // O Quadro persiste no IndexedDB do browser e é compartilhado entre abas: liveQuery reemite a contagem
  // a cada escrita, inclusive as feitas por outra aba, e é a única fonte de recordedCount.
  let countSubscription: { unsubscribe: () => void } | null = null

  onMounted(() => {
    countSubscription = liveQuery(() => db.table('recordedLogs').count()).subscribe({
      next: (count) => { recordedCount.value = count },
      error: (err) => console.error('Falha ao observar o Quadro de Análise:', err),
    })
  })

  onUnmounted(() => {
    countSubscription?.unsubscribe()
    countSubscription = null
  })

  return {
    isRecording,
    recordedCount,
    toggleRecord,
    forgetTarget,
    recordLine,
    clearRecord,
    exportRecord,
  }
}
