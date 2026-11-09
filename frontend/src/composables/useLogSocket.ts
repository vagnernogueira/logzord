import { ref } from 'vue'

const RECONNECT_DELAY_MS = 5000

// Mensagem do servidor (LOG_CHUNK · STREAM_END · ERROR), com o streamId do START_STREAM quando enviado.
export interface LogSocketMessage {
  type: string
  streamId?: number
  content?: string
  offset?: number
  message?: string
}

export interface LogSocketHandlers {
  onOpen: () => void
  // Mensagem já decodificada; JSON inválido é logado e não chega aqui.
  onMessage: (data: LogSocketMessage) => void | Promise<void>
}

// Transporte WebSocket: conexão, reconexão com espera fixa e estado (`wsState`). Não conhece o protocolo de stream.
export function useLogSocket(url: string, handlers: LogSocketHandlers) {
  const wsState = ref<WebSocket['readyState']>(WebSocket.CLOSED)

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let shouldReconnect = true

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
    }, RECONNECT_DELAY_MS)
  }

  function connectWebSocket() {
    clearReconnectTimer()
    ws = new WebSocket(url)
    wsState.value = ws.readyState

    ws.onopen = () => {
      console.log('Connected to WS')
      wsState.value = ws?.readyState ?? WebSocket.OPEN
      handlers.onOpen()
    }

    ws.onmessage = async (event) => {
      let data: LogSocketMessage
      try {
        data = JSON.parse(event.data)
      } catch (error) {
        console.error('Invalid WS message:', error)
        return
      }
      await handlers.onMessage(data)
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

  function isOpen(): boolean {
    return !!ws && ws.readyState === WebSocket.OPEN
  }

  // Envia só com a conexão aberta; devolve se enviou.
  function send(message: object): boolean {
    if (!isOpen()) return false
    ws!.send(JSON.stringify(message))
    return true
  }

  function connect() {
    shouldReconnect = true
    connectWebSocket()
  }

  function disconnect() {
    shouldReconnect = false
    clearReconnectTimer()
    if (ws) ws.close()
  }

  return { wsState, isOpen, send, connect, disconnect }
}
