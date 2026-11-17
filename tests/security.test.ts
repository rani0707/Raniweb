import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildCsp, isValidMdFile, sanitizeUrl } from '../lib/security.ts'
import { MAX_REPORT_BYTES, readReport, summarizeReports } from '../lib/csp-report.ts'

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

test('telemetry budget is bounded and resets after a minute', async () => {
  const { acceptReport } = await import('../lib/csp-report.ts')
  const now = Date.now()
  for (let i = 0; i < 120; i++) assert.ok(acceptReport(now))
  assert.equal(acceptReport(now), false)
  assert.equal(acceptReport(now + 60_000), true)
})
