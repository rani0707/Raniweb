import { access, cp, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'

try {
  await access('.next/standalone/server.js')
} catch {
  console.error('운영 빌드가 없습니다. 먼저 npm run build를 실행하세요.')
  process.exit(1)
}
await mkdir('.next/standalone/.next', { recursive: true })
await cp('public', '.next/standalone/public', { recursive: true })
await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: process.env.SERVER_HOST || '0.0.0.0' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1) })
