import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://127.0.0.1:3000'
const request = (path, options = {}) => fetch(new URL(path, base), { ...options, signal: AbortSignal.timeout(5000) })
const get = path => request(path)
const first = await get('/')
assert.equal(first.status, 200)
assert.equal(first.headers.get('x-content-type-options'), 'nosniff')
assert.match(first.headers.get('cache-control') ?? '', /\bno-store\b/)
assert.equal(first.headers.get('reporting-endpoints'), 'csp-endpoint="/api/csp-report"')
const csp = first.headers.get('content-security-policy')
const nonce = csp?.match(/'nonce-([^']+)'/)?.[1]
assert.ok(nonce, 'CSP must contain a nonce')
assert.ok(!csp.includes('unsafe-inline'))
assert.ok(!csp.includes('unsafe-eval'))
const html = await first.text()
const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]
assert.ok(scripts.length > 0)
for (const script of scripts) assert.ok(script[1].includes(`nonce="${nonce}"`), 'Every framework script must carry the response nonce')
const second = await get('/')
const nextNonce = second.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]
assert.ok(nextNonce)
assert.notEqual(nextNonce, nonce)
await second.body?.cancel()
for (const path of ['/api/health', '/robots.txt', '/sitemap.xml', '/content/projects/rani-bot.md', '/logo.webp']) {
  const response = await get(path)
  assert.equal(response.status, 200, path)
  await response.body?.cancel()
}
for (const path of ['/.env', '/.git/config']) {
  const response = await get(path)
  assert.equal(response.status, 404, path)
  await response.body?.cancel()
}
assert.equal((await get('/api/csp-report')).status, 405)
const errorStyles = await get('/errors.css')
assert.equal(errorStyles.status, 200)
assert.match(errorStyles.headers.get('cache-control') ?? '', /\bmax-age=300\b/)
assert.equal(errorStyles.headers.get('content-security-policy'), null)
await errorStyles.body?.cancel()
const post = (body, type = 'application/csp-report') => request('/api/csp-report', { method: 'POST', headers: { 'content-type': type }, body })
assert.equal((await post(JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } }))).status, 204)
assert.equal((await post('{bad json')).status, 400)
assert.equal((await post('{}', 'text/plain')).status, 415)
assert.equal((await post('x'.repeat(16 * 1024 + 1))).status, 413)
console.log('PASS: production HTTP, unique CSP nonces on every script, static assets and report status/size limits')
for (const code of [403, 404, 429, 500, 503]) {
  const response = await get(`/${code}`)
  assert.equal(response.status, code)
  assert.match(await response.text(), /홈으로 돌아가기/)
}
const detail = await get('/projects/1')
assert.equal(detail.status, 200)
assert.match(await detail.text(), /프로젝트 소개/)
const missing = await get('/projects/does-not-exist')
assert.equal(missing.status, 404)
await missing.body?.cancel()
console.log('PASS: error UI/status codes and server-rendered project URLs')
