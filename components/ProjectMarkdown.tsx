import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sanitizeUrl } from '@/lib/security'
import imageDimensions from '@/data/project-images.json'
import styles from './Projects.module.css'

export default function ProjectMarkdown({ content, inModal = false }: { content: string; inModal?: boolean }) {
  const components: Components = {
    h1: ({ children }) => inModal ? <h3>{children}</h3> : <h2>{children}</h2>,
    h2: ({ children }) => inModal ? <h4>{children}</h4> : <h3>{children}</h3>,
    h3: ({ children }) => inModal ? <h5>{children}</h5> : <h4>{children}</h4>,
    h4: ({ children }) => inModal ? <h6>{children}</h6> : <h5>{children}</h5>,
    h5: ({ children }) => <h6>{children}</h6>,
    h6: ({ children }) => <h6>{children}</h6>,
    img: ({ src, alt }) => {
      const path = sanitizeUrl(typeof src === 'string' ? src : undefined, true)
      if (!path) return null
      const dimensions = imageDimensions[path as keyof typeof imageDimensions]
      return (
        // Static assets already have WebP compression and intrinsic dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={path} alt={alt || ''} width={dimensions?.width} height={dimensions?.height} loading="lazy" decoding="async" />
      )
    },
    a: ({ href, children }) => {
      const safeHref = sanitizeUrl(href)
      if (!safeHref) return <span>{children}</span>
      const external = /^https?:/i.test(safeHref)
      return <a href={safeHref} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer nofollow ugc' : undefined}>{children}</a>
    },
  }
  return <div className={styles.mdContent}><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown></div>
}
