/** Read only the paste event payload; never poll the system clipboard. */
export function clipboardImages(data: Pick<DataTransfer, 'items' | 'files'> | null): File[] {
  if (!data) return []
  const items = Array.from(data.items ?? [])
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
  // WebViews may expose just files. Do not import a screenshot twice when both views exist.
  const files = items.length > 0 ? items : Array.from(data.files ?? [])
    .filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  const extensions: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  }
  return files.map(file => {
    const extension = extensions[file.type.toLowerCase()]
    if (!extension || /\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file
    return new File([file], `clipboard-image.${extension}`, { type: file.type })
  })
}

export interface ImageSelection { start: number; end: number }

/** Replace the selection, preserve surrounding text, and leave a new caret after the image. */
export function insertImage(content: string, path: string, selection: ImageSelection): { content: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, content.length))
  const end = Math.max(start, Math.min(selection.end, content.length))
  const before = content.slice(0, start)
  const after = content.slice(end)
  const prefix = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const suffix = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  const inserted = `${prefix}![[${path}]]${suffix}`
  return { content: `${before}${inserted}${after}`, caret: before.length + inserted.length }
}
