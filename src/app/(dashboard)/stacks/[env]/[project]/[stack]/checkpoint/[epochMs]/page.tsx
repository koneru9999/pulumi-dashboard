import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RelativeTime } from '@/components/relative-time'
import { ResourceTree } from '@/components/resource-tree'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getBucket } from '@/lib/buckets'
import { getCheckpoint, listHistoryFiles } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ env: string; project: string; stack: string; epochMs: string }>
}) {
  const { env, project, stack, epochMs } = await params

  let bucket: string
  let checkpoint: Awaited<ReturnType<typeof getCheckpoint>>
  let allFiles: Awaited<ReturnType<typeof listHistoryFiles>>

  try {
    ;({ bucket } = getBucket(env))
    ;[checkpoint, allFiles] = await Promise.all([
      getCheckpoint(bucket, project, stack, epochMs),
      listHistoryFiles(bucket, project, stack),
    ])
  } catch {
    notFound()
  }

  const allResources = checkpoint.checkpoint?.latest?.resources ?? []
  const manifest = checkpoint.checkpoint?.latest?.manifest

  // Checkpoints sorted newest-first
  const checkpoints = allFiles.filter((f) => f.type === 'checkpoint')
  const currentIndex = checkpoints.findIndex((c) => c.epoch === epochMs)
  const newerEpoch = currentIndex > 0 ? checkpoints[currentIndex - 1].epoch : null
  const olderEpoch =
    currentIndex < checkpoints.length - 1 ? checkpoints[currentIndex + 1].epoch : null
  const checkpointBase = `/stacks/${env}/${project}/${stack}/checkpoint`

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground flex items-center gap-1">
        <Link href="/" className="hover:underline">
          Stacks
        </Link>
        <span>/</span>
        <span>{env}</span>
        <span>/</span>
        <span>{project}</span>
        <span>/</span>
        <Link href={`/stacks/${env}/${project}/${stack}`} className="hover:underline">
          {stack}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
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

      {/* Manifest */}
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

      {/* Resources at this checkpoint */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resources ({allResources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ResourceTree resources={allResources} />
        </CardContent>
      </Card>
    </div>
  )
}
