import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createNavigation } from './navigation.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { configureVaultConnection } from './vault-bridge.ts'
import { createLibraryDock, LibraryMount, LibraryPanel } from './knowledge/panel.tsx'
import { JoyHouseKnowledgeAction } from './knowledge/knowledge-action.tsx'
import { en, zh, type KnowledgeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'joyhouse.knowledge': KnowledgeKey }
}

export const inject = ['slots', 'locale', 'layout', 'connection']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('joyhouse.knowledge', { en, zh }), 'knowledge: locales')
  ctx.effect(() => configureVaultConnection((ctx.get('connection') as ConnectionHandle).rpc), 'knowledge: owner RPC')
  const panelId = 'joyhouse-library' as MainPanelId
  const dock = createLibraryDock()
  const navigation = createNavigation(active => {
    if (active) ctx.layout.selectPanel(panelId)
    else if (ctx.layout.panelInfo.getSnapshot().activePanelId === panelId) ctx.layout.selectPanel(null)
  })
  ctx.effect(() => ctx.layout.panelInfo.subscribe(() => {
    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== panelId) navigation.chat()
  }), 'knowledge: native navigation')
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId, inject: () => ({ dock }) }, LibraryMount))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', locale: 'joyhouse.knowledge', id: 'joyhouse-knowledge', order: -9,
    inject: () => ({ navigation }),
  }, JoyHouseKnowledgeAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', locale: 'joyhouse.knowledge', id: 'joyhouse-library', inject: () => ({ navigation, dock }),
  }, LibraryPanel))
}
export { KNOWLEDGE_OPEN_EVENT } from './knowledge/knowledge-action.tsx'
