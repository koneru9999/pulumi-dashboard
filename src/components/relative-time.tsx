'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip'

export function RelativeTime({ ms }: { ms: number }) {
  const date = new Date(ms)
  return (
    <TooltipRoot>
      <TooltipTrigger>
        <span className="cursor-default">{formatDistanceToNow(date, { addSuffix: true })}</span>
      </TooltipTrigger>
      <TooltipContent>{format(date, 'do MMMM yyyy, p')}</TooltipContent>
    </TooltipRoot>
  )
}
