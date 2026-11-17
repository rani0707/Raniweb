import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTimedAbort } from '../lib/abort.ts'
import { readReport, ReportTimeoutError, trustedReportClient } from '../lib/csp-report.ts'

test('slow report streams are cancelled with a deadline', async () => {
  let cancelled = false
  const body = new ReadableStream({ cancel() { cancelled = true } })
  const request = new Request('http://localhost/api/csp-report', { method: 'POST', body, duplex: 'half' } as RequestInit)
  await assert.rejects(readReport(request, 30), ReportTimeoutError)
  assert.ok(cancelled)
})

test('client IP headers are ignored unless explicitly trusted and valid', () => {
  const headers = new Headers({ 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.1, 192.0.2.2' })
  assert.equal(trustedReportClient(headers), undefined)
  assert.equal(trustedReportClient(headers, 'x-forwarded-for'), undefined)
  assert.match(trustedReportClient(headers, 'cf-connecting-ip') ?? '', /^[a-f0-9]{64}$/)
  assert.equal(trustedReportClient(new Headers({ 'x-real-ip': 'invalid' }), 'x-real-ip'), undefined)
})

test('timeout helper supports cleanup and distinguishes cancellation', async () => {
  const timeout = createTimedAbort(10)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.ok(timeout.signal.aborted && timeout.didTimeout())
  const cancelled = createTimedAbort(1000)
  cancelled.abort()
  assert.ok(cancelled.signal.aborted && !cancelled.didTimeout())
  cancelled.dispose()
})

test('one trusted client cannot exhaust other clients per-client budget', async () => {
  const { acceptReport } = await import('../lib/csp-report.ts')
  const now = Date.now() + 120_000
  for (let i = 0; i < 20; i++) assert.ok(acceptReport(now, 'client-a'))
  assert.equal(acceptReport(now, 'client-a'), false)
  assert.ok(acceptReport(now, 'client-b'))
})
