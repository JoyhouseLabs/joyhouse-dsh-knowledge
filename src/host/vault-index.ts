import { parse } from 'yaml'
import type { VaultIndex, VaultNoteInfo } from '../contracts.ts'

export function buildVaultIndex(files: { path: string; content: string }[]): VaultIndex {
  const rawParents = new Map<string, string>()
  const notes: VaultNoteInfo[] = files.map(file => {
    let body = file.content, front: Record<string, unknown> = {}
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
    if (match) {
      try {
        const parsed: unknown = parse(match[1] ?? '', { maxAliasCount: 30 })
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) front = parsed as Record<string, unknown>
        body = body.slice(match[0].length)
      }
      catch { /* Malformed metadata never prevents the note from opening. */ }
    }
    const tags = new Set<string>()
    for (const tag of Array.isArray(front.tags) ? front.tags : typeof front.tags === 'string' ? front.tags.split(/[,\s]+/) : [])
      if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim())
    const headings: VaultNoteInfo['headings'] = [], links = new Set<string>()
    let fence = ''
    for (const line of body.split(/\r?\n/)) {
      const code = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (code) { if (!fence) fence = code; else if (code[0] === fence[0] && code.length >= fence.length) fence = ''; continue }
      if (fence) continue
      const heading = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
      if (heading) {
        const text = heading[2] ?? ''
        headings.push({ level: heading[1]!.length, text, slug: text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') })
      }
      else for (const tag of line.matchAll(/(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) tags.add(tag[1]!)
      for (const link of line.matchAll(/!?\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]/g)) links.add(link[1]!.trim())
    }
    if (typeof front.parent === 'string') rawParents.set(file.path, front.parent.replace(/^\[\[|\]\]$/g, '').trim())
    return { path: file.path, title: typeof front.title === 'string' && front.title.trim() ? front.title : headings.find(h => h.level === 1)?.text ?? file.path.split('/').at(-1)!.replace(/\.md$/i, ''),
      tags: [...tags].sort(), links: [...links].map(target => ({ target, resolved: false })), backlinks: [], children: [], headings }
  })
  function resolve(target: string): string | undefined {
    const normalized = target.replace(/\.md$/i, '').toLowerCase()
    const exact = notes.find(note => note.path.replace(/\.md$/i, '').toLowerCase() === normalized)
    if (exact) return exact.path
    const matches = notes.filter(note => note.path.split('/').at(-1)!.replace(/\.md$/i, '').toLowerCase() === normalized)
    return matches.length === 1 ? matches[0]!.path : undefined
  }
  for (const note of notes) {
    note.links = note.links.map(link => { const path = resolve(link.target); return { target: path ?? link.target, resolved: !!path } })
    const parent = rawParents.get(note.path)
    if (parent) { const path = resolve(parent); note.parent = { target: path ?? parent, resolved: !!path } }
  }
  for (const note of notes) {
    note.backlinks = notes.filter(other => other.path !== note.path && other.links.some(link => link.resolved && link.target === note.path)).map(other => other.path)
    note.children = notes.filter(other => other.path !== note.path && (other.parent?.resolved && other.parent.target === note.path)).map(other => other.path)
  }
  const tags = new Map<string, number>()
  for (const note of notes) for (const tag of note.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1)
  return { notes, tags: [...tags].sort(([a], [b]) => a.localeCompare(b)).map(([tag, count]) => ({ tag, count })) }
}
