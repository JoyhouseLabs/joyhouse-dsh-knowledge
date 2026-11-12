/**
 * 侧边栏底部「知识库」入口：由独立资料中心插件在官方底部插槽中
 * 排列在工作台按钮下方，通过独立的原生面板进入右侧资料工作区。
 * 保留 `joyhouse:knowledge:open` 事件供已有入口使用。
 */
import { useEffect } from 'react'
import type { KnowledgeKey } from '../locales.ts'
import { useNavigation } from '../navigation.ts'
import type { Navigation } from '../navigation.ts'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** 打开知识库工作区的窗口内事件（同一 iframe 文档内广播）。 */
export const KNOWLEDGE_OPEN_EVENT = 'joyhouse:knowledge:open'

export interface KnowledgeInjected {
  navigation: Navigation
  t: (key: KnowledgeKey) => string
}

type KnowledgeActionProps = PropsRuntime<'sidebar.footer.action'> & KnowledgeInjected

export function JoyHouseKnowledgeAction({ wide, t, navigation }: KnowledgeActionProps): React.JSX.Element {
  const state = useNavigation(navigation)

  useEffect(() => {
    const onOpenRequest = (): void => navigation.open('knowledge')
    window.addEventListener(KNOWLEDGE_OPEN_EVENT, onOpenRequest)
    return () => window.removeEventListener(KNOWLEDGE_OPEN_EVENT, onOpenRequest)
  }, [navigation])

  return (
    <div data-joyhouse-sidebar-action style={{ display: 'flex', flexDirection: 'column', width: wide ? '100%' : 36, minWidth: 0 }}>
      <style>{`[data-slot="sidebar.footer.action"] { display: flex !important; flex-direction: column; align-items: stretch; gap: 0; width: 100%; min-width: 0; } [data-joyhouse-sidebar-trigger]:hover { background: var(--dsw-alias-interactive-bg-hover) !important; }`}</style>
      <button
        data-joyhouse-sidebar-trigger
        type="button"
        title={t('knowledgeOpen')}
        aria-label={t('knowledgeOpen')}
        aria-current={state.active === 'knowledge' ? 'page' : undefined}
        onClick={() => navigation.open('knowledge')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center',
          gap: wide ? 'var(--dsh-sidebar-label-gap, 6px)' : 0, width: wide ? '100%' : 36, height: wide ? 42 : 36,
          margin: wide ? '4px 0' : '8px 0 10px', padding: wide ? '0 calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px))' : 0,
          boxSizing: 'border-box', flexShrink: 0,
          border: 0, borderInline: wide ? 'var(--dsh-sidebar-paint-inset, 3px) solid transparent' : 0, backgroundClip: wide ? 'padding-box' : 'border-box', borderRadius: 'var(--dsw-radius-md, 12px)', background: 'transparent', color: 'inherit',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, lineHeight: '22px', textAlign: 'left', overflow: 'hidden',
        }}
      >
        <svg aria-hidden="true" width={wide ? 16 : 18} height={wide ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: `0 0 ${wide ? 16 : 18}px` }}>
          <path d="M12 7v14M12 7C9 4 5 4 2 5v15c3-1 7-1 10 1 3-2 7-2 10-1V5c-3-1-7-1-10 2Z" />
        </svg>
        {wide && (
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('knowledgeEntry')}
          </span>
        )}
      </button>

    </div>
  )
}
