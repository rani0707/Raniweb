'use client'
import ErrorScreen from '@/components/ErrorScreen'
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <><ErrorScreen code={500} /><button className="error-retry" type="button" onClick={reset}>다시 시도</button></>
}
