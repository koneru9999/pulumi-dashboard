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

const PROVIDER_COLORS: Record<string, string> = {
  aws: '#FF9900',
  'aws-native': '#FF9900',
  gcp: '#4285F4',
  'google-native': '#4285F4',
  azure: '#0078D4',
  'azure-native': '#0078D4',
  pulumi: '#8A3FC7',
  docker: '#2496ED',
  kubernetes: '#326CE5',
  k8s: '#326CE5',
  random: '#10B981',
  tls: '#6366F1',
}

function providerColor(type: string): string {
  const provider = type.split(':')[0]
  return PROVIDER_COLORS[provider] ?? '#6B7280'
}

function arnToConsoleUrl(arn: string): string | null {
  if (!arn.startsWith('arn:')) {
    return null
  }
  const parts = arn.split(':')
  if (parts.length < 6) {
    return null
  }
  const [, partition, service, region, account, ...resourceParts] = parts
  const resource = resourceParts.join(':')
  if (partition !== 'aws') {
    return null
  }
  const base = 'https://console.aws.amazon.com'
  switch (service) {
    case 'iam': {
      if (resource.startsWith('role/')) {
        return `${base}/iam/home#/roles/${resource.slice(5)}`
      }
      if (resource.startsWith('policy/')) {
        return `${base}/iam/home#/policies/${encodeURIComponent(arn)}`
      }
      return `${base}/iam/home`
    }
    case 'lambda': {
      const name = resource.split(':')[1]
      return name ? `${base}/lambda/home?region=${region}#/functions/${name}` : null
    }
    case 'logs': {
      const logGroup = resource.replace(/^log-group:/, '')
      return `${base}/cloudwatch/home?region=${region}#logsV2:log-groups/log-group-name/${encodeURIComponent(logGroup)}`
    }
    case 'cloudwatch': {
      if (resource.startsWith('alarm:')) {
        return `${base}/cloudwatch/home?region=${region}#alarmsV2:alarm/${encodeURIComponent(resource.slice(6))}`
      }
      return null
    }
    case 'states': {
      if (resource.startsWith('stateMachine:')) {
        return `${base}/states/home?region=${region}#/statemachines/view/${encodeURIComponent(arn)}`
      }
      return null
    }
    case 'sqs': {
      const queueUrl = `https://sqs.${region}.amazonaws.com/${account}/${resource}`
      return `${base}/sqs/v2/home?region=${region}#/queues/${encodeURIComponent(queueUrl)}`
    }
    case 'sns':
      return `${base}/sns/v3/home?region=${region}#/topic/${encodeURIComponent(arn)}`
    case 'ecr': {
      if (resource.startsWith('repository/')) {
        return `${base}/ecr/repositories/private/${account}/${resource.slice(11)}?region=${region}`
      }
      return null
    }
    case 's3':
      return `${base}/s3/buckets/${resource}`
    case 'dynamodb': {
      if (resource.startsWith('table/')) {
        return `${base}/dynamodbv2/home?region=${region}#table?name=${encodeURIComponent(resource.slice(6).split('/')[0])}`
      }
      return null
    }
    case 'rds': {
      if (resource.startsWith('db:')) {
        return `${base}/rds/home?region=${region}#database:id=${resource.slice(3)}`
      }
      return null
    }
    case 'secretsmanager':
      return `${base}/secretsmanager/secret?name=${encodeURIComponent(resource.replace(/^secret:/, ''))}&region=${region}`
    case 'ssm': {
      if (resource.startsWith('parameter/')) {
        return `${base}/systems-manager/parameters/${resource.slice(10)}/description?region=${region}`
      }
      return null
    }
    default:
      return null
  }
}

function ResourceLink({ href, name }: { href: string; name: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        textDecoration: hovered ? 'underline' : 'none',
        color: 'inherit',
      }}
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
        style={{ opacity: hovered ? 0.5 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}
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
  const name = node.urn.split('::').at(-1) ?? node.urn
  const arn = node.outputs?.arn as string | undefined
  const consoleUrl = arn ? arnToConsoleUrl(arn) : null
  const color = providerColor(node.type)

  return (
    <>
      <TableRow>
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 rounded-full"
              style={{ width: 8, height: 8, backgroundColor: color }}
            />
            <span className="font-mono text-xs text-muted-foreground">{node.type}</span>
          </div>
        </TableCell>
        <TableCell className="py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.urn)}
                className="text-muted-foreground shrink-0"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: 10,
                  width: 14,
                  textAlign: 'left',
                }}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
            ) : (
              <span className="shrink-0" style={{ width: 14 }} />
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
