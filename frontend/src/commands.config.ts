import type { ShellCommand } from '@vagnernogueira/vsshellcode/vue'

export const commands: ShellCommand[] = [
  { id: 'quick-open', title: 'Ir para log… (Ctrl+P)', icon: 'go-to-file' },
  { id: 'toggle-sidebar', title: 'View: Toggle Sidebar', icon: 'layout-sidebar-left' },
  { id: 'toggle-theme', title: 'View: Toggle Theme', icon: 'color-mode' },
  { id: 'toggle-play', title: 'Stream: Play/Pause', icon: 'debug-start' },
  { id: 'stream-rewind', title: 'Stream: Rewind', icon: 'debug-reverse-continue' },
  { id: 'stream-fast-forward', title: 'Stream: Fast Forward', icon: 'debug-continue' },
  { id: 'download-log', title: 'Log: Download', icon: 'cloud-download' },
  { id: 'toggle-record', title: 'Record: Start/Stop', icon: 'record' },
  { id: 'export-record', title: 'Record: Export', icon: 'export' },
  { id: 'clear-record', title: 'Record: Clear', icon: 'clear-all' },
]
