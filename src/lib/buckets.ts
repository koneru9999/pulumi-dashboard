import 'server-only'

export interface BucketConfig {
  id: string
  label: string
  bucket: string
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

let _cache: BucketConfig[] | null = null

export function getBuckets(): BucketConfig[] {
  if (_cache) {
    return _cache
  }

  const configs: BucketConfig[] = []

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('PULUMI_STATE_BUCKET_') || !value) {
      continue
    }
    const suffix = key.slice('PULUMI_STATE_BUCKET_'.length)
    if (!suffix) {
      continue
    }
    configs.push({ id: suffix.toLowerCase(), label: titleCase(suffix), bucket: value })
  }

  if (configs.length === 0) {
    const bucket = process.env.PULUMI_STATE_BUCKET
    if (!bucket) {
      throw new Error(
        'No S3 bucket configured. Set PULUMI_STATE_BUCKET or PULUMI_STATE_BUCKET_<ENV>.',
      )
    }
    configs.push({ id: 'default', label: 'Default', bucket })
  }

  _cache = configs.sort((a, b) => a.id.localeCompare(b.id))
  return _cache
}
