import 'server-only'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { historyCache } from './cache'
import type {
  HistoryFile,
  Paginated,
  PulumiCheckpoint,
  PulumiHistoryEntry,
  PulumiStackState,
  StackSummary,
} from './pulumi-types'
import { getStackIndex } from './stack-index'

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
const PREFIX = '.pulumi'

// ─── Helpers ───────────────────────────────────────────────────────────────

// Keys under .pulumi/history/ are immutable once written — safe to cache.
function isImmutable(key: string): boolean {
  return key.includes(`${PREFIX}/history/`)
}

async function s3Json<T>(bucket: string, key: string): Promise<T> {
  const cacheKey = `${bucket}:${key}`
  if (isImmutable(key)) {
    const cached = historyCache.get(cacheKey)
    if (cached) return JSON.parse(cached) as T
  }

  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = await res.Body?.transformToString()
  if (!body) throw new Error(`Empty response body for S3 key: ${key}`)

  if (isImmutable(key)) {
    historyCache.set(cacheKey, body, Buffer.byteLength(body, 'utf8'))
  }

  return JSON.parse(body) as T
}

async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)

  return keys
}

// ─── History files cache ────────────────────────────────────────────────────

const historyFilesCache = new Map<string, HistoryFile[]>()

export function clearHistoryFilesCache(bucket: string, project: string, stack: string): void {
  historyFilesCache.delete(`${bucket}:${project}/${stack}`)
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of stacks across all configured buckets, sorted alphabetically.
 * Paginates by project group so a project is never split across pages.
 * pageSize = number of projects per page.
 */
export async function listStacks(
  page = 1,
  pageSize = 25,
  query = '',
): Promise<Paginated<StackSummary>> {
  const index = await getStackIndex()
  const q = query.trim().toLowerCase()

  const filtered = q
    ? index.filter((e) => e.project.toLowerCase().includes(q) || e.stack.toLowerCase().includes(q))
    : index

  // Group entries by project, preserving sort order from the index
  const projectMap = new Map<string, typeof filtered>()
  for (const entry of filtered) {
    const group = projectMap.get(entry.project) ?? []
    group.push(entry)
    projectMap.set(entry.project, group)
  }

  const projects = [...projectMap.keys()]
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize))
  const pageProjects = projects.slice((page - 1) * pageSize, page * pageSize)
  const pageEntries = pageProjects.flatMap((p) => projectMap.get(p) ?? [])

  const items = await Promise.all(
    pageEntries.map(async ({ bucket, env, envLabel, project, stack }) => {
      const key = `${PREFIX}/stacks/${project}/${stack}.json`
      try {
        const state = await s3Json<PulumiStackState>(bucket, key)
        const resources = state.checkpoint?.latest?.resources ?? []
        const manifest = state.checkpoint?.latest?.manifest
        return {
          env,
          envLabel,
          project,
          stack,
          lastUpdated: manifest?.time,
          resourceCount: resources.length,
        } satisfies StackSummary
      } catch {
        return { env, envLabel, project, stack } satisfies StackSummary
      }
    }),
  )

  return { items, total, page, pageSize, totalPages }
}

/**
 * Returns a list of all history + checkpoint file metadata for a stack, sorted newest-first.
 * Results are cached per bucket/project/stack.
 */
export async function listHistoryFiles(
  bucket: string,
  project: string,
  stack: string,
): Promise<HistoryFile[]> {
  const cacheKey = `${bucket}:${project}/${stack}`
  const cached = historyFilesCache.get(cacheKey)
  if (cached) return cached

  const prefix = `${PREFIX}/history/${project}/${stack}/`
  const keys = await listKeys(bucket, prefix)

  const result = keys
    .filter((k) => k.endsWith('.history.json') || k.endsWith('.checkpoint.json'))
    .map((key) => {
      const filename = key.split('/').pop() ?? ''
      const isHistory = filename.endsWith('.history.json')
      const suffix = isHistory ? '.history.json' : '.checkpoint.json'
      const epoch = filename.replace(`${stack}-`, '').replace(suffix, '')
      return { key, epoch, type: isHistory ? 'history' : 'checkpoint' } satisfies HistoryFile
    })
    .sort((a, b) => (BigInt(b.epoch) > BigInt(a.epoch) ? 1 : -1))

  historyFilesCache.set(cacheKey, result)
  return result
}

/**
 * Returns a paginated list of history entries for a stack, sorted newest-first.
 */
export async function listHistory(
  bucket: string,
  project: string,
  stack: string,
  page = 1,
  pageSize = 25,
): Promise<Paginated<PulumiHistoryEntry & { epoch: string }>> {
  const allFiles = await listHistoryFiles(bucket, project, stack)
  const sorted = allFiles.filter((f) => f.type === 'history')

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageSlice = sorted.slice((page - 1) * pageSize, page * pageSize)

  const items = await Promise.all(
    pageSlice.map(async ({ key, epoch }, i) => {
      const entry = await s3Json<PulumiHistoryEntry>(bucket, key)
      const version = total - ((page - 1) * pageSize + i)
      return { ...entry, epoch, version }
    }),
  )

  return { items, total, page, pageSize, totalPages }
}

/**
 * Returns the checkpoint (frozen resource state) for a specific update epoch.
 */
export async function getCheckpoint(
  bucket: string,
  project: string,
  stack: string,
  epoch: string,
): Promise<PulumiCheckpoint> {
  const files = await listHistoryFiles(bucket, project, stack)
  const file = files.find((f) => f.type === 'checkpoint' && f.epoch === epoch)
  if (!file) throw new Error(`No checkpoint found for ${project}/${stack} at epoch ${epoch}`)
  return s3Json<PulumiCheckpoint>(bucket, file.key)
}

/**
 * Returns the history entry (metadata) for a specific update epoch.
 */
export async function getHistoryEntry(
  bucket: string,
  project: string,
  stack: string,
  epoch: string,
): Promise<PulumiHistoryEntry> {
  const files = await listHistoryFiles(bucket, project, stack)
  const file = files.find((f) => f.type === 'history' && f.epoch === epoch)
  if (!file) throw new Error(`No history entry found for ${project}/${stack} at epoch ${epoch}`)
  return s3Json<PulumiHistoryEntry>(bucket, file.key)
}

/**
 * Returns the current stack state (resources, manifest).
 */
export async function getStackState(
  bucket: string,
  project: string,
  stack: string,
): Promise<PulumiStackState> {
  const key = `${PREFIX}/stacks/${project}/${stack}.json`
  return s3Json<PulumiStackState>(bucket, key)
}
