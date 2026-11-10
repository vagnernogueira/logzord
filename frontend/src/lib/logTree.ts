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

export interface FlatTarget {
  target: LogTreeTarget
  path: string[]
}

// Lista plana para a paleta (Ctrl+P): `path` são os labels dos grupos ancestrais; rotações carregadas entram como filhas do target.
export function flattenTargets(nodes: LogTreeNode[], path: string[] = []): FlatTarget[] {
  return nodes.flatMap((node) => {
    if (node.type === 'group') return flattenTargets(node.children, [...path, node.label])
    return [{ target: node, path }, ...flattenTargets(node.children ?? [], path)]
  })
}
