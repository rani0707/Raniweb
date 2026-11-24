import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import sharp from 'sharp'
import projects from '../../data/projects.json' with { type: 'json' }
import images from '../../data/project-images.json' with { type: 'json' }
import sources from '../../data/image-sources.json' with { type: 'json' }
import { isValidMdFile, sanitizeUrl } from '../../lib/security.ts'

const publicDirectory = new URL('../../public/', import.meta.url)
const markdownDirectory = new URL('content/projects/', publicDirectory)
const dimensions = new Map(Object.entries(images))

test('project records point to public Markdown and valid links', async () => {
  const ids = new Set<number>()
  for (const project of projects) {
    assert.ok(Number.isInteger(project.id) && project.id > 0 && !ids.has(project.id), `Invalid project ID: ${project.id}`)
    ids.add(project.id)
    for (const field of ['title', 'description', 'year'] as const) {
      assert.ok(typeof project[field] === 'string' && project[field].trim(), `Missing ${field} for project ${project.id}`)
    }
    assert.ok(Array.isArray(project.tags) && project.tags.every(tag => typeof tag === 'string' && tag.trim()), `Invalid tags for project ${project.id}`)
    for (const link of [project.github, project.url]) {
      assert.equal(typeof link, 'string')
      if (link) assert.match(sanitizeUrl(link) ?? '', /^https?:\/\//)
    }
    assert.ok(isValidMdFile(project.mdFile), `Invalid Markdown path: ${project.mdFile}`)
    const markdown = await readFile(new URL(project.mdFile, markdownDirectory), 'utf8')
    for (const [, src] of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      assert.ok(dimensions.has(src), `Unknown project image ${src} in ${project.mdFile}`)
    }
  }
  await access(new URL('logo.webp', publicDirectory))
})

test('project image sources and dimensions match the published files', async () => {
  const sourceFiles = await readdir(new URL('../../assets/project-sources/', import.meta.url))
  assert.deepEqual(sourceFiles.filter(name => name.endsWith('.png')).sort(), Object.keys(sources).sort())

  const imageDirectory = new URL('images/projects/', publicDirectory)
  const outputNames = [...new Set(Object.values(sources))].sort()
  const published = (await readdir(imageDirectory)).filter(name => name.endsWith('.webp')).sort()
  assert.deepEqual(published, outputNames)
  assert.deepEqual([...dimensions.keys()].sort(), outputNames.map(name => `/images/projects/${name}`))

  for (const name of outputNames) {
    assert.match(name, /^[a-f0-9]{20}\.webp$/)
    const { width, height } = await sharp(await readFile(new URL(name, imageDirectory))).metadata()
    assert.deepEqual(dimensions.get(`/images/projects/${name}`), { width, height }, name)
  }
})
