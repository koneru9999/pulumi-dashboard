import 'server-only'

const enabled = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

type LogCategory = 's3' | 'cache' | 'api' | 'route' | 'index' | 'sync'

export function debug(
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (!enabled) {
    return
  }
  const parts = [`[${category}]`, message]
  if (meta) {
    parts.push(JSON.stringify(meta))
  }
  console.log(parts.join(' '))
}
