import 'server-only'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { historyCache } from './cache'
import { debug } from './logger'
import type {
  Paginated,
  PulumiCheckpoint,
  PulumiHistoryEntry,
  PulumiStackState,
  StackSummary,
} from './pulumi-types'
import { PREFIX, s3 } from './s3-client'
import { getHistoryFiles, getStackIndex } from './stack-index'

// ─── Helpers ───────────────────────────────────────────────────────────────

// Keys under .pulumi/history/ are immutable once written — safe to cache.
function isImmutable(key: string): boolean {
  return key.includes(`${PREFIX}/history/`)
}

async function s3Json<T>(bucket: string, key: string): Promise<T> {
  const cacheKey = `${bucket}:${key}`
  if (isImmutable(key)) {
    const cached = historyCache.get(cacheKey)
    if (cached) {
      debug('s3', 'GetObject cache-hit', { bucket, key })
      return JSON.parse(cached) as T
    }
  }

  debug('s3', 'GetObject', { bucket, key })
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = await res.Body?.transformToString()
  if (!body) {
    throw new Error(`Empty response body for S3 key: ${key}`)
  }

  if (isImmutable(key)) {
    historyCache.set(cacheKey, body, Buffer.byteLength(body, 'utf8'))
  }

  return JSON.parse(body) as T
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
  debug('api', 'listStacks', { page, pageSize, query })
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
  const totalPages = Math.max(1, Math.ceil(projects.length / pageSize))
  const pageProjects = projects.slice((page - 1) * pageSize, page * pageSize)
  const items: StackSummary[] = pageProjects.flatMap(
    (p) =>
      projectMap.get(p)?.map((e) => ({
        env: e.env,
        envLabel: e.envLabel,
        project: e.project,
        stack: e.stack,
        lastUpdated: e.lastUpdated,
        lastResult: e.lastResult,
        resourceCount: e.resourceCount,
      })) ?? [],
  )

  return { items, total: projects.length, page, pageSize, totalPages }
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
  debug('api', 'listHistory', { project, stack, page, pageSize })
  const allFiles = await getHistoryFiles(bucket, project, stack)
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
 * Constructs the S3 key directly from the deterministic path pattern.
 */
export async function getCheckpoint(
  bucket: string,
  project: string,
  stack: string,
  epoch: string,
): Promise<PulumiCheckpoint> {
  debug('api', 'getCheckpoint', { project, stack, epoch })
  const key = `${PREFIX}/history/${project}/${stack}/${stack}-${epoch}.checkpoint.json`
  return s3Json<PulumiCheckpoint>(bucket, key)
}

/**
 * Returns the history entry (metadata) for a specific update epoch.
 * Constructs the S3 key directly from the deterministic path pattern.
 */
export async function getHistoryEntry(
  bucket: string,
  project: string,
  stack: string,
  epoch: string,
): Promise<PulumiHistoryEntry> {
  debug('api', 'getHistoryEntry', { project, stack, epoch })
  const key = `${PREFIX}/history/${project}/${stack}/${stack}-${epoch}.history.json`
  return s3Json<PulumiHistoryEntry>(bucket, key)
}

/**
 * Returns the current stack state (resources, manifest).
 */
export async function getStackState(
  bucket: string,
  project: string,
  stack: string,
): Promise<PulumiStackState> {
  debug('api', 'getStackState', { project, stack })
  const key = `${PREFIX}/stacks/${project}/${stack}.json`
  return s3Json<PulumiStackState>(bucket, key)
}
