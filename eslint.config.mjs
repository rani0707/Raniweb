import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Next.js 16.4+ supplies ESLint 10 rule-context compatibility for its bundled
// plugins. Keep the official presets so React, Hooks and accessibility checks stay enabled.
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**']),
])
