import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { VaultNoteInfo } from '../../contracts.ts'

type Base = { t: (key: string) => string; disabled: boolean }
const BUTTON: CSSProperties = { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, background: 'transparent', color: 'var(--dsw-alias-label-primary)', padding: '4px 7px', font: 'inherit', fontSize: 12, cursor: 'pointer' }
const INPUT: CSSProperties = { ...BUTTON, width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'var(--dsw-alias-bg-base)', cursor: 'text' }
export const HELP: CSSProperties = { margin: '2px 0 6px', fontSize: 11, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' }

export function NotePicker({ t, disabled, label, notes, onSelect, onClear }: Base & {
  label: string; notes: VaultNoteInfo[]; onSelect: (path: string) => Promise<boolean>; onClear?: (() => Promise<boolean>) | undefined
}): React.JSX.Element {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState('')
  return <div>
    <button type="button" style={BUTTON} disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>{label}</button>
    {open && <form style={{ display: 'grid', gap: 6, marginTop: 6 }} onSubmit={event => { event.preventDefault(); if (selected) void onSelect(selected).then(ok => { if (ok) { setOpen(false); setSelected('') } }) }}>
      <select aria-label={label} style={INPUT} value={selected} disabled={disabled} onChange={event => setSelected(event.target.value)}>
        <option value="">{t('noteChoose')}</option>
        {notes.map(note => <option key={note.path} value={note.path}>{note.title} · {note.path}</option>)}
      </select>
      {!notes.length && <p style={HELP}>{t('noteNoCandidates')}</p>}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button type="submit" style={BUTTON} disabled={disabled || !selected}>{t('noteApply')}</button>
        {onClear && <button type="button" style={BUTTON} disabled={disabled} onClick={() => void onClear().then(ok => { if (ok) setOpen(false) })}>{t('noteRemoveParent')}</button>}
        <button type="button" style={BUTTON} onClick={() => setOpen(false)}>{t('editorCancel')}</button>
      </div>
    </form>}
  </div>
}
export function ChildCreator({ t, disabled, onCreate }: Base & { onCreate: (name: string) => Promise<boolean> }): React.JSX.Element {
  const [open, setOpen] = useState(false), [name, setName] = useState('')
  return <div>
    <button type="button" style={BUTTON} disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>{t('noteCreateChild')}</button>
    {open && <form style={{ display: 'grid', gap: 6, marginTop: 6 }} onSubmit={event => { event.preventDefault(); void onCreate(name.trim()).then(ok => { if (ok) { setName(''); setOpen(false) } }) }}>
      <input style={INPUT} aria-label={t('noteChildName')} placeholder={t('noteChildName')} value={name} disabled={disabled} onChange={event => setName(event.target.value)} />
      <div style={{ display: 'flex', gap: 5 }}>
        <button type="submit" style={BUTTON} disabled={disabled || !name.trim()}>{t('noteApply')}</button>
        <button type="button" style={BUTTON} onClick={() => setOpen(false)}>{t('editorCancel')}</button>
      </div>
    </form>}
  </div>
}
export function TagEditor({ t, disabled, tags, suggestions, onSave }: Base & {
  tags: string[]; suggestions: string[]; onSave: (tags: string) => Promise<boolean>
}): React.JSX.Element {
  const [open, setOpen] = useState(false), [value, setValue] = useState('')
  return <div>
    <button type="button" style={BUTTON} disabled={disabled} aria-expanded={open} onClick={() => { setValue(tags.join(', ')); setOpen(!open) }}>{t('noteEditTags')}</button>
    {open && <form style={{ display: 'grid', gap: 6, marginTop: 6 }} onSubmit={event => { event.preventDefault(); void onSave(value).then(ok => { if (ok) setOpen(false) }) }}>
      <textarea style={{ ...INPUT, resize: 'vertical' }} rows={3} aria-label={t('noteEditTags')} value={value} disabled={disabled} onChange={event => setValue(event.target.value)} />
      <p style={HELP}>{t('noteTagsHelp')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{suggestions.filter(tag => !value.split(/[,，\s]+/).includes(tag)).slice(0, 12).map(tag =>
        <button key={tag} type="button" disabled={disabled} style={BUTTON} onClick={() => setValue(value.trim() ? `${value}, ${tag}` : tag)}>+ {tag}</button>)}</div>
      <div style={{ display: 'flex', gap: 5 }}>
        <button type="submit" style={BUTTON} disabled={disabled}>{t('noteSaveTags')}</button>
        <button type="button" style={BUTTON} onClick={() => setOpen(false)}>{t('editorCancel')}</button>
      </div>
    </form>}
  </div>
}
