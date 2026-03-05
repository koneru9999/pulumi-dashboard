'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Bucket {
  id: string
  label: string
}

export function EnvSelector({ buckets, selected }: { buckets: Bucket[]; selected: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('env')
    } else {
      params.set('env', value)
    }
    params.delete('page')
    router.push(`/?${params.toString()}`)
  }

  return (
    <Select value={selected || 'all'} onValueChange={handleChange}>
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="all">All environments</SelectItem>
        {buckets.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
