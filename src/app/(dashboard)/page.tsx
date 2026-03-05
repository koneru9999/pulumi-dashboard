import Link from 'next/link'
import { Suspense } from 'react'
import { refreshStackIndexAction } from '@/app/actions'
import { Pagination } from '@/components/pagination'
import { RelativeTime } from '@/components/relative-time'
import { StackSearch } from '@/components/stack-search'
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
import { listStacks } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function StacksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>
}) {
  const { page: pageParam, q } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const query = q ?? ''

  const { items: stacks, total, totalPages } = await listStacks(page, 25, query)

  const byProject = stacks.reduce<Record<string, typeof stacks>>((acc, s) => {
    if (!acc[s.project]) {
      acc[s.project] = []
    }
    acc[s.project].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} project{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={refreshStackIndexAction}>
            <Button type="submit" variant="ghost" size="sm" title="Refresh projects list">
              ↻
            </Button>
          </form>
          <Suspense>
            <StackSearch initialQuery={query} />
          </Suspense>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} basePath="/" className="border-b" />

      {Object.entries(byProject).map(([project, groupStacks]) => {
        const projectMultiEnv = new Set(groupStacks.map((s) => s.env)).size > 1
        return (
          <Card key={project}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{project}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stack</TableHead>
                    <TableHead>Resources</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupStacks.map((s) => (
                    <TableRow key={`${s.env}/${s.stack}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/stacks/${s.project}/${s.stack}`}
                            className="font-medium hover:underline"
                          >
                            {s.stack}
                          </Link>
                          {projectMultiEnv && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: 'var(--muted)',
                                color: 'var(--muted-foreground)',
                              }}
                            >
                              {s.envLabel}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {s.resourceCount !== undefined ? (
                          <Badge variant="secondary">{s.resourceCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {s.lastUpdated ? (
                          <RelativeTime ms={new Date(s.lastUpdated).getTime()} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      <Pagination page={page} totalPages={totalPages} basePath="/" />
    </div>
  )
}
