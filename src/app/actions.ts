'use server'

import { revalidatePath } from 'next/cache'
import { clearHistoryFilesCache } from '@/lib/s3'
import { clearStackIndex, lookupStack } from '@/lib/stack-index'

export async function refreshStackIndexAction() {
  clearStackIndex()
  revalidatePath('/')
}

export async function refreshStackAction(project: string, stack: string) {
  const entry = await lookupStack(project, stack)
  clearHistoryFilesCache(entry.bucket, project, stack)
  revalidatePath(`/stacks/${project}/${stack}`)
}
