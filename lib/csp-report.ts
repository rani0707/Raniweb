import { isIP } from 'node:net'
import { createHash } from 'node:crypto'

export const MAX_REPORT_BYTES = 16 * 1024
const MAX_REPORTS_PER_MINUTE = 120
const MAX_CLIENT_REPORTS_PER_MINUTE = 20
const clients = new Map<string, number>()
let windowStart = 0
let received = 0

// Only enable an IP header after the origin is restricted to a trusted proxy.
export function trustedReportClient(headers: Headers, configuredHeader?: string): string | undefined {
  const name = configuredHeader?.toLowerCase()
  if (!name || !['x-real-ip', 'cf-connecting-ip'].includes(name)) return undefined
  const value = headers.get(name)?.trim()
  if (!value || !isIP(value)) return undefined
  return createHash('sha256').update(value).digest('hex')
}

export function acceptReport(now = Date.now(), clientKey?: string): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now
    received = 0
    clients.clear()
  }
  if (received >= MAX_REPORTS_PER_MINUTE) return false
  if (clientKey) {
    const count = clients.get(clientKey) ?? 0
    if (count >= MAX_CLIENT_REPORTS_PER_MINUTE) return false
    clients.set(clientKey, count + 1)
  }
  received++
  return true
}

export class ReportTimeoutError extends Error {
  constructor() { super('Report read timed out'); this.name = 'ReportTimeoutError' }
}

export async function readReport(request: Request, timeoutMs = 5000): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_REPORT_BYTES) {
    void request.body?.cancel().catch(() => {})
    throw new RangeError('Report too large')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new SyntaxError('Empty report')
  const bytes = new Uint8Array(MAX_REPORT_BYTES)
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ReportTimeoutError())
      void reader.cancel().catch(() => {})
    }, timeoutMs)
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline])
      if (done) break
      if (size + value.byteLength > MAX_REPORT_BYTES) {
        void reader.cancel().catch(() => {})
        throw new RangeError('Report too large')
      }
      bytes.set(value, size)
      size += value.byteLength
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)))
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

export function summarizeReports(value: unknown) {
  const items = Array.isArray(value) ? value.slice(0, 20) : [value]
  return items.flatMap(item => {
    const report = object(item)
    const body = object(report?.['csp-report']) ?? (report?.type === 'csp-violation' ? object(report.body) : undefined)
    if (!body) return []
    const directive = body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive']
    if (typeof directive !== 'string' || !/^[a-z-]{1,64}(?:\s|$)/.test(directive)) return []
    const blocked = body['blocked-uri'] ?? body.blockedURL
    // Do not retain URLs, query strings, referrers, source samples or user data.
    const resourceType = typeof blocked === 'string' && /^(inline|eval|data|blob)$/.test(blocked)
      ? blocked : 'url'
    return [{ directive: directive.split(/\s/)[0], resourceType }]
  })
}
