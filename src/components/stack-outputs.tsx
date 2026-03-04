'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function isSecret(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'ciphertext' in value
}

function formatValue(value: unknown): string {
  if (isSecret(value)) return '****'
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function OutputRow({ name, value }: { name: string; value: unknown }) {
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)
  const secret = isSecret(value)
  const formatted = formatValue(value)
  const isUrl =
    !secret &&
    typeof value === 'string' &&
    (value.startsWith('https://') || value.startsWith('http://'))

  function handleCopy() {
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <TableRow
      className="py-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <TableCell className="py-2 w-[45%]">
        <span className="font-mono text-xs text-muted-foreground">{name}</span>
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-mono truncate max-w-xl${secret ? ' tracking-widest text-muted-foreground' : ''}`}
          >
            {formatted}
          </span>
          {!secret && (
            <div
              className="flex items-center gap-1 shrink-0"
              style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}
            >
              {isUrl && (
                <a
                  href={value as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  title="Open URL"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={13}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="img"
                    aria-label="Open URL"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="text-muted-foreground hover:text-foreground"
                title={copied ? 'Copied!' : 'Copy value'}
              >
                {copied ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={13}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="img"
                    aria-label="Copied"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={13}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="img"
                    aria-label="Copy"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function StackOutputs({ outputs }: { outputs: Record<string, unknown> }) {
  const entries = Object.entries(outputs)

  if (entries.length === 0) {
    return <div className="p-8 text-center text-muted-foreground text-sm">No outputs defined.</div>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[45%]">Name</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([key, val]) => (
          <OutputRow key={key} name={key} value={val} />
        ))}
      </TableBody>
    </Table>
  )
}
