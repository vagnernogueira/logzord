import type { Component } from 'vue'
import type { ShellActivityBarItem } from '@vagnernogueira/vsshellcode/vue'
import AnalysisSection from '@/components/AnalysisSection.vue'
import TargetsSection from '@/components/TargetsSection.vue'

export interface ShellViewConfig extends ShellActivityBarItem {
  component: Component
}

export const views: ShellViewConfig[] = [
  { id: 'targets', icon: 'files', title: 'Logs', component: TargetsSection },
  { id: 'analysis', icon: 'graph', title: 'Análise', component: AnalysisSection },
]
