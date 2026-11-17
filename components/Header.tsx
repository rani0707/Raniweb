'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { lockScroll } from '@/lib/scroll-lock'
import { useTheme } from './ThemeProvider'
import styles from './Header.module.css'

const navItems = [
  { label: 'About', href: '/#about' },
  { label: 'Projects', href: '/#projects' },
  { label: 'Skills', href: '/#skills' },
  { label: 'Experience', href: '/#experience' },
  { label: 'Certifications', href: '/#certifications' },
  { label: 'Awards', href: '/#awards' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const headerRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const unlock = lockScroll()
    const menuButton = menuRef.current
    const background = Array.from(document.querySelectorAll<HTMLElement>('main, footer'))
    const previous = background.map(element => element.inert)
    background.forEach(element => { element.inert = true })
    headerRef.current?.querySelector<HTMLElement>('nav a')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if (event.key !== 'Tab') return
      const focusables = headerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    const breakpoint = window.matchMedia('(min-width: 769px)')
    const handleResize = () => { if (breakpoint.matches) setMobileOpen(false) }
    breakpoint.addEventListener('change', handleResize)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      unlock()
      background.forEach((element, index) => { element.inert = previous[index] })
      breakpoint.removeEventListener('change', handleResize)
      document.removeEventListener('keydown', handleKeyDown)
      menuButton?.focus()
    }
  }, [mobileOpen])

  const handleNavClick = () => {
    setMobileOpen(false)
  }

  return (
    <header ref={headerRef} className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.container}>
        <Link href="/" prefetch={false} className={styles.logo} onClick={handleNavClick}>
          RANI
        </Link>

        <nav
          id="primary-navigation"
          aria-label="주요 메뉴"
          className={`${styles.nav} ${mobileOpen ? styles.mobileOpen : ''}`}
          onClick={handleNavClick}
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={styles.navLink}
              onClick={handleNavClick}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <button
            onClick={toggleTheme}
            className={styles.themeBtn}
            aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            )}
          </button>

          <button
            ref={menuRef}
            aria-controls="primary-navigation"
            className={styles.menuBtn}
            onClick={() => setMobileOpen(open => !open)}
            aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileOpen}
          >
            <span className={`${styles.menuLine} ${mobileOpen ? styles.menuLineTop : ''}`} />
            <span className={`${styles.menuLine} ${mobileOpen ? styles.menuLineMid : ''}`} />
            <span className={`${styles.menuLine} ${mobileOpen ? styles.menuLineBot : ''}`} />
          </button>
        </div>
      </div>
    </header>
  )
}
