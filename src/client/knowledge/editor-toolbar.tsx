import { useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { editMarkdown, type EditorCommand, type EditSelection } from './editor-commands.ts'

export interface EditorToolbarProps {
  editor: RefObject<HTMLTextAreaElement>
  content: string
  disabled: boolean
  t: (key: string) => string
  onChange: (content: string) => void
  onImage: () => void
}

export function applyEditorCommand(props: EditorToolbarProps, command: EditorCommand, selection?: EditSelection, url?: string): void {
  const editor = props.editor.current
  if (!editor || props.disabled) return
  const result = editMarkdown(props.content, selection ?? { start: editor.selectionStart, end: editor.selectionEnd }, command,
    props.t(command === 'table' ? 'editorColumn' : 'editorPlaceholder'), url)
  props.onChange(result.content)
  requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(result.start, result.end) })
}

export function EditorToolbar(props: EditorToolbarProps): React.JSX.Element {
  const { t } = props
  const [link, setLink] = useState<EditSelection | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const commands: [EditorCommand, string][] = [
    ['h1', 'editorH1'], ['h2', 'editorH2'], ['h3', 'editorH3'], ['bold', 'editorBold'],
    ['italic', 'editorItalic'], ['strike', 'editorStrike'], ['bullet', 'editorBullet'],
    ['ordered', 'editorOrdered'], ['task', 'editorTask'], ['quote', 'editorQuote'],
    ['code', 'editorCode'], ['table', 'editorTable'], ['rule', 'editorRule'],
  ]
  return <div style={{ borderBottom: '1px solid var(--dsw-alias-border-l2)', padding: '8px 12px', flexShrink: 0 }}>
    <div role="group" aria-label={t('editorToolbar')} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {commands.map(([command, label]) => <button key={command} type="button" style={BUTTON} disabled={props.disabled}
        title={t(label)} onMouseDown={event => event.preventDefault()} onClick={() => applyEditorCommand(props, command)}>{t(label)}</button>)}
      <button type="button" style={BUTTON} disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={() => {
        const editor = props.editor.current
        if (editor) { setLink({ start: editor.selectionStart, end: editor.selectionEnd }); setUrl(''); setError(false) }
      }}>{t('editorLink')}</button>
      <button type="button" style={BUTTON} disabled={props.disabled} onMouseDown={event => event.preventDefault()} onClick={props.onImage}>{t('knowledgeUpload')}</button>
    </div>
    {link && <form onSubmit={event => {
      event.preventDefault()
      try { applyEditorCommand(props, 'link', link, url); setLink(null) }
      catch { setError(true) }
    }} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
      <label>{t('editorLinkUrl')} <input autoFocus value={url} placeholder="https://" onChange={event => setUrl(event.target.value)} style={{ ...BUTTON, minWidth: 190 }} /></label>
      <button type="submit" disabled={props.disabled} style={BUTTON}>{t('editorInsert')}</button>
      <button type="button" style={BUTTON} onClick={() => setLink(null)}>{t('editorCancel')}</button>
      {error && <span role="alert">{t('editorLinkInvalid')}</span>}
    </form>}
  </div>
}

const BUTTON: CSSProperties = { padding: '4px 8px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12, cursor: 'pointer' }
