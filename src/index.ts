import type { Context } from '@deepseek-ai/cordis'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { HarnessVault, VaultError } from './host/vault.ts'

export const name = 'joyhouse-knowledge'
export const inject = ['connection', 'webServer']

/** Same authenticated owner RPC as official Harness plugins; never an unauthenticated HTTP file server. */
export function apply(ctx: Context): void {
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(ctx.webServer.host) || ctx.connection.allowsRemoteAuthorities)
    throw new Error('VAULT_LOOPBACK_REQUIRED')
  const vault = new HarnessVault(process.env.JOYHOUSE_KNOWLEDGE_ROOT || dshHomePath('joyhouse', 'library', 'vault'))
  const handle = async (method: string, input: unknown) => {
    try {
      const value = method === 'capabilities' ? { desktopBridge: process.env.JOYHOUSE_DESKTOP_VAULT === '1' } : vault.call(method, input)
      return { ok: true, value }
    }
    catch (error) {
      return { ok: false, error: { code: 'internal', message: error instanceof VaultError ? error.code : 'VAULT_OPERATION_FAILED', details: {} } }
    }
  }
  // Exact Fetch routes retain Harness owner authentication without registering a second HTTP channel.
  ctx.connection.fetch.register({
    path: '/api/joyhouse-vault/call', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return new Response('JSON required', { status: 415 })
      const message = clientRequestSchema.safeParse(await request.json().catch(() => null))
      if (!message.success || message.data.method !== 'joyhouse-vault/call') return new Response('Invalid RPC envelope', { status: 400 })
      const payload = message.data.payload as { method?: unknown; params?: unknown } | null
      if (!payload || typeof payload.method !== 'string') return new Response('Invalid method', { status: 400 })
      return Response.json({ type: 'server-response', rpcId: message.data.rpcId, result: await handle(payload.method, payload.params) })
    },
  })
}
