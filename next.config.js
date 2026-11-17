/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // All images are pre-optimized local assets. No public image-fetch proxy is needed.
  images: { unoptimized: true, remotePatterns: [], dangerouslyAllowSVG: false },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
        : []),
    ]
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/content/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }] },
      // Hash-named images must receive a new filename when their content changes.
      { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/logo.webp', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, must-revalidate' }] },
      { source: '/errors.css', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }] },
    ]
  },
}
export default nextConfig
