import { isMap, parseDocument } from 'yaml'
import type { VaultNoteInfo } from '../../contracts.ts'

const FRONT = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
function split(content: string) {
  const match = FRONT.exec(content)
  if (/^(?:\uFEFF)?---\r?\n/.test(content) && !match) throw new Error('NOTE_METADATA_INVALID')
  let doc = parseDocument(match?.[1] ?? '{}')
  if (doc.contents === null && !doc.errors.length) doc = parseDocument(`${match?.[1] ?? ''}\n{}`)
  if (doc.errors.length || !isMap(doc.contents)) throw new Error('NOTE_METADATA_INVALID')
  return { doc, body: match ? content.slice(match[0].length) : content, eol: content.includes('\r\n') ? '\r\n' : '\n' }
}
function join(doc: ReturnType<typeof parseDocument>, body: string, eol: string) {
  return `---${eol}${String(doc).trimEnd().replace(/\r?\n/g, eol)}${eol}---${eol}${body}`
}
export function visibleNoteBody(content: string): string {
  try { return split(content).body } catch { return content }
}
export function parseTags(input: string): string[] {
  const tags = [...new Set(input.split(/[,，\s]+/).map(tag => tag.replace(/^#/, '').trim()).filter(Boolean))]
  if (tags.length > 50 || tags.some(tag => tag.length > 64 || !/^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u.test(tag))) throw new Error('NOTE_TAG_INVALID')
  return tags
}
export function updateTags(content: string, input: string, previousTags: string[]): string {
  const tags = parseTags(input), { doc, body, eol } = split(content)
  const removed = new Set(previousTags.filter(tag => !tags.includes(tag)))
  let fence = ''
  const nextBody = body.split(/(\r?\n)/).map(line => {
    const code = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (code) { if (!fence) fence = code; else if (code[0] === fence[0] && code.length >= fence.length) fence = ''; return line }
    if (fence || /^\s*#{1,6}\s/.test(line)) return line
    return line.replace(/(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu, (all, prefix: string, tag: string) => removed.has(tag) ? prefix : all)
  }).join('')
  doc.set('tags', tags)
  return join(doc, nextBody, eol)
}
export function updateParent(content: string, parent: string | null): string {
  const { doc, body, eol } = split(content)
  if (parent) doc.set('parent', parent)
  else doc.delete('parent')
  return join(doc, body, eol)
}
export function canSetParent(notes: VaultNoteInfo[], child: string, parent: string): boolean {
  const seen = new Set([child]); let current: string | undefined = parent
  while (current) {
    if (seen.has(current)) return false
    seen.add(current)
    const note = notes.find(note => note.path === current)
    current = note?.parent?.resolved ? note.parent.target : undefined
  }
  return true
}
export function insertNoteLink(content: string, target: string, selection?: { start: number; end: number }): string {
  if (!target || /[\[\]#|\r\n]/.test(target)) throw new Error('NOTE_LINK_INVALID')
  const start = Math.max(0, Math.min(selection?.start ?? content.length, content.length))
  const end = Math.max(start, Math.min(selection?.end ?? start, content.length))
  const separator = !selection && content && !content.endsWith('\n') ? '\n\n' : ''
  return content.slice(0, start) + separator + `[[${target}]]` + content.slice(end)
}

export function normalizeNoteName(input: string): string {
  const name = input.trim().replace(/\.md$/i, '')
  if (!name || name.length > 240 || name.startsWith('.') || /[. ]$/.test(name) || /[\\/:\x00-\x1f<>"|?*]/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('NOTE_NAME_INVALID')
  return name
}
/** Update the visible title without changing other headings, prose or fenced examples. */
export function renameNoteTitle(content: string, title: string): string {
  const { doc, body, eol } = split(content)
  let fence = '', changed = false
  const next = body.split(/(\r?\n)/).map(line => {
    const code = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (code) { if (!fence) fence = code; else if (code[0] === fence[0] && code.length >= fence.length) fence = ''; return line }
    if (!fence && !changed && /^#\s+/.test(line)) { changed = true; return `# ${title}` }
    return line
  }).join('')
  if (doc.has('title')) doc.set('title', title)
  if (FRONT.test(content)) return join(doc, changed ? next : `# ${title}${eol}${eol}${body}`, eol)
  return changed ? next : `# ${title}${eol}${eol}${body}`
}
