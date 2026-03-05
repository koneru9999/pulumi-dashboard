import 'server-only'

class LruCache {
  private readonly map = new Map<string, { value: string; bytes: number }>()
  private usedBytes = 0

  constructor(readonly maxBytes: number) {}

  get(key: string): string | undefined {
    const entry = this.map.get(key)
    if (!entry) {
      return undefined
    }
    // Re-insert to mark as most recently used
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: string, value: string, bytes: number): void {
    if (bytes > this.maxBytes) {
      return // single item exceeds limit — skip
    }

    // Remove existing entry to update its position and size
    const existing = this.map.get(key)
    if (existing) {
      this.usedBytes -= existing.bytes
      this.map.delete(key)
    }

    // Evict least-recently-used entries until there is room
    while (this.usedBytes + bytes > this.maxBytes) {
      const lruKey = this.map.keys().next().value
      if (lruKey === undefined) {
        break
      }
      const lruEntry = this.map.get(lruKey)
      if (lruEntry) {
        this.usedBytes -= lruEntry.bytes
      }
      this.map.delete(lruKey)
    }

    this.map.set(key, { value, bytes })
    this.usedBytes += bytes
  }

  get size(): number {
    return this.map.size
  }

  get bytesUsed(): number {
    return this.usedBytes
  }
}

const maxBytes = parseInt(process.env.HISTORY_CACHE_MAX_BYTES ?? String(50 * 1024 * 1024), 10)

export const historyCache = new LruCache(maxBytes)
