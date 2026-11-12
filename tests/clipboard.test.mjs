import test from 'node:test'
import assert from 'node:assert/strict'
import { clipboardImages, insertImage } from '../src/client/clipboard.ts'

test('a screenshot in items and files is imported once', () => {
  const file = new File(['image'], 'screenshot.png', { type: 'image/png' })
  assert.deepEqual(clipboardImages({ items: [{ kind: 'file', type: file.type, getAsFile: () => file }], files: [file] }), [file])
})

test('text and HTML paste produce no images and remain native', () => {
  assert.deepEqual(clipboardImages({ items: [{ kind: 'string', type: 'text/html', getAsFile: () => null }], files: [] }), [])
  assert.deepEqual(clipboardImages(null), [])
})

test('clipboard files without a filename are normalized using MIME, including native fallback payloads', async () => {
  const file = new File(['image'], '', { type: 'image/png' })
  const [result] = clipboardImages({ items: [], files: [file] })
  assert.equal(result.name, 'clipboard-image.png')
  assert.equal(result.type, 'image/png')
  assert.equal(await result.text(), 'image')
  assert.equal(clipboardImages({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }], files: [file] }).length, 1)
})

test('multiple distinct clipboard images keep their order', () => {
  const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]
  assert.deepEqual(clipboardImages({ items: [], files }), files)
})

test('image insertion preserves surrounding writing and replaces only the selected range', () => {
  const result = insertImage('之前选中之后', 'attachments/a.png', { start: 2, end: 4 })
  assert.equal(result.content, '之前\n\n![[attachments/a.png]]\n\n之后')
  assert.equal(result.content.slice(result.caret), '之后')
  const second = insertImage(result.content, 'attachments/b.png', { start: result.caret, end: result.caret })
  assert.equal(second.content, '之前\n\n![[attachments/a.png]]\n\n![[attachments/b.png]]\n\n之后')
})

test('empty and end-of-note paste preserve blank lines without trimming the document', () => {
  assert.equal(insertImage('', 'a.png', { start: 0, end: 0 }).content, '![[a.png]]\n\n')
  assert.equal(insertImage('记录\n\n', 'a.png', { start: 4, end: 4 }).content, '记录\n\n![[a.png]]\n\n')
})
