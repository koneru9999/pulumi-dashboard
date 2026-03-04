'use client'

import { Tooltip } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function TooltipProvider({ children, ...props }: React.ComponentProps<typeof Tooltip.Provider>) {
  return (
    <Tooltip.Provider delayDuration={300} {...props}>
      {children}
    </Tooltip.Provider>
  )
}

function TooltipRoot({ children, ...props }: React.ComponentProps<typeof Tooltip.Root>) {
  return <Tooltip.Root {...props}>{children}</Tooltip.Root>
}

function TooltipTrigger({ children, ...props }: React.ComponentProps<typeof Tooltip.Trigger>) {
  return (
    <Tooltip.Trigger asChild {...props}>
      {children}
    </Tooltip.Trigger>
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof Tooltip.Content>) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        sideOffset={sideOffset}
        className={cn('z-50 rounded-md px-3 py-1.5 text-xs shadow-md', className)}
        style={{
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
        }}
        {...props}
      />
    </Tooltip.Portal>
  )
}

export { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
