// Pulumi history entry — .pulumi/history/{project}/{stack}/{stack}-{epoch_ms}.history.json
export interface PulumiHistoryEntry {
  kind: 'update' | 'preview' | 'refresh' | 'destroy' | 'import'
  startTime: number
  message: string
  environment: Record<string, string>
  config: Record<string, { value: string; secret?: boolean }>
  result: 'succeeded' | 'failed' | 'in-progress'
  endTime: number
  resourceChanges?: {
    create?: number
    delete?: number
    update?: number
    same?: number
  }
  version: number
}

// Pulumi checkpoint — .pulumi/history/{project}/{stack}/{stack}-{epoch_ms}.checkpoint.json
export interface PulumiCheckpoint {
  version: number
  deployment?: {
    manifest: {
      time: string
      magic: string
      version: string
    }
    resources?: PulumiResource[]
  }
}

// Pulumi current stack state — .pulumi/stacks/{project}/{stack}.json
export interface PulumiStackState {
  version: number
  deployment?: {
    manifest: {
      time: string
      magic: string
      version: string
    }
    resources?: PulumiResource[]
  }
}

export interface PulumiResource {
  urn: string
  type: string
  id?: string
  parent?: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  created?: string
  modified?: string
}

export interface HistoryFile {
  key: string
  /** Raw epoch string from the filename — may be nanoseconds, kept as string to avoid float64 precision loss */
  epoch: string
  type: 'history' | 'checkpoint'
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Derived summary types used by the UI
export interface StackSummary {
  project: string
  stack: string
  lastUpdated?: string
  lastResult?: PulumiHistoryEntry['result']
  resourceCount?: number
}
