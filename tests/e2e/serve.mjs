import { spawn, execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const host = '127.0.0.1'
const appPort = 3107
const tlsPort = 3443
const directory = await mkdtemp(join(tmpdir(), 'rani-e2e-tls-'))
const keyFile = join(directory, 'key.pem')
const certFile = join(directory, 'cert.pem')
let tls

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', keyFile, '-out', certFile, '-subj', '/CN=localhost',
  ], { stdio: 'ignore' })
  tls = { key: await readFile(keyFile), cert: await readFile(certFile) }
} finally {
  await rm(directory, { recursive: true, force: true })
}

const server = createServer(tls, (incoming, response) => {
  const upstream = httpRequest({
    hostname: host,
    port: appPort,
    path: incoming.url,
    method: incoming.method,
    headers: { ...incoming.headers, 'x-forwarded-proto': 'https' },
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502)
    response.end()
  })
  response.on('close', () => upstream.destroy())
  incoming.pipe(upstream)
})

const app = spawn(process.execPath, ['scripts/standalone.mjs', 'start'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(appPort), SERVER_HOST: host },
})

function stop() {
  server.close()
  server.closeAllConnections()
  app.kill('SIGTERM')
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
for (const resource of [server, app]) {
  resource.on('error', error => {
    console.error(error.message)
    process.exitCode = 1
    stop()
  })
}
app.on('exit', code => {
  process.exitCode ??= code ?? 1
  server.close()
  server.closeAllConnections()
})
server.listen(tlsPort, host)
