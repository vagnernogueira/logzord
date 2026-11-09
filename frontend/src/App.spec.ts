import { nextTick, ref, type PropType, type VNode } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry, LogTreeNode, LogTreeTarget } from '@/types'
import type { LineMatcher } from '@/lib/lineMatcher'

const {
  useLogStreamMock,
  useRecordingMock,
  useShellKeybindingsMock,
  isNarrowMock,
} = vi.hoisted(() => ({
  useLogStreamMock: vi.fn(),
  useRecordingMock: vi.fn(),
  useShellKeybindingsMock: vi.fn(),
  isNarrowMock: { value: false },
}))

vi.mock('@/composables/useLogStream', () => ({
  useLogStream: useLogStreamMock,
}))

vi.mock('@/composables/useRecording', () => ({
  useRecording: useRecordingMock,
}))

vi.mock('@vagnernogueira/vsshellcode/vue', async (importOriginal) => {
  const { defineComponent, h } = await import('vue')
  const { ShellTitleBarAction, ShellTitleBarSearch, ShellTitleBarSearchToggle } =
    await importOriginal<typeof import('@vagnernogueira/vsshellcode/vue')>()

  type TitleBarMenuItem = { id: string; label: string }
  type ActivityBarItem = { id: string; icon: string; title: string }
  type ShellTab = { id: string; label: string; icon?: string }
  type StatusBarItem = { id: string; icon?: string; label: string }
  type Command = { id: string; title: string; icon?: string }

  const ShellTitleBar = defineComponent({
    name: 'ShellTitleBar',
    props: {
      menuItems: { type: Array as PropType<TitleBarMenuItem[]>, required: true },
    },
    emits: ['menu-click'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'header',
          { class: 'title-bar' },
          [
            ...props.menuItems.map((item) =>
              h(
                'button',
                {
                  class: 'title-bar__menu-item',
                  type: 'button',
                  onClick: () => emit('menu-click', item.id),
                },
                item.label,
              ),
            ),
            slots.search?.(),
            slots.actions?.(),
          ],
        )
    },
  })

  const ShellActivityBar = defineComponent({
    name: 'ShellActivityBar',
    props: {
      items: { type: Array as PropType<ActivityBarItem[]>, required: true },
      activeId: { type: String as PropType<string | null>, default: null },
    },
    emits: ['update:activeId'],
    setup(props, { emit }) {
      return () =>
        h(
          'nav',
          { class: 'activity-bar' },
          props.items.map((item) =>
            h(
              'button',
              {
                class: 'activity-bar__item',
                type: 'button',
                'data-view-id': item.id,
                'aria-selected': item.id === props.activeId,
                onClick: () => emit('update:activeId', props.activeId === item.id ? null : item.id),
              },
              item.title,
            ),
          ),
        )
    },
  })

  const ShellSidebar = defineComponent({
    name: 'ShellSidebar',
    props: {
      open: { type: Boolean, required: true },
    },
    emits: ['dismiss'],
    setup(props, { slots }) {
      return () =>
        h(
          'aside',
          { class: 'sidebar', ...(props.open ? {} : { hidden: true }) },
          slots.default?.(),
        )
    },
  })

  type TreeNode = { id: string; label: string; icon?: string; open?: boolean; children?: TreeNode[] }

  const ShellTree = defineComponent({
    name: 'ShellTree',
    props: {
      nodes: { type: Array as PropType<TreeNode[]>, required: true },
    },
    emits: ['select'],
    setup(props, { emit }) {
      function renderNode(node: TreeNode): VNode {
        return h('li', { key: node.id }, [
          h(
            'button',
            {
              type: 'button',
              'data-node-id': node.id,
              onClick: () => emit('select', node),
            },
            node.label,
          ),
          node.children?.length ? h('ul', node.children.map((child) => renderNode(child))) : null,
        ])
      }

      return () => h('ul', { class: 'tree' }, props.nodes.map((node) => renderNode(node)))
    },
  })

  const ShellTabs = defineComponent({
    name: 'ShellTabs',
    props: {
      tabs: { type: Array as PropType<ShellTab[]>, required: true },
      activeTabId: { type: String as PropType<string | null>, default: null },
    },
    emits: ['update:activeTabId', 'close'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          { class: 'tabs', role: 'tablist' },
          props.tabs.map((tab) =>
            h(
              'div',
              {
                class: 'tab',
                role: 'tab',
                'aria-selected': tab.id === props.activeTabId,
                onClick: () => emit('update:activeTabId', tab.id),
              },
              [
                h('span', tab.label),
                h(
                  'button',
                  {
                    class: 'tab__close',
                    type: 'button',
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      emit('close', tab.id)
                    },
                  },
                  'Fechar',
                ),
              ],
            ),
          ),
        )
    },
  })

  const ShellStatusBar = defineComponent({
    name: 'ShellStatusBar',
    props: {
      leftItems: { type: Array as PropType<StatusBarItem[]>, required: true },
      rightItems: { type: Array as PropType<StatusBarItem[]>, required: true },
    },
    emits: ['item-click'],
    setup(props, { emit }) {
      const renderItems = (items: StatusBarItem[]) =>
        items.map((item) =>
          h(
            'div',
            {
              class: 'status-bar__item',
              'data-item-id': item.id,
              onClick: () => emit('item-click', item.id),
            },
            item.label,
          ),
        )

      return () =>
        h('footer', { class: 'status-bar' }, [
          h('div', { class: 'status-bar__group' }, renderItems(props.leftItems)),
          h('div', { class: 'status-bar__group' }, renderItems(props.rightItems)),
        ])
    },
  })

  const ShellCommandPalette = defineComponent({
    name: 'ShellCommandPalette',
    props: {
      open: { type: Boolean, required: true },
      commands: { type: Array as PropType<Command[]>, required: true },
    },
    setup(props) {
      return () => h('div', { class: 'command-palette', hidden: !props.open })
    },
  })

  return {
    ShellTitleBar,
    ShellTitleBarAction,
    ShellTitleBarSearch,
    ShellTitleBarSearchToggle,
    ShellActivityBar,
    ShellSidebar,
    ShellTree,
    ShellTabs,
    ShellStatusBar,
    ShellCommandPalette,
    useShellKeybindings: useShellKeybindingsMock,
    useShellViewport: () => ({ isNarrow: isNarrowMock }),
  }
})

import App from './App.vue'

const tree: LogTreeNode[] = [
  { type: 'target', id: 'app', label: 'Application log', path: '/var/log/app.log' },
  { type: 'target', id: 'worker', label: 'Worker log', path: '/var/log/worker.log' },
]

function createLogStreamState() {
  const selectedTarget = ref<LogTreeTarget | null>(null)
  const isPlaying = ref(false)
  const filterText = ref('')
  const filterMode = ref<'substring' | 'regex'>('substring')
  const filterError = ref<string | null>(null)
  const filteredLogs = ref<LogEntry[]>([])
  const currentWsOffset = ref(42)
  const selectTarget = vi.fn((target: LogTreeTarget) => {
    selectedTarget.value = target
  })

  return {
    tree: ref(tree),
    selectedTarget,
    isPlaying,
    filterText,
    filterMode,
    lineMatcher: ref<LineMatcher>({ matches: () => true, error: null }),
    filterError,
    filteredLogs,
    currentWsOffset,
    availableRotations: ref([]),
    rotationsLoading: ref(false),
    selectTarget,
    clearTarget: vi.fn(() => {
      selectedTarget.value = null
    }),
    forgetTarget: vi.fn(),
    downloadLog: vi.fn(),
    rewind: vi.fn(),
    fastForward: vi.fn(),
    canRewind: ref(true),
    togglePlay: vi.fn(() => {
      isPlaying.value = !isPlaying.value
    }),
    setOnLogEntries: vi.fn(),
    wsState: ref<number>(WebSocket.OPEN),
    fetchRotationsFor: vi.fn(),
    addRotation: vi.fn(),
  }
}

function createRecordingState() {
  return {
    isRecording: ref(false),
    recordedCount: ref(0),
    recordError: ref<string | null>(null),
    toggleRecord: vi.fn(),
    forgetTarget: vi.fn(),
    recordLines: vi.fn(async () => {}),
    clearRecord: vi.fn(),
    exportRecord: vi.fn(),
  }
}

function mountApp() {
  return mount(App)
}

describe('App', () => {
  beforeEach(() => {
    useLogStreamMock.mockReset()
    useLogStreamMock.mockReturnValue(createLogStreamState())
    useRecordingMock.mockReset()
    useRecordingMock.mockReturnValue(createRecordingState())
    useShellKeybindingsMock.mockReset()
    isNarrowMock.value = false
  })

  it('troca a view ao selecionar outra atividade', async () => {
    const wrapper = mountApp()

    expect(wrapper.find('aside.sidebar').text()).toContain('Application log')

    await wrapper.find('[data-view-id="analysis"]').trigger('click')

    expect(wrapper.find('[data-view-id="analysis"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('aside.sidebar').text()).toContain('Quadro de Análise')
    expect(wrapper.find('aside.sidebar').text()).not.toContain('Application log')
  })

  it('colapsa a sidebar ao clicar na view ativa', async () => {
    const wrapper = mountApp()

    await wrapper.find('[data-view-id="targets"]').trigger('click')

    expect(wrapper.find('[data-view-id="targets"]').attributes('aria-selected')).toBe('false')
    expect(wrapper.find('aside.sidebar').attributes('hidden')).toBeDefined()
  })

  it('em viewport estreita, colapsa a sidebar ao selecionar um alvo', async () => {
    isNarrowMock.value = true
    const wrapper = mountApp()

    await wrapper.findAll('aside button')[0]!.trigger('click')

    expect(wrapper.find('aside.sidebar').attributes('hidden')).toBeDefined()
    expect(wrapper.find('.tabs .tab').text()).toContain('Application log')
  })

  it('em viewport larga, mantém a sidebar aberta ao selecionar um alvo', async () => {
    const wrapper = mountApp()

    await wrapper.findAll('aside button')[0]!.trigger('click')

    expect(wrapper.find('aside.sidebar').attributes('hidden')).toBeUndefined()
  })

  it('fecha a sidebar no dismiss da casca (clique fora / Esc em tela estreita)', async () => {
    const wrapper = mountApp()

    await wrapper.findComponent({ name: 'ShellSidebar' }).vm.$emit('dismiss')

    expect(wrapper.find('aside.sidebar').attributes('hidden')).toBeDefined()
  })

  it('compõe tabs abertas, troca a tab ativa e fecha a tab ativa', async () => {
    const wrapper = mountApp()
    const targetButtons = wrapper.findAll('aside button')

    await targetButtons[0]!.trigger('click')
    await targetButtons[1]!.trigger('click')

    let tabs = wrapper.findAll('.tabs .tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.text()).toContain('Application log')
    expect(tabs[1]!.text()).toContain('Worker log')
    expect(tabs[1]!.attributes('aria-selected')).toBe('true')

    await tabs[0]!.trigger('click')
    expect(wrapper.findAll('.tabs .tab')[0]!.attributes('aria-selected')).toBe('true')

    await wrapper.findAll('.tab__close')[1]!.trigger('click')

    tabs = wrapper.findAll('.tabs .tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.text()).toContain('Application log')
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
  })

  it('inicia sem tabs abertas', () => {
    const wrapper = mountApp()

    expect(wrapper.findAll('.tabs .tab')).toHaveLength(0)
  })

  it('fecha a última tab e limpa a seleção', async () => {
    const state = createLogStreamState()
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()

    await wrapper.findAll('aside button')[0]!.trigger('click')
    expect(wrapper.findAll('.tabs .tab')).toHaveLength(1)

    await wrapper.find('.tab__close').trigger('click')

    expect(wrapper.findAll('.tabs .tab')).toHaveLength(0)
    expect(state.clearTarget).toHaveBeenCalledOnce()
    expect(state.selectedTarget.value).toBeNull()
  })

  it('descarta o estado de play e gravação da aba fechada', async () => {
    const state = createLogStreamState()
    const recording = createRecordingState()
    useLogStreamMock.mockReturnValue(state)
    useRecordingMock.mockReturnValue(recording)
    const wrapper = mountApp()

    await wrapper.findAll('aside button')[0]!.trigger('click')
    await wrapper.find('.tab__close').trigger('click')

    expect(state.forgetTarget).toHaveBeenCalledWith('app')
    expect(recording.forgetTarget).toHaveBeenCalledWith('app')
  })

  it('ao fechar a aba ativa, troca para a aba restante antes de descartar o estado da fechada', async () => {
    const state = createLogStreamState()
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()
    const targetButtons = wrapper.findAll('aside button')

    await targetButtons[0]!.trigger('click')
    await targetButtons[1]!.trigger('click')
    await wrapper.findAll('.tab__close')[1]!.trigger('click')

    const fallbackCall = state.selectTarget.mock.invocationCallOrder.at(-1)!
    expect(state.selectTarget).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'app' }))
    expect(state.forgetTarget).toHaveBeenCalledWith('worker')
    expect(state.forgetTarget.mock.invocationCallOrder[0]).toBeGreaterThan(fallbackCall)
  })

  it('o comando download-log aciona downloadLog', async () => {
    const state = createLogStreamState()
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()

    wrapper.findComponent({ name: 'ShellCommandPalette' }).vm.$emit('execute', 'download-log')

    expect(state.downloadLog).toHaveBeenCalledOnce()
  })
  it('os botões e comandos de navegação acionam rewind e fastForward', async () => {
    const state = createLogStreamState()
    state.selectedTarget.value = { type: 'target', id: 'app', label: 'App' }
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()

    await wrapper.find('[aria-label="Retroceder"]').trigger('click')
    await wrapper.find('[aria-label="Avançar"]').trigger('click')
    const palette = wrapper.findComponent({ name: 'ShellCommandPalette' })
    palette.vm.$emit('execute', 'stream-rewind')
    palette.vm.$emit('execute', 'stream-fast-forward')

    expect(state.rewind).toHaveBeenCalledTimes(2)
    expect(state.fastForward).toHaveBeenCalledTimes(2)
  })

  it('desabilita o Rewind quando canRewind é falso', () => {
    const state = createLogStreamState()
    state.canRewind.value = false
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()

    expect(wrapper.find('[aria-label="Retroceder"]').attributes('disabled')).toBeDefined()
  })

  it('o toggle de regex alterna o modo do filtro e reflete em aria-pressed', async () => {
    const state = createLogStreamState()
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()
    const toggle = () => wrapper.find('[aria-label="Usar expressão regular"]')

    expect(toggle().attributes('aria-pressed')).toBe('false')
    await toggle().trigger('click')
    expect(state.filterMode.value).toBe('regex')
    expect(toggle().attributes('aria-pressed')).toBe('true')
    await toggle().trigger('click')
    expect(state.filterMode.value).toBe('substring')
  })

  it('regex inválida marca o campo de filtro com a mensagem de erro', () => {
    const state = createLogStreamState()
    state.filterError.value = 'Invalid regular expression: /foo(/: Unterminated group'
    useLogStreamMock.mockReturnValue(state)
    const wrapper = mountApp()
    const input = wrapper.find('input[placeholder="Filtrar logs..."]')

    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('title')).toBe(state.filterError.value)
  })

  it('o callback de gravação usa o matcher do filtro', () => {
    const state = createLogStreamState()
    const matches = vi.fn(() => true)
    state.lineMatcher.value = { matches, error: null }
    useLogStreamMock.mockReturnValue(state)
    const recording = createRecordingState()
    useRecordingMock.mockReturnValue(recording)
    mountApp()

    const onLogEntries = state.setOnLogEntries.mock.calls[0]![0] as (lines: Array<{ content: string, offset: number }>) => void
    const lines = [{ content: 'linha', offset: 7 }]
    onLogEntries(lines)

    expect(recording.recordLines).toHaveBeenCalledWith(lines, matches)
  })

  it('o botão da title bar e o comando toggle-theme alternam data-theme no <html>', async () => {
    const wrapper = mountApp()
    const root = document.documentElement
    const initial = root.getAttribute('data-theme')
    const other = initial === 'dark' ? 'light' : 'dark'

    await wrapper.find('[aria-label="Alternar tema"]').trigger('click')
    await nextTick()
    expect(root.getAttribute('data-theme')).toBe(other)

    wrapper.findComponent({ name: 'ShellCommandPalette' }).vm.$emit('execute', 'toggle-theme')
    await nextTick()
    expect(root.getAttribute('data-theme')).toBe(initial)
  })
})
