import type { ShellCommand } from '@vagnernogueira/vsshellcode/vue'

export const commands: ShellCommand[] = [
  { id: 'toggle-sidebar', title: 'View: Toggle Sidebar', icon: 'layout-sidebar-left' },
  { id: 'toggle-panel', title: 'View: Toggle Panel', icon: 'panel-right' },
  { id: 'toggle-play', title: 'Stream: Play/Pause', icon: 'debug-start' },
  { id: 'toggle-record', title: 'Record: Start/Stop', icon: 'record' },
  { id: 'export-record', title: 'Record: Export', icon: 'export' },
  { id: 'clear-record', title: 'Record: Clear', icon: 'clear-all' },
]
