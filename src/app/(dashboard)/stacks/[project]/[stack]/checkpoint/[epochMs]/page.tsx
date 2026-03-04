import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCheckpoint } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function CheckpointPage({
  params,
}: {
  params: Promise<{ project: string; stack: string; epochMs: string }>
}) {
  const { project, stack, epochMs } = await params
  const epoch = parseInt(epochMs, 10)

  let checkpoint: Awaited<ReturnType<typeof getCheckpoint>>

  try {
    checkpoint = await getCheckpoint(project, stack, epoch)
  } catch {
    notFound()
  }

  const resources = checkpoint.deployment?.resources ?? []
  const manifest = checkpoint.deployment?.manifest

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground flex items-center gap-1">
        <Link href="/" className="hover:underline">
          Stacks
        </Link>
        <span>/</span>
        <span>{project}</span>
        <span>/</span>
        <Link href={`/stacks/${project}/${stack}`} className="hover:underline">
          {stack}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">
          Snapshot {new Date(epoch).toLocaleString()}
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
            <p className="text-2xl font-bold">{resources.length}</p>
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
              {manifest?.time ? new Date(manifest.time).toLocaleString() : '—'}
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
          <CardTitle className="text-base">Resources ({resources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>URN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r) => (
                <TableRow key={r.urn}>
                  <TableCell className="text-sm font-mono whitespace-nowrap">{r.type}</TableCell>
                  <TableCell>
                    {r.id ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-md">
                    {r.urn}
                  </TableCell>
                </TableRow>
              ))}
              {resources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    No resources in this snapshot.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
