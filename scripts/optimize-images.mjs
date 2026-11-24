import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const check = process.argv.includes('--check')
const sourceDirectory = 'assets/project-sources'
const outputDirectory = 'public/images/projects'
const markdownDirectory = 'public/content/projects'
const mappingFile = 'data/image-sources.json'
const dimensionsFile = 'data/project-images.json'
const publicPath = '/images/projects/'
const generatedName = /^[a-f0-9]{20}\.webp$/

async function replaceFile(path, contents) {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, contents)
    await rename(temp, path)
  } finally {
    await rm(temp, { force: true })
  }
}

const previous = JSON.parse(await readFile(mappingFile, 'utf8'))
const mapping = {}
const dimensions = {}
const output = new Map()

for (const source of (await readdir(sourceDirectory)).filter(name => name.endsWith('.png')).sort()) {
  const bytes = await sharp(`${sourceDirectory}/${source}`)
    .resize({ width: 1120, withoutEnlargement: true })
    .webp({ quality: 90, effort: 5 })
    .toBuffer()
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.webp`
  mapping[source] = name
  if (output.has(name)) continue

  output.set(name, bytes)
  const { width, height } = await sharp(bytes).metadata()
  dimensions[publicPath + name] = { width, height }
}

const successors = new Map()
for (const [source, name] of Object.entries(mapping)) {
  const oldName = previous[source]
  if (!generatedName.test(oldName) || output.has(oldName)) continue
  if (!successors.has(oldName)) successors.set(oldName, new Set())
  successors.get(oldName).add(name)
}

const markdown = new Map()
for (const file of (await readdir(markdownDirectory)).filter(name => name.endsWith('.md'))) {
  const path = `${markdownDirectory}/${file}`
  const original = await readFile(path, 'utf8')
  const updated = original.replace(/\/images\/projects\/([\w.-]+)/g, (reference, name) => {
    const candidates = successors.get(name)
    let nextName = name
    if (Object.hasOwn(mapping, name)) nextName = mapping[name]
    else if (candidates?.size === 1) nextName = candidates.values().next().value

    assert.ok(output.has(nextName), `${file}: replace or remove the reference to ${reference} before optimizing.`)
    return publicPath + nextName
  })
  if (updated !== original) markdown.set(path, updated)
}

if (!check) await mkdir(outputDirectory, { recursive: true })
const stale = (await readdir(outputDirectory, { withFileTypes: true }))
  .filter(file => file.isFile() && generatedName.test(file.name) && !output.has(file.name))
  .map(file => file.name)

if (check) {
  assert.deepEqual(mapping, previous, 'Image source mapping is out of date')
  assert.deepEqual(dimensions, JSON.parse(await readFile(dimensionsFile, 'utf8')))
  assert.deepEqual([...markdown.keys()], [], 'Markdown image references are out of date')
  assert.deepEqual(stale, [], 'Obsolete WebP files are still public')
  for (const [name, bytes] of output) {
    assert.ok(bytes.equals(await readFile(`${outputDirectory}/${name}`)), `Changed image: ${name}`)
  }
  console.log(`Verified ${output.size} optimized images.`)
} else {
  for (const [name, bytes] of output) await replaceFile(`${outputDirectory}/${name}`, bytes)
  for (const [path, content] of markdown) await replaceFile(path, content)
  await replaceFile(mappingFile, JSON.stringify(mapping, null, 2) + '\n')
  await replaceFile(dimensionsFile, JSON.stringify(dimensions, null, 2) + '\n')

  // Retire public copies after the replacement assets and references are ready.
  for (const name of stale) await rm(`${outputDirectory}/${name}`, { force: true })
  console.log(`Optimized ${output.size} images and removed ${stale.length} obsolete WebP files.`)
}
