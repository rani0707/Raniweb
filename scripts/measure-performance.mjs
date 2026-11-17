import { performance } from 'node:perf_hooks'
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3000')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('This measurement is limited to the local development/production server.')
const samples = []
let html = ''
for (let i = 0; i < 20; i++) {
  const start = performance.now()
  const response = await fetch(base, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  html = await response.text()
  samples.push(performance.now() - start)
}
samples.sort((a, b) => a - b)
console.log(JSON.stringify({ samples: samples.length, p50Ms: +samples[9].toFixed(2), p95Ms: +samples[18].toFixed(2), htmlBytes: Buffer.byteLength(html), scriptTags: [...html.matchAll(/<script\b/g)].length, note: 'Local response measurements; not field Core Web Vitals or a distributed load test.' }, null, 2))
