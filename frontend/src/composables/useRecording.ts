import { ref, computed, onMounted, onUnmounted, type Ref } from 'vue'
import Dexie, { liveQuery } from 'dexie'
import { gzipBlob } from '@/lib/gzip'
import type { ParsedLine } from '@/composables/useLogStream'

// CA5: exports acima de 5MB saem em .gz.
export const COMPRESSION_THRESHOLD_BYTES = 5 * 1024 * 1024

export const EXPORT_PAGE_SIZE = 10_000

export const ANALYSIS_DB_NAME = 'LogzordAnalysisDB'

export function useRecording(activeTargetId: Ref<string | null>) {
  const db = new Dexie(ANALYSIS_DB_NAME)
  // v2 (#37): só a chave primária. A v1 indexava content e offset sem nenhuma consulta usá-los;
  // a migração apenas remove os índices e preserva as linhas.
  db.version(2).stores({
    recordedLogs: '++id',
  })

  // Gravação por aba: o botão comanda só a aba em foco; o Quadro de Análise (IndexedDB) é único.
  const recordingTargetIds = ref(new Set<string>())
  const isRecording = computed(() => !!activeTargetId.value && recordingTargetIds.value.has(activeTargetId.value))
  const recordedCount = ref(0)
  // Última falha de escrita no Quadro (quota, modo privado...); some na próxima escrita bem-sucedida.
  const recordError = ref<string | null>(null)

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
  // Uma escrita (bulkAdd) por chunk. Nunca rejeita: a falha vira log + recordError.
  async function recordLines(lines: ParsedLine[], matches: (line: string) => boolean) {
    if (!isRecording.value) return
    const rows = lines
      .filter((line) => matches(line.content))
      .map(({ content, offset }) => ({ content, offset }))
    if (rows.length === 0) return

    try {
      await db.table('recordedLogs').bulkAdd(rows)
      recordError.value = null
    } catch (err) {
      console.error('Falha ao gravar no Quadro de Análise:', err)
      recordError.value = err instanceof Error && err.message ? err.message : String(err)
    }
  }

  async function clearRecord() {
    await db.table('recordedLogs').clear()
    recordError.value = null
  }

  // Leitura paginada pela chave primária, uma parte de Blob por página: o export nunca monta uma string
  // única com o Quadro inteiro, o que travava a aba com centenas de milhares de linhas (#24).
  async function exportRecord() {
    const table = db.table('recordedLogs')
    const parts: Blob[] = []
    let lastId = 0
    for (;;) {
      const page: Array<{ id: number, content: string }> = await table
        .where('id').above(lastId).limit(EXPORT_PAGE_SIZE).toArray()
      if (page.length === 0) break
      const text = page.map((r) => r.content).join('\n')
      parts.push(new Blob([parts.length > 0 ? `\n${text}` : text]))
      lastId = page[page.length - 1]!.id
      if (page.length < EXPORT_PAGE_SIZE) break
    }

    if (parts.length === 0) {
      alert('Nenhum log gravado no Quadro de Analise.')
      return
    }

    const blob = new Blob(parts, { type: 'text/plain' })

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
    recordError,
    toggleRecord,
    forgetTarget,
    recordLines,
    clearRecord,
    exportRecord,
  }
}
