import 'server-only'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { getBuckets } from './buckets'

interface StackEntry {
  bucket: string
  env: string
  envLabel: string
  project: string
  stack: string
}

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
const PREFIX = '.pulumi'

let _index: StackEntry[] | null = null

async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const obj of res.Contents ?? []) {
      if (obj.Key) {
        keys.push(obj.Key)
      }
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)

  return keys
}

export async function getStackIndex(): Promise<StackEntry[]> {
  if (_index) {
    return _index
  }

  const buckets = getBuckets()
  const entries: StackEntry[] = []

  for (const cfg of buckets) {
    const keys = await listKeys(cfg.bucket, `${PREFIX}/stacks/`)
    for (const key of keys) {
      if (!key.endsWith('.json') || key.endsWith('.json.bak')) {
        continue
      }
      const name = key.replace(`${PREFIX}/stacks/`, '').replace('.json', '')
      const parts = name.split('/')
      if (parts.length !== 2) {
        continue
      }
      const [project, stack] = parts
      entries.push({ bucket: cfg.bucket, env: cfg.id, envLabel: cfg.label, project, stack })
    }
  }

  entries.sort((a, b) => `${a.project}/${a.stack}`.localeCompare(`${b.project}/${b.stack}`))
  _index = entries
  return _index
}

export function clearStackIndex(): void {
  _index = null
}

export async function lookupStack(project: string, stack: string): Promise<StackEntry> {
  const index = await getStackIndex()
  const entry = index.find((e) => e.project === project && e.stack === stack)
  if (!entry) {
    throw new Error(`Stack not found: ${project}/${stack}`)
  }
  return entry
}
