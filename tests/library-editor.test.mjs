import test from 'node:test'
import assert from 'node:assert/strict'
import { editMarkdown } from '../src/client/knowledge/editor-commands.ts'

test('formatting wraps the selection, preserves surrounding content and toggles back', () => {
  const source = '今天完成工作，再休息'
  const result = editMarkdown(source, { start: 2, end: 6 }, 'bold', '文字')
  assert.equal(result.content, '今天**完成工作**，再休息')
  assert.equal(result.content.slice(result.start, result.end), '完成工作')
  assert.equal(editMarkdown(result.content, result, 'bold', '文字').content, source)
  assert.equal(editMarkdown('', { start: 0, end: 0 }, 'italic', '文字').content, '*文字*')
})

test('lists and headings operate on selected lines without consuming the following line', () => {
  const source = '第一行\n第二行\n第三行'
  const result = editMarkdown(source, { start: 0, end: 8 }, 'ordered', '文字')
  assert.equal(result.content, '1. 第一行\n2. 第二行\n第三行')
  assert.equal(editMarkdown(result.content, result, 'ordered', '文字').content, source)
  assert.equal(editMarkdown('# 标题\n正文', { start: 2, end: 4 }, 'h2', '文字').content, '## 标题\n正文')
  assert.equal(editMarkdown('\n下一行', { start: 0, end: 0 }, 'task', '任务').content, '- [ ] 任务\n下一行')
})

test('links reject executable URLs and block templates preserve adjacent text', () => {
  const result = editMarkdown('阅读资料', { start: 2, end: 4 }, 'link', '链接', 'https://example.com/a')
  assert.equal(result.content, '阅读[资料](<https://example.com/a>)')
  assert.throws(() => editMarkdown('资料', { start: 0, end: 2 }, 'link', '', 'javascript:alert(1)'), /LINK_URL_INVALID/)
  assert.match(editMarkdown('前后', { start: 1, end: 1 }, 'table', '列').content, /^前\n\n\| 列 1 \| 列 2 \|/)
  assert.match(editMarkdown('前后', { start: 1, end: 1 }, 'code', '代码').content, /^前\n\n```\n代码\n```\n\n后$/)
})
