import { ref, shallowRef, computed, watch, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import type { LogEntry, LogRotation, LogTreeNode, LogTreeTarget, LogViewport } from '@/types'
import { findTargetById } from '@/lib/logTree'
import { makeLineMatcher, type FilterMode } from '@/lib/lineMatcher'
import { syntaxHighlight } from '@/lib/syntaxHighlight'
import {
  byteLength,
  routeChunk,
  splitLines,
  takeLeadingBytes,
  type NavigationState,
  type ParsedLine,
} from '@/lib/logChunks'
import { useLogSocket } from '@/composables/useLogSocket'

const ROTATIONS_STORAGE_KEY = 'logzord:rotations'

type PersistedRotations = Record<string, LogRotation[]>

function loadPersistedRotations(): PersistedRotations {
  try {
    const raw = localStorage.getItem(ROTATIONS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePersistedRotations(map: PersistedRotations) {
  try {
    localStorage.setItem(ROTATIONS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage indisponível (modo privado, quota) — degrada sem persistir
  }
}

const MAX_LOG_ENTRIES = 2000
const DEFAULT_PAGE_LINES = 50
// Estimativa de bytes/linha quando o buffer está vazio; a página é lida com folga de 2× e cortada em N linhas.
const DEFAULT_LINE_BYTES = 200
const PAGE_BYTES_MARGIN = 2

// Contador monotônico: ids únicos como :key do v-for, inclusive entre abas (#36).
let nextEntryId = 0

// O realce é calculado uma vez, na criação da entrada, e não a cada renderização da lista (#36).
function toEntries(lines: ParsedLine[]): LogEntry[] {
  return lines.map((line) => ({
    id: ++nextEntryId,
    offset: line.offset,
    content: line.content,
    html: syntaxHighlight(line.content),
  }))
}

// viewport: área de scroll do log (LogViewer exposto por template ref); sem ela, o stream segue sem rolar.
export function useLogStream(viewport: Ref<LogViewport | null> = ref(null)) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

  function apiUrl(...segments: string[]): string {
    return [API_URL, ...segments.map(encodeURIComponent)].join('/')
  }

  // GET em /api com segmentos codificados; status fora de 2xx vira erro em vez de dado (#38).
  async function getJson<T>(...segments: string[]): Promise<T> {
    const res = await fetch(apiUrl(...segments))
    if (!res.ok) {
      throw new Error(`GET /${segments.join('/')} failed with status ${res.status}`)
    }
    return res.json()
  }

  const tree = ref<LogTreeNode[]>([])
  const selectedTarget = ref<LogTreeTarget | null>(null)
  const isPlaying = ref(false)
  // shallowRef: entradas são imutáveis e toda escrita substitui o array inteiro; mutar no lugar não dispara reatividade.
  const logs = shallowRef<LogEntry[]>([])
  const filterText = ref('')
  const filterMode = ref<FilterMode>('substring')
  const currentWsOffset = ref(0)
  const availableRotations = ref<LogRotation[]>([])
  const rotationsLoading = ref(false)
  const pageLines = ref(DEFAULT_PAGE_LINES)

  let onLogEntries: ((lines: ParsedLine[]) => void) | null = null
  // Fragmento final de LOG_CHUNK ainda sem '\n': só vira linha quando o restante chegar (CA2).
  let pendingLine = ''
  // Guardas de offset (ver StreamCursor em lib/logChunks).
  let expectedOffset: number | null = null
  let navigation: NavigationState = { kind: 'live' }
  // Id do último START_STREAM: o servidor o devolve em LOG_CHUNK/STREAM_END/ERROR e mensagens de outro
  // stream (aba anterior, salto do Fast Forward) são descartadas antes das guardas de offset (#24).
  let streamId = 0
  // Estado de play por aba: os controles comandam só a aba em foco; aba sem estado prévio abre tocando.
  const playStateByTarget = new Map<string, boolean>()
  // Filtro (texto + modo) por aba: editar o campo altera só o filtro da aba em foco.
  const filterByTarget = new Map<string, { text: string, mode: FilterMode }>()
  // Logs e offset por aba: voltar a uma aba retoma de onde parou, sem reler o arquivo nem regravar no Record.
  const streamByTarget = new Map<string, { logs: LogEntry[], offset: number }>()

  watch([filterText, filterMode], ([text, mode]) => {
    if (selectedTarget.value) {
      filterByTarget.set(selectedTarget.value.id, { text, mode })
    }
  }, { flush: 'sync' })

  // Byte inicial da linha mais antiga do buffer: o Rewind lê o trecho anterior a ele.
  const bufferStart = computed(() => {
    const first = logs.value[0]
    return first ? first.offset - byteLength(first.content) - 1 : currentWsOffset.value
  })
  const canRewind = computed(() => !!selectedTarget.value && bufferStart.value > 0)

  const lineMatcher = computed(() => makeLineMatcher(filterText.value, filterMode.value))
  const filterError = computed(() => lineMatcher.value.error)

  const filteredLogs = computed(() => {
    if (!filterText.value) return logs.value
    const { matches } = lineMatcher.value
    return logs.value.filter(log => matches(log.content))
  })

  function applyPersistedRotations(nodes: LogTreeNode[]) {
    const persisted = loadPersistedRotations()
    for (const node of nodes) {
      if (node.type === 'target') {
        const rotations = persisted[node.id]
        if (rotations?.length && !node.children?.length) {
          node.children = rotations.map((rotation) => ({
            type: 'target',
            id: rotation.id,
            label: rotation.label,
            rotationOf: node.id,
          }))
        }
      }
      if (node.children) {
        applyPersistedRotations(node.children)
      }
    }
  }

  async function fetchConfig() {
    try {
      const data = await getJson<{ pageLines: number }>('config')
      if (Number.isInteger(data?.pageLines) && data.pageLines > 0) {
        pageLines.value = data.pageLines
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
    }
  }

  async function fetchTargets() {
    try {
      const data = await getJson<LogTreeNode[]>('targets')
      applyPersistedRotations(data)
      tree.value = data
    } catch (error) {
      console.error('Failed to fetch targets:', error)
    }
  }

  function setPlaying(value: boolean) {
    isPlaying.value = value
    if (selectedTarget.value) {
      playStateByTarget.set(selectedTarget.value.id, value)
    }
  }

  function selectTarget(target: LogTreeTarget) {
    if (isPlaying.value) {
      stopStream()
    }
    if (selectedTarget.value) {
      streamByTarget.set(selectedTarget.value.id, { logs: logs.value, offset: currentWsOffset.value })
    }
    const saved = streamByTarget.get(target.id)
    selectedTarget.value = target
    pendingLine = ''
    navigation = { kind: 'live' }
    const savedFilter = filterByTarget.get(target.id)
    filterText.value = savedFilter?.text ?? ''
    filterMode.value = savedFilter?.mode ?? 'substring'
    logs.value = saved?.logs ?? []
    currentWsOffset.value = saved?.offset ?? 0
    availableRotations.value = []
    setPlaying(playStateByTarget.get(target.id) ?? true)
    if (isPlaying.value) {
      startStream()
    }
  }

  function forgetTarget(id: string) {
    playStateByTarget.delete(id)
    filterByTarget.delete(id)
    streamByTarget.delete(id)
  }

  function clearTarget() {
    if (isPlaying.value) {
      stopStream()
      isPlaying.value = false
    }
    selectedTarget.value = null
    filterText.value = ''
    filterMode.value = 'substring'
    pendingLine = ''
    expectedOffset = null
    navigation = { kind: 'live' }
    logs.value = []
    currentWsOffset.value = 0
    availableRotations.value = []
  }

  async function fetchRotationsFor(target: LogTreeTarget) {
    rotationsLoading.value = true
    try {
      const rotations = await getJson<LogRotation[]>('targets', target.id, 'rotations')
      const addedIds = new Set((target.children ?? []).map((child) => child.id))
      availableRotations.value = rotations.filter((rotation) => !addedIds.has(rotation.id))
    } catch (error) {
      console.error('Failed to fetch rotations:', error)
      availableRotations.value = []
    } finally {
      rotationsLoading.value = false
    }
  }

  function addRotation(target: LogTreeTarget, rotation: LogRotation) {
    const node = findTargetById(tree.value, target.id)
    if (!node) return

    node.children = [
      ...(node.children ?? []),
      { type: 'target', id: rotation.id, label: rotation.label, rotationOf: node.id },
    ]
    availableRotations.value = availableRotations.value.filter((item) => item.id !== rotation.id)

    const persisted = loadPersistedRotations()
    persisted[node.id] = [...(persisted[node.id] ?? []), rotation]
    savePersistedRotations(persisted)
  }

  const { wsState, isOpen, send, connect, disconnect } = useLogSocket(WS_URL, {
    onOpen: () => {
      if (isPlaying.value) {
        startStream()
      }
    },
    onMessage: async (data) => {
      // Mensagem sem streamId (servidor antigo) segue para as guardas de offset, como antes.
      if (data.streamId !== undefined && data.streamId !== streamId) return

      if (data.type === 'LOG_CHUNK') {
        await handleChunk(data.content ?? '', data.offset ?? 0)
      } else if (data.type === 'STREAM_END') {
        // Fim da leitura atual, não do stream: o backend segue em polling do arquivo, então o play continua.
        // O Rewind não conclui aqui: um STREAM_END do stream anterior pode chegar antes da página; ele termina ao alcançar o início do buffer.
        if (navigation.kind === 'fastForwardJump') {
          await finishFastForwardJump()
        }
      } else if (data.type === 'ERROR') {
        console.error('Server error:', data.message)
        setPlaying(false)
      }
    },
  })

  // Uma atribuição por chunk: push+shift por linha num array reativo custava O(n) por linha com o buffer cheio (#24).
  function appendLines(lines: ParsedLine[]) {
    if (lines.length === 0) return
    logs.value = [...logs.value, ...toEntries(lines)].slice(-MAX_LOG_ENTRIES)

    onLogEntries?.(lines)
  }

  async function handleChunk(content: string, end: number) {
    const routed = routeChunk({ expectedOffset, navigation }, content, end)
    expectedOffset = routed.cursor.expectedOffset
    navigation = routed.cursor.navigation

    if (routed.effect.kind === 'finishRewind') {
      finishRewind()
      return
    }
    if (routed.effect.kind !== 'append') return

    const { text } = routed.effect
    // Stick to bottom: só segue o fim se a visão já estava nele antes do chunk; quem rolou para cima fica onde está (#25).
    const follow = isAtBottom()
    const parsed = splitLines(pendingLine + text, end - byteLength(pendingLine + text))
    pendingLine = parsed.pending
    appendLines(parsed.lines)
    // A retomada parte do fim da última linha completa: o fragmento pendente é relido do servidor.
    currentWsOffset.value = end - byteLength(pendingLine)
    // O scroll-smooth foi removido de propósito: cada LOG_CHUNK reiniciava a animação suave.
    // Esperamos o nextTick porque o LogViewer só recebe o novo conteúdo depois do patch do DOM do Vue.
    if (!follow) return
    await nextTick()
    scrollToBottom()
  }

  function finishRewind() {
    if (navigation.kind !== 'rewind') return
    const { start, end, text } = navigation
    navigation = { kind: 'live' }
    expectedOffset = null
    stopStream()

    // Só o trecho [start, end): o que passou do início do buffer já está na tela.
    const page = takeLeadingBytes(text, end - start)
    const lines = splitLines(page, start, start > 0).lines.slice(-pageLines.value)
    let merged = [...toEntries(lines), ...logs.value]
    if (merged.length > MAX_LOG_ENTRIES) {
      // Acima do teto, saem as linhas mais novas; o Play relê a partir da última linha mantida.
      merged = merged.slice(0, MAX_LOG_ENTRIES)
      currentWsOffset.value = merged[merged.length - 1]!.offset
      pendingLine = ''
    }
    logs.value = merged

    onLogEntries?.(lines)

    void nextTick().then(scrollToTop)
  }

  async function finishFastForwardJump() {
    if (navigation.kind !== 'fastForwardJump') return
    const { start, end, text } = navigation
    navigation = { kind: 'live' }

    const parsed = splitLines(text, start, true)
    pendingLine = parsed.pending
    expectedOffset = end
    currentWsOffset.value = end - byteLength(pendingLine)
    logs.value = []
    appendLines(parsed.lines.slice(-pageLines.value))

    await nextTick()
    scrollToBottom()
  }

  function sendStart(extra: Record<string, number> = {}) {
    if (!isOpen() || !selectedTarget.value) return false

    return send({
      type: 'START_STREAM',
      targetId: selectedTarget.value.id,
      offset: currentWsOffset.value,
      streamId: ++streamId,
      ...extra,
    })
  }

  function startStream() {
    navigation = { kind: 'live' }
    // O servidor reenvia a partir de currentWsOffset, que exclui o fragmento pendente; o trecho repetido é recortado.
    if (sendStart()) {
      expectedOffset = currentWsOffset.value + byteLength(pendingLine)
    }
  }

  function stopStream() {
    expectedOffset = null
    send({ type: 'PAUSE_STREAM' })
  }

  // Bytes estimados para N linhas, pela média do buffer, com folga para o corte exato em linhas.
  function pageBytes(): number {
    const sample = logs.value
    const average = sample.length
      ? sample.reduce((total, log) => total + byteLength(log.content) + 1, 0) / sample.length
      : DEFAULT_LINE_BYTES
    return Math.ceil(pageLines.value * average * PAGE_BYTES_MARGIN)
  }

  // Rewind: carrega a página anterior ao início do buffer e pausa.
  function rewind() {
    if (!canRewind.value || !isOpen()) return
    const end = bufferStart.value
    const start = Math.max(0, end - pageBytes())

    setPlaying(false)
    navigation = { kind: 'rewind', start, end, text: '' }
    expectedOffset = start
    send({
      type: 'START_STREAM',
      targetId: selectedTarget.value!.id,
      offset: start,
      streamId: ++streamId,
    })
  }

  // Fast Forward: vai para a cauda do arquivo (nunca recua) e segue tocando ao vivo.
  function fastForward() {
    if (!selectedTarget.value) return
    setPlaying(true)
    if (sendStart({ fromEnd: pageBytes() })) {
      navigation = { kind: 'fastForward' }
      expectedOffset = currentWsOffset.value + byteLength(pendingLine)
    }
  }

  function togglePlay() {
    if (!selectedTarget.value) return
    setPlaying(!isPlaying.value)
    if (isPlaying.value) {
      startStream()
    } else {
      stopStream()
    }
  }

  // O backend responde com Content-Disposition (e .gz acima de 5MB, CA5): o browser baixa por stream.
  function downloadLog() {
    if (!selectedTarget.value) return
    const a = document.createElement('a')
    a.href = apiUrl('targets', selectedTarget.value.id, 'download')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function isAtBottom(): boolean {
    return viewport.value?.isAtBottom() ?? true
  }

  function scrollToBottom() {
    viewport.value?.scrollToBottom()
  }

  function scrollToTop() {
    viewport.value?.scrollToTop()
  }

  // Um callback por chunk com todas as suas linhas: a gravação no Quadro faz uma escrita por lote (#37).
  function setOnLogEntries(callback: ((lines: ParsedLine[]) => void) | null) {
    onLogEntries = callback
  }

  onMounted(() => {
    fetchConfig()
    fetchTargets()
    connect()
  })

  onUnmounted(disconnect)

  return {
    tree,
    selectedTarget,
    isPlaying,
    logs,
    filterText,
    filterMode,
    lineMatcher,
    filterError,
    filteredLogs,
    currentWsOffset,
    WS_URL,
    wsState,
    availableRotations,
    rotationsLoading,
    selectTarget,
    clearTarget,
    forgetTarget,
    togglePlay,
    rewind,
    fastForward,
    canRewind,
    pageLines,
    downloadLog,
    setOnLogEntries,
    fetchRotationsFor,
    addRotation,
  }
}
