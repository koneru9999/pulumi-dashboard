'use client'

import { useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PulumiResource } from '@/lib/pulumi-types'
import { arnToConsoleUrl, providerColor, resourceName } from '@/lib/resource-utils'

function ResourceLink({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 text-inherit hover:underline"
    >
      {name}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={10}
        height={10}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Open in AWS console"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-50"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  )
}

interface TreeNodeProps {
  node: PulumiResource
  childrenMap: Map<string | undefined, PulumiResource[]>
  depth: number
  collapsed: Set<string>
  onToggle: (urn: string) => void
}

function TreeNode({ node, childrenMap, depth, collapsed, onToggle }: TreeNodeProps) {
  const children = childrenMap.get(node.urn) ?? []
  const hasChildren = children.length > 0
  const isCollapsed = collapsed.has(node.urn)
  const name = resourceName(node.urn)
  const arn = node.outputs?.arn as string | undefined
  const consoleUrl = arn ? arnToConsoleUrl(arn) : null
  const color = providerColor(node.type)

  return (
    <>
      <TableRow>
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full size-2" style={{ backgroundColor: color }} />
            <span className="font-mono text-xs text-muted-foreground">{node.type}</span>
          </div>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.urn)}
                className="shrink-0 border-0 bg-transparent p-0 text-[10px] leading-none w-3.5 text-left text-muted-foreground cursor-pointer"
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span className="shrink-0 w-3.5" />
            )}
            <span className="text-sm">
              {consoleUrl ? <ResourceLink href={consoleUrl} name={name} /> : name}
            </span>
          </div>
        </TableCell>
      </TableRow>
      {!isCollapsed &&
        children.map((child) => (
          <TreeNode
            key={child.urn}
            node={child}
            childrenMap={childrenMap}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}

export function ResourceTree({ resources }: { resources: PulumiResource[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { childrenMap, roots } = useMemo(() => {
    const urnSet = new Set(resources.map((r) => r.urn))
    const map = new Map<string | undefined, PulumiResource[]>()
    for (const r of resources) {
      const parentKey = r.parent && urnSet.has(r.parent) ? r.parent : undefined
      const siblings = map.get(parentKey) ?? []
      siblings.push(r)
      map.set(parentKey, siblings)
    }
    return { childrenMap: map, roots: map.get(undefined) ?? [] }
  }, [resources])

  function handleToggle(urn: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(urn)) {
        next.delete(urn)
      } else {
        next.add(urn)
      }
      return next
    })
  }

  if (resources.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">No resources found.</div>
  }

  return (
    <div className="overflow-auto max-h-[640px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[45%]">Type</TableHead>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roots.map((root) => (
            <TreeNode
              key={root.urn}
              node={root}
              childrenMap={childrenMap}
              depth={0}
              collapsed={collapsed}
              onToggle={handleToggle}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
