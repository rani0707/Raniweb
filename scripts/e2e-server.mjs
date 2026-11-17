// Local test fixture only; never used by the application or deployment workflow.
import { createServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const directory = await mkdtemp(path.join(tmpdir(), 'rani-e2e-tls-'))
const keyFile = path.join(directory, 'key.pem')
const certFile = path.join(directory, 'cert.pem')
const certificate = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost'], { stdio: 'ignore' })
if (certificate.status !== 0) { await rm(directory, { recursive: true, force: true }); throw new Error('OpenSSL is required for local HTTPS browser tests.') }
const child = process.env.E2E_REUSE_APP === '1' ? undefined : spawn(process.execPath, ['scripts/start-standalone.mjs'], {
  stdio: 'inherit', env: { ...process.env, PORT: '3107', SERVER_HOST: '127.0.0.1' },
})
const server = createServer({ key: await readFile(keyFile), cert: await readFile(certFile) }, (request, response) => {
  const upstream = httpRequest({ hostname: '127.0.0.1', port: 3107, path: request.url, method: request.method, headers: { ...request.headers, 'x-forwarded-proto': 'https' } }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', () => { response.writeHead(502); response.end('Application not ready') })
  response.on('close', () => upstream.destroy())
  request.pipe(upstream)
})
server.listen(3443, '127.0.0.1', () => console.log('Local HTTPS test fixture: https://127.0.0.1:3443'))
let closing = false
async function close() {
  if (closing) return
  closing = true
  server.close()
  child?.kill('SIGTERM')
  await rm(directory, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
child?.on('error', async error => { console.error(error.message); await close() })
