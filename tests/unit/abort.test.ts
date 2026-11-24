import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTimedAbort } from '../../lib/abort.ts'

test('timeout helper supports cleanup and distinguishes cancellation', async () => {
  const timeout = createTimedAbort(10)
  await new Promise<void>(resolve => timeout.signal.addEventListener('abort', () => resolve(), { once: true }))
  assert.ok(timeout.signal.aborted && timeout.didTimeout())
  const cancelled = createTimedAbort(1000)
  cancelled.abort()
  assert.ok(cancelled.signal.aborted && !cancelled.didTimeout())
  cancelled.dispose()
})
