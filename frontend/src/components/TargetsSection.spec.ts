import { type PropType } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { LogTreeNode } from '@/types'

type TreeNode = { id: string; label: string; icon?: string; open?: boolean; children?: TreeNode[] }

vi.mock('@vagnernogueira/vsshellcode/vue', async () => {
  const { defineComponent, h } = await import('vue')

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

  return { ShellTree }
})

const { default: TargetsSection } = await import('./TargetsSection.vue')

const tree: LogTreeNode[] = [
  { type: 'target', id: 'app', label: 'Application log', path: '/var/log/app.log' },
]

describe('TargetsSection', () => {
  it('selects a target when its tree node is clicked', async () => {
    const wrapper = mount(TargetsSection, {
      props: {
        tree,
        selectedTarget: null,
        availableRotations: [],
        rotationsLoading: false,
      },
    })

    await wrapper.get('[data-node-id="app"]').trigger('click')

    expect(wrapper.emitted('select-target')).toEqual([[tree[0]]])
  })

  it('does not show the rotations picker without a selected target', () => {
    const wrapper = mount(TargetsSection, {
      props: {
        tree,
        selectedTarget: null,
        availableRotations: [],
        rotationsLoading: false,
      },
    })

    expect(wrapper.text()).not.toContain('Ver logs rotacionados')
  })

  it('requests and lists rotations for the selected target, and emits add-rotation on pick', async () => {
    const target = tree[0]!
    const wrapper = mount(TargetsSection, {
      props: {
        tree,
        selectedTarget: target,
        availableRotations: [{ id: 'app::2026-08-20', date: '2026-08-20', label: '2026-08-20' }],
        rotationsLoading: false,
      },
    })

    await wrapper.get('[data-testid="rotations-toggle"]').trigger('click')
    expect(wrapper.emitted('request-rotations')).toEqual([[target]])

    const rotationButtons = wrapper.findAll('button').filter((button) => button.text() === '2026-08-20')
    await rotationButtons[0]!.trigger('click')
    expect(wrapper.emitted('add-rotation')).toEqual([
      [target, { id: 'app::2026-08-20', date: '2026-08-20', label: '2026-08-20' }],
    ])
  })
})
