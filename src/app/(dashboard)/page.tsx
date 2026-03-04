import Link from 'next/link'
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
import { listStacks } from '@/lib/s3'

export const dynamic = 'force-dynamic'

export default async function StacksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10))

  const { items: stacks, total, totalPages } = await listStacks(page)

  const byProject = stacks.reduce<Record<string, typeof stacks>>((acc, s) => {
    if (!acc[s.project]) acc[s.project] = []
    acc[s.project].push(s)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Stacks</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {total} stack{total !== 1 ? 's' : ''}
        </p>
      </div>

      {Object.entries(byProject).map(([project, projectStacks]) => (
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
                {projectStacks.map((s) => (
                  <TableRow key={s.stack}>
                    <TableCell>
                      <Link
                        href={`/stacks/${s.project}/${s.stack}`}
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
                      {s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Pagination page={page} totalPages={totalPages} basePath="/" />
    </div>
  )
}
