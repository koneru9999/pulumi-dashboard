'use client'

import { Tabs } from 'radix-ui'
import type * as React from 'react'
import { createContext, useContext, useState } from 'react'
import { cn } from '@/lib/utils'

const ActiveTabCtx = createContext<string>('')

function TabsRoot({
  defaultValue,
  onValueChange,
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Root>) {
  const [active, setActive] = useState(defaultValue ?? '')

  function handleChange(value: string) {
    setActive(value)
    onValueChange?.(value)
  }

  return (
    <ActiveTabCtx.Provider value={active}>
      <Tabs.Root
        defaultValue={defaultValue}
        onValueChange={handleChange}
        className={cn('flex flex-col', className)}
        {...props}
      />
    </ActiveTabCtx.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof Tabs.List>) {
  return <Tabs.List className={cn('flex items-center gap-1', className)} {...props} />
}

function TabsTrigger({ value, className, ...props }: React.ComponentProps<typeof Tabs.Trigger>) {
  const active = useContext(ActiveTabCtx)
  const isActive = active === value

  return (
    <Tabs.Trigger
      value={value}
      className={cn('px-3 py-1.5 text-base transition-colors rounded-md', className)}
      style={{
        cursor: 'pointer',
        color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
        fontWeight: isActive ? 500 : 400,
      }}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof Tabs.Content>) {
  return <Tabs.Content className={cn(className)} {...props} />
}

export { TabsRoot, TabsList, TabsTrigger, TabsContent }
