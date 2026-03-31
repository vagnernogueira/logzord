import { ref, onMounted } from 'vue'
import Dexie from 'dexie'

export function useRecording() {
  const db = new Dexie('LogzordAnalysisDB')
  db.version(1).stores({
    recordedLogs: '++id, content, offset',
  })

  const isRecording = ref(false)
  const recordedCount = ref(0)

  function toggleRecord() {
    isRecording.value = !isRecording.value
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
    recordLine,
    clearRecord,
    exportRecord,
  }
}
