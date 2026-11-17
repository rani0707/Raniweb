import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import assert from 'node:assert/strict'
const check = process.argv.includes('--check')
const existingDimensions = check ? JSON.parse(await readFile('data/project-images.json', 'utf8')) : undefined

const folder = 'public/images/projects'
const sources = 'assets/project-sources'
const previous = JSON.parse(await readFile('data/image-sources.json', 'utf8'))
const mapping = {}
const dimensions = {}
const replacements = new Map()
for (const source of (await readdir(sources)).filter(name => name.endsWith('.png')).sort()) {
  const bytes = await sharp(`${sources}/${source}`).resize({ width: 1120, withoutEnlargement: true }).webp({ quality: 90, effort: 5 }).toBuffer()
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.webp`
  if (check) assert.ok(bytes.equals(await readFile(`${folder}/${name}`)), `Changed image: ${name}`)
  else await writeFile(`${folder}/${name}`, bytes)
  mapping[source] = name
  const { width, height } = await sharp(bytes).metadata()
  dimensions[`/images/projects/${name}`] = { width, height }
  if (check) assert.deepEqual(existingDimensions[`/images/projects/${name}`], { width, height })
  replacements.set(`/images/projects/${source}`, `/images/projects/${name}`)
  if (previous[source]) replacements.set(`/images/projects/${previous[source]}`, `/images/projects/${name}`)
}
for (const name of await readdir('public/content/projects')) {
  if (!name.endsWith('.md')) continue
  const file = `public/content/projects/${name}`
  const original = await readFile(file, 'utf8')
  let markdown = original
  for (const [from, to] of replacements) markdown = markdown.replaceAll(from, to)
  if (check) assert.equal(markdown, original, `Outdated references in ${file}`)
  else await writeFile(file, markdown)
}
if (check) {
  assert.deepEqual(mapping, previous)
  console.log('PASS: image conversion is reproducible; image bytes, dimensions and references are unchanged.')
  process.exit(0)
}
await writeFile('data/image-sources.json', `${JSON.stringify(mapping, null, 2)}\n`)
await writeFile('data/project-images.json', `${JSON.stringify(dimensions, null, 2)}\n`)
console.log(`Optimized ${Object.keys(mapping).length} images; original PNG files retained. Run npm run content:check.`)
