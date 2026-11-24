import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import sharp from 'sharp'

const run = promisify(execFile)
const optimizer = fileURLToPath(new URL('../../scripts/optimize-images.mjs', import.meta.url))

test('changing a source retires its old WebP after updating the Markdown', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rani-images-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sources = join(root, 'assets/project-sources')
  const published = join(root, 'public/images/projects')
  const content = join(root, 'public/content/projects')
  const data = join(root, 'data')
  for (const directory of [sources, content, data]) {
    await mkdir(directory, { recursive: true })
  }
  await writeFile(join(data, 'image-sources.json'), '{}')

  const source = join(sources, 'sample.png')
  const markdown = join(content, 'sample.md')
  const writeImage = (background: string) =>
    sharp({ create: { width: 8, height: 8, channels: 3, background } }).png().toFile(source)

  await writeImage('red')
  await writeFile(markdown, '![Sample](/images/projects/sample.png)\n')
  await run(process.execPath, [optimizer], { cwd: root })
  const [first] = await readdir(published)
  assert.match(first, /^[a-f0-9]{20}\.webp$/)
  const original = await readFile(join(published, first))

  await writeImage('blue')
  await run(process.execPath, [optimizer], { cwd: root })
  const files = await readdir(published)
  assert.equal(files.length, 1)
  const [replacement] = files
  assert.notEqual(replacement, first)
  assert.equal(await readFile(markdown, 'utf8'), `![Sample](/images/projects/${replacement})\n`)

  await writeFile(join(published, first), original)
  await assert.rejects(run(process.execPath, [optimizer, '--check'], { cwd: root }), /Obsolete WebP/)
  await access(join(published, first))
  await run(process.execPath, [optimizer], { cwd: root })
  await run(process.execPath, [optimizer, '--check'], { cwd: root })

  await rm(source)
  await assert.rejects(run(process.execPath, [optimizer], { cwd: root }), /replace or remove the reference/)
  await access(join(published, replacement))
})
