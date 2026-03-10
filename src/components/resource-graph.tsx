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
import { useEffect, useMemo } from 'react'
import type { PulumiResource } from '@/lib/pulumi-types'
import { providerColor, resourceName } from '@/lib/resource-utils'

const NODE_WIDTH = 260
const NODE_HEIGHT = 60

interface ResourceNodeData {
  name: string
  type: string
  color: string
  [key: string]: unknown
}

type ResourceNode = Node<ResourceNodeData, 'resource'>

function computeLayout(resources: PulumiResource[]): { nodes: ResourceNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  const urnSet = new Set(resources.map((r) => r.urn))

  for (const r of resources) {
    g.setNode(r.urn, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  const edges: Edge[] = []
  for (const r of resources) {
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

  const nodes: ResourceNode[] = resources.map((r) => {
    const pos = g.node(r.urn)
    return {
      id: r.urn,
      type: 'resource',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        name: resourceName(r.urn),
        type: r.type,
        color: providerColor(r.type),
      },
    }
  })

  return { nodes, edges }
}

function ResourceNodeComponent({ data }: NodeProps<ResourceNode>) {
  return (
    <div className="w-[244px] rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <div className="truncate text-sm font-medium leading-tight">{data.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="shrink-0 rounded-full size-2" style={{ backgroundColor: data.color }} />
        <span className="font-mono text-[11px] leading-tight text-muted-foreground truncate">
          {data.type}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  )
}

const nodeTypes = { resource: ResourceNodeComponent }

export function ResourceGraph({ resources }: { resources: PulumiResource[] }) {
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () => computeLayout(resources),
    [resources],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  if (resources.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">No resources found.</div>
  }

  return (
    <div className="h-[600px] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
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
  )
}
