import { readFile } from 'node:fs/promises'
import path from 'node:path'
import projects from '@/data/projects.json'
import { isValidMdFile } from './security'

export function findProject(id: string) {
  return projects.find(project => String(project.id) === id)
}
export async function readProjectContent(mdFile: string) {
  if (!isValidMdFile(mdFile)) throw new Error('Invalid project file')
  return readFile(path.join(process.cwd(), 'public', 'content', 'projects', mdFile), 'utf8')
}
