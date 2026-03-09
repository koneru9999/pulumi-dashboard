'use client'

import { List, Workflow } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { ResourceTree } from '@/components/resource-tree'
import type { PulumiResource } from '@/lib/pulumi-types'

const ResourceGraph = dynamic(() => import('@/components/resource-graph-lazy'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] items-center justify-center text-sm text-muted-foreground">
      Loading graph…
    </div>
  ),
})

type View = 'list' | 'graph'

export function ResourceView({ resources }: { resources: PulumiResource[] }) {
  const [view, setView] = useState<View>('list')

  return (
    <div>
      <div className="flex items-center gap-1 border-b px-4 py-2">
        <button
          type="button"
          onClick={() => setView('list')}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'list'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <List size={16} />
          List View
        </button>
        <button
          type="button"
          onClick={() => setView('graph')}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'graph'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Workflow size={16} />
          Graph View
        </button>
      </div>
      {view === 'list' ? <ResourceTree resources={resources} /> : null}
      {view === 'graph' ? <ResourceGraph resources={resources} /> : null}
    </div>
  )
}
