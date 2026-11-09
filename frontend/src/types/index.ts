export interface LogTreeGroup {
  type: 'group'
  id: string
  label: string
  icon?: string
  children: LogTreeNode[]
}

export interface LogTreeTarget {
  type: 'target'
  id: string
  label: string
  icon?: string
  path?: string
  rotationOf?: string
  children?: LogTreeTarget[]
}

export type LogTreeNode = LogTreeGroup | LogTreeTarget

export interface LogRotation {
  id: string
  date: string
  label: string
}

export interface LogEntry {
  id: number
  offset: number
  content: string
  // Conteúdo escapado e realçado, pronto para v-html.
  html: string
}

// Área de scroll do log, exposta pelo LogViewer: o stream decide quando rolar sem tocar no DOM.
export interface LogViewport {
  isAtBottom: () => boolean
  scrollToBottom: () => void
  scrollToTop: () => void
}
