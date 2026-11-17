import { acceptReport, readReport, summarizeReports, trustedReportClient, ReportTimeoutError } from '../../../lib/csp-report'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!['application/csp-report', 'application/reports+json', 'application/json'].includes(contentType ?? '')) {
    return new Response(null, { status: 415 })
  }
  const clientKey = trustedReportClient(request.headers, process.env.CSP_REPORT_TRUSTED_IP_HEADER)
  if (!acceptReport(Date.now(), clientKey)) return new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
  try {
    const reports = summarizeReports(await readReport(request))
    if (reports.length === 0) return new Response(null, { status: 400 })
    console.warn('[csp-violation]', JSON.stringify(reports))
    return new Response(null, { status: 204 })
  } catch (error) {
    return new Response(null, { status: error instanceof ReportTimeoutError ? 408 : error instanceof RangeError ? 413 : 400 })
  }
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}
