'use client'
import ErrorScreen from '@/components/ErrorScreen'
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ko"><head><meta name="robots" content="noindex" /></head><body className="error-document"><ErrorScreen code={500} /><button className="error-retry" type="button" onClick={reset}>다시 시도</button></body></html>
}
