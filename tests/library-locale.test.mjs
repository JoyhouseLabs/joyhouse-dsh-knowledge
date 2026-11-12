import test from 'node:test'
import assert from 'node:assert/strict'
import { en, zh } from '../src/client/locales.ts'
import { errorFeedback, feedbackText } from '../src/client/knowledge/feedback.ts'

test('library dictionaries have the same complete keys and English UI copy contains no hardcoded Chinese', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort())
  for (const key of Object.keys(en)) {
    assert.ok(en[key].trim(), key)
    assert.ok(zh[key].trim(), key)
    assert.doesNotMatch(en[key], /[\u4e00-\u9fff]/, key)
  }
})
test('retained errors translate on display and keep useful diagnostic codes', () => {
  for (const [code, key] of [['VAULT_WRITE_CONFLICT', 'actionConflict'], ['ENOSPC', 'actionDiskFull'], ['VAULT_PERMISSION_DENIED', 'actionPermission'], ['NOTE_METADATA_INVALID', 'noteMetadataError'], ['NOTE_NAME_INVALID', 'actionInvalidName'], ['VAULT_NAME_TAKEN', 'actionNameTaken']]) {
    const feedback = errorFeedback(new Error(code))
    assert.equal(feedback.key, key)
    assert.ok(feedbackText(feedback, k => en[k]).startsWith(en[key]))
    assert.ok(feedbackText(feedback, k => zh[k]).startsWith(zh[key]))
  }
  assert.equal(errorFeedback(new Error('unexpected host failure')).key, 'actionFailed')
  assert.equal(feedbackText(null, k => en[k]), '')
})
