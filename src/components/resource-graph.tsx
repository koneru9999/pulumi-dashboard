'use client'

import dagre from '@dagrejs/dagre'
import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PulumiResource } from '@/lib/pulumi-types'
import { providerColor, resourceName } from '@/lib/resource-utils'

const NODE_WIDTH = 260
const NODE_HEIGHT = 60

interface ResourceNodeData {
  name: string
  type: string
  color: string
  childCount: number
  collapsed: boolean
  [key: string]: unknown
}

type ResourceNode = Node<ResourceNodeData, 'resource'>

const CollapseContext = createContext<(nodeId: string) => void>(() => {})

function buildChildrenMap(resources: PulumiResource[]): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const r of resources) {
    if (r.parent) {
      const siblings = children.get(r.parent)
      if (siblings) {
        siblings.push(r.urn)
      } else {
        children.set(r.parent, [r.urn])
      }
    }
  }
  return children
}

function getDescendantCount(nodeId: string, childrenMap: Map<string, string[]>): number {
  let count = 0
  const queue = [...(childrenMap.get(nodeId) ?? [])]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.pop()
    if (id === undefined || visited.has(id)) {
      continue
    }
    visited.add(id)
    count++
    for (const child of childrenMap.get(id) ?? []) {
      queue.push(child)
    }
  }
  return count
}

function getHiddenIds(collapsedIds: Set<string>, childrenMap: Map<string, string[]>): Set<string> {
  const hidden = new Set<string>()
  for (const collapsedId of collapsedIds) {
    const queue = [...(childrenMap.get(collapsedId) ?? [])]
    while (queue.length > 0) {
      const id = queue.pop()
      if (id === undefined || hidden.has(id)) {
        continue
      }
      hidden.add(id)
      for (const child of childrenMap.get(id) ?? []) {
        queue.push(child)
      }
    }
  }
  return hidden
}

function computeLayout(
  resources: PulumiResource[],
  collapsedIds: Set<string>,
  childrenMap: Map<string, string[]>,
): { nodes: ResourceNode[]; edges: Edge[] } {
  const hiddenIds = getHiddenIds(collapsedIds, childrenMap)
  const visibleResources = resources.filter((r) => !hiddenIds.has(r.urn))

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  const urnSet = new Set(visibleResources.map((r) => r.urn))

  for (const r of visibleResources) {
    g.setNode(r.urn, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  const edges: Edge[] = []
  for (const r of visibleResources) {
    if (r.parent && urnSet.has(r.parent)) {
      g.setEdge(r.parent, r.urn)
      edges.push({
        id: `${r.parent}->${r.urn}`,
        source: r.parent,
        target: r.urn,
        type: 'smoothstep',
        animated: false,
      })
    }
  }

  dagre.layout(g)

  const nodes: ResourceNode[] = visibleResources.map((r) => {
    const pos = g.node(r.urn)
    return {
      id: r.urn,
      type: 'resource',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        name: resourceName(r.urn),
        type: r.type,
        color: providerColor(r.type),
        childCount: getDescendantCount(r.urn, childrenMap),
        collapsed: collapsedIds.has(r.urn),
      },
    }
  })

  return { nodes, edges }
}

function getConnectedIds(nodeId: string, edges: Edge[]): Set<string> {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const e of edges) {
    children.set(e.source, [...(children.get(e.source) ?? []), e.target])
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source])
  }

  const connected = new Set<string>()

  const upQueue = [nodeId]
  while (upQueue.length > 0) {
    const id = upQueue.pop()
    if (id === undefined || connected.has(id)) {
      continue
    }
    connected.add(id)
    for (const p of parents.get(id) ?? []) {
      upQueue.push(p)
    }
  }

  const downQueue = [nodeId]
  while (downQueue.length > 0) {
    const id = downQueue.pop()
    if (id === undefined || (id !== nodeId && connected.has(id))) {
      continue
    }
    connected.add(id)
    for (const c of children.get(id) ?? []) {
      downQueue.push(c)
    }
  }

  return connected
}

function ResourceNodeComponent({ data, id }: NodeProps<ResourceNode>) {
  const toggleCollapse = useContext(CollapseContext)

  return (
    <div className="relative w-[244px] rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <div className="truncate text-sm font-medium leading-tight">{data.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="shrink-0 rounded-full size-2" style={{ backgroundColor: data.color }} />
        <span className="font-mono text-[11px] leading-tight text-muted-foreground truncate">
          {data.type}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border" />
      {data.childCount > 0 && (
        <button
          type="button"
          className="nodrag absolute -right-3 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-xs font-medium transition-colors hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapse(id)
          }}
        >
          {data.collapsed ? '+' : '\u2212'}
        </button>
      )}
      {data.collapsed && data.childCount > 0 && (
        <span className="absolute -right-1 -top-2 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {data.childCount}
        </span>
      )}
    </div>
  )
}

const nodeTypes = { resource: ResourceNodeComponent }

export function ResourceGraph({ resources }: { resources: PulumiResource[] }) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [prevResources, setPrevResources] = useState(resources)
  if (prevResources !== resources) {
    setPrevResources(resources)
    setCollapsedIds(new Set())
  }

  const childrenMap = useMemo(() => buildChildrenMap(resources), [resources])

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(resources, collapsedIds, childrenMap),
    [resources, collapsedIds, childrenMap],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)
  const [highlightedIds, setHighlightedIds] = useState<Set<string> | null>(null)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
    setHighlightedIds(null)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const applyHighlight = useCallback(
    (connectedNodeIds: Set<string> | null) => {
      setHighlightedIds(connectedNodeIds)
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          style: connectedNodeIds && !connectedNodeIds.has(n.id) ? { opacity: 0.15 } : undefined,
        })),
      )
      setEdges((prev) =>
        prev.map((e) => ({
          ...e,
          animated: connectedNodeIds
            ? connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target)
            : false,
          style:
            connectedNodeIds && !(connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target))
              ? { opacity: 0.08 }
              : undefined,
        })),
      )
    },
    [setNodes, setEdges],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: ResourceNode) => {
      if (highlightedIds?.has(node.id) && highlightedIds.size > 0) {
        applyHighlight(null)
        return
      }
      applyHighlight(getConnectedIds(node.id, layoutEdges))
    },
    [layoutEdges, highlightedIds, applyHighlight],
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const both = new Set([edge.source, edge.target])
      const connected = new Set<string>()
      for (const id of both) {
        for (const c of getConnectedIds(id, layoutEdges)) {
          connected.add(c)
        }
      }
      applyHighlight(connected)
    },
    [layoutEdges, applyHighlight],
  )

  const handlePaneClick = useCallback(() => {
    applyHighlight(null)
  }, [applyHighlight])

  if (resources.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">No resources found.</div>
  }

  return (
    <CollapseContext.Provider value={toggleCollapse}>
      <div className="h-[600px] w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>
    </CollapseContext.Provider>
  )
}
