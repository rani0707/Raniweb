import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'
import { THEME_INITIALIZER } from '@/lib/theme-script'

export const metadata: Metadata = {
  title: 'RANI | Portfolio',
  description: '사용자 경험을 중시하는 개발자 RANI의 포트폴리오입니다.',
  keywords: ['portfolio', 'developer', 'react', 'nextjs', 'frontend'],
  authors: [{ name: 'RANI' }],
  metadataBase: new URL('https://www.raniweb.kr'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'RANI | Portfolio',
    description: '사용자 경험을 중시하는 개발자 RANI의 포트폴리오입니다.',
    type: 'website',
    locale: 'ko_KR',
    url: 'https://www.raniweb.kr',
    siteName: 'RANI Portfolio',
    images: [{ url: '/logo.webp', width: 280, height: 280, alt: 'RANI Portfolio' }],
  },
  twitter: {
    card: 'summary',
    images: ['/logo.webp'],
    title: 'RANI | Portfolio',
    description: '사용자 경험을 중시하는 개발자 RANI의 포트폴리오입니다.',
  },
  icons: {
    icon: '/logo.webp',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Reading request headers keeps the document dynamic for per-request CSP nonces.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INITIALIZER }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}