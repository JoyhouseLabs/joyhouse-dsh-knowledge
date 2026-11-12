import type { KnowledgeKey } from '../locales.ts'

/** Store message keys, not translated strings, so visible feedback follows language changes. */
export type Feedback = { key: KnowledgeKey; detail?: string | undefined }
export function feedbackText(value: Feedback | null, t: (key: string) => string): string {
  return value ? t(value.key) + (value.detail ? ` (${value.detail})` : '') : ''
}
export function errorFeedback(error: unknown): Feedback {
  if (error && typeof error === 'object' && 'key' in error) return error as Feedback
  const message = error instanceof Error ? error.message : String(error ?? '')
  const mappings: [RegExp, KnowledgeKey][] = [
    [/NOTE_NAME_INVALID/, 'actionInvalidName'], [/EEXIST|VAULT_NAME_TAKEN|VAULT_NAME_CONFLICT/, 'actionNameTaken'],
    [/NOTE_METADATA_INVALID/, 'noteMetadataError'], [/NOTE_TAG_INVALID/, 'noteTagError'],
    [/NOTE_PARENT_CYCLE/, 'noteParentError'], [/NOTE_LINK_INVALID/, 'noteLinkError'],
    [/IMAGE_TYPE|VAULT_ASSET_REJECTED/, 'knowledgeImageType'], [/IMAGE_SIZE|VAULT_ASSET_TOO_LARGE/, 'knowledgeImageSize'],
    [/VAULT_WRITE_CONFLICT/, 'actionConflict'], [/ENOENT|VAULT_FILE_MISSING|NOTE_CHANGED/, 'actionMissing'],
    [/EACCES|EPERM|VAULT_PERMISSION_DENIED/, 'actionPermission'], [/ENOSPC/, 'actionDiskFull'],
  ]
  const match = mappings.find(([pattern]) => pattern.test(message))
  const code = message.match(/\b(?:[A-Z]+_[A-Z_]+|ENOENT|EACCES|EPERM|ENOSPC)\b/)?.[0]
  return { key: match?.[1] ?? 'actionFailed', ...(code ? { detail: code } : {}) }
}
