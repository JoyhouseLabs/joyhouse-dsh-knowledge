/** 知识库左侧文件树：由扁平 `VaultEntry[]` 构建可折叠目录树。 */
import { useMemo, useState } from 'react'
import type { VaultEntry, VaultSearchHit } from '../vault-bridge.ts'

export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

export function buildTree(entries: VaultEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }
  const dirIndex = new Map<string, TreeNode>([['', root]])
  for (const entry of entries) {
    const parentPath = entry.path.includes('/')
      ? entry.path.slice(0, entry.path.lastIndexOf('/'))
      : ''
    const parent = dirIndex.get(parentPath) ?? root
    if (entry.kind === 'dir') {
      const node: TreeNode = { name: entry.name, path: entry.path, isDir: true, children: [] }
      dirIndex.set(entry.path, node)
      parent.children.push(node)
    }
    else {
      parent.children.push({ name: entry.name, path: entry.path, isDir: false, children: [] })
    }
  }
  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir)
        return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
    for (const node of nodes)
      sortNodes(node.children)
  }
  sortNodes(root.children)
  return root.children
}

export interface FileTreeProps {
  nodes: TreeNode[]
  activePath: string | null
  fileLabel: (entry: { path: string, name: string }) => string
  onSelect: (path: string) => void
}

export function FileTree(props: FileTreeProps): React.JSX.Element {
  return <>{props.nodes.map(node => (
    <TreeRow
      key={node.path}
      node={node}
      depth={0}
      activePath={props.activePath}
      onSelect={props.onSelect}
      fileLabel={props.fileLabel}
    />
  ))}</>
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  activePath: string | null
  onSelect: (path: string) => void
  fileLabel: (entry: { path: string, name: string }) => string
}

function TreeRow(props: TreeRowProps): React.JSX.Element {
  const { node, depth, activePath, onSelect, fileLabel } = props
  const [open, setOpen] = useState(true)
  const active = activePath === node.path
  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            padding: `4px 8px 4px ${8 + depth * 14}px`, border: 0, borderRadius: 7,
            background: 'transparent', color: 'inherit', cursor: 'pointer',
            font: 'inherit', fontSize: 12.5, textAlign: 'left',
          }}
        >
          <span aria-hidden="true" style={{ width: 10, color: 'var(--dsw-alias-label-tertiary)', fontSize: 9 }}>{open ? '▾' : '▸'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        </button>
        {open && node.children.map(child => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onSelect={onSelect}
            fileLabel={fileLabel}
          />
        ))}
      </div>
    )
  }
  return (
    <button
      type="button"
      title={node.path}
      onClick={() => onSelect(node.path)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        padding: `4px 8px 4px ${8 + depth * 14}px`, border: 0, borderRadius: 7,
        background: active ? 'var(--dsw-alias-interactive-bg-active)' : 'transparent',
        color: active ? 'var(--dsw-alias-state-business-primary)' : 'inherit', cursor: 'pointer',
        font: 'inherit', fontSize: 12.5, textAlign: 'left',
      }}
    >
      <span aria-hidden="true" style={{ width: 10, textAlign: 'center', opacity: .7, fontSize: 9 }}>{node.name.endsWith('.md') ? '✎' : '▣'}</span>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileLabel(node)}</span>
    </button>
  )
}

/** 搜索结果列表（文件树下方）。 */
export interface SearchResultsProps {
  hits: VaultSearchHit[]
  onSelect: (path: string) => void
}

export function SearchResults(props: SearchResultsProps): React.JSX.Element {
  const grouped = useMemo(() => {
    const byPath = new Map<string, VaultSearchHit[]>()
    for (const hit of props.hits) {
      const list = byPath.get(hit.path) ?? []
      list.push(hit)
      byPath.set(hit.path, list)
    }
    return [...byPath.entries()]
  }, [props.hits])

  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {grouped.map(([path, hits]) => (
        <button
          key={path}
          type="button"
          onClick={() => props.onSelect(path)}
          style={{
            display: 'grid', gap: 3, width: '100%', padding: '6px 8px', border: 0,
            borderRadius: 7, background: 'transparent', color: 'inherit',
            cursor: 'pointer', font: 'inherit', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--dsw-alias-state-business-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</span>
          {hits.slice(0, 3).map(hit => (
            <span key={`${hit.path}:${hit.line}`} style={{ fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hit.kind === 'content' ? `${hit.line}: ` : ''}{hit.snippet}
            </span>
          ))}
        </button>
      ))}
    </div>
  )
}
