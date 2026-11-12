import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { feedbackText, type Feedback } from './feedback.ts'
import { localDay, type NoteTemplate } from '../library.ts'

export function useNotice() {
  const [notice, setNotice] = useState<{ message: Feedback; error: boolean; id: number } | null>(null)
  const counter = useRef(0)
  const notify = useCallback((message: Feedback, error = false) => setNotice({ message, error, id: ++counter.current }), [])
  const dismiss = useCallback(() => setNotice(null), [])
  useEffect(() => {
    if (!notice || notice.error) return
    const timer = window.setTimeout(dismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [notice, dismiss])
  return { notice, notify, dismiss }
}
export function Notice({ notice, dismiss, t }: { notice: ReturnType<typeof useNotice>['notice']; dismiss: () => void; t: (key: string) => string }) {
  if (!notice) return null
  return <div key={notice.id} data-library-toast role={notice.error ? 'alert' : 'status'} style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1100, maxWidth: 'min(460px, calc(100% - 32px))', display: 'flex', alignItems: 'start', gap: 12, padding: '12px 16px', borderRadius: 10, boxShadow: '0 5px 24px #0002', background: 'var(--dsw-alias-bg-base)', color: notice.error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2)', overflowWrap: 'anywhere' }}>
    <span>{feedbackText(notice.message, t)}</span><button type="button" style={BUTTON} aria-label={t('actionDismiss')} onClick={dismiss}>×</button>
  </div>
}
export type NoteAction = { kind: 'create' | 'rename' | 'delete'; path: string; dir: string; name: string }
export function NoteActionDialog({ action, busy, error, t, onSubmit, onCancel }: {
  action: NoteAction; busy: boolean; error: Feedback | null; t: (key: string) => string
  onSubmit: (name: string, title: boolean, template: NoteTemplate) => Promise<void>; onCancel: () => void
}) {
  const [name, setName] = useState(action.name), [updateTitle, setUpdateTitle] = useState(true)
  const [template, setTemplate] = useState<NoteTemplate>('blank')
  const root = useRef<HTMLDivElement>(null), titleId = useId()
  useEffect(() => {
    const previous = document.activeElement
    root.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  const label = t(action.kind === 'rename' ? 'knowledgeRename' : action.kind === 'delete' ? 'knowledgeDelete' : 'knowledgeNewNote')
  return <div style={{ position: 'absolute', inset: 0, zIndex: 1000, background: '#0004', display: 'grid', placeItems: 'center', padding: 20 }} onClick={event => { if (event.target === event.currentTarget && !busy) onCancel() }}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel() }
      if (event.key === 'Tab') {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') ?? [])]
        const first = controls[0], last = controls.at(-1)
        if (!controls.length) event.preventDefault()
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }} style={{ width: 'min(420px, 100%)', padding: 22, borderRadius: 12, background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', boxShadow: '0 12px 48px #0003' }}>
      <h3 id={titleId} style={{ marginTop: 0 }}>{label}</h3>
      <form onSubmit={event => { event.preventDefault(); if (!busy) void onSubmit(name, updateTitle, template) }} style={{ display: 'grid', gap: 12 }}>
        {action.kind === 'create' && <>
          <label>{t('templateLabel')}<select aria-label={t('templateLabel')} value={template} disabled={busy} style={{ ...BUTTON, display: 'block', width: '100%', marginTop: 6 }} onChange={event => {
            const kind = event.target.value as NoteTemplate
            setTemplate(kind)
            const day = localDay(new Date())
            const wasGenerated = template !== 'blank' && name === `${day} ${t(template === 'daily' ? 'templateDaily' : 'templateEssay')}`
            if (kind !== 'blank' && (!name.trim() || wasGenerated)) setName(`${day} ${t(kind === 'daily' ? 'templateDaily' : 'templateEssay')}`)
          }}><option value="blank">{t('templateBlank')}</option><option value="daily">{t('templateDaily')}</option><option value="essay">{t('templateEssay')}</option></select></label>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('templateHint')}</p>
        </>}
        {action.kind === 'delete' ? <p style={{ margin: 0 }}>{t('knowledgeConfirmDelete')}<br /><strong>{action.name}</strong></p> : <>
          <label>{t('actionName')}<input aria-label={t('actionName')} value={name} disabled={busy} onChange={event => setName(event.target.value)} style={{ ...BUTTON, cursor: 'text', boxSizing: 'border-box', display: 'block', width: '100%', marginTop: 6 }} /></label>
          {action.kind === 'rename' && <><label style={{ fontSize: 12 }}><input type="checkbox" checked={updateTitle} disabled={busy} onChange={event => setUpdateTitle(event.target.checked)} /> {t('actionUpdateTitle')}</label><p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('actionRenameHint')}</p></>}
        </>}
        {error && <p role="alert" style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, overflowWrap: 'anywhere' }}>{feedbackText(error, t)}</p>}
        <div style={{ display: 'flex', justifyContent: 'end', gap: 8 }}>
          <button type="button" style={BUTTON} disabled={busy} onClick={onCancel}>{t('editorCancel')}</button>
          <button type="submit" style={BUTTON} disabled={busy}>{busy ? t('actionWorking') : label}</button>
        </div>
      </form>
    </div>
  </div>
}
const BUTTON: CSSProperties = { padding: '7px 12px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 7, background: 'var(--dsw-alias-bg-module-platform)', color: 'inherit', font: 'inherit', cursor: 'pointer' }
