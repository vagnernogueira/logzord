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
    stream!.selectTarget({ type: 'target', id: 'app', label: 'App' })

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
          offset: 8,
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

  it('downloadLog baixa o log da aba em foco pelo endpoint de download', async () => {
    mount(TestHarness, { attachTo: document.body })
    await flushPromises()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.href)
    })
    const hrefs: string[] = []

    stream!.downloadLog()
    expect(click).not.toHaveBeenCalled()

    stream!.selectTarget({ type: 'target', id: 'app::2026-08-21', label: 'App' })
    stream!.downloadLog()

    expect(hrefs).toEqual(['http://localhost:3001/api/targets/app%3A%3A2026-08-21/download'])
  })
  describe('Rewind e Fast Forward', () => {
    // Arquivo a partir do byte 82: '9\n' 82-84 · 'l0\n' -87 · 'l1\n' -90 · 'l2a\n' -94 · 'l3\n' -97 · 'l4\n' -100
    const app = { type: 'target' as const, id: 'app', label: 'App' }

    function streamEnd(ws: FakeWebSocket) {
      return ws.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'STREAM_END' }) }))
    }

    async function mountWithPageLines(pageLines: number) {
      vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        json: async () => (url.endsWith('/config') ? { pageLines } : []),
      })))
      mount(TestHarness, { attachTo: document.body })
      await flushPromises()
      return wsInstances[0]!
    }

    async function fastForwardToTail(ws: FakeWebSocket) {
      stream!.selectTarget(app)
      stream!.fastForward()
      await logChunk(ws, '\nl2a\nl3\nl4\n', 100)
      await streamEnd(ws)
    }

    it('lê pageLines de GET /api/config', async () => {
      await mountWithPageLines(7)

      expect(stream!.pageLines.value).toBe(7)
    })

    it('Fast Forward com salto substitui o buffer pelas N últimas linhas e segue tocando', async () => {
      const ws = await mountWithPageLines(2)
      const lines: string[] = []
      stream!.setOnLogEntry((line) => lines.push(line))
      stream!.selectTarget(app)
      await logChunk(ws, 'a\n', 2)

      stream!.fastForward()
      expect(ws.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'START_STREAM', targetId: 'app', offset: 2, fromEnd: 8 }),
      )

      await logChunk(ws, '\nl2a\nl3\nl4\n', 100)
      expect(stream!.logs.value.map((log) => log.content)).toEqual(['a'])

      await streamEnd(ws)
      expect(stream!.logs.value.map((log) => [log.content, log.offset])).toEqual([['l3', 97], ['l4', 100]])
      expect(stream!.currentWsOffset.value).toBe(100)
      expect(stream!.isPlaying.value).toBe(true)
      expect(lines).toEqual(['a', 'l3', 'l4'])

      await logChunk(ws, 'l5\n', 103)
      expect(stream!.logs.value.map((log) => log.content)).toEqual(['l3', 'l4', 'l5'])
    })

    it('Fast Forward sem salto anexa ao buffer atual', async () => {
      const ws = await mountWithPageLines(2)
      stream!.selectTarget(app)
      await logChunk(ws, 'a\n', 2)

      stream!.fastForward()
      await logChunk(ws, 'b\n', 4)

      expect(stream!.logs.value.map((log) => log.content)).toEqual(['a', 'b'])
      expect(stream!.currentWsOffset.value).toBe(4)
    })

    it('Rewind prefixa as N linhas anteriores ao buffer e pausa', async () => {
      const ws = await mountWithPageLines(2)
      await fastForwardToTail(ws)
      const lines: string[] = []
      stream!.setOnLogEntry((line) => lines.push(line))
      expect(stream!.canRewind.value).toBe(true)

      stream!.rewind()
      expect(stream!.isPlaying.value).toBe(false)
      expect(ws.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'START_STREAM', targetId: 'app', offset: 82 }),
      )

      // Chunk do stream ao vivo ainda em voo: lacuna em relação ao início da página, descartado.
      await logChunk(ws, 'l5\n', 103)
      await logChunk(ws, '9\nl0\nl1\nl2a\nl3\nl4\n', 100)

      expect(ws.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'PAUSE_STREAM' }))
      expect(stream!.logs.value.map((log) => [log.content, log.offset])).toEqual([
        ['l1', 90],
        ['l2a', 94],
        ['l3', 97],
        ['l4', 100],
      ])
      expect(stream!.currentWsOffset.value).toBe(100)
      expect(lines).toEqual(['l1', 'l2a'])

      // Pausado: chunks que ainda chegarem são descartados.
      await logChunk(ws, 'l5\n', 103)
      expect(stream!.logs.value).toHaveLength(4)
    })

    it('Rewind fica indisponível com o buffer no início do arquivo', async () => {
      const ws = await mountWithPageLines(2)
      expect(stream!.canRewind.value).toBe(false)

      stream!.selectTarget(app)
      await logChunk(ws, 'a\nb\n', 4)

      expect(stream!.canRewind.value).toBe(false)
      ws.send.mockClear()
      stream!.rewind()
      expect(ws.send).not.toHaveBeenCalled()
    })

    it('Rewind acima do teto de 2000 linhas descarta as mais novas e recua o offset', async () => {
      const ws = await mountWithPageLines(2)
      // 2000 linhas de 2 bytes ('x\n') a partir do byte 10; o buffer fica cheio.
      stream!.selectTarget(app)
      stream!.fastForward()
      await logChunk(ws, `\n${'x\n'.repeat(2000)}`, 4010)
      await streamEnd(ws)
      // pageLines=2 corta a cauda; reabastece o buffer até o teto com um chunk ao vivo.
      await logChunk(ws, 'x\n'.repeat(1998), 4010 + 1998 * 2)
      expect(stream!.logs.value).toHaveLength(2000)
      const start = stream!.logs.value[0]!.offset - 2

      stream!.rewind()
      const pageStart = start - 2 * 2 * 2
      await logChunk(ws, 'y\nz\nw\nq\n', pageStart + 8)

      expect(stream!.logs.value).toHaveLength(2000)
      expect(stream!.logs.value.slice(0, 2).map((log) => log.content)).toEqual(['w', 'q'])
      expect(stream!.currentWsOffset.value).toBe(stream!.logs.value[1999]!.offset)
      expect(stream!.currentWsOffset.value).toBe(4010 + 1998 * 2 - 4)
    })
  })
})
