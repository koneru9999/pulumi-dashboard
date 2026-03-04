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

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
const BUCKET = process.env.PULUMI_STATE_BUCKET
if (!BUCKET) throw new Error('PULUMI_STATE_BUCKET env var is required')
const PREFIX = '.pulumi'

// ─── Helpers ───────────────────────────────────────────────────────────────

// Keys under .pulumi/history/ are immutable once written — safe to cache.
function isImmutable(key: string): boolean {
  return key.includes(`${PREFIX}/history/`)
}

async function s3Json<T>(key: string): Promise<T> {
  if (isImmutable(key)) {
    const cached = historyCache.get(key)
    if (cached) return JSON.parse(cached) as T
  }

  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const body = await res.Body?.transformToString()
  if (!body) throw new Error(`Empty response body for S3 key: ${key}`)

  if (isImmutable(key)) {
    historyCache.set(key, body, Buffer.byteLength(body, 'utf8'))
  }

  return JSON.parse(body) as T
}

async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
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

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of stacks, sorted alphabetically by project/stack.
 * Only fetches S3 content for the current page — key listing is cheap.
 */
export async function listStacks(page = 1, pageSize = 25): Promise<Paginated<StackSummary>> {
  const keys = await listKeys(`${PREFIX}/stacks/`)
  const stackKeys = keys.filter((k) => k.endsWith('.json') && !k.endsWith('.json.bak')).sort()

  const total = stackKeys.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageKeys = stackKeys.slice((page - 1) * pageSize, page * pageSize)

  const items = await Promise.all(
    pageKeys.map(async (key) => {
      // .pulumi/stacks/{project}/{stack}.json
      const parts = key.replace(`${PREFIX}/stacks/`, '').replace('.json', '').split('/')
      const project = parts[0]
      const stack = parts[1]

      try {
        const state = await s3Json<PulumiStackState>(key)
        const resources = state.deployment?.resources ?? []
        const manifest = state.deployment?.manifest
        return {
          project,
          stack,
          lastUpdated: manifest?.time,
          resourceCount: resources.length,
        } satisfies StackSummary
      } catch {
        return { project, stack } satisfies StackSummary
      }
    }),
  )

  return { items, total, page, pageSize, totalPages }
}

/**
 * Returns a paginated list of history entries for a stack, sorted newest-first.
 * Parses epochMs from filenames to sort without fetching content, then fetches
 * only the current page.
 */
export async function listHistory(
  project: string,
  stack: string,
  page = 1,
  pageSize = 25,
): Promise<Paginated<PulumiHistoryEntry & { epochMs: number }>> {
  const prefix = `${PREFIX}/history/${project}/${stack}/`
  const keys = await listKeys(prefix)

  const sorted = keys
    .filter((k) => k.endsWith('.history.json'))
    .map((key) => {
      const filename = key.split('/').pop() ?? ''
      const epochMs = parseInt(filename.split('-').pop()?.replace('.history.json', '') ?? '0', 10)
      return { key, epochMs }
    })
    .sort((a, b) => b.epochMs - a.epochMs)

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageSlice = sorted.slice((page - 1) * pageSize, page * pageSize)

  const items = await Promise.all(
    pageSlice.map(async ({ key, epochMs }) => {
      const entry = await s3Json<PulumiHistoryEntry>(key)
      return { ...entry, epochMs }
    }),
  )

  return { items, total, page, pageSize, totalPages }
}

/**
 * Returns a list of all history + checkpoint file metadata for a stack, sorted newest-first.
 */
export async function listHistoryFiles(project: string, stack: string): Promise<HistoryFile[]> {
  const prefix = `${PREFIX}/history/${project}/${stack}/`
  const keys = await listKeys(prefix)

  return keys
    .filter((k) => k.endsWith('.history.json') || k.endsWith('.checkpoint.json'))
    .map((key) => {
      const filename = key.split('/').pop() ?? ''
      const isHistory = filename.endsWith('.history.json')
      const suffix = isHistory ? '.history.json' : '.checkpoint.json'
      const epochMs = parseInt(filename.replace(`${stack}-`, '').replace(suffix, ''), 10)
      return { key, epochMs, type: isHistory ? 'history' : 'checkpoint' } satisfies HistoryFile
    })
    .sort((a, b) => b.epochMs - a.epochMs)
}

/**
 * Returns the checkpoint (frozen resource state) for a specific update epoch.
 */
export async function getCheckpoint(
  project: string,
  stack: string,
  epochMs: number,
): Promise<PulumiCheckpoint> {
  const key = `${PREFIX}/history/${project}/${stack}/${stack}-${epochMs}.checkpoint.json`
  return s3Json<PulumiCheckpoint>(key)
}

/**
 * Returns the current stack state (resources, manifest).
 */
export async function getStackState(project: string, stack: string): Promise<PulumiStackState> {
  const key = `${PREFIX}/stacks/${project}/${stack}.json`
  return s3Json<PulumiStackState>(key)
}
