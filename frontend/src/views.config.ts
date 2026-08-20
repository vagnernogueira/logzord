import type { Component } from 'vue'
import type { ShellActivityBarItem } from '@vagnernogueira/vsshellcode/vue'
import type { Target } from '@/types'
import AnalysisSection from '@/components/AnalysisSection.vue'
import TargetsSection from '@/components/TargetsSection.vue'

export interface ViewPropsContext {
  targets: Target[]
  selectedTarget: Target | null
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
    props: ({ targets, selectedTarget }) => ({ targets, selectedTarget }),
  },
  {
    id: 'analysis',
    icon: 'graph',
    title: 'Análise',
    component: AnalysisSection,
    props: ({ recordedCount, isRecording }) => ({ recordedCount, isRecording }),
  },
]
