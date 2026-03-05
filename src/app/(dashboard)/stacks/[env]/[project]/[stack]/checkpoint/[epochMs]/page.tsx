import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RelativeTime } from '@/components/relative-time'
import { ResourceTree } from '@/components/resource-tree'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getBucket } from '@/lib/buckets'
import { getCheckpoint } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ env: string; project: string; stack: string; epochMs: string }>
}) {
  const { env, project, stack, epochMs } = await params

  let bucket: string
  let checkpoint: Awaited<ReturnType<typeof getCheckpoint>>

  try {
    ;({ bucket } = getBucket(env))
    checkpoint = await getCheckpoint(bucket, project, stack, epochMs)
  } catch {
    notFound()
  }

  const allResources = checkpoint.checkpoint?.latest?.resources ?? []
  const manifest = checkpoint.checkpoint?.latest?.manifest

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
