import Link from 'next/link'
import { notFound } from 'next/navigation'
import { refreshStackAction } from '@/app/actions'
import { ClickableRow } from '@/components/clickable-row'
import { Pagination } from '@/components/pagination'
import { RelativeTime } from '@/components/relative-time'
import { ResourceTree } from '@/components/resource-tree'
import { StackOutputs } from '@/components/stack-outputs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui/tabs'
import type { PulumiHistoryEntry } from '@/lib/pulumi-types'
import { getStackState, listHistory, listHistoryFiles } from '@/lib/s3'
import { lookupStack } from '@/lib/stack-index'

export const dynamic = 'force-dynamic'

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
  searchParams: Promise<{ historyPage?: string }>
}) {
  const { project, stack } = await params
  const { historyPage: hp } = await searchParams
  const historyPage = Math.max(1, parseInt(hp ?? '1', 10))

  const entry = await lookupStack(project, stack).catch(() => notFound())

  const [history, state, historyFiles] = await Promise.all([
    listHistory(entry.bucket, project, stack, historyPage),
    getStackState(entry.bucket, project, stack),
    listHistoryFiles(entry.bucket, project, stack),
  ])

  const allResources = state.checkpoint?.latest?.resources ?? []
  const deploymentOutputs = state.checkpoint?.latest?.outputs ?? {}
  const stackResourceOutputs =
    allResources.find((r) => r.type === 'pulumi:pulumi:Stack')?.outputs ?? {}
  const stackOutputs = { ...stackResourceOutputs, ...deploymentOutputs } as Record<string, unknown>

  const checkpointEpochs = new Set(
    historyFiles.filter((f) => f.type === 'checkpoint').map((f) => f.epoch),
  )

  const stackPath = `/stacks/${project}/${stack}`

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground flex items-center gap-1">
          <Link href="/" className="hover:underline">
            Stacks
          </Link>
          <span>/</span>
          <span>{project}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{stack}</span>
        </div>
        <form action={refreshStackAction.bind(null, project, stack)}>
          <Button type="submit" variant="ghost" size="icon-sm" title="Refresh stack data">
            ↻
          </Button>
        </form>
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
              {history.items[0] ? <RelativeTime ms={history.items[0].startTime * 1000} /> : '—'}
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

      {/* Tabs: History | Resources | Outputs */}
      <TabsRoot defaultValue="history" className="gap-4">
        <TabsList>
          <TabsTrigger value="history">History ({history.total})</TabsTrigger>
          <TabsTrigger value="resources">Resources ({allResources.length})</TabsTrigger>
          <TabsTrigger value="outputs">Outputs ({Object.keys(stackOutputs).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.items.map((entry) => {
                    const hasSnapshot = checkpointEpochs.has(entry.epoch)
                    const Row = hasSnapshot ? ClickableRow : TableRow
                    const rowProps = hasSnapshot
                      ? { href: `${stackPath}/checkpoint/${entry.epoch}` }
                      : {}
                    return (
                      <Row key={entry.epoch} {...(rowProps as object)}>
                        <TableCell className="text-muted-foreground text-sm">
                          #{entry.version}
                        </TableCell>
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
                          <RelativeTime ms={entry.startTime * 1000} />
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate text-muted-foreground">
                          {entry.message || '—'}
                        </TableCell>
                      </Row>
                    )
                  })}
                  {history.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
              />
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

        <TabsContent value="outputs">
          <Card>
            <CardContent className="p-0">
              <StackOutputs outputs={stackOutputs} />
            </CardContent>
          </Card>
        </TabsContent>
      </TabsRoot>
    </div>
  )
}
