/**
 * JoyHouse 资料工作区：三栏（文件树/标签 · 编辑预览 · 反链/子笔记/大纲）。
 *
 * 数据经 `vault-bridge` 从 Harness Host 或桌面宿主获取；未配置 vault 时
 * 显示创建/选择流程。自动保存（800ms debounce）在失焦、关闭时冲刷。
 */
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  JoyHouseVaultBridgeError,
  requestJoyHouseVault,
  vaultCapabilities,
  type VaultEntry,
  type VaultFile,
  type VaultIndex,
  type VaultNoteInfo,
  type VaultSearchHit,
  type VaultStatus,
} from '../vault-bridge.ts'
import { SyncPanel } from './sync-panel.tsx'
import type { SyncStatus } from '../vault-bridge.ts'
import { clipboardImages, insertImage, type ImageSelection } from '../clipboard.ts'
import type { ClipboardEvent } from 'react'
import { createSaveQueue, imageAssetPath, getOrCreateWorkLog, renderNoteTemplate, type NoteTemplate } from '../library.ts'
import { errorFeedback, feedbackText, type Feedback } from './feedback.ts'
import { NoteActionDialog, Notice, useNotice, type NoteAction } from './action-feedback.tsx'
import { ChildCreator, NotePicker, TagEditor, HELP } from './note-controls.tsx'
import { updateTags, updateParent, canSetParent, insertNoteLink, normalizeNoteName, renameNoteTitle } from './note-metadata.ts'
import { EditorToolbar, applyEditorCommand } from './editor-toolbar.tsx'
import { FileTree, SearchResults, buildTree } from './file-tree.tsx'
import { MarkdownView, dirOf, parseOutline } from './markdown.tsx'

type Phase = 'loading' | 'setup' | 'ready' | 'error'

export interface KnowledgeWorkspaceProps {
  t: (key: string) => string
  open: boolean
  controls: ReactNode
  onClose: () => void
}


export function KnowledgeWorkspace(props: KnowledgeWorkspaceProps): React.JSX.Element | null {
  const { t, open, onClose, controls } = props
  const { notice, notify, dismiss } = useNotice()
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null)
  const [capabilities, setCapabilities] = useState({ folderPicker: false, sync: false })
  const [phase, setPhase] = useState<Phase>('loading')
  const [bridgeError, setBridgeError] = useState<Feedback | null>(null)
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [index, setIndex] = useState<VaultIndex | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [file, setFile] = useState<VaultFile | null>(null)
  const [draft, setDraft] = useState('')
  const [savedDraft, setSavedDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<VaultSearchHit[]>([])
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asset, setAsset] = useState<{ path: string; dataUrl: string } | null>(null)
  const moreMenu = useRef<HTMLDetailsElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const uploadSelection = useRef<{ path: string | null; draft: string; selection: ImageSelection } | null>(null)
  const importing = useRef(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncReport, setSyncReport] = useState<{ uploaded: number; downloaded: number; conflicts: number } | null>(null)
  const syncMessage = syncReport ? `${t('knowledgeSyncDone')} · ${t('knowledgeSyncUploaded')} ${syncReport.uploaded} · ${t('knowledgeSyncDownloaded')} ${syncReport.downloaded} · ${t('knowledgeSyncConflicts')} ${syncReport.conflicts}` : ''
  const [syncError, setSyncError] = useState<Feedback | null>(null)
  const syncTick = useRef<() => void>(() => {})
  const pendingSaves = useRef(0)
  const saveQueue = useRef(createSaveQueue((path, content) => requestJoyHouseVault('write', { path, content, ...(draftRef.current.activePath === path ? { expectedContent: draftRef.current.savedDraft } : {}) })))

  // 最新值引用：关闭/卸载时冲刷未保存内容
  const draftRef = useRef({ activePath, draft, savedDraft, saving })
  draftRef.current = { activePath, draft, savedDraft, saving }
  const indexRequest = useRef(0)
  const saveTimer = useRef<number | null>(null)
  const searchTimer = useRef<number | null>(null)

  useEffect(() => { if (activeTag && index && !index.tags.some(tag => tag.tag === activeTag)) setActiveTag(null) }, [index, activeTag])

  const noteByPath = useMemo(() => {
    const map = new Map<string, VaultNoteInfo>()
    for (const note of index?.notes ?? [])
      map.set(note.path, note)
    return map
  }, [index])

  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const current = { ...draftRef.current }
    if (current.activePath === null || (current.draft === current.savedDraft && pendingSaves.current === 0))
      return true
    pendingSaves.current++
    setSaving(true)
    try {
      await saveQueue.current(current.activePath, current.draft)
      if (draftRef.current.activePath === current.activePath) {
        draftRef.current.savedDraft = current.draft
        setSavedDraft(current.draft)
      }
      setBridgeError(null)
      const request = ++indexRequest.current
      try { const nextIndex = await requestJoyHouseVault('index'); if (request === indexRequest.current) setIndex(nextIndex) } catch { /* Saved content remains authoritative; a later refresh retries indexing. */ }
      return true
    }
    catch (error) {
      reportError(error)
      return false
    }
    finally {
      pendingSaves.current--
      setSaving(pendingSaves.current > 0)
    }
  }, [])

  const refresh = useCallback(async (keepActive: boolean) => {
    setPhase('loading')
    setBridgeError(null)
    try {
      setCapabilities(await vaultCapabilities())
      const vaultStatus = await requestJoyHouseVault('status')
      setStatus(vaultStatus)
      setSyncStatus(await requestJoyHouseVault('sync-status').catch(() => null))
      if (!vaultStatus.configured) {
        setPhase('setup')
        return
      }
      const [list, vaultIndex] = await Promise.all([
        requestJoyHouseVault('list'),
        requestJoyHouseVault('index'),
      ])
      setEntries(list)
      setIndex(vaultIndex)
      if (!keepActive) {
        setActivePath(null)
        setFile(null)
      }
      setPhase('ready')
    }
    catch (error) {
      if (error instanceof JoyHouseVaultBridgeError
        && error.code === 'DESKTOP_BRIDGE_UNAVAILABLE') {
        // 直接在浏览器打开 DSH 页面（而非桌面壳 iframe）时给出可理解的提示
        reportError({ key: 'knowledgeBridgeUnavailable' })
      }
      else {
        reportError(error)
      }
      setPhase('error')
    }
  }, [t])

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (open) void refreshRef.current(true)
  }, [open]) // A locale revision must not reload or unmount a focused editor.

  // Dismiss only our own disclosure; do not consume the outside control's event.
  useEffect(() => {
    if (!open) { if (moreMenu.current) moreMenu.current.open = false; return }
    const dismissOutside = (event: Event) => {
      const menu = moreMenu.current
      if (menu?.open && event.target && !menu.contains(event.target as Node)) menu.open = false
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('click', dismissOutside, true)
    document.addEventListener('focusin', dismissOutside, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('click', dismissOutside, true)
      document.removeEventListener('focusin', dismissOutside, true)
    }
  }, [open])

  // 自动保存：编辑内容变化 800ms 后写回
  useEffect(() => {
    if (activePath === null || draft === savedDraft)
      return
    if (saveTimer.current !== null)
      window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void flushSave(), 800)
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [draft, savedDraft, activePath, flushSave])

  // 搜索：输入停顿 400ms 后执行
  useEffect(() => {
    if (searchTimer.current !== null)
      window.clearTimeout(searchTimer.current)
    const trimmed = query.trim()
    if (trimmed === '') {
      setSearchHits([])
      return
    }
    searchTimer.current = window.setTimeout(() => {
      void requestJoyHouseVault('search', { query: trimmed })
        .then(setSearchHits)
        .catch(error => { setSearchHits([]); reportError(error) })
    }, 400)
    return () => {
      if (searchTimer.current !== null)
        window.clearTimeout(searchTimer.current)
    }
  }, [query])

  // Always mounted by the sidebar, so enabled libraries also sync while this dialog is closed.
  useEffect(() => {
    void requestJoyHouseVault('sync-status').then(setSyncStatus).catch(() => {})
    const timer = window.setInterval(() => syncTick.current(), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  syncTick.current = () => { if (syncStatus?.enabled && !busy && !importing.current && document.activeElement !== editor.current) void runSync() }

  async function syncOperation<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (busy || importing.current) return
    importing.current = true
    setBusy(true)
    setSyncError(null)
    try {
      if (!(await flushSave())) return
      const result = await operation()
      const [list, vaultIndex, nextStatus] = await Promise.all([
        requestJoyHouseVault('list'), requestJoyHouseVault('index'), requestJoyHouseVault('sync-status'),
      ])
      setEntries(list); setIndex(vaultIndex); setSyncStatus(nextStatus)
      const current = draftRef.current.activePath
      if (current !== null) {
        if (list.some(e => e.path === current)) {
          const next = await requestJoyHouseVault('read', { path: current })
          draftRef.current.draft = next.content; draftRef.current.savedDraft = next.content
          setDraft(next.content); setSavedDraft(next.content); setFile(next)
        } else {
          draftRef.current.activePath = null
          setActivePath(null); setFile(null); setDraft(''); setSavedDraft('')
        }
      }
      return result
    } catch (error) {
      setSyncError({ key: 'knowledgeSyncFailure', detail: errorFeedback(error).detail })
      // A partial sync can already have applied a remote version. Reload before editing resumes.
      try {
        const current = draftRef.current.activePath
        if (current !== null) {
          const list = await requestJoyHouseVault('list')
          setEntries(list)
          if (list.some(e => e.path === current)) {
            const next = await requestJoyHouseVault('read', { path: current })
            draftRef.current.draft = next.content; draftRef.current.savedDraft = next.content
            setDraft(next.content); setSavedDraft(next.content); setFile(next)
          } else { draftRef.current.activePath = null; setActivePath(null); setFile(null); setDraft(''); setSavedDraft('') }
        }
      } catch { setPhase('error') }
    } finally { importing.current = false; setBusy(false) }
  }
  async function runSync(): Promise<void> {
    setSyncReport(null)
    const report = await syncOperation(() => requestJoyHouseVault('sync-run'))
    setSyncReport(report ?? null)
  }

  async function handleClose(): Promise<void> {
    if (busy || importing.current) { notify({ key: 'actionBusy' }); return }
    if (!(await flushSave())) return
    onClose()
  }

  async function openNote(path: string): Promise<boolean> {
    if (busy || importing.current) { notify({ key: 'actionBusy' }); return false }
    if (!(await flushSave())) return false
    try {
      if (!path.endsWith('.md')) {
        if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) { notify({ key: 'actionUnsupported' }); return false }
        setAsset(await requestJoyHouseVault('read-asset', { path }))
        setActivePath(null)
        setFile(null)
        setDraft('')
        setSavedDraft('')
        return true
      }
      setAsset(null)
      const next = await requestJoyHouseVault('read', { path })
      setActivePath(next.path)
      setFile(next)
      setDraft(next.content)
      setSavedDraft(next.content)
      setMode('preview')
      setQuery('')
      return true
    }
    catch (error) {
      reportError(error)
      return false
    }
  }

  async function createNote(dir: string, rawName = ''): Promise<void> {
    startNoteAction('create', dir, rawName)
  }

  async function openWorkLog(): Promise<void> {
    if (busy || importing.current || !(await flushSave())) return
    setBusy(true)
    try {
      const path = await getOrCreateWorkLog(requestJoyHouseVault, new Date(), t('knowledgeLogTitle'), t('knowledgeLogTemplate'))
      await refresh(true)
      if (await openNote(path)) { setMode('edit'); notify({ key: 'actionLogOpened' }) }
    } catch (error) { reportError(error) }
    finally { setBusy(false) }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = clipboardImages(event.clipboardData)
    if (files.length === 0) return // Text-only paste retains the textarea's native behavior.
    event.preventDefault()
    event.stopPropagation()
    if (busy || importing.current) return
    const { selectionStart, selectionEnd } = event.currentTarget
    void importImages(files, { start: selectionStart, end: selectionEnd })
  }

  async function importImages(files: File[], selection?: ImageSelection): Promise<void> {
    if (busy || importing.current || files.length === 0) return
    // Lock before the first await: a rapid paste/navigation must not move the image to another note.
    importing.current = true
    setBusy(true)
    const targetNote = draftRef.current.activePath
    let insertion = selection
    let caret: number | undefined
    try {
      if (!(await flushSave())) return
      const prepared = files.map(file => ({ file, path: imageAssetPath(file, crypto.randomUUID()) }))
      let lastImage: string | undefined
      for (const { file: image, path } of prepared) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'))
          reader.onabort = () => reject(new Error('IMAGE_READ_FAILED'))
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
          reader.readAsDataURL(image)
        })
        await requestJoyHouseVault('write-asset', { path, dataBase64: data })
        lastImage = path
        if (targetNote !== null && draftRef.current.activePath === targetNote) {
          const current = draftRef.current.draft
          const next = insertImage(current, path, insertion ?? { start: current.length, end: current.length })
          draftRef.current.draft = next.content
          setDraft(next.content)
          if (selection) {
            caret = next.caret
            insertion = { start: caret, end: caret }
          }
          if (!(await flushSave())) return
        }
      }
      // Refresh metadata without unmounting the focused editor.
      const [list, vaultIndex] = await Promise.all([requestJoyHouseVault('list'), requestJoyHouseVault('index')])
      setEntries(list)
      setIndex(vaultIndex)
      if (targetNote === null && lastImage) setAsset(await requestJoyHouseVault('read-asset', { path: lastImage }))
      notify({ key: 'actionImages' })
    } catch (error) {
      reportError(error)
      // Partial imports stay visible and never remove already saved files.
      try { setEntries(await requestJoyHouseVault('list')) } catch { /* Keep original error. */ }
    } finally {
      importing.current = false
      setBusy(false)
      if (caret !== undefined) {
        const position = caret
        window.requestAnimationFrame(() => {
          if (draftRef.current.activePath !== targetNote || !editor.current) return
          editor.current.focus()
          editor.current.setSelectionRange(position, position)
        })
      }
    }
  }

  function reportError(error: unknown): void {
    const message = errorFeedback(error)
    setBridgeError(message); notify(message, true)
  }

  function startNoteAction(kind: NoteAction['kind'], dir = '', name = ''): void {
    if (busy || importing.current) { notify({ key: 'actionBusy' }); return }
    if (kind !== 'create' && !activePath) { notify({ key: 'knowledgeEmptyTitle' }); return }
    setBridgeError(null)
    setNoteAction({ kind, dir, path: activePath ?? '', name: kind === 'create' ? name : activePath!.split('/').at(-1)!.replace(/\.md$/i, '') })
  }

  async function refreshListing(): Promise<void> {
    const [list, nextIndex] = await Promise.all([requestJoyHouseVault('list'), requestJoyHouseVault('index')])
    setEntries(list); setIndex(nextIndex)
    setStatus(current => current ? { ...current, noteCount: nextIndex.notes.length } : current)
  }

  async function submitNoteAction(rawName: string, updateTitle: boolean, template: NoteTemplate): Promise<void> {
    const action = noteAction
    if (!action) return
    if (busy || importing.current) { notify({ key: 'actionBusy' }); return }
    let name = ''
    try { if (action.kind !== 'delete') name = normalizeNoteName(rawName) }
    catch (error) { reportError(error); return }
    importing.current = true; setBusy(true); setBridgeError(null)
    let completed = false
    try {
      if (!(await flushSave())) return
      if (action.kind === 'create') {
        const dir = action.dir === 'notes' && !entries.some(entry => entry.kind === 'dir' && entry.path === 'notes') ? '' : action.dir
        const path = await requestJoyHouseVault('create', { dir, name })
        completed = true
        const initial = await requestJoyHouseVault('read', { path })
        const content = template === 'blank' ? initial.content : renderNoteTemplate(template, name, new Date(), t)
        draftRef.current = { activePath: path, draft: content, savedDraft: initial.content, saving: false }
        setActivePath(path); setDraft(content); setSavedDraft(initial.content); setFile(initial)
        setAsset(null); setMode('edit'); setQuery(''); setNoteAction(null); setActiveTag(null)
        // Keep the template as an editable draft if persistence fails after file creation.
        const saved = await flushSave()
        await refreshListing()
        if (saved) notify({ key: 'actionCreated' })
      } else if (action.kind === 'rename') {
        const current = draftRef.current
        if (current.activePath !== action.path) throw new Error('NOTE_CHANGED')
        const content = updateTitle ? renameNoteTitle(current.draft, name) : current.draft
        if (name === action.name && content === current.draft) { notify({ key: 'actionNoChange' }); setNoteAction(null); return }
        const base = current.draft
        const path = name === action.name ? action.path : await requestJoyHouseVault('rename', { path: action.path, newName: name })
        completed = true; setNoteAction(null)
        // Switch the save target immediately; never recreate the old file if the title write fails.
        draftRef.current = { activePath: path, draft: content, savedDraft: base, saving: false }
        setActivePath(path); setDraft(content); setSavedDraft(base)
        setFile(currentFile => currentFile ? { ...currentFile, path, content: base } : currentFile)
        if (!(await flushSave())) { notify({ key: 'actionTitlePending' }, true); return }
        await refreshListing(); notify({ key: 'actionRenamed' })
      } else {
        await requestJoyHouseVault('delete', { path: action.path })
        completed = true; setNoteAction(null)
        draftRef.current = { activePath: null, draft: '', savedDraft: '', saving: false }
        setActivePath(null); setFile(null); setDraft(''); setSavedDraft('')
        await refreshListing(); notify({ key: 'actionDeleted' })
      }
    } catch (error) { reportError(completed ? { key: 'actionRefreshFailed' } : error) }
    finally { importing.current = false; setBusy(false) }
  }

  async function changeNote(transform: (content: string) => string): Promise<boolean> {
    if (busy || importing.current || !draftRef.current.activePath) return false
    importing.current = true; setBusy(true)
    try {
      if (!(await flushSave())) return false
      const content = transform(draftRef.current.draft)
      if (content === draftRef.current.draft) { notify({ key: 'actionNoChange' }); return true }
      draftRef.current.draft = content; setDraft(content)
      const saved = await flushSave()
      if (saved) notify({ key: 'actionSaved' })
      return saved
    } catch (error) { reportError(error); return false }
    finally { importing.current = false; setBusy(false) }
  }

  async function setParent(parent: string | null): Promise<boolean> {
    return changeNote(content => {
      if (parent && (!activePath || !canSetParent(index?.notes ?? [], activePath, parent))) throw new Error('NOTE_PARENT_CYCLE')
      return updateParent(content, parent)
    })
  }

  async function createChild(name: string): Promise<boolean> {
    if (!name || !activePath || busy || importing.current) return false
    importing.current = true; setBusy(true)
    try {
      if (!(await flushSave())) return false
      name = normalizeNoteName(name)
      const created = await requestJoyHouseVault('create', { dir: dirOf(activePath), name })
      const initial = await requestJoyHouseVault('read', { path: created })
      await requestJoyHouseVault('write', { path: created, content: updateParent(initial.content || `# ${name}\n\n`, activePath), expectedContent: initial.content })
      const [list, nextIndex] = await Promise.all([requestJoyHouseVault('list'), requestJoyHouseVault('index')])
      setEntries(list); setIndex(nextIndex); setActiveTag(null)
      importing.current = false; setBusy(false)
      const opened = await openNote(created)
      if (opened) { setMode('edit'); notify({ key: 'actionCreated' }) }
      return opened
    } catch (error) {
      reportError(error)
      try { setEntries(await requestJoyHouseVault('list')) } catch { /* Keep the original error visible. */ }
      return false
    } finally { importing.current = false; setBusy(false) }
  }

  async function setupVault(path?: string): Promise<void> {
    setBusy(true)
    try {
      if (path === undefined) {
        await requestJoyHouseVault('set-root', {})
      }
      else {
        await requestJoyHouseVault('set-root', { path })
      }
      await refresh(false)
    }
    catch (error) {
      reportError(error)
    }
    finally {
      setBusy(false)
    }
  }

  async function pickVaultFolder(): Promise<void> {
    try {
      const picked = await requestJoyHouseVault('pick-folder')
      if (picked !== null)
        await setupVault(picked)
    }
    catch (error) {
      reportError(error)
    }
  }

  /** wikilink 点击：解析到笔记则打开，否则按该名字创建（Obsidian 行为）。 */
  async function openLink(target: string): Promise<void> {
    if (busy || importing.current) return
    const direct = noteByPath.get(target)
    if (direct) {
      await openNote(direct.path)
      return
    }
    if (target.includes('/')) {
      const withExt = target.endsWith('.md') ? target : `${target}.md`
      if (noteByPath.has(withExt)) {
        await openNote(withExt)
        return
      }
    }
    const lowered = target.toLowerCase()
    const matches = (index?.notes ?? []).filter(note => {
      const name = note.path.slice(note.path.lastIndexOf('/') + 1).replace(/\.md$/, '')
      return name.toLowerCase() === lowered
    })
    if (matches.length === 1) {
      await openNote(matches[0]?.path ?? '')
      return
    }
    const dir = activePath !== null ? dirOf(activePath) : 'notes'
    await createNote(dir === '' ? 'notes' : dir, target)
  }

  /** vault 内资源解析：先按路径、再按文件名（Obsidian 的全库名字解析）。 */
  const resolveAsset = useCallback((src: string): string | undefined => {
    const byPath = entries.find(entry => entry.path === src)
    if (byPath)
      return byPath.path
    const byName = entries.filter(entry => entry.name === src)
    if (byName.length >= 1)
      return (byName.find(entry => entry.path.startsWith('attachments/')) ?? byName[0])?.path
    return undefined
  }, [entries])

  const filteredEntries = useMemo(() => {
    if (activeTag === null)
      return entries
    const tagged = new Set(
      (index?.notes ?? []).filter(note => note.tags.includes(activeTag)).map(note => note.path),
    )
    return entries.filter(entry => entry.kind === 'dir' || tagged.has(entry.path))
  }, [entries, index, activeTag])

  const treeNodes = useMemo(() => buildTree(filteredEntries), [filteredEntries])
  const activeNote = activePath === null ? undefined : noteByPath.get(activePath)
  const dirty = draft !== savedDraft
  const outline = useMemo(() => parseOutline(draft), [draft])
  const noteTitle = (path: string): string => noteByPath.get(path)?.title
    ?? path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')

  if (!open)
    return null

  return (
    <div
      data-joyhouse-surface
      role="region"
      aria-label={t('knowledgeTitle')}
      style={{
        position: 'relative', height: '100%', flex: 1, width: '100%', minHeight: 0, minWidth: 0, containerType: 'inline-size', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
        font: '14px/1.6 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <style>{VAULT_MARKDOWN_CSS}</style>
      <Notice notice={notice} dismiss={dismiss} t={t} />
      {noteAction && <NoteActionDialog key={`${noteAction.kind}-${noteAction.path}`} action={noteAction} busy={busy} error={bridgeError} t={t} onSubmit={submitNoteAction}
        onCancel={() => { setNoteAction(null); setBridgeError(null); notify({ key: 'actionCancelled' }) }} />}

      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--dsw-alias-interactive-bg-active)', flex: '0 0 auto' }}>
        <span style={{ color: 'var(--dsw-alias-state-business-primary)', fontSize: 10.5, fontWeight: 750, letterSpacing: '.16em' }}>{t('knowledgeEyebrow')}</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('knowledgeTitle')}</h2>
        {status?.root && (
          <span title={status.root} style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('knowledgeVaultAt')}: {status.root}
          </span>
        )}
        {status?.configured && <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11.5 }}>{status.noteCount} {t('knowledgeNotesSuffix')}</span>}
        <span style={{ flex: 1 }} />
        {status?.configured && capabilities.sync && <button type="button" onClick={() => setSyncOpen(!syncOpen)} style={ACTION_BUTTON}>{t('knowledgeSync')} · {t(syncStatus?.enabled ? 'knowledgeSyncActive' : syncStatus?.configured ? 'knowledgeSyncPaused' : 'knowledgeSyncLocal')}{syncError ? ' !' : ''}</button>}
        {bridgeError && <span style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 11.5, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={feedbackText(bridgeError, t)}>{feedbackText(bridgeError, t)}</span>}
        {controls}
        <button type="button" aria-label={t('knowledgeClose')} onClick={() => void handleClose()} style={HEADER_BUTTON}>×</button>
      </header>

      {syncOpen && <SyncPanel t={t} status={syncStatus} busy={busy} message={syncMessage} error={feedbackText(syncError, t)} run={syncOperation} onSync={runSync} onClose={() => setSyncOpen(false)} />}

      {phase === 'loading'  && <div style={{ padding: 40, color: 'var(--dsw-alias-label-secondary)' }}>…</div>}

      {phase === 'error' && (
        <div style={{ padding: 40, display: 'grid', gap: 12, justifyItems: 'start' }}>
          <span style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{t('knowledgeLoadFailed')}</span>
          <button type="button" onClick={() => void refresh(true)} style={ACTION_BUTTON}>{t('knowledgeRetry')}</button>
        </div>
      )}

      {phase === 'setup' && (
        <SetupScreen t={t} busy={busy} folderPicker={capabilities.folderPicker} onCreate={() => void setupVault()} onPick={() => void pickVaultFolder()} />
      )}

      {phase === 'ready' && (
        <div className="library-columns" style={{ flex: 1, display: 'grid', minHeight: 0 }}>
          {/* 左栏：搜索 + 标签 + 文件树 */}
          <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--dsw-alias-border-l2)', padding: '10px 10px 12px', gap: 10 }}>
            <input
              value={query}
              placeholder={t('knowledgeSearchPlaceholder')}
              onChange={event => setQuery(event.target.value)}
              style={SEARCH_INPUT}
            />
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 4, alignContent: 'start' }}>
              {query.trim() !== ''
                ? <SearchResults hits={searchHits} onSelect={path => { void openNote(path) }} />
                : (
                  <>
                    {(index?.tags.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '2px 2px 8px', borderBottom: '1px solid var(--dsw-alias-border-l2)', marginBottom: 4 }}>
                        <TagChip label={t('knowledgeAllTags')} active={activeTag === null} onClick={() => setActiveTag(null)} />
                        {index?.tags.map(tag => (
                          <TagChip key={tag.tag} label={`${tag.tag} ${tag.count}`} active={activeTag === tag.tag} onClick={() => setActiveTag(activeTag === tag.tag ? null : tag.tag)} />
                        ))}
                      </div>
                    )}
                    <details style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', margin: '6px 0' }}><summary style={{ cursor: 'pointer' }}>{t('noteTagsGuide')}</summary><p style={HELP}>{t('noteTagsOverview')}</p></details>
                  <FileTree nodes={treeNodes} activePath={activePath} fileLabel={entry => noteTitle(entry.path)} onSelect={path => { void openNote(path) }} />
                  </>
                )}
            </div>
            <button type="button" disabled={busy} onClick={() => void openWorkLog()} style={ACTION_BUTTON}>{t('knowledgeToday')}</button>
            <button type="button" disabled={busy} onClick={() => { uploadSelection.current = null; uploadInput.current?.click() }} style={ACTION_BUTTON}>{t('knowledgeUpload')}</button>
            <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>{t('knowledgeImageHelp')}</span>
            <input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
              onChange={event => {
                const files = Array.from(event.target.files ?? []); event.target.value = ''
                const pending = uploadSelection.current; uploadSelection.current = null
                if (pending && pending.path !== draftRef.current.activePath) return
                const selection = pending?.draft === draftRef.current.draft ? pending.selection : undefined
                void importImages(files, selection)
              }} />
            <button type="button" disabled={busy} onClick={() => void createNote(activeTag === null ? (activePath !== null && dirOf(activePath) !== '' ? dirOf(activePath) : 'notes') : 'notes')} style={ACTION_BUTTON}>+ {t('knowledgeNewNote')}</button>
          </aside>

          {/* 中栏：工具条 + 编辑/预览 */}
          <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--dsw-alias-border-l2)', flexWrap: 'wrap' }}>
              <Breadcrumb activeNote={activeNote} activePath={activePath} onOpen={path => void openNote(path)} />
              <span style={{ flex: 1 }} />
              {activeNote?.parent && <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 11 }}>↑ <button type="button" style={LINK_BUTTON} onClick={() => void openNote(activeNote.parent?.target ?? '')}>{noteTitle(activeNote.parent.target)}</button></span>}
              {file !== null && (
                <>
                  <details ref={moreMenu} key={activePath} style={{ position: 'relative' }} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation() } }}>
                    <summary className="library-more-trigger">{t('noteMore')} ···</summary>
                    <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 5, display: 'grid', gap: 5, padding: 8, minWidth: 130, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-base)' }}>
                      <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); startNoteAction('rename') }} style={ACTION_BUTTON}>{t('knowledgeRename')}</button>
                      <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); startNoteAction('delete') }} style={{ ...ACTION_BUTTON, background: 'transparent', color: 'var(--dsw-alias-label-secondary)' }}>{t('knowledgeDelete')}</button>
                    </div>
                  </details>
                  <div role="group" aria-label={t('editorView')} style={{ display: 'flex', gap: 4 }}>
                    <button type="button" disabled={busy} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')} style={mode === 'edit' ? VIEW_BUTTON_SELECTED : VIEW_BUTTON}>{t('knowledgeEdit')}</button>
                    <button type="button" disabled={busy} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')} style={mode === 'preview' ? VIEW_BUTTON_SELECTED : VIEW_BUTTON}>{t('knowledgePreview')}</button>
                  </div>
                </>
              )}
              <span style={{ color: saving ? 'var(--dsw-alias-state-warn-label)' : dirty ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-state-business-primary)', fontSize: 11 }}>
                {saving ? t('knowledgeSaving') : dirty ? t('knowledgeDirty') : file !== null ? t('knowledgeSaved') : ''}
              </span>
            </div>
            {file !== null && mode === 'edit' && <EditorToolbar key={activePath} editor={editor} content={draft} disabled={busy} t={t}
              onChange={content => { draftRef.current.draft = content; setDraft(content) }} onImage={() => {
                const current = editor.current
                if (current) uploadSelection.current = { path: activePath, draft, selection: { start: current.selectionStart, end: current.selectionEnd } }
                uploadInput.current?.click()
              }} />}
            {asset !== null
              ? <div style={{ padding: 24, overflow: 'auto', minHeight: 0 }}><p>{asset.path}</p><img src={asset.dataUrl} alt={asset.path} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} /></div>
              : file === null
              ? (
                <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 8, justifyItems: 'center', color: 'var(--dsw-alias-label-secondary)' }}>
                  <div style={{ fontSize: 40, opacity: .35 }}>✎</div>
                  <div style={{ fontSize: 15, color: 'var(--dsw-alias-label-secondary)' }}>{t('knowledgeEmptyTitle')}</div>
                  <div style={{ fontSize: 12.5 }}>{t('knowledgeEmptyBody')}</div>
                  <button type="button" disabled={busy} onClick={() => void createNote('notes')} style={ACTION_BUTTON}>+ {t('knowledgeNewNote')}</button>
                </div>
              )
              : mode === 'edit'
                ? (
                  <textarea
                    ref={editor}
                    onPaste={handlePaste}
                    onKeyDown={event => {
                      if (event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return
                      const key = event.key.toLowerCase()
                      if (key === 'b' || key === 'i') {
                        event.preventDefault()
                        applyEditorCommand({ editor, content: draft, disabled: busy, t, onChange: content => { draftRef.current.draft = content; setDraft(content) }, onImage: () => {} }, key === 'b' ? 'bold' : 'italic')
                      }
                    }}
                    aria-label={t('knowledgeEditor')}
                    disabled={busy}
                    value={draft}
                    onChange={event => { draftRef.current.draft = event.target.value; setDraft(event.target.value) }}
                    onBlur={() => void flushSave()}
                    spellCheck={false}
                    style={{
                      flex: 1, minHeight: 0, resize: 'none', border: 0, outline: 'none',
                      padding: '16px 22px', color: 'var(--dsw-alias-label-primary)', background: 'transparent',
                      font: '13px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    }}
                  />
                )
                : (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 26px 60px' }}>
                    <MarkdownView content={draft} notePath={file.path} resolveAsset={resolveAsset} onOpenLink={target => void openLink(target)} />
                  </div>
                )}
          </main>

          {/* 右栏：反链/子笔记/链接/大纲/标签 */}
          <aside className="library-details" style={{ minHeight: 0, overflowY: 'auto', borderLeft: '1px solid var(--dsw-alias-border-l2)', padding: '12px 14px', display: 'grid', gap: 16, alignContent: 'start' }}>
            {activeNote === undefined
              ? <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>—</span>
              : (
                <>
                  <SideSection title={t('knowledgeBacklinks')}>
                    <p style={HELP}>{t('noteBacklinksHelp')}</p>
                    {activeNote.backlinks.length === 0 ? null : activeNote.backlinks.map(path => (
                      <SideLink key={path} onClick={() => void openNote(path)} label={noteTitle(path)} hint={path} />
                    ))}
                  </SideSection>
                  <SideSection title={t('noteParent')}>
                    {activeNote.parent && <SideLink onClick={() => void openLink(activeNote.parent!.target)} label={noteTitle(activeNote.parent.target)} hint={activeNote.parent.target} />}
                    <NotePicker key={`parent-${activePath}`} t={t} disabled={busy} label={t('noteSetParent')}
                      notes={(index?.notes ?? []).filter(note => canSetParent(index?.notes ?? [], activeNote.path, note.path))}
                      onSelect={setParent} onClear={activeNote.parent ? () => setParent(null) : undefined} />
                  </SideSection>
                  <SideSection title={t('knowledgeChildren')}>
                    <p style={HELP}>{t('noteChildrenHelp')}</p>
                    <ChildCreator key={`child-${activePath}`} t={t} disabled={busy} onCreate={createChild} />
                    {activeNote.children.length === 0 ? null : activeNote.children.map(path => (
                      <SideLink key={path} onClick={() => void openNote(path)} label={noteTitle(path)} hint={path} />
                    ))}
                  </SideSection>
                  <SideSection title={t('knowledgeLinks')}>
                    <p style={HELP}>{t('noteLinksHelp')}</p>
                    <NotePicker key={`links-${activePath}`} t={t} disabled={busy} label={t('noteInsertLink')}
                      notes={(index?.notes ?? []).filter(note => note.path !== activePath)}
                      onSelect={target => changeNote(content => insertNoteLink(content, target, mode === 'edit' && editor.current ? { start: editor.current.selectionStart, end: editor.current.selectionEnd } : undefined))} />
                    {activeNote.links.length === 0 ? null : activeNote.links.map(link => (
                      <SideLink
                        key={link.target}
                        onClick={() => void openLink(link.target)}
                        label={link.resolved ? noteTitle(link.target) : link.target}
                        hint={link.resolved ? link.target : t('knowledgeUnresolved')}
                        muted={!link.resolved}
                      />
                    ))}
                  </SideSection>
                  <SideSection title={t('knowledgeOutline')}>
                    {outline.length === 0 ? null : outline.map((heading, position) => (
                      <button
                        key={`${position}-${heading.text}`}
                        type="button"
                        onClick={() => scrollOutline(position)}
                        style={{
                          display: 'block', width: '100%', border: 0, background: 'transparent',
                          color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                          fontSize: 12, padding: `2px 0 2px ${(heading.level - 1) * 12}px`,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {heading.text}
                      </button>
                    ))}
                  </SideSection>
                  <SideSection title={t('knowledgeTags')}>
                    <TagEditor key={`tags-${activePath}`} t={t} disabled={busy} tags={activeNote.tags} suggestions={index?.tags.map(tag => tag.tag) ?? []}
                      onSave={input => changeNote(content => updateTags(content, input, activeNote.tags))} />
                    {activeNote.tags.length === 0 ? null : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {activeNote.tags.map(tag => (
                          <TagChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} />
                        ))}
                      </div>
                    )}
                  </SideSection>
                </>
              )}
          </aside>
        </div>
      )}
    </div>
  )
}

function scrollOutline(position: number): void {
  const heading = document.querySelector(`[data-vault-h="${position}"]`)
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function SetupScreen(props: { folderPicker: boolean, t: (key: string) => string, busy: boolean, onCreate: () => void, onPick: () => void }): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 14, justifyItems: 'center', padding: 30 }}>
      <div style={{ fontSize: 40, opacity: .4 }}>✎</div>
      <h3 style={{ margin: 0, fontSize: 19 }}>{props.t('knowledgeSetupTitle')}</h3>
      <p style={{ margin: 0, maxWidth: 430, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>{props.t(props.folderPicker ? 'knowledgeSetupIntro' : 'knowledgeSetupHostIntro')}</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button type="button" disabled={props.busy} onClick={props.onCreate} style={PRIMARY_BUTTON}>{props.t('knowledgeSetupCreate')}</button>
        {props.folderPicker && <button type="button" disabled={props.busy} onClick={props.onPick} style={ACTION_BUTTON}>{props.t('knowledgeSetupPick')}</button>}
      </div>
      {props.busy && <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>{props.t('knowledgeSetupBusy')}</span>}
    </div>
  )
}

function Breadcrumb(props: { activeNote: VaultNoteInfo | undefined, activePath: string | null, onOpen: (path: string) => void }): React.JSX.Element | null {
  if (props.activePath === null)
    return null
  const segments = props.activePath.split('/')
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', minWidth: 0, overflow: 'hidden' }}>
      {segments.map((segment, position) => (
        <span key={`${position}-${segment}`} style={{ display: 'flex', gap: 5, minWidth: 0 }}>
          {position > 0 && <span aria-hidden="true">/</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {position === segments.length - 1 ? segment.replace(/\.md$/, '') : segment}
          </span>
        </span>
      ))}
    </span>
  )
}

function SideSection(props: { title: string, children: React.ReactNode }): React.JSX.Element {
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h4 style={{ margin: 0, fontSize: 11, fontWeight: 750, letterSpacing: '.1em', color: 'var(--dsw-alias-label-secondary)', textTransform: 'uppercase' }}>{props.title}</h4>
      {props.children ?? <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }}>—</span>}
    </section>
  )
}

function SideLink(props: { onClick: () => void, label: string, hint: string, muted?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      title={props.hint}
      onClick={props.onClick}
      style={{
        display: 'block', width: '100%', border: 0, background: 'transparent', cursor: 'pointer',
        color: props.muted === true ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-state-business-primary)', font: 'inherit', fontSize: 12.5,
        textAlign: 'left', padding: '3px 6px', borderRadius: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {props.muted === true ? `${props.label} · ${props.hint}` : props.label}
    </button>
  )
}

function TagChip(props: { label: string, active: boolean, onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '1.5px 9px',
        background: props.active ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
        color: props.active ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 11,
      }}
    >
      {props.label}
    </button>
  )
}

const HEADER_BUTTON: React.CSSProperties = {
  display: 'grid', placeItems: 'center', width: 30, height: 30, flex: '0 0 30px',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 9, color: 'var(--dsw-alias-label-primary)',
  background: 'var(--dsw-alias-bg-module-platform)', cursor: 'pointer', font: 'inherit', fontSize: 18, lineHeight: 1,
}

const ACTION_BUTTON: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '4px 11px',
  background: 'var(--dsw-alias-interactive-bg-active)', color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer', font: 'inherit', fontSize: 12,
}

const VIEW_BUTTON: React.CSSProperties = {
  borderStyle: 'solid', borderWidth: 1, borderColor: 'var(--dsw-alias-border-l2)', borderRadius: 8, padding: '4px 11px',
  background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, lineHeight: 'inherit', fontWeight: 400,
}
const VIEW_BUTTON_SELECTED: React.CSSProperties = {
  ...VIEW_BUTTON, background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, var(--dsw-alias-bg-base))',
  color: 'var(--dsw-alias-state-business-primary)', borderColor: 'var(--dsw-alias-state-business-primary)', fontWeight: 600,
}

const DANGER_BUTTON: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: 8, padding: '4px 11px',
  background: 'var(--dsw-alias-interactive-bg-hover-danger)', color: 'var(--dsw-alias-state-error-primary)', cursor: 'pointer', font: 'inherit', fontSize: 12,
}

const PRIMARY_BUTTON: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: '8px 16px',
  background: 'var(--dsw-alias-interactive-bg-active)', color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer', font: 'inherit', fontSize: 13,
}

const SEARCH_INPUT: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '6px 10px',
  background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12.5, outline: 'none',
}

const LINK_BUTTON: React.CSSProperties = {
  border: 0, padding: 0, background: 'transparent', color: 'var(--dsw-alias-state-business-primary)',
  cursor: 'pointer', font: 'inherit', fontSize: 11,
}

const VAULT_MARKDOWN_CSS = `
.library-more-trigger {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 4px 11px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 400; list-style: none;
}
.library-more-trigger::-webkit-details-marker { display: none; }
.library-more-trigger:hover, details[open] > .library-more-trigger {
  background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary);
}
.library-more-trigger:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }

.library-columns { grid-template-columns: 230px minmax(240px, 1fr) 240px; overflow-x: auto; }
@container (max-width: 1050px) { .library-columns { grid-template-columns: 170px minmax(240px, 1fr) 220px; } }
@container (max-width: 650px) { .library-columns { grid-template-columns: 150px minmax(260px, 1fr) 220px; } }

.vault-markdown { font-size: 14px; line-height: 1.8; color: var(--dsw-alias-label-primary); max-width: 780px; }
.vault-markdown h1, .vault-markdown h2, .vault-markdown h3,
.vault-markdown h4, .vault-markdown h5, .vault-markdown h6 {
  color: var(--dsw-alias-label-primary); line-height: 1.3; margin: 1.4em 0 .5em; font-weight: 700;
}
.vault-markdown h1 { font-size: 24px; } .vault-markdown h2 { font-size: 19px; }
.vault-markdown h3 { font-size: 16px; }
.vault-markdown p { margin: .6em 0; }
.vault-markdown a { color: var(--dsw-alias-state-business-primary); }
.vault-markdown a[data-vault-link] { color: var(--dsw-alias-state-business-primary); cursor: pointer; text-decoration: none; border-bottom: 1px dashed var(--dsw-alias-border-l2); }
.vault-markdown a[data-vault-link]:hover { background: var(--dsw-alias-interactive-bg-active); }
.vault-markdown img { max-width: 100%; border-radius: 10px; margin: .5em 0; }
.vault-markdown code { background: var(--dsw-alias-border-l2); border-radius: 5px; padding: .1em .4em; font-size: .92em; }
.vault-markdown pre { background: var(--dsw-alias-border-l2); border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; padding: 12px 14px; overflow-x: auto; }
.vault-markdown pre code { background: transparent; padding: 0; }
.vault-markdown blockquote { margin: .8em 0; padding: .2em 1em; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.vault-markdown table { border-collapse: collapse; margin: .8em 0; }
.vault-markdown th, .vault-markdown td { border: 1px solid var(--dsw-alias-border-l2); padding: 5px 10px; }
.vault-markdown hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l2); margin: 1.6em 0; }
.vault-markdown ul, .vault-markdown ol { padding-left: 1.5em; }
`
