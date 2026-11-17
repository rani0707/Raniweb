import { errorResponse } from '@/lib/error-pages'
export const dynamic = 'force-dynamic'
export function GET(request: Request) { return errorResponse(429, request.headers.get('x-nonce') ?? undefined) }
