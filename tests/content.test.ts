import { strict as assert } from 'node:assert'
import { readFile, access } from 'node:fs/promises'
import { test } from 'node:test'
import { isValidMdFile } from '../lib/security.ts'

test('every project and Markdown image resolves to a local public file', async () => {
  const projects = JSON.parse(await readFile(new URL('../data/projects.json', import.meta.url), 'utf8')) as { id: number; mdFile: string }[]
  assert.equal(new Set(projects.map(p => p.id)).size, projects.length)
  for (const project of projects) {
    assert.ok(isValidMdFile(project.mdFile))
    const file = new URL(`../public/content/projects/${project.mdFile}`, import.meta.url)
    const markdown = await readFile(file, 'utf8')
    for (const match of markdown.matchAll(/!\[[^\]]*\]\((\/[^)]+)\)/g)) {
      await access(new URL(`../public${match[1]}`, import.meta.url))
    }
  }
  await access(new URL('../public/logo.webp', import.meta.url))
})
