import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureVaultConnection, requestJoyHouseVault } from '../src/client/vault-bridge.ts'
import { hostConnection } from './fixtures/host-connection.mjs'
import { HarnessVault } from '../src/host/vault.ts'
import { buildVaultIndex } from '../src/host/vault-index.ts'

function fixture(t) {
  const base = fs.mkdtempSync(join(tmpdir(), 'joyhouse-library-host-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const vault = new HarnessVault(join(base, 'vault'))
  return { base, vault }
}

test('standalone vault creates, edits, preserves old contents and refuses stale saves', t => {
  const { vault } = fixture(t)
  assert.equal(vault.status().configured, false)
  vault.setup()
  const path = vault.create('notes', '日志')
  vault.write(path, '# 工作\n\n今天的内容', '')
  assert.throws(() => vault.write(path, 'stale', ''), /WRITE_CONFLICT/)
  assert.equal(vault.read(path).content, '# 工作\n\n今天的内容')
  vault.setup()
  assert.equal(vault.read(path).content, '# 工作\n\n今天的内容')
  assert.ok(vault.search('内容').some(hit => hit.path === path))
  assert.notEqual(vault.create('notes', '日志'), path)
  assert.throws(() => vault.rename(path, '日志-1'), /EEXIST/)
  const next = vault.rename(path, '已完成')
  assert.equal(vault.read(next).content, '# 工作\n\n今天的内容')
  vault.delete(next)
  assert.throws(() => vault.write(next, 'recreated'), /ENOENT/)
  assert.equal(fs.readdirSync(join(vault.root, '.trash')).length, 1)
})

test('image round-trip preserves bytes; invalid paths, symlinks and excessive data are blocked', t => {
  const { base, vault } = fixture(t)
  vault.setup()
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=', 'base64')
  vault.call('write-asset', { path: 'attachments/p.png', dataBase64: bytes.toString('base64') })
  assert.equal(vault.call('read-asset', { path: 'attachments/p.png' }).dataUrl, `data:image/png;base64,${bytes.toString('base64')}`)
  assert.throws(() => vault.call('write-asset', { path: 'attachments/p.png', dataBase64: bytes.toString('base64') }), /EEXIST/)
  for (const path of ['../escape.md', '/etc/a.md', '.trash/a.md', 'notes/../a.md', 'notes\\a.md', 'notes/a.svg', 'notes/a.md:stream', 'notes/con.md'])
    assert.throws(() => vault.read(path))
  assert.throws(() => vault.call('set-root', { path: base }), /ROOT_HOST_ONLY/)
  assert.throws(() => vault.call('write-asset', { path: 'attachments/a.svg', dataBase64: 'abcd' }), /IMAGE_INVALID/)
  assert.throws(() => vault.call('write-asset', { path: 'attachments/a.png', dataBase64: '%%%=' }), /IMAGE_INVALID/)
  const note = vault.create('notes', 'limit')
  assert.throws(() => vault.write(note, 'x'.repeat(2 * 1024 * 1024 + 1)), /SIZE_LIMIT/)
  if (process.platform !== 'win32') {
    const outside = join(base, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(join(outside, 'secret.md'), 'private')
    fs.symlinkSync(outside, join(vault.root, 'linked'))
    assert.throws(() => vault.read('linked/secret.md'), /SYMLINK/)
    assert.throws(() => vault.create('linked', 'new'), /SYMLINK/)
    assert.ok(!vault.list().some(entry => entry.path.startsWith('linked')))
    fs.symlinkSync(outside, join(vault.root, '.trash'))
    assert.throws(() => vault.delete(note), /TRASH_REJECTED/)
    assert.ok(fs.existsSync(join(vault.root, note)))
  }
})

test('index understands frontmatter, tags, headings, backlinks and ignores fenced examples', () => {
  const index = buildVaultIndex([
    { path: 'notes/a.md', content: '---\ntitle: 主笔记\ntags: [工作, 长期]\n---\n# 任务\n[[b]] #工作\n```md\n[[secret]] #ignored\n```' },
    { path: 'notes/b.md', content: '---\nparent: "[[a]]"\n---\n# 子笔记\n## 下一步\n#个人' },
  ])
  assert.equal(index.notes[0].title, '主笔记')
  assert.deepEqual(index.notes[0].links, [{ target: 'notes/b.md', resolved: true }])
  assert.deepEqual(index.notes[1].backlinks, ['notes/a.md'])
  assert.deepEqual(index.notes[0].children, ['notes/b.md'])
  assert.equal(index.notes[1].parent.target, 'notes/a.md')
  assert.ok(index.tags.some(tag => tag.tag === '工作' && tag.count === 1))
  assert.ok(!index.tags.some(tag => tag.tag === 'ignored'))
})

test('packaged library mounts in real Harness Cordis and its authenticated owner route rejects guests', async t => {
  const { base } = fixture(t)
  const plugin = await import('../lib/index.js')
  const old = process.env.JOYHOUSE_KNOWLEDGE_ROOT
  process.env.JOYHOUSE_KNOWLEDGE_ROOT = join(base, 'rpc')
  t.after(() => { if (old === undefined) delete process.env.JOYHOUSE_KNOWLEDGE_ROOT; else process.env.JOYHOUSE_KNOWLEDGE_ROOT = old })
  const host = await hostConnection(t)
  await host.mount(plugin)
  const dispose = configureVaultConnection(await host.client()); t.after(dispose)
  assert.equal((await requestJoyHouseVault('status')).configured, false)
  const path = '/api/joyhouse-vault/call'
  assert.equal((await host.request(path, 'set-root', {}, { guest: true })).status, 403)
  assert.equal(fs.existsSync(join(base, 'rpc')), false)
  const call = async (method, params = {}) => (await (await host.request(path, method, params)).json()).result
  assert.equal((await call('set-root')).ok, true)
  assert.equal((await call('set-root', { path: base })).ok, false)
  assert.equal((await call('sync-run')).ok, false)
  assert.throws(() => plugin.apply({ webServer: { host: '0.0.0.0' } }), /LOOPBACK_REQUIRED/)
  assert.throws(() => plugin.apply({ webServer: { host: '127.0.0.1' }, connection: { allowsRemoteAuthorities: true } }), /LOOPBACK_REQUIRED/)
})
