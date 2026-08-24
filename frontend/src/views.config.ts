import type { Component } from 'vue'
import type { ShellActivityBarItem } from '@vagnernogueira/vsshellcode/vue'
import type { LogRotation, LogTreeNode, LogTreeTarget } from '@/types'
import AnalysisSection from '@/components/AnalysisSection.vue'
import TargetsSection from '@/components/TargetsSection.vue'

export interface ViewPropsContext {
  tree: LogTreeNode[]
  selectedTarget: LogTreeTarget | null
  availableRotations: LogRotation[]
  rotationsLoading: boolean
  recordedCount: number
  isRecording: boolean
}

export interface ShellViewConfig extends ShellActivityBarItem {
  component: Component
  props: (context: ViewPropsContext) => Record<string, unknown>
}

export const views: ShellViewConfig[] = [
  {
    id: 'targets',
    icon: 'files',
    title: 'Logs',
    component: TargetsSection,
    props: ({ tree, selectedTarget, availableRotations, rotationsLoading }) => ({
      tree,
      selectedTarget,
      availableRotations,
      rotationsLoading,
    }),
  },
  {
    id: 'analysis',
    icon: 'graph',
    title: 'Análise',
    component: AnalysisSection,
    props: ({ recordedCount, isRecording }) => ({ recordedCount, isRecording }),
  },
]
