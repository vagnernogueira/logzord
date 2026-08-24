import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { LogEntry, LogRotation, LogTreeNode, LogTreeTarget } from '@/types'
import { findTargetById, firstTarget } from '@/lib/logTree'

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

  let ws: WebSocket | null = null
  let onLogEntry: ((line: string, offset: number) => void) | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true

  const filteredLogs = computed(() => {
    if (!filterText.value) return logs.value
    return logs.value.filter(log => log.content.includes(filterText.value))
  })

  function syntaxHighlight(content: string): string {
    return content
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

  async function fetchTargets() {
    try {
      const res = await fetch(`${API_URL}/targets`)
      const data: LogTreeNode[] = await res.json()
      applyPersistedRotations(data)
      tree.value = data
      const first = firstTarget(tree.value)
      if (first) {
        selectTarget(first)
      }
    } catch (error) {
      console.error('Failed to fetch targets:', error)
    }
  }

  function selectTarget(target: LogTreeTarget) {
    selectedTarget.value = target
    logs.value = []
    currentWsOffset.value = 0
    availableRotations.value = []
    if (isPlaying.value) {
      stopStream()
      startStream()
    }
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
        const lines = data.content.split('\n')
        for (const line of lines) {
          if (!line.trim()) continue

          const logEntry: LogEntry = {
            id: Math.random().toString(36).substring(7),
            offset: data.offset,
            content: line,
          }
          logs.value.push(logEntry)

          if (logs.value.length > 2000) {
            logs.value.shift()
          }

          if (onLogEntry) {
            onLogEntry(line, data.offset)
          }
        }
        currentWsOffset.value = data.offset
        scrollToBottom()
      } else if (data.type === 'STREAM_END') {
        isPlaying.value = false
      } else if (data.type === 'ERROR') {
        console.error('Server error:', data.message)
        isPlaying.value = false
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

  function startStream() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!selectedTarget.value) return

    ws.send(JSON.stringify({
      type: 'START_STREAM',
      targetId: selectedTarget.value.id,
      offset: currentWsOffset.value,
    }))
  }

  function stopStream() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(JSON.stringify({
      type: 'PAUSE_STREAM',
    }))
  }

  function togglePlay() {
    isPlaying.value = !isPlaying.value
    if (isPlaying.value) {
      startStream()
    } else {
      stopStream()
    }
  }

  function scrollToBottom() {
    const container = document.getElementById('log-container')
    if (container) {
      container.scrollTop = container.scrollHeight
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
    togglePlay,
    syntaxHighlight,
    setOnLogEntry,
    getWsState,
    fetchRotationsFor,
    addRotation,
  }
}
