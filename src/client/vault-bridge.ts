import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
/**
 * 资料库双宿主传输：原版 Harness 使用经鉴权的 Host RPC；Joyhouse Desktop
 * 保留既有 Tauri vault 桥与资料路径。浏览器代码不直接接触文件系统。
 */

export type * from '../contracts.ts'
import type { VaultMethod, VaultMethodParams, VaultMethodResult } from '../contracts.ts'

interface VaultRequestMessage {
  source: 'joyhouse-vault-client'
  type: 'joyhouse://vault/request'
  id: string
  method: VaultMethod
  params: Record<string, unknown>
}

interface VaultResponseMessage {
  source: 'joyhouse-desktop-vault'
  type: 'joyhouse://vault/response'
  id: string
  ok: boolean
  data?: unknown
  error?: {
    code: string
    message: string
  }
}

/** 带机器可读错误码的稳定失败类型。 */
export class JoyHouseVaultBridgeError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'JoyHouseVaultBridgeError'
  }
}

function isVaultResponse(value: unknown): value is VaultResponseMessage {
  if (typeof value !== 'object' || value === null)
    return false
  const candidate = value as Partial<VaultResponseMessage>
  return candidate.source === 'joyhouse-desktop-vault'
    && candidate.type === 'joyhouse://vault/response'
    && typeof candidate.id === 'string'
    && typeof candidate.ok === 'boolean'
}

function targetOrigin(): string {
  if (typeof document === 'undefined' || document.referrer === '')
    return '*'
  try {
    const origin = new URL(document.referrer).origin
    return origin === 'null' ? '*' : origin
  }
  catch {
    return '*'
  }
}

/** 当前页面是否运行在 JoyHouse 桌面壳的 iframe 内。 */
export function hasJoyHouseDesktopHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

/**
 * 请求桌面宿主执行一次 vault 操作。超时默认 8s（目录树/索引扫描较重），
 * `pick-folder` 等待用户操作给 10 分钟。
 */
function requestDesktopVault<M extends VaultMethod>(
  method: M,
  params: VaultMethodParams[M] = {} as VaultMethodParams[M],
  timeoutMs = method === 'pick-folder' || method === 'sync-connect' ? 600_000 : method.startsWith('sync-') ? 180_000 : 8_000,
): Promise<VaultMethodResult<M>> {
  if (!hasJoyHouseDesktopHost()) {
    return Promise.reject(new JoyHouseVaultBridgeError(
      'DESKTOP_BRIDGE_UNAVAILABLE',
      'JoyHouse desktop host is unavailable',
    ))
  }

  const id = crypto.randomUUID()
  const request: VaultRequestMessage = {
    source: 'joyhouse-vault-client',
    type: 'joyhouse://vault/request',
    id,
    method,
    params: params as Record<string, unknown>,
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new JoyHouseVaultBridgeError(
        'DESKTOP_BRIDGE_TIMEOUT',
        'JoyHouse desktop host did not answer in time',
      ))
    }, timeoutMs)

    function finish(): void {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }

    function onMessage(event: MessageEvent<unknown>): void {
      if (event.source !== window.parent || !isVaultResponse(event.data) || event.data.id !== id)
        return
      finish()
      if (!event.data.ok) {
        reject(new JoyHouseVaultBridgeError(
          event.data.error?.code ?? 'VAULT_FAILED',
          event.data.error?.message ?? 'JoyHouse desktop vault request failed',
        ))
        return
      }
      resolve(event.data.data as VaultMethodResult<M>)
    }

    window.addEventListener('message', onMessage)
    window.parent.postMessage(request, targetOrigin())
  })
}

/**
 * 附件加载前使用透明占位，随后经已鉴权的 read-asset 能力获取 data URL。
 */
export function vaultAssetUrl(_relPath: string): string {
  // Images are filled via the authenticated file capability; no desktop-only URL scheme.
  return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
}


let rpc: ClientConnectionRpc | undefined
let desktop: Promise<boolean> | undefined
export function configureVaultConnection(connection: ClientConnectionRpc): () => void {
  rpc = connection
  desktop = undefined
  return () => { if (rpc === connection) { rpc = undefined; desktop = undefined } }
}
async function useDesktop(): Promise<boolean> {
  if (!rpc) return hasJoyHouseDesktopHost()
  desktop ??= (async () => {
    const result = await rpc!.call('/api', 'joyhouse-vault/call', { method: 'capabilities', params: {} })
    if (!result.ok) throw new JoyHouseVaultBridgeError('VAULT_UNAVAILABLE', result.error.message)
    if ((result.value as { desktopBridge: boolean }).desktopBridge) return true
    // Older Joyhouse hosts predate the process marker; preserve an existing working vault bridge.
    if (hasJoyHouseDesktopHost()) {
      try { await requestDesktopVault('status', {}, 1500); return true }
      catch (error) {
        if (!(error instanceof JoyHouseVaultBridgeError) || error.code !== 'DESKTOP_BRIDGE_TIMEOUT') throw error
      }
    }
    return false
  })().catch(error => { desktop = undefined; throw error })
  return desktop
}
export async function vaultCapabilities(): Promise<{ folderPicker: boolean; sync: boolean }> {
  const native = await useDesktop()
  return { folderPicker: native, sync: native }
}
export async function requestJoyHouseVault<M extends VaultMethod>(
  method: M, params: VaultMethodParams[M] = {} as VaultMethodParams[M], timeoutMs?: number,
): Promise<VaultMethodResult<M>> {
  if (await useDesktop()) return requestDesktopVault(method, params, timeoutMs)
  if (!rpc) throw new JoyHouseVaultBridgeError('VAULT_UNAVAILABLE', 'Harness library connection unavailable')
  const result = await rpc.call('/api', 'joyhouse-vault/call', { method, params })
  if (!result.ok) throw new JoyHouseVaultBridgeError(result.error.message, result.error.message)
  return result.value as VaultMethodResult<M>
}
