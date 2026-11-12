/**
 * 知识库 Markdown 渲染：wikilink/嵌入预处理 → marked → DOMPurify。
 *
 * - `[[目标]]` / `[[目标|别名]]` → `<a data-vault-link>`（未解析目标保留原名，
 *   点击时由工作区创建）；
 * - `![[图片]]` 与 `![](相对路径)` → `<img data-vault-embed>`，src 指向
 * `vault://` 协议，加载失败回退 data URL（见 `attachImageFallbacks`）；
 * - 标题渲染后按出现顺序编号（`data-vault-h`），供大纲跳转。
 */
import { useEffect, useMemo, useRef } from 'react'
import { visibleNoteBody } from './note-metadata.ts'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { requestJoyHouseVault, vaultAssetUrl } from '../vault-bridge.ts'

const WIKILINK = /(!?)\[\[([^\[\]|#]+)(#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]/g
const IMAGE_MD = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif']

export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTS.includes(ext)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** vault 相对路径的目录部分（`notes/a/b.md` → `notes/a`；顶层为空）。 */
export function dirOf(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

/** 相对当前笔记目录解析资源路径。 */
function resolveRelative(src: string, noteDir: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:'))
    return src
  const parts = src.split('/')
  const stack = noteDir === '' ? [] : noteDir.split('/')
  for (const part of parts) {
    if (part === '.' || part === '')
      continue
    if (part === '..')
      stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

export interface MarkdownProps {
  content: string
  notePath: string
  /** 按文件名或相对路径查找 vault 内资源。 */
  resolveAsset: (src: string) => string | undefined
  /** 点击 wikilink（`resolved=false` 时 target 为原始名）。 */
  onOpenLink: (target: string) => void
}

interface OutlineEntry {
  level: number
  text: string
}

/** 从内容解析标题大纲（忽略围栏代码块内）。 */
export function parseOutline(content: string): OutlineEntry[] {
  const outline: OutlineEntry[] = []
  let inFence = false
  for (const line of content.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      continue
    }
    if (inFence)
      continue
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
    if (match) {
      outline.push({ level: match[1]?.length ?? 0, text: match[2] ?? '' })
    }
  }
  return outline
}

function preprocess(markdown: string, noteDir: string, resolveAsset: (src: string) => string | undefined): string {
  let out = visibleNoteBody(markdown).replace(
    WIKILINK,
    (_all, embed: string, rawTarget: string, _anchor: string | undefined, alias: string | undefined) => {
      const target = rawTarget.trim()
      const label = (alias ?? '').trim() || target
      if (embed && isImagePath(target)) {
        const resolved = resolveAsset(target)
        if (resolved) {
          return `<img src="${escapeHtml(vaultAssetUrl(resolved))}" alt="${escapeHtml(target)}" data-vault-embed="${escapeHtml(resolved)}" />`
        }
      }
      return `<a data-vault-link="${escapeHtml(target)}">${escapeHtml(label)}</a>`
    },
  )
  out = out.replace(IMAGE_MD, (all, alt: string, src: string) => {
    const resolved = resolveRelative(src, noteDir)
    if (isImagePath(resolved)) {
      return `<img src="${escapeHtml(vaultAssetUrl(resolved))}" alt="${escapeHtml(alt)}" data-vault-embed="${escapeHtml(resolved)}" />`
    }
    return all
  })
  return out
}

export function MarkdownView(props: MarkdownProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    const processed = preprocess(props.content, dirOf(props.notePath), props.resolveAsset)
    const raw = marked.parse(processed, { async: false, gfm: true, breaks: true }) as string
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['data-vault-link', 'data-vault-embed', 'target'],
    })
  }, [props.content, props.notePath, props.resolveAsset])

  // 渲染后处理：标题编号（供大纲跳转）与图片协议回退
  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return
    container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading, index) => {
      heading.setAttribute('data-vault-h', String(index))
    })
    container.querySelectorAll('img[data-vault-embed]').forEach((element) => {
      const img = element as HTMLImageElement
      const rel = img.getAttribute('data-vault-embed')
      if (!rel || img.dataset.vaultFallback === '1')
        return
      img.dataset.vaultFallback = '1'
      void requestJoyHouseVault('read-asset', { path: rel })
        .then(asset => { if (img.isConnected) img.src = asset.dataUrl })
        .catch(() => { if (img.isConnected) img.alt = `${img.alt} (image unavailable)` })

    })
  }, [html])

  return (
    <div
      ref={containerRef}
      className="vault-markdown"
      onClick={(event) => {
        const target = event.target as HTMLElement
        const anchor = target.closest?.('a[data-vault-link]') as HTMLAnchorElement | null
        if (anchor) {
          event.preventDefault()
          const link = anchor.getAttribute('data-vault-link')
          if (link)
            props.onOpenLink(link)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
