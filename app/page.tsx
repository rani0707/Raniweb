import Header from '@/components/Header'
import Hero from '@/components/Hero'
import Projects from '@/components/Projects'
import Skills from '@/components/Skills'
import Experience from '@/components/Experience'
import Certifications from '@/components/Certifications'
import Awards from '@/components/Awards'
import Footer from '@/components/Footer'

export default function Page() {
  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Projects />
        <Skills />
        <Experience />
        <Certifications />
        <Awards />
      </main>
      <Footer />
    </>
  )
}
