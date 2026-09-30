import { ref, computed, onMounted, type Ref } from 'vue'
import Dexie from 'dexie'

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

  async function recordLine(line: string, offset: number, filterText: string) {
    if (!isRecording.value) return
    if (filterText && !line.includes(filterText)) return

    await db.table('recordedLogs').add({
      content: line,
      offset,
    })
    recordedCount.value = await db.table('recordedLogs').count()
  }

  async function clearRecord() {
    await db.table('recordedLogs').clear()
    recordedCount.value = 0
  }

  async function exportRecord() {
    const allRecords = await db.table('recordedLogs').toArray()
    if (allRecords.length === 0) {
      alert('Nenhum log gravado no Quadro de Analise.')
      return
    }

    const content = allRecords.map((r: { content: string }) => r.content).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })

    if (blob.size > 5 * 1024 * 1024) {
      downloadBlob(blob, 'logzord_analysis.txt')
      alert('Arquivo grande! Seria compactado para .zip ou .gz conforme CA 5.')
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

  async function initCount() {
    recordedCount.value = await db.table('recordedLogs').count()
  }

  onMounted(() => {
    initCount()
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
