import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RelativeTime } from '@/components/relative-time'
import { ResourceTree } from '@/components/resource-tree'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui/tabs'
import type { PulumiCheckpoint, PulumiHistoryEntry, PulumiResource } from '@/lib/pulumi-types'
import { getCheckpoint, getHistoryEntry, listHistoryFiles } from '@/lib/s3'
import { lookupStack } from '@/lib/stack-index'

export const dynamic = 'force-dynamic'

// ─── Diff helpers ────────────────────────────────────────────────────────────

interface InputChange {
  key: string
  kind: 'added' | 'removed' | 'changed'
  oldValue?: unknown
  newValue?: unknown
}

interface ResourceChange {
  urn: string
  type: string
  name: string
  status: 'created' | 'updated' | 'deleted'
  inputChanges?: InputChange[]
}

function diffInputs(
  prev: Record<string, unknown> | undefined,
  curr: Record<string, unknown> | undefined,
): InputChange[] {
  const p = prev ?? {}
  const c = curr ?? {}
  const keys = new Set([...Object.keys(p), ...Object.keys(c)])
  const changes: InputChange[] = []
  for (const key of keys) {
    if (!(key in p)) {
      changes.push({ key, kind: 'added', newValue: c[key] })
    } else if (!(key in c)) {
      changes.push({ key, kind: 'removed', oldValue: p[key] })
    } else if (JSON.stringify(p[key]) !== JSON.stringify(c[key])) {
      changes.push({ key, kind: 'changed', oldValue: p[key], newValue: c[key] })
    }
  }
  return changes
}

function computeChanges(prev: PulumiResource[], curr: PulumiResource[]): ResourceChange[] {
  const prevByUrn = new Map(prev.map((r) => [r.urn, r]))
  const currByUrn = new Map(curr.map((r) => [r.urn, r]))
  const changes: ResourceChange[] = []

  for (const r of curr) {
    const name = r.urn.split('::').at(-1) ?? r.urn
    const prevR = prevByUrn.get(r.urn)
    if (!prevR) {
      changes.push({ urn: r.urn, type: r.type, name, status: 'created' })
    } else if (JSON.stringify(prevR.inputs) !== JSON.stringify(r.inputs)) {
      changes.push({
        urn: r.urn,
        type: r.type,
        name,
        status: 'updated',
        inputChanges: diffInputs(prevR.inputs, r.inputs),
      })
    }
  }

  for (const r of prev) {
    if (!currByUrn.has(r.urn)) {
      const name = r.urn.split('::').at(-1) ?? r.urn
      changes.push({ urn: r.urn, type: r.type, name, status: 'deleted' })
    }
  }

  return changes
}

function formatValue(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 100 ? `${s.slice(0, 100)}…` : s
}

// ─── Changes tab component ───────────────────────────────────────────────────

function ChangesList({ changes, hasPrev }: { changes: ResourceChange[]; hasPrev: boolean }) {
  if (!hasPrev) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm">
        No previous snapshot — all resources shown in Resources tab.
      </div>
    )
  }

  if (changes.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">No resource changes.</div>
  }

  const created = changes.filter((c) => c.status === 'created')
  const updated = changes.filter((c) => c.status === 'updated')
  const deleted = changes.filter((c) => c.status === 'deleted')

  const sections = [
    { list: created, label: 'Created', symbol: '+', color: 'text-green-600' },
    { list: updated, label: 'Updated', symbol: '~', color: 'text-yellow-600' },
    { list: deleted, label: 'Deleted', symbol: '-', color: 'text-red-600' },
  ] as const

  return (
    <div className="divide-y">
      {sections.map(({ list, label, symbol, color }) =>
        list.length > 0 ? (
          <div key={label}>
            <div className={`px-4 py-2 text-xs font-medium bg-muted/30 ${color}`}>
              {symbol} {label} ({list.length})
            </div>
            <div className="divide-y">
              {list.map((r) => (
                <div key={r.urn} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs ${color}`}>{symbol}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.type}</span>
                    <span className="text-sm font-medium">{r.name}</span>
                  </div>
                  {r.inputChanges && r.inputChanges.length > 0 && (
                    <div className="mt-2 ml-4 space-y-0.5">
                      {r.inputChanges.map((ic) => (
                        <div key={ic.key} className="font-mono text-xs">
                          {ic.kind === 'added' && (
                            <span>
                              <span className="text-green-600">+ {ic.key}: </span>
                              <span className="text-muted-foreground">
                                {formatValue(ic.newValue)}
                              </span>
                            </span>
                          )}
                          {ic.kind === 'removed' && (
                            <span>
                              <span className="text-red-600">- {ic.key}: </span>
                              <span className="text-muted-foreground line-through">
                                {formatValue(ic.oldValue)}
                              </span>
                            </span>
                          )}
                          {ic.kind === 'changed' && (
                            <span>
                              <span className="text-yellow-600">~ {ic.key}: </span>
                              <span className="text-muted-foreground line-through">
                                {formatValue(ic.oldValue)}
                              </span>
                              <span className="text-muted-foreground"> → </span>
                              <span className="text-muted-foreground">
                                {formatValue(ic.newValue)}
                              </span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null,
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ project: string; stack: string; epochMs: string }>
}) {
  const { project, stack, epochMs } = await params

  let checkpoint: Awaited<ReturnType<typeof getCheckpoint>>
  let historyEntry: PulumiHistoryEntry | null = null
  let prevCheckpoint: PulumiCheckpoint | null = null
  let allFiles: Awaited<ReturnType<typeof listHistoryFiles>>

  try {
    const entry = await lookupStack(project, stack)
    allFiles = await listHistoryFiles(entry.bucket, project, stack)

    const cpFiles = allFiles.filter((f) => f.type === 'checkpoint')
    const currentIndex = cpFiles.findIndex((c) => c.epoch === epochMs)
    const prevEpoch = currentIndex < cpFiles.length - 1 ? cpFiles[currentIndex + 1].epoch : null

    ;[checkpoint, historyEntry, prevCheckpoint] = await Promise.all([
      getCheckpoint(entry.bucket, project, stack, epochMs),
      getHistoryEntry(entry.bucket, project, stack, epochMs).catch(() => null),
      prevEpoch
        ? getCheckpoint(entry.bucket, project, stack, prevEpoch).catch(() => null)
        : Promise.resolve(null),
    ])
  } catch {
    notFound()
  }

  const allResources = checkpoint.checkpoint?.latest?.resources ?? []
  const manifest = checkpoint.checkpoint?.latest?.manifest
  const prevResources = prevCheckpoint?.checkpoint?.latest?.resources ?? []
  const changes = computeChanges(prevResources, allResources)

  // Checkpoint navigation
  const checkpoints = allFiles.filter((f) => f.type === 'checkpoint')
  const currentIndex = checkpoints.findIndex((c) => c.epoch === epochMs)
  const newerEpoch = currentIndex > 0 ? checkpoints[currentIndex - 1].epoch : null
  const olderEpoch =
    currentIndex < checkpoints.length - 1 ? checkpoints[currentIndex + 1].epoch : null
  const checkpointBase = `/stacks/${project}/${stack}/checkpoint`

  const changesCount = changes.length

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground flex items-center gap-1">
        <Link href="/" className="hover:underline">
          Projects
        </Link>
        <span>/</span>
        <span>{project}</span>
        <span>/</span>
        <Link href={`/stacks/${project}/${stack}`} className="hover:underline">
          {stack}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium flex items-center gap-1.5">
          {historyEntry?.result === 'succeeded' && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-500"
              aria-label="Succeeded"
              role="img"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          )}
          {historyEntry?.result === 'failed' && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
              aria-label="Failed"
              role="img"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6M9 9l6 6" />
            </svg>
          )}
          {historyEntry?.result === 'in-progress' && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-yellow-500"
              aria-label="In progress"
              role="img"
            >
              <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
            </svg>
          )}
          Snapshot {manifest?.time ? new Date(manifest.time).toLocaleString() : epochMs}
        </span>
      </div>

      {/* Prev / next navigation */}
      <div className="flex items-center justify-between text-sm">
        <div>
          {newerEpoch ? (
            <Link
              href={`${checkpointBase}/${newerEpoch}`}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>←</span>
              <span>Newer</span>
            </Link>
          ) : (
            <span className="text-muted-foreground/40">← Newer</span>
          )}
        </div>
        <span className="text-muted-foreground">
          {currentIndex + 1} / {checkpoints.length}
        </span>
        <div>
          {olderEpoch ? (
            <Link
              href={`${checkpointBase}/${olderEpoch}`}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Older</span>
              <span>→</span>
            </Link>
          ) : (
            <span className="text-muted-foreground/40">Older →</span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Resources at snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allResources.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Snapshot time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">
              {manifest?.time ? <RelativeTime ms={new Date(manifest.time).getTime()} /> : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Pulumi version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold font-mono">{manifest?.version ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <TabsRoot defaultValue="changes" className="gap-4">
        <TabsList>
          <TabsTrigger value="changes">
            Changes {historyEntry?.resourceChanges ? `(${changesCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="resources">Resources ({allResources.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="changes">
          <Card>
            <CardContent className="p-0">
              <ChangesList changes={changes} hasPrev={prevCheckpoint !== null} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources">
          <Card>
            <CardContent className="p-0">
              <ResourceTree resources={allResources} />
            </CardContent>
          </Card>
        </TabsContent>
      </TabsRoot>
    </div>
  )
}
