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
  id: string
  offset: number
  content: string
}
