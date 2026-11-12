export type EditorCommand = 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'strike' | 'bullet' | 'ordered' | 'task' | 'quote' | 'code' | 'table' | 'rule' | 'link'
export interface EditSelection { start: number; end: number }
export interface EditResult extends EditSelection { content: string }

/** All transformations operate on the selected text, without touching the rest of the note. */
export function editMarkdown(content: string, selection: EditSelection, command: EditorCommand, placeholder: string, url = ''): EditResult {
  const start = Math.max(0, Math.min(selection.start, content.length))
  const end = Math.max(start, Math.min(selection.end, content.length))
  const selected = content.slice(start, end)
  function replace(from: number, to: number, text: string, offset = 0, length = text.length): EditResult {
    return { content: content.slice(0, from) + text + content.slice(to), start: from + offset, end: from + offset + length }
  }
  const marker = { bold: '**', italic: '*', strike: '~~' }[command as 'bold' | 'italic' | 'strike']
  if (marker) {
    if (start >= marker.length && content.slice(start - marker.length, start) === marker && content.slice(end, end + marker.length) === marker)
      return replace(start - marker.length, end + marker.length, selected)
    const text = selected || placeholder
    return replace(start, end, marker + text + marker, marker.length, text.length)
  }
  if (command === 'link') {
    const target = new URL(url)
    if (!['https:', 'http:', 'mailto:'].includes(target.protocol)) throw new Error('LINK_URL_INVALID')
    const text = selected || placeholder
    const label = text.replace(/[\\[\]]/g, '\\$&')
    return replace(start, end, `[${label}](<${target.href.replace(/>/g, '%3E')}>)`, 1, label.length)
  }
  if (['code', 'table', 'rule'].includes(command)) {
    const before = start && content[start - 1] !== '\n' ? '\n\n' : ''
    const after = end < content.length && content[end] !== '\n' ? '\n\n' : '\n'
    const text = command === 'code' ? `\`\`\`\n${selected || placeholder}\n\`\`\``
      : command === 'table' ? `| ${placeholder} 1 | ${placeholder} 2 |\n| --- | --- |\n|  |  |` : '---'
    return replace(start, end, before + text + after, before.length, text.length)
  }
  const from = start === 0 ? 0 : content.lastIndexOf('\n', start - 1) + 1
  const last = end > start && content[end - 1] === '\n' ? end - 1 : end
  const newline = content.indexOf('\n', last)
  const to = newline < 0 ? content.length : newline
  const lines = content.slice(from, to).split('\n')
  const prefix = command === 'h1' ? '# ' : command === 'h2' ? '## ' : command === 'h3' ? '### '
    : command === 'bullet' ? '- ' : command === 'task' ? '- [ ] ' : command === 'quote' ? '> ' : ''
  const allSet = lines.every(line => command === 'ordered' ? /^\d+\. /.test(line) : line.startsWith(prefix))
  const text = lines.map((line, index) => {
    if (allSet) return command === 'ordered' ? line.replace(/^\d+\. /, '') : line.slice(prefix.length)
    const clean = line.replace(/^(?:#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/, '') || placeholder
    return (command === 'ordered' ? `${index + 1}. ` : prefix) + clean
  }).join('\n')
  return replace(from, to, text)
}
