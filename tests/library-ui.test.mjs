import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { en, zh } from '../src/client/locales.ts'
import { wireClient } from './fixtures/host-connection.mjs'
import { HarnessVault } from '../src/host/vault.ts'

test('standalone packaged library formats selections, saves and retains editor across native panels', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'library-ui-'))
  const vault = new HarnessVault(dir); vault.setup()
  const note = vault.create('notes', '示例'); vault.write(note, '正文')
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://127.0.0.1/', pretendToBeVisual: true })
  dom.window.prompt = dom.window.confirm = () => { throw new Error("Native dialogs must not be used") }
  const previous = new Map()
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  let cleanup = async () => {}
  t.after(async () => {
    await cleanup(); dom.window.close(); rmSync(dir, { recursive: true, force: true })
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]
    }
  })
  const require = createRequire(new URL('../package.json', import.meta.url))
  const React = require('react'), { createRoot } = require('react-dom/client')
  const { act, createElement: h, useSyncExternalStore } = React
  let registration
  window.__ModuleLoader__ = { load(value) { registration = value } }
  await import('../lib/client.js?library-ui')
  const plugin = registration.factory(require), slots = [], listeners = new Set(), disposers = []
  let panel = { activePanelId: null }
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
  const getSnapshot = () => panel
  const selectPanel = activePanelId => { panel = { activePanelId }; for (const fn of listeners) fn() }
  const calls = []
  let failMethod = null
  const rpc = await wireClient(t, async (input, init) => {
    assert.equal(input, 'api/joyhouse-vault/call')
    const envelope = JSON.parse(init.body)
    assert.equal(envelope.method, 'joyhouse-vault/call')
    const { method, params } = envelope.payload; calls.push(method)
    if (method === failMethod) throw new Error('VAULT_PERMISSION_DENIED')
    return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: method === 'capabilities' ? { desktopBridge: false } : vault.call(method, params) } })
  })
  plugin.apply({
    locale: { register: () => () => {}, bind: () => key => key },
    get: name => {
      assert.equal(name, 'connection', 'no workbench or desktop service needed')
      return { rpc }
    },
    effect: install => disposers.push(install()),
    layout: { selectPanel, panelInfo: { getSnapshot, subscribe } },
    slots: { inject: (_name, install) => install(), register: (options, component) => { slots.push({ options, component }); return () => {} } },
  })
  let language = null
  const translate = key => language ? ({ en, zh }[language][key] ?? key) : key
  const slotProps = slot => ({ ...slot.options.inject?.(), ...(slot.options.locale ? { t: key => translate(key) } : {}) })
  const native = slots.find(s => s.options.name === 'main'), overlay = slots.find(s => s.options.name === 'shell.overlay')
  const navigation = overlay.options.inject().navigation
  function Frame() {
    const current = useSyncExternalStore(subscribe, getSnapshot)
    return h(React.Fragment, null,
      h('aside', { 'data-slot': 'sidebar' }),
      current.activePanelId === native.options.key ? h(native.component, slotProps(native)) : h('div', { id: 'chat' }),
      h(overlay.component, slotProps(overlay)))
  }
  const root = createRoot(document.querySelector('#app'))
  cleanup = async () => { await act(async () => root.unmount()); for (const dispose of disposers) dispose?.() }
  const button = label => [...document.querySelectorAll('button')].find(b => b.textContent === label)
  await act(async () => root.render(h(Frame)))
  await act(async () => navigation.open('knowledge'))
  const file = [...document.querySelectorAll('button')].find(b => b.textContent.includes('示例'))
  assert.ok(file, 'Host-backed file list loaded')
  assert.equal(document.querySelector('[data-joyhouse-library-panel]').style.flexDirection, 'column')
  assert.equal(document.querySelector('[data-joyhouse-surface]').style.width, '100%', 'size containment must not collapse the library to zero width')
  await act(async () => file.click())
  const more = button('knowledgeRename').closest('details')
  await act(async () => more.querySelector('summary').click())
  assert.equal(more.open, true)
  await act(async () => button('knowledgeEdit').click())
  assert.equal(more.open, false, 'clicking edit dismisses More without blocking edit')
  assert.equal(button('knowledgeEdit').getAttribute('aria-pressed'), 'true')
  assert.equal(button('knowledgePreview').getAttribute('aria-pressed'), 'false')
  assert.notEqual(button('knowledgeEdit').style.background, button('knowledgePreview').style.background)
  await act(async () => more.querySelector('summary').click())
  await act(async () => document.querySelector('aside[data-slot="sidebar"]').dispatchEvent(new window.Event('pointerdown', { bubbles: true })))
  assert.equal(more.open, false, 'pointer outside the library also dismisses its own menu')
  await act(async () => more.querySelector('summary').click())
  await act(async () => button('knowledgePreview').focus())
  assert.equal(more.open, false, 'keyboard focus leaving the menu dismisses it')

  const editor = document.querySelector('textarea[aria-label="knowledgeEditor"]')
  assert.equal(editor.value, '正文')
  editor.setSelectionRange(0, 2)
  await act(async () => button('editorBold').click())
  assert.equal(editor.value, '**正文**')
  assert.ok(document.querySelector('[aria-label="editorToolbar"]'))
  await act(async () => selectPanel('another-plugin'))
  assert.equal(navigation.getSnapshot().active, null)
  assert.equal(editor.isConnected, true)
  await act(async () => navigation.open('knowledge'))
  assert.equal(document.querySelector('textarea'), editor)
  assert.equal(editor.value, '**正文**')
  await act(async () => navigation.toggleFocus())
  assert.equal(document.querySelector('[data-slot="sidebar"]').inert, true)
  await act(async () => document.querySelector('[data-joyhouse-library-panel]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(document.querySelector('[data-slot="sidebar"]').inert, undefined)
  await act(async () => new Promise(resolve => setTimeout(resolve, 850)))
  assert.equal(vault.read(note).content, '**正文**')
  assert.equal(calls.filter(method => method === 'capabilities').length, 1)
  assert.equal(button('knowledgeSyncOpen'), undefined)
  await act(async () => more.querySelector('summary').click())
  await act(async () => button('knowledgePreview').click())
  assert.equal(more.open, false)
  assert.equal(button('knowledgePreview').getAttribute('aria-pressed'), 'true')
  assert.equal(button('knowledgeEdit').getAttribute('aria-pressed'), 'false')
  assert.notEqual(button('knowledgePreview').style.background, button('knowledgeEdit').style.background)
  assert.equal(document.querySelector('strong')?.textContent, '正文')
  // Forms drive the actual packaged React UI and persist through the same RPC path.
  const { Simulate } = require('react-dom/test-utils')
  const change = async (element, value) => act(async () => Simulate.change(element, { target: { value } }))
  const submit = async element => act(async () => element.closest('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })))
  assert.equal(button('knowledgeDelete').closest('details').open, false, 'deletion stays in the collapsed More menu')
  await act(async () => button('noteEditTags').click())
  const tags = document.querySelector('textarea[aria-label="noteEditTags"]')
  await change(tags, '工作, 学习')
  await submit(tags)
  assert.deepEqual(vault.index().notes.find(n => n.path === note).tags, ['学习', '工作'])
  assert.ok([...document.querySelectorAll('button')].some(b => b.textContent === '工作 1'), 'left tag summary refreshes after saving')
  await act(async () => button('noteCreateChild').click())
  const childName = document.querySelector('input[aria-label="noteChildName"]')
  await change(childName, '子笔记')
  await submit(childName)
  const child = vault.index().notes.find(n => n.title === '子笔记')
  assert.equal(child.parent.target, note)
  assert.deepEqual(vault.index().notes.find(n => n.path === note).children, [child.path])
  await act(async () => button('noteSetParent').click())
  await act(async () => button('noteRemoveParent').click())
  assert.deepEqual(vault.index().notes.find(n => n.path === note).children, [])
  await act(async () => button('noteInsertLink').click())
  const picker = document.querySelector('select[aria-label="noteInsertLink"]')
  await change(picker, note)
  await submit(picker)
  assert.deepEqual(vault.index().notes.find(n => n.path === note).backlinks, [child.path])
  assert.equal(vault.index().notes.find(n => n.path === note).children.length, 0, 'ordinary links do not make children')

  const toast = () => document.querySelector('[data-library-toast]')?.textContent
  const dialog = () => document.querySelector('[role="dialog"]')
  const actionName = () => dialog().querySelector('input[aria-label="actionName"]')
  const startRename = async () => act(async () => button('knowledgeRename').click())
  await startRename()
  assert.equal(actionName().value, '子笔记')
  assert.equal(document.activeElement, actionName(), 'dialog focuses its name input')
  await change(actionName(), '新名字.md')
  await submit(actionName())
  const renamed = 'notes/新名字.md'
  assert.equal(dialog(), null)
  assert.ok(!vault.index().notes.some(n => n.path === child.path))
  assert.equal(vault.index().notes.find(n => n.path === renamed).title, '新名字')
  assert.ok(vault.read(renamed).content.includes(`[[${note}]]`), 'rename preserves the rest of the writing')
  assert.match(toast(), /actionRenamed/)
  assert.ok([...document.querySelectorAll('button')].some(b => b.textContent.includes('新名字')), 'tree title updates too')
  await startRename(); await submit(actionName())
  assert.match(toast(), /actionNoChange/)
  await startRename(); await change(actionName(), '示例'); await submit(actionName())
  assert.ok(dialog(), 'collision leaves dialog available for correction')
  assert.match(toast(), /actionNameTaken/)
  assert.ok(vault.read(renamed).content.includes('# 新名字'))
  assert.ok(vault.read(note).content.includes('正文'), 'existing destination is not overwritten')
  await change(actionName(), ''); await submit(actionName())
  assert.match(toast(), /actionInvalidName/)
  await change(actionName(), '失败的名字'); failMethod = 'rename'
  await submit(actionName()); failMethod = null
  assert.match(toast(), /VAULT_PERMISSION_DENIED/)
  assert.ok(vault.read(renamed).content.includes('# 新名字'))
  await act(async () => button('editorCancel').click())
  assert.equal(dialog(), null); assert.match(toast(), /actionCancelled/)
  // Filename-only is explicit and keeps the existing title and prose byte-for-byte.
  const priorContent = vault.read(renamed).content
  await startRename(); await change(actionName(), '只改文件名')
  await act(async () => Simulate.change(dialog().querySelector('input[type="checkbox"]'), { target: { checked: false } }))
  await submit(actionName())
  assert.equal(vault.read('notes/只改文件名.md').content, priorContent)
  // A post-rename title-write failure keeps the new save target and unsaved title.
  await startRename(); await change(actionName(), '待保存标题'); failMethod = 'write'
  await submit(actionName())
  assert.match(toast(), /actionTitlePending/)
  assert.ok(!vault.index().notes.some(n => n.path === 'notes/只改文件名.md'))
  assert.equal(vault.read('notes/待保存标题.md').content, priorContent)
  assert.match(document.querySelector('textarea[aria-label="knowledgeEditor"]').value, /# 待保存标题/)
  failMethod = null
  await startRename(); await submit(actionName()) // flush retries the retained draft
  assert.equal(vault.index().notes.find(n => n.path === 'notes/待保存标题.md').title, '待保存标题')
  // Create and delete use the same accessible application dialog, never prompt/confirm.
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('+ knowledgeNewNote')).click())
  await change(actionName(), '新建测试'); await submit(actionName())
  assert.match(toast(), /actionCreated/)
  assert.equal(vault.read('notes/新建测试.md').content, '')
  await act(async () => button('knowledgeDelete').click())
  await act(async () => button('editorCancel').click())
  assert.equal(vault.read('notes/新建测试.md').content, '')
  await act(async () => button('knowledgeDelete').click())
  await submit(dialog().querySelector('button[type="submit"]'))
  assert.match(toast(), /actionDeleted/)
  assert.ok(!vault.index().notes.some(n => n.path === 'notes/新建测试.md'))
  assert.ok(vault.list().every(n => n.path !== 'notes/新建测试.md'))

  for (const [template, title] of [['daily', '完整日志'], ['essay', '一篇随笔']]) {
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('+ knowledgeNewNote')).click())
    await change(dialog().querySelector('select[aria-label="templateLabel"]'), template)
    assert.match(actionName().value, /^\d{4}-\d{2}-\d{2} /)
    await change(actionName(), title)
    await submit(actionName())
    const content = vault.read(`notes/${title}.md`).content
    assert.match(content, new RegExp(`# ${title}`))
    assert.ok(content.includes(template === 'daily' ? '#work-log' : '#templateEssayTag'))
    assert.match(toast(), /actionCreated/)
    assert.equal(document.querySelector('textarea[aria-label="knowledgeEditor"]').value, content)
  }
  // Creating from a template does not discard the body if the first write fails.
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('+ knowledgeNewNote')).click())
  await change(dialog().querySelector('select[aria-label="templateLabel"]'), 'essay')
  await change(actionName(), '模板草稿'); failMethod = 'write'
  await submit(actionName())
  assert.match(toast(), /VAULT_PERMISSION_DENIED/)
  assert.match(document.querySelector('textarea[aria-label="knowledgeEditor"]').value, /# 模板草稿/)
  assert.equal(vault.read('notes/模板草稿.md').content, '')
  failMethod = null
  await startRename(); await submit(actionName())
  assert.match(vault.read('notes/模板草稿.md').content, /#templateEssayTag/)

  // Official locale slots provide a new translator on revision; preserve mounted editors and forms.
  assert.equal(overlay.options.locale, 'joyhouse.knowledge')
  assert.equal(slots.find(slot => slot.options.name === 'sidebar.footer.action').options.locale, 'joyhouse.knowledge')
  const languageEditor = document.querySelector('textarea[aria-label="knowledgeEditor"]')
  await change(languageEditor, '我的未保存草稿与图片链接 [[notes/示例.md]]')
  languageEditor.focus(); languageEditor.setSelectionRange(2, 5)
  const reads = calls.filter(method => method === 'list' || method === 'read').length
  const writes = calls.filter(method => method === 'write').length
  language = 'en'; await act(async () => root.render(h(Frame)))
  assert.equal(document.querySelector(`textarea[aria-label="${en.knowledgeEditor}"]`), languageEditor)
  assert.equal(languageEditor.value, '我的未保存草稿与图片链接 [[notes/示例.md]]')
  assert.equal(languageEditor.selectionStart, 2); assert.equal(languageEditor.selectionEnd, 5)
  assert.equal(document.activeElement, languageEditor)
  assert.ok(button(en.knowledgePreview)); assert.ok(button(en.noteCreateChild))
  assert.equal(calls.filter(method => method === 'list' || method === 'read').length, reads, 'language changes must not reload the vault')
  assert.equal(calls.filter(method => method === 'write').length, writes, 'language changes must not rewrite notes')
  await act(async () => button(en.knowledgeRename).click())
  const renameField = dialog().querySelector('input')
  await change(renameField, ':'); await submit(renameField)
  assert.ok(toast().includes(en.actionInvalidName))
  await change(renameField, '保留表单内容')
  language = 'zh'; await act(async () => root.render(h(Frame)))
  assert.equal(dialog().querySelector('input'), renameField)
  assert.equal(renameField.value, '保留表单内容')
  assert.ok(toast().includes(zh.actionInvalidName), 'existing error toasts follow the current language')
  assert.ok(button(zh.knowledgeRename))
  await act(async () => button(zh.editorCancel).click())
  language = 'en'; await act(async () => root.render(h(Frame)))
  assert.ok(toast().includes(en.actionCancelled), 'success/status toasts also translate at render time')
  await act(async () => button(`+ ${en.knowledgeNewNote}`).click())
  await change(dialog().querySelector('select'), 'essay')
  const englishName = dialog().querySelector('input').value
  assert.ok(englishName.endsWith(en.templateEssay))
  await submit(dialog().querySelector('input'))
  const englishContent = vault.read(`notes/${englishName}.md`).content
  assert.match(englishContent, /## Free writing/)
  assert.match(englishContent, /#journal/)
  assert.doesNotMatch(englishContent, /[\u4e00-\u9fff]/)
  assert.equal(vault.read('notes/模板草稿.md').content, '我的未保存草稿与图片链接 [[notes/示例.md]]')

})
