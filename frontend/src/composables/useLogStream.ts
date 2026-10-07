import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { LogEntry, LogRotation, LogTreeNode, LogTreeTarget } from '@/types'
import { findTargetById } from '@/lib/logTree'

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const utf8 = new TextEncoder()
const utf8Decoder = new TextDecoder()

const MAX_LOG_ENTRIES = 2000
const DEFAULT_PAGE_LINES = 50
// Estimativa de bytes/linha quando o buffer está vazio; a página é lida com folga de 2× e cortada em N linhas.
const DEFAULT_LINE_BYTES = 200
const PAGE_BYTES_MARGIN = 2

function byteLength(value: string): number {
  return utf8.encode(value).length
}

// Remove os primeiros `bytes` bytes do texto (o trecho que já foi recebido).
function dropLeadingBytes(value: string, bytes: number): string {
  return bytes > 0 ? utf8Decoder.decode(utf8.encode(value).slice(bytes)) : value
}

interface ParsedLine {
  content: string
  offset: number
}

// Separa o texto em linhas completas com o byte final de cada uma; o resto sem '\n' volta como pending.
// dropFirst descarta a primeira linha, parcial quando a leitura começa no meio dela (Rewind/FF).
function splitLines(text: string, textStart: number, dropFirst = false) {
  const parts = text.split('\n')
  const pending = parts.pop() ?? ''
  const lines: ParsedLine[] = []
  let lineEndOffset = textStart
  parts.forEach((line, index) => {
    lineEndOffset += byteLength(line) + 1
    if (dropFirst && index === 0) return
    if (!line.trim()) return
    lines.push({ content: line, offset: lineEndOffset })
  })
  return { lines, pending }
}

type NavigationState =
  | { kind: 'live' }
  // Rewind: lê [start, end) e pausa; end é o início do buffer atual.
  | { kind: 'rewind', start: number, end: number, text: string }
  // Fast Forward antes de o servidor revelar se saltou ou continuou do offset atual.
  | { kind: 'fastForward' }
  // Fast Forward com salto: acumula a cauda até o STREAM_END e só então substitui o buffer.
  | { kind: 'fastForwardJump', start: number, end: number, text: string }

export function useLogStream() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

  const tree = ref<LogTreeNode[]>([])
  const selectedTarget = ref<LogTreeTarget | null>(null)
  const isPlaying = ref(false)
  const logs = ref<LogEntry[]>([])
  const filterText = ref('')
  const currentWsOffset = ref(0)
  const wsState = ref<WebSocket['readyState']>(WebSocket.CLOSED)
  const availableRotations = ref<LogRotation[]>([])
  const rotationsLoading = ref(false)
  const pageLines = ref(DEFAULT_PAGE_LINES)

  let ws: WebSocket | null = null
  let onLogEntry: ((line: string, offset: number) => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true
  // Fragmento final de LOG_CHUNK ainda sem '\n': só vira linha quando o restante chegar (CA2).
  let pendingLine = ''
  // Byte do arquivo onde começa o próximo conteúdo inédito; null descarta chunks (pausado).
  // Chunks de streams anteriores ainda em voo trazem bytes reais do arquivo: sobreposição é recortada, lacuna é descartada.
  let expectedOffset: number | null = null
  let navigation: NavigationState = { kind: 'live' }
  // Estado de play por aba: os controles comandam só a aba em foco; aba sem estado prévio abre tocando.
  const playStateByTarget = new Map<string, boolean>()
  // Filtro por aba: editar o campo altera só o filtro da aba em foco.
  const filterByTarget = new Map<string, string>()
  // Logs e offset por aba: voltar a uma aba retoma de onde parou, sem reler o arquivo nem regravar no Record.
  const streamByTarget = new Map<string, { logs: LogEntry[], offset: number }>()

  watch(filterText, (value) => {
    if (selectedTarget.value) {
      filterByTarget.set(selectedTarget.value.id, value)
    }
  }, { flush: 'sync' })

  // Byte inicial da linha mais antiga do buffer: o Rewind lê o trecho anterior a ele.
  const bufferStart = computed(() => {
    const first = logs.value[0]
    return first ? first.offset - byteLength(first.content) - 1 : currentWsOffset.value
  })
  const canRewind = computed(() => !!selectedTarget.value && bufferStart.value > 0)

  const filteredLogs = computed(() => {
    if (!filterText.value) return logs.value
    return logs.value.filter(log => log.content.includes(filterText.value))
  })

  // O resultado vai para v-html: escapar o conteúdo do log antes de injetar os spans de realce.
  function syntaxHighlight(content: string): string {
    return escapeHtml(content)
      .replace(/\[ERROR\]/g, '<span class="text-red-500 font-bold">[ERROR]</span>')
      .replace(/\[WARN\]/g, '<span class="text-yellow-500 font-bold">[WARN]</span>')
      .replace(/\[INFO\]/g, '<span class="text-blue-500 font-bold">[INFO]</span>')
      .replace(/(ORA-\d+)/g, '<span class="text-red-600 font-bold bg-red-100 px-1 rounded">$1</span>')
  }

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
      const res = await fetch(`${API_URL}/config`)
      const data = await res.json()
      if (Number.isInteger(data?.pageLines) && data.pageLines > 0) {
        pageLines.value = data.pageLines
      }
    } catch (error) {
      console.error('Failed to fetch config:', error)
    }
  }

  async function fetchTargets() {
    try {
      const res = await fetch(`${API_URL}/targets`)
      const data: LogTreeNode[] = await res.json()
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
    filterText.value = filterByTarget.get(target.id) ?? ''
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
      const res = await fetch(`${API_URL}/targets/${target.id}/rotations`)
      const rotations: LogRotation[] = await res.json()
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

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect() {
    if (!shouldReconnect || reconnectTimer) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWebSocket()
    }, 5000)
  }

  function connectWebSocket() {
    clearReconnectTimer()
    ws = new WebSocket(WS_URL)
    wsState.value = ws.readyState

    ws.onopen = () => {
      console.log('Connected to WS')
      wsState.value = ws?.readyState ?? WebSocket.OPEN
      if (isPlaying.value) {
        startStream()
      }
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'LOG_CHUNK') {
        await handleChunk(data.content, data.offset)
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
    }

    ws.onclose = () => {
      console.log('Disconnected from WS')
      wsState.value = ws?.readyState ?? WebSocket.CLOSED
      scheduleReconnect()
    }

    ws.onerror = () => {
      wsState.value = ws?.readyState ?? WebSocket.CLOSED
    }
  }

  function appendLines(lines: ParsedLine[]) {
    for (const line of lines) {
      logs.value.push({
        id: Math.random().toString(36).substring(7),
        offset: line.offset,
        content: line.content,
      })

      if (logs.value.length > MAX_LOG_ENTRIES) {
        logs.value.shift()
      }

      if (onLogEntry) {
        onLogEntry(line.content, line.offset)
      }
    }
  }

  async function handleChunk(content: string, end: number) {
    if (expectedOffset === null) return
    const start = end - byteLength(content)

    if (navigation.kind === 'fastForwardJump') {
      if (start > navigation.end || end <= navigation.end) return
      navigation.text += dropLeadingBytes(content, navigation.end - start)
      navigation.end = end
      return
    }

    if (end <= expectedOffset) return
    if (start > expectedOffset) {
      // Lacuna só é legítima no Fast Forward: o servidor pulou para a cauda do arquivo.
      if (navigation.kind === 'fastForward') {
        navigation = { kind: 'fastForwardJump', start, end, text: content }
      }
      return
    }

    const text = dropLeadingBytes(content, expectedOffset - start)
    expectedOffset = end

    if (navigation.kind === 'rewind') {
      navigation.text += text
      if (end >= navigation.end) {
        finishRewind()
      }
      return
    }

    // Continuação do offset atual: o Fast Forward sem salto vira um Play comum.
    navigation = { kind: 'live' }
    const parsed = splitLines(pendingLine + text, end - byteLength(pendingLine + text))
    pendingLine = parsed.pending
    appendLines(parsed.lines)
    // A retomada parte do fim da última linha completa: o fragmento pendente é relido do servidor.
    currentWsOffset.value = end - byteLength(pendingLine)
    // O scroll-smooth foi removido de propósito: cada LOG_CHUNK reiniciava a animação suave.
    // Esperamos o nextTick porque o #log-container só recebe o novo conteúdo depois do patch do DOM do Vue.
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
    const page = utf8Decoder.decode(utf8.encode(text).slice(0, end - start))
    const lines = splitLines(page, start, start > 0).lines.slice(-pageLines.value)
    const entries = lines.map((line) => ({
      id: Math.random().toString(36).substring(7),
      offset: line.offset,
      content: line.content,
    }))
    let merged = [...entries, ...logs.value]
    if (merged.length > MAX_LOG_ENTRIES) {
      // Acima do teto, saem as linhas mais novas; o Play relê a partir da última linha mantida.
      merged = merged.slice(0, MAX_LOG_ENTRIES)
      currentWsOffset.value = merged[merged.length - 1]!.offset
      pendingLine = ''
    }
    logs.value = merged

    if (onLogEntry) {
      for (const line of lines) onLogEntry(line.content, line.offset)
    }

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
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (!selectedTarget.value) return false

    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: selectedTarget.value.id,
      offset: currentWsOffset.value,
      ...extra,
    }))
    return true
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(JSON.stringify({
      type: 'PAUSE_STREAM',
    }))
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
    if (!canRewind.value || !ws || ws.readyState !== WebSocket.OPEN) return
    const end = bufferStart.value
    const start = Math.max(0, end - pageBytes())

    setPlaying(false)
    navigation = { kind: 'rewind', start, end, text: '' }
    expectedOffset = start
    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: selectedTarget.value!.id,
      offset: start,
    }))
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
    a.href = `${API_URL}/targets/${encodeURIComponent(selectedTarget.value.id)}/download`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function scrollToBottom() {
    const container = document.getElementById('log-container')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }

  function scrollToTop() {
    const container = document.getElementById('log-container')
    if (container) {
      container.scrollTop = 0
    }
  }

  function setOnLogEntry(callback: ((line: string, offset: number) => void) | null) {
    onLogEntry = callback
  }

  function getWsState(): number | undefined {
    return wsState.value
  }

  onMounted(() => {
    shouldReconnect = true
    fetchConfig()
    fetchTargets()
    connectWebSocket()
  })

  onUnmounted(() => {
    shouldReconnect = false
    clearReconnectTimer()
    if (ws) ws.close()
  })

  return {
    tree,
    selectedTarget,
    isPlaying,
    logs,
    filterText,
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
    syntaxHighlight,
    setOnLogEntry,
    getWsState,
    fetchRotationsFor,
    addRotation,
  }
}
