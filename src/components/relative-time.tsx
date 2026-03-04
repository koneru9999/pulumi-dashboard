'use client'

import { formatDistanceToNow } from 'date-fns'
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip'

export function RelativeTime({ ms }: { ms: number }) {
  const date = new Date(ms)
  return (
    <TooltipRoot>
      <TooltipTrigger>
        <span style={{ cursor: 'default' }}>{formatDistanceToNow(date, { addSuffix: true })}</span>
      </TooltipTrigger>
      <TooltipContent>{date.toLocaleString()}</TooltipContent>
    </TooltipRoot>
  )
}
