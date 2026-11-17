export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com`,
    "script-src-attr 'none'",
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' https://cloudflareinsights.com https://*.cloudflareinsights.com${isDev ? ' ws: wss:' : ''}`,
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "media-src 'self'",
    ...(!isDev ? ['upgrade-insecure-requests'] : []),
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ].join('; ')
}

export function isValidMdFile(filename: string): boolean {
  return /^[a-zA-Z0-9_-]+\.md$/.test(filename)
}

/** Links and images deliberately have separate allowlists. */
export function sanitizeUrl(value: string | undefined, image = false): string | undefined {
  const url = value?.trim()
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return undefined
  if (url.startsWith('/') && !url.startsWith('//')) {
    if (image) {
      const path = new URL(url, 'https://local.invalid').pathname
      if (!path.startsWith('/images/') || /%(?:2f|5c|2e)/i.test(path)) return undefined
    }
    return url
  }
  if (image) return undefined
  if (url.startsWith('#')) return url
  try {
    const parsed = new URL(url)
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password) {
      return parsed.href
    }
    if (parsed.protocol === 'mailto:' && parsed.pathname && !url.startsWith('mailto://')) return url
  } catch {
    // Unsupported or malformed URLs are rendered without a link.
  }
  return undefined
}
