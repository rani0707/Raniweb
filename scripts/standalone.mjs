import { spawn } from 'node:child_process'
import { access, cp, rm } from 'node:fs/promises'
import { basename } from 'node:path'

const directory = '.next/standalone'
const server = `${directory}/server.js`
const command = process.argv[2]

if (command === 'prepare') {
  // Next.js may copy these files into the standalone directory during a build.
  for (const filename of ['.env', '.env.production']) {
    await rm(`${directory}/${filename}`, { force: true })
  }
  await cp('.next/static', `${directory}/.next/static`, { recursive: true })
  await cp('public', `${directory}/public`, {
    recursive: true,
    filter: source => !/^(?:\.env|\.npmrc$|\.DS_Store$)|\.(?:key|pem|log|textClipping)$/i.test(basename(source)),
  })
} else if (command === 'start') {
  try {
    await access(server)
  } catch {
    console.error('운영 빌드가 없습니다. 먼저 npm run build를 실행하세요.')
    process.exit(1)
  }
  const child = spawn(process.execPath, [server], {
    stdio: 'inherit',
    env: { ...process.env, HOSTNAME: process.env.SERVER_HOST || '0.0.0.0' },
  })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('error', error => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
  })
} else {
  throw new Error('Usage: node scripts/standalone.mjs prepare|start')
}
