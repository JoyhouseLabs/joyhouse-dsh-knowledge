import { createRequire } from 'node:module'
const runtime = createRequire(new URL('../../package.json', import.meta.url))
const { Context } = await import(runtime.resolve('@deepseek-ai/cordis'))
const { installConnection } = await import(runtime.resolve('@deepseek-ai/dsh-client-connection/client'))
const { HostConnectionService } = await import(runtime.resolve('@deepseek-ai/dsh-client-connection'))

// Real Cordis service proxies and official Connection admission/dispatch, without a listening socket.
export async function hostConnection(t) {
  const ctx = new Context()
  ctx.provide('webServer', { host: '127.0.0.1' })
  const provider = ctx.plugin({ apply(scope) { new HostConnectionService(scope, [], {}) } })
  await provider.await()
  const connection = ctx.get('connection')
  const fibers = []
  t.after(async () => { for (const fiber of fibers.reverse()) await fiber.dispose(); await provider.dispose() })
  return {
    ctx,
    async client() {
      return wireClient(t, (input, init) => connection.createSharedFetchHandler('/api').fetch(
        new Request(new URL(input, 'http://127.0.0.1/'), init), connection.browserPeer))
    },
    async mount(plugin) { const fiber = ctx.plugin(plugin); fibers.push(fiber); await fiber.await(); return fiber },
    async request(path, method, params = {}, { guest = false, signal } = {}) {
      return connection.createSharedFetchHandler('/api').fetch(new Request(`http://127.0.0.1${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ type: 'client-request', rpcId: 'test-rpc', method: path.replace(/^\/api\//, ''), payload: { method, params } }),
      }), guest ? { principal: { kind: 'test-guest' } } : connection.browserPeer)
    },
  }
}

// Keep the official client's target validation and envelope parsing in integration tests.
export async function wireClient(t, doFetch) {
  const client = new Context()
  const fiber = client.plugin({ apply(scope) { installConnection(scope, { transport: { fetch: doFetch }, location: { hostname: '127.0.0.1' } }) } })
  await fiber.await()
  t.after(() => fiber.dispose())
  return client.get('connection').rpc
}
