import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const cli = process.env.DSH_CLI && resolve(process.env.DSH_CLI)
if (!cli) throw new Error('Set DSH_CLI to the official @deepseek-ai/dsh/lib/bin.js')
const archive = resolve(process.env.PLUGIN_TARBALL || join(root, 'dist', `joyhouse-dsh-knowledge-${pkg.version}.tgz`))
const home = mkdtempSync(join(tmpdir(), 'joyhouse-official-library-'))
const env = { ...process.env, DSH_HOME: home, JOYHOUSE_KNOWLEDGE_ROOT: join(home, 'test-vault') }
for (const key of Object.keys(env)) if (/^(OPENAI|ANTHROPIC|DEEPSEEK)_/.test(key) || key === 'JOYHOUSE_DESKTOP_VAULT') delete env[key]
const report = { plugin: pkg.version, runtime: '', platform: `${process.platform}-${process.arch}`, node: process.version, timestamp: new Date().toISOString(), checks: {} }
let server
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`CLI step failed (${args[0]}): ${String(result.stderr || result.stdout || result.error).replace(/https?:\/\/\S+/g, '[URL redacted]').slice(-1800)}`)
  return result.stdout
}
try {
  report.runtime = run(['--version']).trim()
  assert.equal(report.runtime, pkg.engines.dsh)
  report.checks.officialVersion = 'passed'
  const flags = ['--ignore-scripts', '--config.auto-install-peers=false', ...(process.env.DSH_OFFLINE === '1' ? ['--offline'] : [])]
  run(['plugin', '--profile', 'web', 'add', archive, ...flags])
  const profile = JSON.parse(readFileSync(join(home, 'profiles/web/package.json'), 'utf8'))
  assert.ok(profile.dsh.profile.bundles.includes(pkg.name))
  assert.ok(!profile.dsh.profile.bundles.includes('@joyhouse/dsh-workbench'))
  assert.equal(JSON.parse(readFileSync(join(home, 'profiles/web/node_modules', pkg.name, 'package.json'), 'utf8')).version, pkg.version)
  report.checks.isolatedInstall = 'passed'
  const config = run(['--profile', 'web', '--dump-config'])
  assert.ok(config.includes('joyhouse-knowledge'))
  report.checks.officialComposition = 'passed'
  if (process.env.DSH_SKIP_HTTP === '1') {
    report.checks.http = 'not-run: explicitly skipped'
  } else {
    let output = ''
    server = spawn(process.execPath, [cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { output = (output + bytes.toString()).slice(-100_000) })
    const started = Date.now()
    let launch
    while (Date.now() - started < 30_000) {
      if (/listen EPERM|listen EACCES/.test(output)) { report.checks.http = 'blocked: execution environment prohibits loopback listening'; break }
      launch = [...output.matchAll(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*/g)].map(match => match[0]).find(url => url.includes('token='))
      if (launch) break
      if (server.exitCode !== null) throw new Error('Official Web exited before its authenticated URL was available')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (launch) {
      const url = new URL(launch), origin = url.origin
      const auth = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      const cookie = auth.headers.get('set-cookie')?.split(';')[0]
      assert.ok(cookie, 'official token exchange issues a browser cookie')
      const body = method => JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'joyhouse-vault/call', payload: { method, params: {} } })
      const denied = await fetch(`${origin}/api/joyhouse-vault/call`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: body('status') })
      assert.ok([401, 403].includes(denied.status), 'anonymous clients are rejected')
      for (const method of ['status', 'set-root', 'list', 'index']) {
        const response = await fetch(`${origin}/api/joyhouse-vault/call`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin }, body: body(method) })
        assert.equal(response.status, 200)
        assert.equal((await response.json()).result.ok, true)
      }
      report.checks.http = 'passed: official auth exchange and owner vault RPC'
    } else if (!report.checks.http) throw new Error('Timed out waiting for official authenticated Web URL')
  }
} catch (error) {
  report.failure = error.message
  process.exitCode = 1
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
  rmSync(home, { recursive: true, force: true })
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist/official-test-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (String(report.checks.http).startsWith('blocked:')) process.exitCode = 2
}
