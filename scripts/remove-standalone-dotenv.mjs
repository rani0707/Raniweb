import { rm } from 'node:fs/promises'

// Next.js copies these dotenv files into standalone output after building.
for (const filename of ['.env', '.env.production']) {
  await rm(`.next/standalone/${filename}`, { force: true })
}
