import 'server-only'
import { type BucketConfig, getBuckets } from './buckets'
import { debug } from './logger'
import type { HistoryFile, PulumiHistoryEntry, PulumiStackState } from './pulumi-types'
import { listKeysWithMeta, PREFIX, type S3KeyMeta, s3JsonSafe } from './s3-client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StackEntry {
  bucket: string
  env: string
  envLabel: string
  project: string
  stack: string
  lastUpdated?: string
  lastResult?: PulumiHistoryEntry['result']
  resourceCount?: number
}

interface StackMeta {
  entry: StackEntry
  /** LastModified of the stack state file in S3 */
  stateLastModified: Date
}

// ─── In-memory stores (globalThis to survive Next.js module isolation) ────────

interface StackIndexState {
  stackMap: Map<string, StackMeta>
  historyFilesMap: Map<string, HistoryFile[]>
  initialized: boolean
}

const GLOBAL_KEY = '__pulumiStackIndex' as const

function getState(): StackIndexState {
  const g = globalThis as unknown as Record<string, StackIndexState>
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      stackMap: new Map(),
      historyFilesMap: new Map(),
      initialized: false,
    }
  }
  return g[GLOBAL_KEY]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function stackId(project: string, stack: string): string {
  return `${project}/${stack}`
}

function historyFilesCacheKey(bucket: string, project: string, stack: string): string {
  return `${bucket}:${project}/${stack}`
}

function parseHistoryFiles(keys: S3KeyMeta[], stack: string): HistoryFile[] {
  return keys
    .filter((k) => k.key.endsWith('.history.json') || k.key.endsWith('.checkpoint.json'))
    .map(({ key }) => {
      const filename = key.split('/').pop() ?? ''
      const isHistory = filename.endsWith('.history.json')
      const suffix = isHistory ? '.history.json' : '.checkpoint.json'
      const epoch = filename.replace(`${stack}-`, '').replace(suffix, '')
      return { key, epoch, type: isHistory ? 'history' : 'checkpoint' } satisfies HistoryFile
    })
    .sort((a, b) => (BigInt(b.epoch) > BigInt(a.epoch) ? 1 : -1))
}

async function enrichEntry(
  cfg: BucketConfig,
  project: string,
  stack: string,
  stateLastModified: Date,
): Promise<StackMeta> {
  const entry: StackEntry = {
    bucket: cfg.bucket,
    env: cfg.id,
    envLabel: cfg.label,
    project,
    stack,
  }

  const [state, historyKeyMetas] = await Promise.all([
    s3JsonSafe<PulumiStackState>(cfg.bucket, `${PREFIX}/stacks/${project}/${stack}.json`),
    listKeysWithMeta(cfg.bucket, `${PREFIX}/history/${project}/${stack}/`),
  ])

  if (state) {
    entry.resourceCount = state.checkpoint?.latest?.resources?.length ?? 0
    entry.lastUpdated = state.checkpoint?.latest?.manifest?.time
  }

  // Cache parsed history files
  const { historyFilesMap } = getState()
  const historyFiles = parseHistoryFiles(historyKeyMetas, stack)
  historyFilesMap.set(historyFilesCacheKey(cfg.bucket, project, stack), historyFiles)

  // Get last result from newest history entry
  const latestHistoryKey = historyFiles.find((f) => f.type === 'history')?.key
  if (latestHistoryKey) {
    const histEntry = await s3JsonSafe<PulumiHistoryEntry>(cfg.bucket, latestHistoryKey)
    if (histEntry) {
      entry.lastResult = histEntry.result
    }
  }

  return { entry, stateLastModified }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the full stack index from scratch. Called at server startup and on manual refresh.
 */
export async function buildStackIndex(): Promise<void> {
  debug('index', 'building stack index')
  const state = getState()
  const buckets = getBuckets()

  for (const cfg of buckets) {
    const keyMetas = await listKeysWithMeta(cfg.bucket, `${PREFIX}/stacks/`)
    const stackKeys = keyMetas.filter(
      (k) => k.key.endsWith('.json') && !k.key.endsWith('.json.bak'),
    )
    debug('index', 'listKeysWithMeta', { bucket: cfg.bucket, count: stackKeys.length })

    const enriched = await Promise.all(
      stackKeys.map((meta) => {
        const name = meta.key.replace(`${PREFIX}/stacks/`, '').replace('.json', '')
        const parts = name.split('/')
        if (parts.length !== 2) {
          return null
        }
        const [project, stack] = parts
        return enrichEntry(cfg, project, stack, meta.lastModified)
      }),
    )

    for (const sm of enriched) {
      if (sm) {
        state.stackMap.set(stackId(sm.entry.project, sm.entry.stack), sm)
      }
    }
  }

  state.initialized = true
  debug('index', `built stack index with ${state.stackMap.size} stacks`)
}

/**
 * Incrementally refreshes only stacks whose state file LastModified has changed.
 */
export async function refreshStaleStacks(): Promise<void> {
  debug('sync', 'checking for stale stacks')
  const state = getState()
  const buckets = getBuckets()
  let refreshed = 0

  for (const cfg of buckets) {
    const keyMetas = await listKeysWithMeta(cfg.bucket, `${PREFIX}/stacks/`)
    const stackKeys = keyMetas.filter(
      (k) => k.key.endsWith('.json') && !k.key.endsWith('.json.bak'),
    )

    for (const meta of stackKeys) {
      const name = meta.key.replace(`${PREFIX}/stacks/`, '').replace('.json', '')
      const parts = name.split('/')
      if (parts.length !== 2) {
        continue
      }
      const [project, stack] = parts
      const id = stackId(project, stack)
      const existing = state.stackMap.get(id)

      // Skip if LastModified hasn't changed
      if (existing && existing.stateLastModified.getTime() === meta.lastModified.getTime()) {
        continue
      }

      debug('sync', 'refreshing stale stack', { project, stack })
      const sm = await enrichEntry(cfg, project, stack, meta.lastModified)
      state.stackMap.set(id, sm)
      refreshed++
    }

    // Detect deleted stacks: remove entries whose bucket matches but key no longer exists
    const currentKeys = new Set(
      stackKeys.map((k) => {
        const name = k.key.replace(`${PREFIX}/stacks/`, '').replace('.json', '')
        return name
      }),
    )
    for (const [id, sm] of state.stackMap) {
      if (sm.entry.bucket === cfg.bucket && !currentKeys.has(id)) {
        debug('sync', 'removing deleted stack', { id })
        state.stackMap.delete(id)
        state.historyFilesMap.delete(
          historyFilesCacheKey(cfg.bucket, sm.entry.project, sm.entry.stack),
        )
      }
    }
  }

  debug('sync', `refresh complete`, { refreshed, total: state.stackMap.size })
}

/**
 * Returns the sorted stack index. Builds on first call if not yet initialized.
 */
export async function getStackIndex(): Promise<StackEntry[]> {
  const state = getState()
  if (!state.initialized) {
    await buildStackIndex()
  }

  const entries = [...state.stackMap.values()].map((sm) => sm.entry)
  entries.sort((a, b) => stackId(a.project, a.stack).localeCompare(stackId(b.project, b.stack)))
  debug('index', 'getStackIndex', { count: entries.length })
  return entries
}

/**
 * Clears the index, forcing a full rebuild on next access.
 */
export function clearStackIndex(): void {
  debug('index', 'clearing stack index')
  const state = getState()
  state.stackMap.clear()
  state.historyFilesMap.clear()
  state.initialized = false
}

/**
 * Returns cached history files for a stack. Falls back to building from S3 if not cached.
 */
export async function getHistoryFiles(
  bucket: string,
  project: string,
  stack: string,
): Promise<HistoryFile[]> {
  const { historyFilesMap } = getState()
  const cacheKey = historyFilesCacheKey(bucket, project, stack)
  const cached = historyFilesMap.get(cacheKey)
  if (cached) {
    debug('cache', 'historyFiles cache-hit', { project, stack, count: cached.length })
    return cached
  }

  debug('cache', 'historyFiles cache-miss, fetching from S3', { project, stack })
  const keyMetas = await listKeysWithMeta(bucket, `${PREFIX}/history/${project}/${stack}/`)
  const files = parseHistoryFiles(keyMetas, stack)
  historyFilesMap.set(cacheKey, files)
  return files
}

/**
 * Clears the history files cache for a specific stack.
 */
export function clearHistoryFiles(bucket: string, project: string, stack: string): void {
  getState().historyFilesMap.delete(historyFilesCacheKey(bucket, project, stack))
}

/**
 * Looks up a single stack by project/stack name.
 */
export async function lookupStack(project: string, stack: string): Promise<StackEntry> {
  const index = await getStackIndex()
  const entry = index.find((e) => e.project === project && e.stack === stack)
  if (!entry) {
    throw new Error(`Stack not found: ${project}/${stack}`)
  }
  return entry
}
