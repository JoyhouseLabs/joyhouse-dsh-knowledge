import test from 'node:test'
import { en, zh } from '../src/client/locales.ts'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSaveQueue, getOrCreateWorkLog, imageAssetPath, MAX_IMAGE_BYTES, renderNoteTemplate } from '../src/client/library.ts'

test('daily log reopens existing writing, including a vault without a notes folder', async () => {
  for (const withNotes of [true, false]) {
    const files = new Map()
    const request = async (method, params) => {
      if (method === 'list') return [...(withNotes ? [{ path: 'notes', kind: 'dir' }] : []), ...[...files.keys()].map(path => ({ path, kind: 'file' }))]
      if (method === 'create') {
        const path = `${params.dir ? params.dir + '/' : ''}${params.name}.md`
        assert.equal(files.has(path), false)
        files.set(path, '')
        return path
      }
      if (method === 'write') files.set(params.path, params.content)
    }
    const date = new Date(2026, 10, 8, 0, 5)
    const path = await getOrCreateWorkLog(request, date, '工作日志', '## 今日计划\n日期：{{date}}\n')
    assert.ok(path.endsWith('work-log-2026-11-08.md'))
    assert.match(files.get(path), /今日计划/)
    assert.match(files.get(path), /日期：2026-11-08/)
    files.set(path, 'My existing work and image references')
    assert.equal(await getOrCreateWorkLog(request, date, '工作日志', 'template'), path)
    assert.equal(files.get(path), 'My existing work and image references')
    assert.equal(files.size, 1)
  }
})

test('image import validates limits and isolates names inside attachments', () => {
  assert.match(imageAssetPath({ name: '../截图 (1).PNG', size: 20 }, 'unique-id'), /^attachments\/[^/]+-unique-id\.png$/)
  assert.throws(() => imageAssetPath({ name: 'x.svg', size: 20 }, 'id'), /IMAGE_TYPE/)
  assert.throws(() => imageAssetPath({ name: 'x.png', size: MAX_IMAGE_BYTES + 1 }, 'id'), /IMAGE_SIZE/)
  assert.throws(() => imageAssetPath({ name: 'x.png', size: 0 }, 'id'), /IMAGE_SIZE/)
  assert.throws(() => imageAssetPath({ name: 'x.png', size: 20 }, '../escape'), /IMAGE_ID/)
  assert.notEqual(imageAssetPath({ name: 'x.jpg', size: 1 }, 'a'), imageAssetPath({ name: 'x.jpg', size: 1 }, 'b'))
})

test('queued saves cannot overwrite newer edits with a slower earlier write', async () => {
  let finishFirst
  const gate = new Promise(resolve => { finishFirst = resolve })
  const writes = []
  const queue = createSaveQueue(async (path, content) => {
    if (content === 'first') await gate
    writes.push([path, content])
  })
  const first = queue('a.md', 'first')
  const last = queue('a.md', 'latest')
  await Promise.resolve()
  assert.deepEqual(writes, [])
  finishFirst()
  await Promise.all([first, last])
  assert.deepEqual(writes, [['a.md', 'first'], ['a.md', 'latest']])
})

test('a failed save rejects to the editor but does not poison retry or another note', async () => {
  const writes = []
  const queue = createSaveQueue(async (path, content) => {
    if (content === 'fail') throw new Error('disk full')
    writes.push([path, content])
  })
  await assert.rejects(queue('a.md', 'fail'), /disk full/)
  await queue('a.md', 'retry')
  await queue('b.md', 'other note')
  assert.deepEqual(writes, [['a.md', 'retry'], ['b.md', 'other note']])
})

test('daily and free-writing templates render local dates, titles, tags and complete sections in both locales', () => {
  const date = new Date(2026, 10, 12, 0, 5)
  for (const locale of [zh, en]) {
    const t = key => locale[key]
    for (const kind of ['daily', 'essay']) {
      const content = renderNoteTemplate(kind, '我的记录', date, t)
      assert.ok(content.startsWith('# 我的记录\n'))
      assert.ok(content.includes('2026-11-12'))
      assert.ok(!content.includes('{{date}}'))
      assert.ok(content.includes(kind === 'daily' ? '#work-log' : `#${locale.templateEssayTag}`))
      assert.ok((content.match(/^## /gm) || []).length >= (kind === 'daily' ? 8 : 6))
    }
  }
  const body = renderNoteTemplate('daily', '今日日志', date, key => zh[key])
  for (const section of ['今日重点', '时间与安排', '工作与学习进展', '生活与照顾自己', '今日复盘', '明日与后续行动']) assert.ok(body.includes(section))
})
