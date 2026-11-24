import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCsp, isValidMdFile, sanitizeUrl } from '../../lib/security.ts'
import { acceptReport, MAX_REPORT_BYTES, readReport, ReportTimeoutError, summarizeReports, trustedReportClient } from '../../lib/csp-report.ts'

test('URL allowlists reject script schemes, ambiguous paths and external images', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.invalid', '/\\evil.invalid', '/\nevil.invalid', 'https://user:password@example.com']) {
    assert.equal(sanitizeUrl(url), undefined, url)
  }
  assert.equal(sanitizeUrl('mailto:support@raniweb.kr'), 'mailto:support@raniweb.kr')
  assert.equal(sanitizeUrl('https://example.com/path'), 'https://example.com/path')
  assert.equal(sanitizeUrl('/images/a.webp', true), '/images/a.webp')
  assert.equal(sanitizeUrl('https://example.com/a.webp', true), undefined)
  assert.equal(sanitizeUrl('mailto:support@raniweb.kr', true), undefined)
  assert.equal(sanitizeUrl('/api/health', true), undefined)
  assert.equal(sanitizeUrl('/images/../api/health', true), undefined)
})

test('Markdown filenames cannot escape the public project directory', () => {
  assert.ok(isValidMdFile('HOOK_intranet_portfolio.md'))
  for (const name of ['../secret.md', '/etc/passwd', '%2e%2e.md', 'x.md?q=1', 'x.md/evil']) assert.ok(!isValidMdFile(name))
})

test('production CSP keeps nonce enforcement while development permits hot reload', () => {
  const prod = buildCsp('test-nonce', false)
  assert.ok(prod.includes("'nonce-test-nonce'"))
  assert.ok(prod.includes("'strict-dynamic'"))
  assert.ok(!prod.includes('unsafe-inline'))
  assert.ok(!prod.includes('unsafe-eval'))
  assert.ok(!prod.includes('script-src-elem'))
  assert.ok(prod.includes('upgrade-insecure-requests'))
  const dev = buildCsp('test-nonce', true)
  assert.ok(dev.includes('unsafe-eval'))
  assert.ok(!dev.includes('upgrade-insecure-requests'))
})

test('CSP reports never retain source samples, full URLs or referrers', () => {
  const summary = summarizeReports({ 'csp-report': {
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://example.com/private?token=secret',
    'document-uri': 'https://example.com/private?token=secret',
    'script-sample': 'secret', referrer: 'secret',
  } })
  assert.deepEqual(summary, [{ directive: 'script-src-elem', resourceType: 'url' }])
  assert.ok(!JSON.stringify(summary).includes('secret'))
  assert.deepEqual(summarizeReports([{ type: 'csp-violation', body: { effectiveDirective: 'style-src', blockedURL: 'inline' } }]), [{ directive: 'style-src', resourceType: 'inline' }])
  assert.deepEqual(summarizeReports({ arbitrary: 'payload' }), [])
  assert.ok(summarizeReports(Array(100).fill({ 'csp-report': { 'effective-directive': 'img-src' } })).length <= 20)
})

test('report body limits apply even without a Content-Length header', async () => {
  const request = new Request('http://localhost/api/csp-report', { method: 'POST', body: 'x'.repeat(MAX_REPORT_BYTES + 1) })
  await assert.rejects(readReport(request), RangeError)
  const valid = new Request('http://localhost/api/csp-report', { method: 'POST', body: '{"ok":true}' })
  assert.deepEqual(await readReport(valid), { ok: true })
})

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

test('report budgets limit each client and reset after a minute', () => {
  const now = 60_000
  for (let i = 0; i < 20; i++) assert.ok(acceptReport(now, 'client-a'))
  assert.equal(acceptReport(now, 'client-a'), false)
  assert.ok(acceptReport(now, 'client-b'))

  const nextWindow = now + 60_000
  for (let i = 0; i < 120; i++) assert.ok(acceptReport(nextWindow))
  assert.equal(acceptReport(nextWindow, 'client-b'), false)
  assert.ok(acceptReport(nextWindow + 60_000, 'client-a'))
})
