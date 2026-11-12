import type { VaultEntry, requestJoyHouseVault } from './vault-bridge.ts'

/** Use the local calendar day, not UTC, for a person's daily log. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function workLogLocation(entries: VaultEntry[], date: Date): { dir: string; name: string; path: string } {
  const name = `work-log-${localDay(date)}`
  const dir = entries.some(entry => entry.kind === 'dir' && entry.path === 'notes') ? 'notes' : ''
  return { dir, name, path: `${dir ? `${dir}/` : ''}${name}.md` }
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export function imageAssetPath(file: { name: string; size: number }, id: string): string {
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!extension || !['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension))
    throw new Error('IMAGE_TYPE')
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_SIZE')
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 64) || 'image'
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('IMAGE_ID')
  return `attachments/${stem}-${id}.${extension}`
}

/** Serialize writes, and allow a failed save to be retried without poisoning the queue. */
export function createSaveQueue(write: (path: string, content: string) => Promise<unknown>) {
  let tail = Promise.resolve()
  return (path: string, content: string): Promise<void> => {
    const next = tail.then(async () => { await write(path, content) })
    tail = next.catch(() => {})
    return next
  }
}

/** Reopening today's log must never reset the person's existing writing. */
export async function getOrCreateWorkLog(
  request: typeof requestJoyHouseVault, date: Date, title: string, template: string,
): Promise<string> {
  const entries = await request('list')
  const log = workLogLocation(entries, date)
  if (entries.some(entry => entry.path === log.path && entry.kind === 'file')) return log.path
  const path = await request('create', { dir: log.dir, name: log.name })
  await request('write', { path, content: `# ${localDay(date)} ${title}\n\n#work-log\n\n${template.replaceAll('{{date}}', localDay(date))}` })
  return path
}


export type NoteTemplate = 'blank' | 'daily' | 'essay'
export function renderNoteTemplate(kind: Exclude<NoteTemplate, 'blank'>, title: string, date: Date, t: (key: string) => string): string {
  const tag = kind === 'daily' ? 'work-log' : t('templateEssayTag')
  const body = t(kind === 'daily' ? 'knowledgeLogTemplate' : 'knowledgeEssayTemplate').replaceAll('{{date}}', localDay(date))
  return `# ${title}\n\n#${tag}\n\n${body}`
}
