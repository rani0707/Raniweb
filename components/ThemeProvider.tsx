'use client'

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'
interface ThemeContextType { theme: Theme; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
let memoryTheme: Theme | undefined

function getTheme(): Theme {
  if (memoryTheme) return memoryTheme
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* Storage is optional in private browsing. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function subscribe(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  window.addEventListener('storage', onChange)
  window.addEventListener('themechange', onChange)
  media.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener('themechange', onChange)
    media.removeEventListener('change', onChange)
  }
}
function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light'
  try {
    localStorage.setItem('theme', next)
    memoryTheme = undefined
  } catch { memoryTheme = next }
  document.documentElement.dataset.theme = next
  window.dispatchEvent(new Event('themechange'))
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as const)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const value = useMemo(() => ({ theme, toggleTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
