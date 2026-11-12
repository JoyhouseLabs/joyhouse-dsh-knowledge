import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useNavigation, type Navigation } from '../navigation.ts'
import type { KnowledgeKey } from '../locales.ts'
import { KnowledgeWorkspace } from './knowledge-workspace.tsx'

export function createLibraryDock() {
  let current: HTMLElement | null = null
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    attach(element: HTMLElement | null) { if (element !== current) { current = element; for (const fn of listeners) fn() } },
  }
}
type Dock = ReturnType<typeof createLibraryDock>
export function LibraryMount({ dock }: { dock: Dock }): React.JSX.Element {
  return <div ref={dock.attach} style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }} />
}

/** The keyed native main may unmount; a persistent portal preserves draft and cursor state. */
export function LibraryPanel({ navigation, dock, t: translate }: { navigation: Navigation; dock: Dock; t: (key: KnowledgeKey) => string }): React.JSX.Element {
  const t = translate as (key: string) => string
  const state = useNavigation(navigation)
  const target = useSyncExternalStore(dock.subscribe, dock.getSnapshot, dock.getSnapshot)
  const parking = useRef<HTMLDivElement>(null), root = useRef<HTMLElement>(null)
  const [surface] = useState(() => {
    const element = document.createElement('div')
    Object.assign(element.style, { display: 'flex', flex: '1', minWidth: '0', minHeight: '0' })
    return element
  })
  useLayoutEffect(() => {
    ;(target ?? parking.current)?.appendChild(surface)
    return () => { surface.remove() }
  }, [target, surface])
  useLayoutEffect(() => {
    if (!state.active || !target) return
    const previousFocus = document.activeElement
    const originals = (state.focused ? ['sidebar', 'rightbar', 'shell.leading', 'shell.bottom'] : []).flatMap(slot => {
      const element = document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
      if (!element) return []
      const original = { element, inert: element.inert }; element.inert = true; return [original]
    })
    root.current?.focus({ preventScroll: true })
    return () => {
      for (const entry of originals) entry.element.inert = entry.inert
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({ preventScroll: true })
    }
  }, [target, state.active, state.focused])
  const controls = <div style={{ display: 'flex', gap: 6 }}>
    <button type="button" style={BUTTON} aria-pressed={state.focused} onClick={() => navigation.toggleFocus()}>{t(state.focused ? 'workspaceExitFocus' : 'workspaceFocus')}</button>
    <button type="button" style={BUTTON} onClick={() => navigation.chat()}>{t('workspaceChat')}</button>
  </div>
  return <><div ref={parking} hidden />{createPortal(<section ref={root} tabIndex={-1} data-joyhouse-library-panel
    style={{ display: state.active ? 'flex' : 'none', flex: 1, flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden', pointerEvents: 'auto',
      position: state.focused ? 'fixed' : 'relative', ...(state.focused ? { inset: 'var(--dsh-frame-chrome-top, 0px) 0 0', zIndex: 100 } : {}),
      background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', outline: 'none' }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation()
        if (state.focused) navigation.toggleFocus(); else navigation.chat()
      }
    }}>
    <KnowledgeWorkspace t={t} open={state.visited.includes('knowledge')} controls={controls} onClose={() => navigation.chat()} />
  </section>, surface)}</>
}
const BUTTON: React.CSSProperties = { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '5px 10px', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }
