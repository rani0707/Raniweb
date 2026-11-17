import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ProjectMarkdown from '@/components/ProjectMarkdown'
import { findProject, readProjectContent } from '@/lib/projects'
import styles from './page.module.css'

type Props = { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const project = findProject(id)
  if (!project) return { title: '프로젝트를 찾을 수 없습니다', robots: { index: false, follow: false } }
  return {
    title: `${project.title} | RANI`, description: project.description,
    alternates: { canonical: `/projects/${project.id}` },
    openGraph: { title: project.title, description: project.description, url: `/projects/${project.id}` },
  }
}
export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  const project = findProject(id)
  if (!project) notFound()
  const content = await readProjectContent(project.mdFile)
  return <>
    <Header />
    <main className={styles.main} id="main-content" tabIndex={-1}>
      <Link className={styles.back} href="/#projects" prefetch={false}>← 모든 프로젝트</Link>
      <p className={styles.year}>{project.year} · {project.tags.join(' / ')}</p>
      <h1>{project.title}</h1>
      <p className={styles.description}>{project.description}</p>
      <ProjectMarkdown content={content} />
    </main>
    <Footer />
  </>
}
