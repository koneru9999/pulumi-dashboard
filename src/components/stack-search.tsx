'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export function StackSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(initialQuery)
  }, [initialQuery])

  const push = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (q) {
        params.set('q', q)
      } else {
        params.delete('q')
      }
      params.delete('page')
      router.push(`/?${params.toString()}`)
    },
    [router, searchParams],
  )

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setValue(q)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => push(q), 300)
  }

  return (
    <input
      type="search"
      value={value}
      onChange={handleChange}
      placeholder="Search projects…"
      className="w-full max-w-sm rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus:outline-none"
    />
  )
}
