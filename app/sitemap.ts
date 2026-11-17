import type { MetadataRoute } from 'next'
import projects from '@/data/projects.json'
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://www.raniweb.kr', changeFrequency: 'monthly', priority: 1 }, ...projects.map(project => ({ url: `https://www.raniweb.kr/projects/${project.id}`, changeFrequency: 'monthly' as const, priority: 0.8 }))]
}
