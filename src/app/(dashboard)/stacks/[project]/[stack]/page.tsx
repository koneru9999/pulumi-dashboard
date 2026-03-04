import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pagination } from '@/components/pagination'
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
import type { PulumiHistoryEntry } from '@/lib/pulumi-types'
import { getStackState, listHistory, listHistoryFiles } from '@/lib/s3'

export const dynamic = 'force-dynamic'

const RESOURCE_PAGE_SIZE = 50

const resultVariant: Record<PulumiHistoryEntry['result'], 'default' | 'destructive' | 'secondary'> =
  {
    succeeded: 'default',
    failed: 'destructive',
    'in-progress': 'secondary',
  }

function formatDuration(startTime: number, endTime: number) {
  const secs = Math.round(endTime - startTime)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function ResourceChangeBadges({ changes }: { changes?: PulumiHistoryEntry['resourceChanges'] }) {
  if (!changes) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex gap-1 flex-wrap">
      {changes.create ? (
        <span className="text-xs text-green-600 font-medium">+{changes.create}</span>
      ) : null}
      {changes.update ? (
        <span className="text-xs text-yellow-600 font-medium">~{changes.update}</span>
      ) : null}
      {changes.delete ? (
        <span className="text-xs text-red-600 font-medium">-{changes.delete}</span>
      ) : null}
      {changes.same ? (
        <span className="text-xs text-muted-foreground">{changes.same} same</span>
      ) : null}
    </div>
  )
}

export default async function StackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string; stack: string }>
  searchParams: Promise<{ historyPage?: string; resourcePage?: string }>
}) {
  const { project, stack } = await params
  const { historyPage: hp, resourcePage: rp } = await searchParams
  const historyPage = Math.max(1, parseInt(hp ?? '1', 10))
  const resourcePage = Math.max(1, parseInt(rp ?? '1', 10))

  let history: Awaited<ReturnType<typeof listHistory>>
  let state: Awaited<ReturnType<typeof getStackState>>
  let historyFiles: Awaited<ReturnType<typeof listHistoryFiles>>

  try {
    ;[history, state, historyFiles] = await Promise.all([
      listHistory(project, stack, historyPage),
      getStackState(project, stack),
      listHistoryFiles(project, stack),
    ])
  } catch {
    notFound()
  }

  const allResources = state.deployment?.resources ?? []
  const resourceTotalPages = Math.max(1, Math.ceil(allResources.length / RESOURCE_PAGE_SIZE))
  const resources = allResources.slice(
    (resourcePage - 1) * RESOURCE_PAGE_SIZE,
    resourcePage * RESOURCE_PAGE_SIZE,
  )

  const checkpointEpochs = new Set(
    historyFiles.filter((f) => f.type === 'checkpoint').map((f) => f.epoch),
  )

  const stackPath = `/stacks/${project}/${stack}`

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
        <span className="text-foreground font-medium">{stack}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{allResources.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Last deployment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {history.items[0]
                ? new Date(history.items[0].startTime * 1000).toLocaleDateString()
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Total updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{history.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Update history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Message</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.items.map((entry) => (
                <TableRow key={entry.epoch}>
                  <TableCell className="text-muted-foreground text-sm">#{entry.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {entry.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={resultVariant[entry.result] ?? 'secondary'}
                      className="capitalize"
                    >
                      {entry.result}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ResourceChangeBadges changes={entry.resourceChanges} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDuration(entry.startTime, entry.endTime)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {new Date(entry.startTime * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate text-muted-foreground">
                    {entry.message || '—'}
                  </TableCell>
                  <TableCell>
                    {checkpointEpochs.has(entry.epoch) ? (
                      <Link
                        href={`${stackPath}/checkpoint/${entry.epoch}`}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        View snapshot
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {history.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination
            page={historyPage}
            totalPages={history.totalPages}
            basePath={stackPath}
            paramName="historyPage"
            otherParams={rp ? { resourcePage: rp } : undefined}
          />
        </CardContent>
      </Card>

      {/* Resources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resources ({allResources.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>URN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r) => (
                <TableRow key={r.urn}>
                  <TableCell className="text-sm font-mono">{r.type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-md">
                    {r.urn}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={resourcePage}
            totalPages={resourceTotalPages}
            basePath={stackPath}
            paramName="resourcePage"
            otherParams={hp ? { historyPage: hp } : undefined}
          />
        </CardContent>
      </Card>
    </div>
  )
}
