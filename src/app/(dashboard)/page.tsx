import Link from 'next/link'
import { Suspense } from 'react'
import { EnvSelector } from '@/components/env-selector'
import { Pagination } from '@/components/pagination'
import { RelativeTime } from '@/components/relative-time'
import { StackSearch } from '@/components/stack-search'
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
import { getBuckets } from '@/lib/buckets'
import { listStacks } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function StacksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; env?: string }>
}) {
  const { page: pageParam, q, env } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))
  const query = q ?? ''
  const envFilter = env ?? ''

  const buckets = getBuckets()
  const { items: stacks, total, totalPages } = await listStacks(page, 25, query, envFilter)

  const multiEnv = new Set(stacks.map((s) => s.env)).size > 1

  const byGroup = stacks.reduce<Record<string, typeof stacks>>((acc, s) => {
    const key = `${s.env}/${s.project}`
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stacks</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {total} stack{total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {buckets.length > 1 && (
            <Suspense>
              <EnvSelector
                buckets={buckets.map(({ id, label }) => ({ id, label }))}
                selected={envFilter}
              />
            </Suspense>
          )}
          <Suspense>
            <StackSearch initialQuery={query} />
          </Suspense>
        </div>
      </div>

      {Object.entries(byGroup).map(([group, groupStacks]) => {
        const { envLabel, project } = groupStacks[0]
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                {multiEnv && (
                  <span
                    className="text-xs font-normal px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                  >
                    {envLabel}
                  </span>
                )}
                {project}
              </CardTitle>
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
                    <TableRow key={s.stack}>
                      <TableCell>
                        <Link
                          href={`/stacks/${s.env}/${s.project}/${s.stack}`}
                          className="font-medium hover:underline"
                        >
                          {s.stack}
                        </Link>
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
