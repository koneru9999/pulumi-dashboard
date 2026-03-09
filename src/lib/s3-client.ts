import 'server-only'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { debug } from './logger'

export const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })
export const PREFIX = '.pulumi'

export interface S3KeyMeta {
  key: string
  lastModified: Date
}

export async function listKeysWithMeta(bucket: string, prefix: string): Promise<S3KeyMeta[]> {
  debug('s3', 'ListObjects', { bucket, prefix })
  const results: S3KeyMeta[] = []
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
      if (obj.Key && obj.LastModified) {
        results.push({ key: obj.Key, lastModified: obj.LastModified })
      }
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)

  debug('s3', `ListObjects returned ${results.length} keys`, { bucket, prefix })
  return results
}

export async function s3JsonSafe<T>(bucket: string, key: string): Promise<T | null> {
  debug('s3', 'GetObject', { bucket, key })
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const body = await res.Body?.transformToString()
    if (!body) {
      return null
    }
    return JSON.parse(body) as T
  } catch {
    return null
  }
}
