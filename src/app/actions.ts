'use server'

import { revalidatePath } from 'next/cache'
import { clearHistoryFiles, clearStackIndex, lookupStack } from '@/lib/stack-index'

export async function refreshStackIndexAction() {
  clearStackIndex()
  revalidatePath('/')
}

export async function refreshStackAction(project: string, stack: string) {
  const entry = await lookupStack(project, stack)
  clearHistoryFiles(entry.bucket, project, stack)
  revalidatePath(`/stacks/${project}/${stack}`)
}
