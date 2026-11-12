/** vault 可用状态。`configured = false` 时进入创建/选择流程。 */
export interface VaultStatus {
  configured: boolean
  root?: string
  noteCount: number
}

/** 目录树条目（`kind`: `file` | `dir`）。 */
export interface VaultEntry {
  path: string
  name: string
  kind: 'file' | 'dir'
  size: number
  modifiedMs: number
}

/** 笔记内容。 */
export interface VaultFile {
  path: string
  content: string
  size: number
  modifiedMs: number
}

/** 已解析的链接目标。 */
export interface VaultLink {
  target: string
  resolved: boolean
}

/** 标题大纲条目。 */
export interface VaultHeading {
  level: number
  text: string
  slug: string
}

/** 单篇笔记在索引中的完整视图。 */
export interface VaultNoteInfo {
  path: string
  title: string
  tags: string[]
  links: VaultLink[]
  backlinks: string[]
  children: string[]
  headings: VaultHeading[]
  parent?: VaultLink
}

export interface VaultTagCount {
  tag: string
  count: number
}

export interface VaultIndex {
  notes: VaultNoteInfo[]
  tags: VaultTagCount[]
}

export interface VaultSearchHit {
  path: string
  kind: 'name' | 'content'
  line: number
  snippet: string
}

export interface VaultAsset {
  path: string
  dataUrl: string
}

export interface SyncStatus { configured: boolean; enabled: boolean; endpoint: string | null; account: string | null; vault: string | null; lastSuccess: number | null }
export interface SyncReport { uploaded: number; downloaded: number; conflicts: number }
export interface SyncVersion { path: string; rev: number; hash: string | null; time: number; device: string }

export type VaultMethod =
  | 'sync-status' | 'sync-connect' | 'sync-configure' | 'sync-run' | 'sync-history' | 'sync-restore'
  | 'status'
  | 'pick-folder'
  | 'set-root'
  | 'list'
  | 'read'
  | 'write'
  | 'create'
  | 'rename'
  | 'delete'
  | 'index'
  | 'search'
  | 'read-asset'
  | 'write-asset'

export interface VaultMethodParams {
  'sync-status': Record<string, never>
  'sync-connect': Record<string, never>
  'sync-configure': { mode: 'enable' | 'pause' | 'disconnect' }
  'sync-run': Record<string, never>
  'sync-history': { path: string; before: string }
  'sync-restore': { path: string; revision: string }
  status: Record<string, never>
  'pick-folder': Record<string, never>
  'set-root': { path?: string }
  list: Record<string, never>
  read: { path: string }
  write: { path: string, content: string, expectedContent?: string }
  create: { dir: string, name: string }
  rename: { path: string, newName: string }
  delete: { path: string }
  index: Record<string, never>
  search: { query: string }
  'read-asset': { path: string }
  'write-asset': { path: string, dataBase64: string }
}

export type VaultMethodResult<M extends VaultMethod> =
  M extends 'sync-status' | 'sync-connect' | 'sync-configure' ? SyncStatus
    : M extends 'sync-run' ? SyncReport
    : M extends 'sync-history' ? SyncVersion[]
    : M extends 'sync-restore' ? string
    : M extends 'status' ? VaultStatus
    : M extends 'set-root' ? VaultStatus
      : M extends 'pick-folder' ? string | null
        : M extends 'list' ? VaultEntry[]
          : M extends 'read' ? VaultFile
            : M extends 'write' ? null
              : M extends 'create' ? string
                : M extends 'rename' ? string
                  : M extends 'delete' ? null
                    : M extends 'index' ? VaultIndex
                      : M extends 'search' ? VaultSearchHit[]
                        : M extends 'read-asset' ? VaultAsset
                          : M extends 'write-asset' ? null
                            : never
