import { describe, expect, it } from 'vitest'
import type { LogTreeNode } from '@/types'
import { flattenTargets } from './logTree'

describe('flattenTargets', () => {
  it('achata targets na raiz, em grupos aninhados e rotações filhas, com o caminho dos grupos', () => {
    const tree: LogTreeNode[] = [
      { type: 'target', id: 'root', label: 'Root log' },
      {
        type: 'group',
        id: 'g1',
        label: 'Infra',
        children: [
          {
            type: 'group',
            id: 'g2',
            label: 'Caddy',
            children: [
              {
                type: 'target',
                id: 'access',
                label: 'access.log',
                children: [{ type: 'target', id: 'access-1', label: 'access.log.1', rotationOf: 'access' }],
              },
            ],
          },
        ],
      },
    ]

    expect(flattenTargets(tree).map(({ target, path }) => [target.id, path])).toEqual([
      ['root', []],
      ['access', ['Infra', 'Caddy']],
      ['access-1', ['Infra', 'Caddy']],
    ])
  })

  it('retorna lista vazia para árvore vazia', () => {
    expect(flattenTargets([])).toEqual([])
  })
})
