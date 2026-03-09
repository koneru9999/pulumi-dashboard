export async function onRequestError() {
  // Required export — intentionally empty
}

export async function register() {
  // Only run on the server (not edge)
  if (typeof globalThis.setTimeout === 'undefined') {
    return
  }

  const { buildStackIndex, refreshStaleStacks } = await import('@/lib/stack-index')
  const { debug } = await import('@/lib/logger')

  const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS ?? '900000', 10)

  debug('sync', 'pre-building stack index on server start')
  await buildStackIndex()
  debug('sync', 'stack index ready')

  setInterval(async () => {
    try {
      await refreshStaleStacks()
    } catch (err) {
      console.error('[sync] refreshStaleStacks failed:', err)
    }
  }, intervalMs)

  debug('sync', `background sync scheduled every ${intervalMs}ms`)
}
