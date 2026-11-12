import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { buildVaultIndex } from './vault-index.ts'
import type { VaultEntry, VaultFile, VaultStatus, VaultSearchHit } from '../contracts.ts'

const NOTE_LIMIT = 2 * 1024 * 1024, IMAGE_LIMIT = 10 * 1024 * 1024, ENTRY_LIMIT = 10000
const TYPES: Record<string, string> = { '.md': 'text/markdown', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' }

export class VaultError extends Error {
  readonly code: string
  constructor(code: string) { super(code); this.code = code }
}
function fail(code: string): never { throw new VaultError(code) }
function text(value: unknown, max = 1024): string {
  if (typeof value !== 'string' || value.length > max) fail('VAULT_INPUT_INVALID')
  return value
}
function parts(value: string): string[] {
  const items = value.split('/')
  if (!value || value.length > 1024 || items.length > 16 || /[\\:\x00-\x1f<>"|?*]/.test(value)
    || items.some(item => !item || item.startsWith('.') || /[. ]$/.test(item) || item.length > 255 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(item))) fail('VAULT_PATH_REJECTED')
  return items
}

/** Private, fixed-root file capability. The browser can never select an arbitrary filesystem path. */
export class HarnessVault {
  readonly root: string
  constructor(root: string) {
    if (!path.isAbsolute(root)) fail('VAULT_ROOT_INVALID')
    this.root = path.resolve(root)
  }
  status(): VaultStatus {
    const configured = fs.existsSync(this.root) && fs.statSync(this.root).isDirectory()
    return { configured, root: this.root, noteCount: configured ? this.list().filter(entry => entry.path.toLowerCase().endsWith('.md')).length : 0 }
  }
  setup(): VaultStatus {
    if (!fs.existsSync(this.root)) fs.mkdirSync(this.root, { recursive: true, mode: 0o700 })
    if (fs.readdirSync(this.root).length === 0) {
      for (const name of ['notes', 'inbox', 'attachments', 'templates']) fs.mkdirSync(path.join(this.root, name))
      fs.writeFileSync(path.join(this.root, 'notes', '开始使用.md'), '# 我的资料中心\n\n记录工作日志、笔记和图片。\n\n#指南\n', { flag: 'wx' })
    }
    return this.status()
  }
  private safe(relative: string, createParents = false): string {
    const items = parts(relative)
    if (!fs.existsSync(this.root)) fail('VAULT_NOT_CONFIGURED')
    let current = fs.realpathSync(this.root)
    items.forEach((item, index) => {
      current = path.join(current, item)
      const stat = fs.lstatSync(current, { throwIfNoEntry: false })
      if (stat?.isSymbolicLink()) fail('VAULT_SYMLINK_REJECTED')
      if (stat && index < items.length - 1 && !stat.isDirectory()) fail('VAULT_PATH_REJECTED')
      if (!stat && index < items.length - 1) {
        if (!createParents) fail('VAULT_NOT_FOUND')
        fs.mkdirSync(current)
      }
    })
    if (!TYPES[path.extname(relative).toLowerCase()]) fail('VAULT_TYPE_REJECTED')
    return current
  }
  private readBytes(relative: string, limit: number): Buffer {
    const target = this.safe(relative)
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
    try {
      const stat = fs.fstatSync(fd)
      if (!stat.isFile() || stat.size > limit || stat.nlink > 1) fail('VAULT_FILE_REJECTED')
      const buffer = Buffer.alloc(limit + 1)
      let total = 0, bytes = 0
      do { bytes = fs.readSync(fd, buffer, total, buffer.length - total, null); total += bytes } while (bytes && total < buffer.length)
      if (total > limit) fail('VAULT_SIZE_LIMIT')
      return buffer.subarray(0, total)
    }
    finally { fs.closeSync(fd) }
  }
  list(): VaultEntry[] {
    if (!fs.existsSync(this.root)) fail('VAULT_NOT_CONFIGURED')
    const result: VaultEntry[] = []
    const root = fs.realpathSync(this.root)
    function walk(dir: string, relative: string, depth: number): void {
      if (depth > 16) fail('VAULT_SCAN_LIMIT')
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name.startsWith('.') || item.isSymbolicLink() || (!item.isDirectory() && !TYPES[path.extname(item.name).toLowerCase()])) continue
        const name = relative ? `${relative}/${item.name}` : item.name
        parts(name)
        const absolute = path.join(dir, item.name), stat = fs.lstatSync(absolute)
        if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink > 1))) continue
        if (result.length >= ENTRY_LIMIT) fail('VAULT_SCAN_LIMIT')
        result.push({ path: name, name: item.name, kind: stat.isDirectory() ? 'dir' : 'file', size: stat.size, modifiedMs: stat.mtimeMs })
        if (stat.isDirectory()) walk(absolute, name, depth + 1)
      }
    }
    walk(root, '', 0)
    return result.sort((a, b) => a.path.localeCompare(b.path))
  }
  read(relative: string): VaultFile {
    if (!relative.toLowerCase().endsWith('.md')) fail('VAULT_TYPE_REJECTED')
    const content = this.readBytes(relative, NOTE_LIMIT).toString('utf8')
    const stat = fs.statSync(this.safe(relative))
    return { path: relative, content, size: stat.size, modifiedMs: stat.mtimeMs }
  }
  private atomicWrite(relative: string, bytes: Buffer): void {
    const target = this.safe(relative, true)
    const temp = path.join(path.dirname(target), `.writing-${randomUUID()}`)
    try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, target) }
    finally { fs.rmSync(temp, { force: true }) }
  }
  write(relative: string, content: string, expected?: string): null {
    if (!relative.toLowerCase().endsWith('.md')) fail('VAULT_TYPE_REJECTED')
    if (Buffer.byteLength(content) > NOTE_LIMIT) fail('VAULT_SIZE_LIMIT')
    // Refuse to recreate a note deleted while an editor still has it open.
    const current = this.read(relative).content
    if (expected !== undefined && current !== expected) fail('VAULT_WRITE_CONFLICT')
    this.atomicWrite(relative, Buffer.from(content))
    return null
  }
  create(dir: string, name: string): string {
    const stem = name.replace(/\.md$/i, '')
    if (parts(stem).length !== 1) fail('VAULT_PATH_REJECTED')
    for (let count = 0; count < 1000; count++) {
      const relative = `${dir ? `${dir}/` : ''}${stem}${count ? `-${count}` : ''}.md`
      try { fs.writeFileSync(this.safe(relative, true), '', { flag: 'wx', mode: 0o600 }); return relative }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    return fail('VAULT_NAME_CONFLICT')
  }
  rename(relative: string, name: string): string {
    const source = this.safe(relative), ext = path.extname(relative).toLowerCase()
    if (parts(name).length !== 1) fail('VAULT_PATH_REJECTED')
    const next = `${path.posix.dirname(relative) === '.' ? '' : `${path.posix.dirname(relative)}/`}${name.toLowerCase().endsWith(ext) ? name : name + ext}`
    if (next === relative) return next
    const target = this.safe(next)
    // Exclusive copy protects existing destinations; rollback leaves the original intact.
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
    try { fs.unlinkSync(source) } catch (error) { fs.unlinkSync(target); throw error }
    return next
  }
  delete(relative: string): null {
    const target = this.safe(relative)
    if (!fs.lstatSync(target).isFile()) fail('VAULT_TYPE_REJECTED')
    const trash = path.join(fs.realpathSync(this.root), '.trash')
    const stat = fs.lstatSync(trash, { throwIfNoEntry: false })
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) fail('VAULT_TRASH_REJECTED')
    if (!stat) fs.mkdirSync(trash, { mode: 0o700 })
    fs.renameSync(target, path.join(trash, `${Date.now()}-${randomUUID()}-${path.basename(relative)}`))
    return null
  }
  private notes(): VaultFile[] {
    let bytes = 0
    return this.list().filter(entry => entry.kind === 'file' && entry.path.toLowerCase().endsWith('.md')).map(entry => {
      const file = this.read(entry.path)
      bytes += Buffer.byteLength(file.content)
      if (bytes > 32 * 1024 * 1024) fail('VAULT_INDEX_SIZE_LIMIT')
      return file
    })
  }
  index() { return buildVaultIndex(this.notes()) }
  search(query: string): VaultSearchHit[] {
    if (!query.trim()) return []
    const needle = query.toLowerCase(), hits: VaultSearchHit[] = []
    for (const file of this.notes()) {
      if (file.path.toLowerCase().includes(needle)) hits.push({ path: file.path, kind: 'name', line: 0, snippet: file.path })
      for (const [index, line] of file.content.split('\n').entries()) {
        const at = line.toLowerCase().indexOf(needle)
        if (at >= 0) hits.push({ path: file.path, kind: 'content', line: index + 1, snippet: line.slice(Math.max(0, at - 60), at + 180) })
        if (hits.length >= 200) return hits
      }
    }
    return hits
  }
  call(method: string, input: unknown): unknown {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('VAULT_INPUT_INVALID')
    const data = input as Record<string, unknown>
    switch (method) {
      case 'status': return this.status()
      case 'set-root': if (data.path !== undefined) fail('VAULT_ROOT_HOST_ONLY'); return this.setup()
      case 'list': return this.list()
      case 'read': return this.read(text(data.path))
      case 'write': return this.write(text(data.path), text(data.content, NOTE_LIMIT), data.expectedContent === undefined ? undefined : text(data.expectedContent, NOTE_LIMIT))
      case 'create': return this.create(text(data.dir), text(data.name, 255))
      case 'rename': return this.rename(text(data.path), text(data.newName, 255))
      case 'delete': return this.delete(text(data.path))
      case 'index': return this.index()
      case 'search': return this.search(text(data.query, 200))
      case 'read-asset': {
        const relative = text(data.path), type = TYPES[path.extname(relative).toLowerCase()]
        if (!type?.startsWith('image/')) fail('VAULT_TYPE_REJECTED')
        return { path: relative, dataUrl: `data:${type};base64,${this.readBytes(relative, IMAGE_LIMIT).toString('base64')}` }
      }
      case 'write-asset': {
        const relative = text(data.path), base64 = text(data.dataBase64, Math.ceil(IMAGE_LIMIT / 3) * 4)
        if (!TYPES[path.extname(relative).toLowerCase()]?.startsWith('image/') || !base64 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('VAULT_IMAGE_INVALID')
        const bytes = Buffer.from(base64, 'base64')
        if (!bytes.length || bytes.length > IMAGE_LIMIT || bytes.toString('base64') !== base64) fail('VAULT_SIZE_LIMIT')
        fs.writeFileSync(this.safe(relative, true), bytes, { flag: 'wx', mode: 0o600 })
        return null
      }
      case 'sync-status': return { configured: false, enabled: false, endpoint: null, account: null, vault: null, lastSuccess: null }
      default: return fail('VAULT_CAPABILITY_UNAVAILABLE')
    }
  }
}
