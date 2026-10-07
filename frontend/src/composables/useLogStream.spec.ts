import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogStream } from './useLogStream'

const wsInstances: FakeWebSocket[] = []

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = FakeWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor() {
    wsInstances.push(this)
  }
}

let stream: ReturnType<typeof useLogStream> | null = null

function logChunk(ws: FakeWebSocket, content: string, offset: number) {
  return ws.onmessage?.(
    new MessageEvent('message', { data: JSON.stringify({ type: 'LOG_CHUNK', content, offset }) }),
  )
}

const TestHarness = defineComponent({
  name: 'TestHarness',
  setup() {
    stream = useLogStream()
    return () => h('div', [h('div', { id: 'log-container' })])
  },
})

describe('useLogStream', () => {
  beforeEach(() => {
    wsInstances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [],
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rola o log-container após o nextTick quando chega um LOG_CHUNK', async () => {
    const wrapper = mount(TestHarness, { attachTo: document.body })
    await flushPromises()

    const ws = wsInstances[0]
    expect(ws).toBeTruthy()

    const container = wrapper.get('#log-container').element as HTMLElement
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 480,
    })
    container.scrollTop = 0

    const message = ws?.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'LOG_CHUNK',
          content: 'linha 1\n',
          offset: 128,
        }),
      }),
    )

    expect(container.scrollTop).toBe(0)

    await message
    await nextTick()

    expect(container.scrollTop).toBe(480)
  })

  it('syntaxHighlight escapa HTML do conteúdo e mantém os realces', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()

    const html = stream!.syntaxHighlight(`[ERROR] ORA-00942 <img src=x onerror="alert('x')"> & fim`)

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; fim')
    expect(html).toContain('<span class="text-red-500 font-bold">[ERROR]</span>')
    expect(html).toContain('<span class="text-red-600 font-bold bg-red-100 px-1 rounded">ORA-00942</span>')
  })

  it('não seleciona nenhum target ao carregar a árvore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => [{ type: 'target', id: 'app', label: 'App', path: '/var/log/app.log' }],
      }),
    )
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()

    expect(stream!.tree.value).toHaveLength(1)
    expect(stream!.selectedTarget.value).toBeNull()
  })

  it('não inicia streaming sem target selecionado', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()

    stream!.togglePlay()

    expect(stream!.isPlaying.value).toBe(false)
    expect(wsInstances[0]!.send).not.toHaveBeenCalled()
  })

  it('clearTarget pausa o streaming e zera a seleção', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!

    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })
    expect(stream!.isPlaying.value).toBe(true)

    stream!.clearTarget()

    expect(ws.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'PAUSE_STREAM' }))
    expect(stream!.isPlaying.value).toBe(false)
    expect(stream!.selectedTarget.value).toBeNull()
    expect(stream!.currentWsOffset.value).toBe(0)
  })

  it('inicia o stream ao abrir um target', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!

    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })

    expect(stream!.isPlaying.value).toBe(true)
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'START_STREAM', targetId: 'app', offset: 0 }),
    )
  })

  it('play/pause afeta somente a aba em foco', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!
    const app = { type: 'target' as const, id: 'app', label: 'App' }
    const worker = { type: 'target' as const, id: 'worker', label: 'Worker' }

    stream!.selectTarget(app)
    stream!.togglePlay()
    expect(stream!.isPlaying.value).toBe(false)

    stream!.selectTarget(worker)
    expect(stream!.isPlaying.value).toBe(true)
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'START_STREAM', targetId: 'worker', offset: 0 }),
    )

    ws.send.mockClear()
    stream!.selectTarget(app)
    expect(stream!.isPlaying.value).toBe(false)
    expect(ws.send).toHaveBeenCalledOnce()
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PAUSE_STREAM' }))
  })

  it('forgetTarget faz a aba reaberta iniciar tocando', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const app = { type: 'target' as const, id: 'app', label: 'App' }

    stream!.selectTarget(app)
    stream!.togglePlay()
    stream!.forgetTarget('app')
    stream!.selectTarget(app)

    expect(stream!.isPlaying.value).toBe(true)
  })

  it('filtro afeta somente a aba em foco', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const app = { type: 'target' as const, id: 'app', label: 'App' }
    const worker = { type: 'target' as const, id: 'worker', label: 'Worker' }

    stream!.selectTarget(app)
    stream!.filterText.value = 'ERROR'

    stream!.selectTarget(worker)
    expect(stream!.filterText.value).toBe('')
    stream!.filterText.value = 'WARN'

    stream!.selectTarget(app)
    expect(stream!.filterText.value).toBe('ERROR')

    stream!.selectTarget(worker)
    expect(stream!.filterText.value).toBe('WARN')
  })

  it('forgetTarget e clearTarget descartam o filtro', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const app = { type: 'target' as const, id: 'app', label: 'App' }

    stream!.selectTarget(app)
    stream!.filterText.value = 'ERROR'
    stream!.clearTarget()
    expect(stream!.filterText.value).toBe('')

    stream!.forgetTarget('app')
    stream!.selectTarget(app)
    expect(stream!.filterText.value).toBe('')
  })

  it('continua tocando após STREAM_END (fim da leitura atual)', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!

    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })
    await ws.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'STREAM_END' }) }))

    expect(stream!.isPlaying.value).toBe(true)
  })

  it('junta a linha que atravessa a fronteira de chunk numa única entrada', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!
    const lines: Array<[string, number]> = []
    stream!.setOnLogEntry((line, offset) => lines.push([line, offset]))
    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })

    await logChunk(ws, 'linha 1\nlin', 11)
    expect(stream!.logs.value.map((log) => log.content)).toEqual(['linha 1'])
    expect(stream!.currentWsOffset.value).toBe(8)

    await logChunk(ws, 'ha 2\n', 16)
    expect(stream!.logs.value.map((log) => [log.content, log.offset])).toEqual([
      ['linha 1', 8],
      ['linha 2', 16],
    ])
    expect(lines).toEqual([['linha 1', 8], ['linha 2', 16]])
    expect(stream!.currentWsOffset.value).toBe(16)
  })

  it('pausar no meio de uma linha retoma do fim da última linha completa', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!
    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })

    // 'ação\n' ocupa 7 bytes em UTF-8; o fragmento 'próx' (5 bytes) fica pendente.
    await logChunk(ws, 'ação\npróx', 12)
    stream!.togglePlay()
    stream!.togglePlay()

    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'START_STREAM', targetId: 'app', offset: 7 }),
    )

    await logChunk(ws, 'próxima\n', 16)
    expect(stream!.logs.value.map((log) => [log.content, log.offset])).toEqual([
      ['ação', 7],
      ['próxima', 16],
    ])
  })

  it('voltar a uma aba preserva logs e retoma do offset salvo', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!
    const lines: string[] = []
    stream!.setOnLogEntry((line) => lines.push(line))
    const app = { type: 'target' as const, id: 'app', label: 'App' }
    const worker = { type: 'target' as const, id: 'worker', label: 'Worker' }

    stream!.selectTarget(app)
    await logChunk(ws, 'linha app\n', 10)

    stream!.selectTarget(worker)
    expect(stream!.logs.value).toEqual([])
    expect(stream!.currentWsOffset.value).toBe(0)
    await logChunk(ws, 'linha worker\n', 13)

    stream!.selectTarget(app)
    expect(stream!.logs.value.map((log) => log.content)).toEqual(['linha app'])
    expect(stream!.currentWsOffset.value).toBe(10)
    expect(ws.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: 'START_STREAM', targetId: 'app', offset: 10 }),
    )
    expect(lines).toEqual(['linha app', 'linha worker'])

    stream!.selectTarget(worker)
    expect(stream!.logs.value.map((log) => log.content)).toEqual(['linha worker'])
    expect(stream!.currentWsOffset.value).toBe(13)
  })

  it('forgetTarget descarta logs e offset da aba', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const ws = wsInstances[0]!
    const app = { type: 'target' as const, id: 'app', label: 'App' }
    const worker = { type: 'target' as const, id: 'worker', label: 'Worker' }

    stream!.selectTarget(app)
    await logChunk(ws, 'linha app\n', 10)
    stream!.selectTarget(worker)
    stream!.forgetTarget('app')
    stream!.selectTarget(app)

    expect(stream!.logs.value).toEqual([])
    expect(stream!.currentWsOffset.value).toBe(0)
  })
})
