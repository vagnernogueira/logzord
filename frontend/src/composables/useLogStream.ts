import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Target, LogEntry } from '@/types'

export function useLogStream() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

  const targets = ref<Target[]>([])
  const selectedTarget = ref<Target | null>(null)
  const isPlaying = ref(false)
  const logs = ref<LogEntry[]>([])
  const filterText = ref('')
  const currentWsOffset = ref(0)
  const wsState = ref<WebSocket['readyState']>(WebSocket.CLOSED)

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

  async function fetchTargets() {
    try {
      const res = await fetch(`${API_URL}/targets`)
      targets.value = await res.json()
      if (targets.value.length > 0) {
        selectTarget(targets.value[0])
      }
    } catch (error) {
      console.error('Failed to fetch targets:', error)
    }
  }

  function selectTarget(target: Target) {
    selectedTarget.value = target
    logs.value = []
    currentWsOffset.value = 0
    if (isPlaying.value) {
      stopStream()
      startStream()
    }
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
    targets,
    selectedTarget,
    isPlaying,
    logs,
    filterText,
    filteredLogs,
    currentWsOffset,
    WS_URL,
    wsState,
    selectTarget,
    togglePlay,
    syntaxHighlight,
    setOnLogEntry,
    getWsState,
  }
}
