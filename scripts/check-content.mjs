import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const projects = JSON.parse(await readFile('data/projects.json', 'utf8'))
const images = JSON.parse(await readFile('data/project-images.json', 'utf8'))
const seen = new Set()
const referenced = new Set()
for (const project of projects) {
  assert.ok(Number.isInteger(project.id) && project.id > 0 && !seen.has(project.id), 'Project IDs must be unique positive integers')
  seen.add(project.id)
  for (const key of ['title', 'description', 'year', 'mdFile']) assert.ok(typeof project[key] === 'string' && project[key].trim(), `Missing ${key}`)
  assert.ok(Array.isArray(project.tags) && project.tags.every(tag => typeof tag === 'string' && tag.trim()), 'Invalid tags')
  for (const key of ['github', 'url']) {
    assert.equal(typeof project[key], 'string')
    if (!project[key]) continue
    const url = new URL(project[key])
    assert.ok(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, `Invalid ${key}`)
  }
  assert.match(project.mdFile, /^[a-zA-Z0-9_-]+\.md$/)
  const markdown = await readFile(`public/content/projects/${project.mdFile}`, 'utf8')
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const src = match[1]
    assert.match(src, /^\/images\/projects\/[a-f0-9]{20}\.webp$/, `Invalid image path ${src}`)
    assert.ok(images[src], `Missing dimensions: ${src}`)
    const meta = await sharp(path.join('public', src)).metadata()
    assert.equal(meta.width, images[src].width, src)
    assert.equal(meta.height, images[src].height, src)
    referenced.add(src)
  }
}
const unused = (await readdir('public/images/projects')).filter(name => name.endsWith('.webp') && !referenced.has(`/images/projects/${name}`))
await access('public/logo.webp')
console.log(`PASS: ${projects.length} projects, ${referenced.size} referenced images, fields/URLs/dimensions verified.`)
if (unused.length) console.warn(`Unused WebP images (review before deleting): ${unused.join(', ')}`)
