'use client'

import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import { TableRow } from '@/components/ui/table'

interface ClickableRowProps extends ComponentProps<typeof TableRow> {
  href: string
}

export function ClickableRow({ href, children, className, ...props }: ClickableRowProps) {
  const router = useRouter()
  return (
    <TableRow
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className ?? ''}`}
      {...props}
    >
      {children}
    </TableRow>
  )
}
