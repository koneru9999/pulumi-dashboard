import Link from 'next/link'

interface PaginationProps {
  page: number
  totalPages: number
  /** Base path without query string, e.g. "/stacks/myproject/mystack" */
  basePath: string
  /** Search param name for the page number. Defaults to "page". */
  paramName?: string
  /** Other search params to preserve in every link, e.g. { historyPage: "2" } */
  otherParams?: Record<string, string>
}

function buildHref(
  basePath: string,
  paramName: string,
  page: number,
  otherParams?: Record<string, string>,
): string {
  const params = new URLSearchParams({ ...otherParams, [paramName]: String(page) })
  return `${basePath}?${params}`
}

type PageItem = { key: string; value: number | '...' }

function pageNumbers(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => ({ key: String(i + 1), value: i + 1 }))
  }

  const delta = 2
  const items: PageItem[] = [{ key: '1', value: 1 }]

  const start = Math.max(2, page - delta)
  const end = Math.min(totalPages - 1, page + delta)

  if (start > 2) items.push({ key: 'ellipsis-start', value: '...' })
  for (let i = start; i <= end; i++) items.push({ key: String(i), value: i })
  if (end < totalPages - 1) items.push({ key: 'ellipsis-end', value: '...' })

  items.push({ key: String(totalPages), value: totalPages })
  return items
}

export function Pagination({
  page,
  totalPages,
  basePath,
  paramName = 'page',
  otherParams,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = pageNumbers(page, totalPages)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={buildHref(basePath, paramName, page - 1, otherParams)}
            className="px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            ←
          </Link>
        ) : (
          <span className="px-2 py-1 text-muted-foreground/40 cursor-not-allowed">←</span>
        )}

        {pages.map(({ key, value }) =>
          value === '...' ? (
            <span key={key} className="px-2 py-1 text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={key}
              href={buildHref(basePath, paramName, value, otherParams)}
              className={`px-2 py-1 rounded transition-colors ${
                value === page ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
              }`}
            >
              {value}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link
            href={buildHref(basePath, paramName, page + 1, otherParams)}
            className="px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            →
          </Link>
        ) : (
          <span className="px-2 py-1 text-muted-foreground/40 cursor-not-allowed">→</span>
        )}
      </div>
    </div>
  )
}
