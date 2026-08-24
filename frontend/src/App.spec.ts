import { ref, type PropType } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogEntry, LogTreeNode, LogTreeTarget } from '@/types'

const {
  useLogStreamMock,
  useRecordingMock,
  useShellKeybindingsMock,
} = vi.hoisted(() => ({
  useLogStreamMock: vi.fn(),
  useRecordingMock: vi.fn(),
  useShellKeybindingsMock: vi.fn(),
}))

vi.mock('@/composables/useLogStream', () => ({
  useLogStream: useLogStreamMock,
}))

vi.mock('@/composables/useRecording', () => ({
  useRecording: useRecordingMock,
}))

vi.mock('@vagnernogueira/vsshellcode/vue', async () => {
  const { defineComponent, h } = await import('vue')

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
    setup(props, { emit }) {
      return () =>
        h(
          'header',
          { class: 'title-bar' },
          props.menuItems.map((item) =>
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
      function renderNode(node: TreeNode) {
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
    ShellActivityBar,
    ShellSidebar,
    ShellTree,
    ShellTabs,
    ShellStatusBar,
    ShellCommandPalette,
    useShellKeybindings: useShellKeybindingsMock,
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
    filteredLogs,
    currentWsOffset,
    availableRotations: ref([]),
    rotationsLoading: ref(false),
    selectTarget,
    togglePlay: vi.fn(() => {
      isPlaying.value = !isPlaying.value
    }),
    syntaxHighlight: (content: string) => content,
    setOnLogEntry: vi.fn(),
    getWsState: () => 1,
    fetchRotationsFor: vi.fn(),
    addRotation: vi.fn(),
  }
}

function createRecordingState() {
  return {
    isRecording: ref(false),
    recordedCount: ref(0),
    toggleRecord: vi.fn(),
    recordLine: vi.fn(),
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
})
