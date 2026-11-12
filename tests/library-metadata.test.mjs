import test from 'node:test'
import assert from 'node:assert/strict'
import { updateTags, updateParent, canSetParent, insertNoteLink, visibleNoteBody, renameNoteTitle, normalizeNoteName } from '../src/client/knowledge/note-metadata.ts'
import { buildVaultIndex } from '../src/host/vault-index.ts'

test('tag editing preserves unrelated metadata and writing, updates inline tags and leaves fenced examples intact', () => {
 const content = '---\ntitle: 日志\ncustom: keep # note\ntags: [旧标签]\n---\n# 日志\n\n正文 #工作 #工作流\n```md\n#工作\n```\n'
 const next = updateTags(content, '个人, #工作流，个人', ['旧标签','工作','工作流'])
 assert.match(next,/custom: keep # note/)
 assert.match(next,/正文  #工作流/)
 assert.match(next,/```md\n#工作\n```/)
 assert.deepEqual(buildVaultIndex([{path:'a.md',content:next}]).notes[0].tags,['个人','工作流'])
 const cleared = updateTags(next,'',['个人','工作流'])
 assert.deepEqual(buildVaultIndex([{path:'a.md',content:cleared}]).tags,[])
 assert.throws(()=>updateTags('---\ntags: [broken\n---\nKeep me','new',[]),/METADATA_INVALID/)
 assert.throws(()=>updateTags('writing','bad!tag',[]),/TAG_INVALID/)
 assert.equal(visibleNoteBody(updateTags('writing','工作',[])),'writing')
})

test('explicit parents and backlinks have different meanings; cycles can be rejected and parent can be removed', () => {
 const files=[{path:'notes/a.md',content:insertNoteLink('# A','notes/b.md')},{path:'notes/b.md',content:'# B'}]
 let index=buildVaultIndex(files)
 assert.deepEqual(index.notes[0].children,[])
 assert.deepEqual(index.notes[1].backlinks,['notes/a.md'])
 files[1].content=updateParent(files[1].content,'notes/a.md')
 index=buildVaultIndex(files)
 assert.deepEqual(index.notes[0].children,['notes/b.md'])
 assert.equal(canSetParent(index.notes,'notes/a.md','notes/b.md'),false)
 assert.equal(canSetParent(index.notes,'notes/a.md','notes/a.md'),false)
 files[1].content=updateParent(files[1].content,null)
 assert.deepEqual(buildVaultIndex(files).notes[0].children,[])
 assert.equal(visibleNoteBody(files[1].content),'# B')
 assert.equal(insertNoteLink('前后','notes/b.md',{start:1,end:1}),'前[[notes/b.md]]后')
 assert.throws(()=>insertNoteLink('keep','bad]name.md'),/LINK_INVALID/)
})


test('renaming visible titles preserves metadata, examples and prose and validates filenames', () => {
 const content = '---\ntitle: 旧标题\ntags: [工作]\nparent: notes/a.md\ncustom: keep # comment\n---\n```md\n# 示例\n```\n# 旧标题\n正文\n## 保留小标题\n'
 const next = renameNoteTitle(content, '新标题')
 assert.equal(buildVaultIndex([{path:'notes/new.md',content:next}]).notes[0].title, '新标题')
 assert.match(next, /custom: keep # comment/)
 assert.match(next, /```md\n# 示例\n```\n# 新标题\n正文\n## 保留小标题/)
 assert.match(next, /parent: notes\/a.md/)
 assert.equal(renameNoteTitle(next, '新标题'), next, 'repeating the name is a no-op')
 assert.equal(renameNoteTitle('正文', '标题'), '# 标题\n\n正文')
 assert.equal(renameNoteTitle('# 旧\r\n正文', '新'), '# 新\r\n正文')
 assert.equal(normalizeNoteName('  新名字.md  '), '新名字')
 for (const name of ['', '.md', '../name', 'a/b', 'a\\b', 'a:b', '.hidden', 'CON', 'a?']) assert.throws(() => normalizeNoteName(name), /NAME_INVALID/)
 assert.throws(() => renameNoteTitle('---\ntags: [broken\n---\n正文', 'new'), /METADATA_INVALID/)
})
