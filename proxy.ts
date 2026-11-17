import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { buildCsp } from './lib/security'

export function proxy(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = Buffer.from(bytes).toString('base64')
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  // Next.js extracts the nonce from the incoming CSP, not from x-nonce alone.
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"')
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!api/|_next/|content/|images/|(?:favicon\\.ico|logo\\.webp|errors\\.css|robots\\.txt|sitemap\\.xml)$).*)'],
}
