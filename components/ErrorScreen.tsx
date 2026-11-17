import '../public/errors.css'
import { errorMarkup, type ErrorCode } from '@/lib/error-pages'

export default function ErrorScreen({ code }: { code: ErrorCode }) {
  return <>
    {/* The renderer accepts only fixed error codes and compile-time copy. */}
    <div className="error-page" dangerouslySetInnerHTML={{ __html: errorMarkup(code) }} />
  </>
}
