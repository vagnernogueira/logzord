import type { ShellTreeNode } from '@vagnernogueira/vsshellcode/vue'
import type { LogTreeNode, LogTreeTarget } from '@/types'

export function findTargetById(nodes: LogTreeNode[], id: string): LogTreeTarget | null {
  for (const node of nodes) {
    if (node.type === 'target' && node.id === id) {
      return node
    }
    if (node.children) {
      const found = findTargetById(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function firstTarget(nodes: LogTreeNode[]): LogTreeTarget | null {
  for (const node of nodes) {
    if (node.type === 'target') return node
    const found = firstTarget(node.children)
    if (found) return found
  }
  return null
}

export function toShellTreeNodes(nodes: LogTreeNode[]): ShellTreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'group') {
      return {
        id: node.id,
        label: node.label,
        icon: node.icon ?? 'folder',
        open: true,
        children: toShellTreeNodes(node.children),
      }
    }

    return {
      id: node.id,
      label: node.label,
      icon: node.icon ?? (node.rotationOf ? 'history' : 'file'),
      open: true,
      children: node.children?.length ? toShellTreeNodes(node.children) : undefined,
    }
  })
}
