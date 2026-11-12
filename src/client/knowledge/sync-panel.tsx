import { useState } from 'react'
import { requestJoyHouseVault, type SyncStatus, type SyncVersion } from '../vault-bridge.ts'

interface Props {
  t: (key: string) => string
  status: SyncStatus | null
  busy: boolean
  message: string
  error: string
  run: <T>(operation: () => Promise<T>) => Promise<T | undefined>
  onSync: () => Promise<void>
  onClose: () => void
}
export function SyncPanel({ t, status, busy, message, error, run, onSync, onClose }: Props): React.JSX.Element {
  const [versions, setVersions] = useState<SyncVersion[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [restored, setRestored] = useState('')
  async function history(older = false): Promise<void> {
    const next = await run(() => requestJoyHouseVault('sync-history', { path: '', before: older ? String(versions?.at(-1)?.rev ?? '') : '' }))
    if (next) { setVersions(older ? [...(versions ?? []), ...next] : next); setHasMore(next.length === 100) }
  }
  return (
    <section aria-label={t('knowledgeSync')} style={{ padding: '14px 18px', borderBottom: '1px solid var(--dsw-alias-border-l2)', maxHeight: '50vh', overflow: 'auto', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{t('knowledgeSync')}</strong>
        <button style={button} type="button" onClick={onClose}>{t('knowledgeSyncClose')}</button>
      </div>
      <p>{t('knowledgeSyncIntro')}</p>
      {status?.configured && <p style={{ overflowWrap: 'anywhere' }}>{status.account} / {status.vault} · {status.endpoint}<br />{t('knowledgeSyncLast')}: {status.lastSuccess ? new Date(status.lastSuccess).toLocaleString() : t('knowledgeSyncNever')}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={button} type="button" disabled={busy} onClick={() => { if (window.confirm(t('knowledgeSyncConfirm'))) void run(() => requestJoyHouseVault('sync-connect')) }}>{t('knowledgeSyncConnect')}</button>
        {status?.configured && <>
          <button style={button} type="button" disabled={busy || !status.enabled} onClick={() => void onSync()}>{t('knowledgeSyncNow')}</button>
          <button style={button} type="button" disabled={busy} onClick={() => void run(() => requestJoyHouseVault('sync-configure', { mode: status.enabled ? 'pause' : 'enable' }))}>{t(status.enabled ? 'knowledgeSyncPause' : 'knowledgeSyncEnable')}</button>
          <button style={button} type="button" disabled={busy} onClick={() => { if (window.confirm(t('knowledgeSyncDisconnectConfirm'))) void run(() => requestJoyHouseVault('sync-configure', { mode: 'disconnect' })).then(() => setVersions(null)) }}>{t('knowledgeSyncDisconnect')}</button>
          <button style={button} type="button" disabled={busy} onClick={() => void history()}>{t('knowledgeSyncHistory')}</button>
        </>}
      </div>
      <p style={{ color: 'var(--dsw-alias-label-secondary)' }}>{t('knowledgeSyncNote')}</p>
      <div role="status" aria-live="polite">{busy ? t('knowledgeSyncBusy') : message}</div>
      {error && <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>}
      {restored && <p>{t('knowledgeSyncRestored')}: {restored}</p>}
      {versions?.length === 0 && <p>{t('knowledgeSyncHistoryEmpty')}</p>}
      {versions && <ul style={{ paddingLeft: 20 }}>
        {versions.map(version => <li key={version.rev} style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
          {version.path} · {new Date(version.time).toLocaleString()} · {version.device} · #{version.rev}{' '}
          {version.hash === null ? t('knowledgeSyncDeleted') : <button style={button} type="button" disabled={busy} onClick={() => void run(() => requestJoyHouseVault('sync-restore', { path: version.path, revision: String(version.rev) })).then(path => { if (path) setRestored(path) })}>{t('knowledgeSyncRestore')}</button>}
        </li>)}
      </ul>}
      {hasMore && <button style={button} type="button" disabled={busy} onClick={() => void history(true)}>{t('knowledgeSyncMore')}</button>}
    </section>
  )
}
const button: React.CSSProperties = {
  font: 'inherit', padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-interactive-bg-active)', color: 'var(--dsw-alias-state-business-primary)',
}
